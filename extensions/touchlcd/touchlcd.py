#!/usr/bin/python3
"""Touch display of the box (Waveshare 2.8 inch Capacitive Touch LCD): shows the cover of an artist or album, turns it like a cube with a
swipe to the left or right, reports a tap and a swipe up.

The extension (api.js) starts this program and talks to it by lines of JSON on stdin; it answers by lines of JSON on stdout:

    in:   {"cmd": "view", "faces": {"prev": F, "cur": F, "next": F}, "transition": "none" | "zoom-in" | "zoom-out"}
              F = {"label": "Name", "cover": "http://..."} or null (no neighbour: the cube does not turn that way)
          {"cmd": "press"}                  a tap was taken (the cover darkens a moment: the answer may take a while)
          {"cmd": "flash"}                  the play symbol for a moment (a tap on an album)
          {"cmd": "brightness", "value": 0..100}
          {"cmd": "wake"}                   switch the display on (it went off after sleepAfter)
          {"cmd": "quit"} / {"cmd": "quit", "off": true}   end, the picture stays / the panel is switched off
    out:  {"event": "ready", "width": 240, "height": 320}
          {"event": "nav", "dir": "next" | "prev"}   the cube turned to the next / previous face (the picture shows it already)
          {"event": "tap"}                           a tap on the cover
          {"event": "up"}                            a swipe up
          {"event": "error", "code": "no_spi" | "spi_access" | "no_i2c" | "i2c_access" | "no_touch" | "gpio" | "no_pil" | ..., "message": "..."}

The covers are fetched here (urllib, in a thread of their own) from the addresses the extension names. Needs Pillow (python3-pil),
python3-spidev and python3-lgpio. Pictures: cube.py; fingers: gesture.py; the two chips: lcd.py.
"""
import argparse
import collections
import io
import json
import os
import select
import signal
import sys
import threading
import time
import urllib.request

COVER_MAX_BYTES = 8 * 1024 * 1024
COVER_KEEP = 30
RETRY_COVER_S = 30
TOUCH_POLL_S = 0.012
IDLE_POLL_S = 0.03
PRESS_S = 2.5
FLASH_S = 1.4
BANNER_S = 1.6
CUBE_S = 0.28
BACK_S = 0.16
ZOOM_S = 0.22
LOST_AFTER = 25  # readings of the touch chip in a row that failed


def emit(**event):
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + '\n')
    sys.stdout.flush()


class LineReader:
    """The lines that come in on a file descriptor (stdin), without blocking: select, then one read of what is there. (A buffered readline
    would hold a second line back that select does not report.)"""

    def __init__(self, fd):
        self.fd = fd
        self.buffer = b''

    def poll(self, wait):
        """The complete lines that came in (maybe none); None when the other end has closed."""
        ready, _, _ = select.select([self.fd], [], [], wait)
        if not ready:
            return []
        data = os.read(self.fd, 65536)
        if not data:
            return None
        self.buffer += data
        *lines, self.buffer = self.buffer.split(bytes([10]))
        return [line.decode('utf8', 'replace').strip() for line in lines if line.strip()]


class Covers:
    """Pictures from the box (or the internet), fetched in a thread of their own and kept for a while. get(url) answers at once: the
    picture if it is there, else None - and it is fetched, and on_ready() says when it came."""

    def __init__(self, side, on_ready=lambda: None, fetch=None):
        self.side = side
        self.on_ready = on_ready
        self.fetch = fetch or self._fetch
        self.pictures = collections.OrderedDict()  # url -> PIL image
        self.failed = {}  # url -> when it failed
        self.wanted = collections.deque()
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.stop = False
        self.thread = threading.Thread(target=self._work, daemon=True)
        self.thread.start()

    @staticmethod
    def _fetch(url):
        with urllib.request.urlopen(url, timeout=10) as response:
            data = response.read(COVER_MAX_BYTES + 1)
        if len(data) > COVER_MAX_BYTES:
            raise ValueError('too big')
        return data

    def get(self, url, now=time.monotonic):
        if not url:
            return None
        with self.lock:
            if url in self.pictures:
                self.pictures.move_to_end(url)
                return self.pictures[url]
            failed = self.failed.get(url)
            if (failed is None or now() - failed > RETRY_COVER_S) and url not in self.wanted:
                self.wanted.append(url)
                self.wake.set()
        return None

    def _work(self):
        from PIL import Image

        while not self.stop:
            self.wake.wait(1.0)
            self.wake.clear()
            while not self.stop:
                with self.lock:
                    url = self.wanted.popleft() if self.wanted else None
                if url is None:
                    break
                try:
                    picture = Image.open(io.BytesIO(self.fetch(url)))
                    picture = picture.convert('RGB')
                    picture.thumbnail((self.side, self.side))
                except Exception:
                    with self.lock:
                        self.failed[url] = time.monotonic()
                    continue
                with self.lock:
                    self.pictures[url] = picture
                    while len(self.pictures) > COVER_KEEP:
                        self.pictures.popitem(last=False)
                self.on_ready()


class App:
    """The program without the hardware: `display` (width, height, show(image), sleep(), wake(), set_brightness(n)) and `touch` (read():
    (x, y) or None) are put in from outside - the real chips (lcd.py), or the window of the simulation."""

    def __init__(self, display, touch, send, covers, show_title=False, sleep_after=0, clock=time.monotonic, nap=time.sleep, pump=lambda: None):
        import cube
        import gesture

        self.cube, self.gesture_module = cube, gesture
        self.display, self.touch, self.send, self.covers = display, touch, send, covers
        self.size = (display.width, display.height)
        self.show_title = show_title
        self.sleep_after = sleep_after
        self.clock, self.nap, self.pump = clock, nap, pump
        self.gesture = gesture.Gesture(*self.size)
        self.faces = {'prev': None, 'cur': None, 'next': None}
        self.count = 4  # how many faces the level has: the angle of the prism follows from it (cube.cube)
        self._kept = collections.OrderedDict()  # the faces made lately
        self.shown = None  # the picture that is on the screen
        self.shown_key = None
        self.press_until = 0.0
        self.flash_until = 0.0
        self.dragging = None  # the last dx that was drawn
        self.asleep = False
        self.muted = False  # a touch that woke the display: no gesture until the finger is up
        self.last_activity = clock()
        self.failures = 0
        self.dirty = threading.Event()

    # ---- pictures ---------------------------------------------------------------------------------------------------------------
    def image_of(self, face):
        """The picture of a face: its cover if it has come, else the name on a colour (and the cover is fetched)."""
        if face is None:
            return None
        label, url = face.get('label') or '', face.get('cover') or ''
        cover = self.covers.get(url) if url else None
        key = (label, url, cover is not None, self.size, self.show_title)
        kept = self._kept.get(key)
        if kept is None:
            kept = self.cube.make_face(cover, label, self.size, self.show_title)
            self._kept[key] = kept
            while len(self._kept) > 12:
                self._kept.popitem(last=False)
        return kept

    def draw(self, image, key=None):
        """To the screen - unless it shows this already (key): a picture costs 30 ms or more at the SPI bus."""
        if key is not None and key == self.shown_key and not self.asleep:
            return
        self.display.show(image)
        self.shown = image
        self.shown_key = key

    def draw_current(self):
        face = self.faces['cur']
        if face is not None:
            self.draw(self.image_of(face), ('face', face.get('label'), face.get('cover'), self.covers.get(face.get('cover') or '') is not None, self.show_title))

    def animate(self, seconds, frame):
        start = self.clock()
        while True:
            t = min(1.0, (self.clock() - start) / seconds)
            frame(t)
            self.pump()
            if t >= 1.0:
                return
            self.nap(0.002)

    # ---- what the extension says -----------------------------------------------------------------------------------------------
    def command(self, message):
        cmd = message.get('cmd')
        if cmd == 'view':
            self.view(message.get('faces') or {}, message.get('transition') or 'none')
        elif cmd == 'press':
            if self.shown is not None:
                self.display.show(self.cube.shade(self.shown, 0.65))
                self.shown_key = None
                self.press_until = self.clock() + PRESS_S
        elif cmd == 'flash':
            if self.shown is not None:
                self.press_until = 0.0
                current = self.image_of(self.faces['cur']) or self.shown
                self.display.show(self.cube.with_play_symbol(current))
                self.shown_key = None
                self.flash_until = self.clock() + FLASH_S
        elif cmd == 'banner':
            text = str(message.get('text') or '')[:40]
            if self.shown is not None and text:
                self.press_until = 0.0
                current = self.image_of(self.faces['cur']) or self.shown
                self.display.show(self.cube.with_banner(current, text))
                self.shown_key = None
                self.flash_until = self.clock() + BANNER_S
        elif cmd == 'brightness':
            self.display.set_brightness(message.get('value', 80))
        elif cmd == 'wake':
            self.activity()

    def view(self, faces, transition):
        old = self.shown
        self.faces = {slot: faces.get(slot) or None for slot in ('prev', 'cur', 'next')}
        try:
            self.count = max(1, int(faces.get('count') or 4))
        except (TypeError, ValueError):
            self.count = 4
        self.press_until = self.flash_until = 0.0
        if self.faces['cur'] is None:
            return
        new = self.image_of(self.faces['cur'])
        self.activity()
        if transition in ('zoom-in', 'zoom-out') and old is not None and not self.asleep:
            inward = transition == 'zoom-in'
            self.animate(ZOOM_S, lambda t: self.display.show(self.cube.zoom(old, new, self.cube.ease_in_out(t), inward)))
            self.shown, self.shown_key = new, None
        self.draw_current()

    # ---- the fingers ------------------------------------------------------------------------------------------------------------
    def activity(self):
        self.last_activity = self.clock()
        if self.asleep:
            self.display.wake()
            self.asleep = False
            self.shown_key = None
            if self.shown is not None:
                self.display.show(self.shown)

    def step(self):
        """One pass: the touch chip, what the finger does, the timers. False when the touch chip is lost (the program ends)."""
        now = self.clock()
        try:
            point = self.touch.read()
            self.failures = 0
        except OSError:
            point = None
            self.failures += 1
            if self.failures >= LOST_AFTER:
                return False
        if point is not None and self.asleep:
            # the touch that wakes the display does nothing else
            self.activity()
            self.muted = True
        if self.muted:
            if point is None:
                self.muted = False
                self.gesture.feed(None, now)
            point = None
            events = []
        else:
            if point is not None:
                self.last_activity = now
            events = self.gesture.feed(point, now, getattr(self.touch, 'fingers', 1))
        drag = None
        for kind, value in events:
            if kind == 'drag':
                drag = value
            elif kind == 'swipe' and value in ('next', 'prev'):
                self.finish_turn(value)
                drag = None
            elif kind == 'swipe' and value == 'up':
                self.dragging = None
                self.send({'event': 'up'})
            elif kind == 'category':
                self.dragging = None
                self.send({'event': 'category', 'dir': value})
            elif kind == 'cancel':
                self.turn_back()
                drag = None
            elif kind == 'tap':
                self.send({'event': 'tap'})
        if drag is not None:
            self.drag(drag)
        # timers
        if self.press_until and now >= self.press_until:
            self.press_until = 0.0
            self.shown_key = None
            self.draw_current()
        if self.flash_until and now >= self.flash_until:
            self.flash_until = 0.0
            self.shown_key = None
            self.draw_current()
        if self.dirty.is_set():
            self.dirty.clear()
            if self.dragging is None and not self.flash_until and not self.press_until:
                self.draw_current()
        if self.sleep_after and not self.asleep and point is None and now - self.last_activity >= self.sleep_after:
            self.display.sleep()
            self.asleep = True
        return True

    def neighbour(self, which):
        return self.faces.get('next' if which == 'next' else 'prev')

    def cube_image(self, dx):
        """The cube at the position of the finger: dx < 0 turns to the next face, dx > 0 to the previous."""
        which = 'next' if dx < 0 else 'prev'
        other = self.image_of(self.neighbour(which))
        if other is None:
            return None
        progress = min(1.0, abs(dx) / float(self.size[0]))
        return self.cube.cube(self.image_of(self.faces['cur']), other, progress, 'left' if which == 'next' else 'right', self.count)

    def drag(self, dx):
        if self.faces['cur'] is None or dx == self.dragging:
            return
        image = self.cube_image(dx)
        if image is None:
            return
        self.dragging = dx
        self.press_until = self.flash_until = 0.0
        self.display.show(image)
        self.shown_key = None

    def finish_turn(self, which):
        dx = self.dragging if self.dragging is not None else 0
        if self.neighbour(which) is None or self.faces['cur'] is None:
            return self.turn_back()
        start = min(1.0, abs(dx) / float(self.size[0]))
        direction = 'left' if which == 'next' else 'right'
        current, other = self.image_of(self.faces['cur']), self.image_of(self.neighbour(which))
        seconds = CUBE_S * (1.0 - start) + 0.05
        self.animate(seconds, lambda t: self.display.show(self.cube.cube(current, other, start + (1.0 - start) * self.cube.ease_out(t), direction, self.count)))
        self.dragging = None
        # (the picture shows the new face now; the extension says what is behind it)
        if which == 'next':
            self.faces = {'prev': self.faces['cur'], 'cur': self.faces['next'], 'next': None}
        else:
            self.faces = {'prev': None, 'cur': self.faces['prev'], 'next': self.faces['cur']}
        self.shown, self.shown_key = other, None
        self.draw_current()
        self.send({'event': 'nav', 'dir': which})

    def turn_back(self):
        dx = self.dragging
        self.dragging = None
        if dx is None or self.faces['cur'] is None:
            return
        start = min(1.0, abs(dx) / float(self.size[0]))
        direction = 'left' if dx < 0 else 'right'
        other = self.image_of(self.neighbour('next' if dx < 0 else 'prev'))
        current = self.image_of(self.faces['cur'])
        if other is not None:
            self.animate(BACK_S, lambda t: self.display.show(self.cube.cube(current, other, start * (1.0 - self.cube.ease_out(t)), direction, self.count)))
        self.shown_key = None
        self.draw_current()


def parse_args(argv):
    parser = argparse.ArgumentParser(description='Touch display of the box (Waveshare 2.8 inch)')
    parser.add_argument('--spi', default='0.1', help='SPI device, bus.chip (0.1: CE1 at BCM 7)')
    parser.add_argument('--spi-mhz', type=float, default=32.0)
    parser.add_argument('--chip', type=int, default=0, help='number of the gpiochip of the header pins')
    parser.add_argument('--dc', type=int, required=True)
    parser.add_argument('--rst', type=int, required=True)
    parser.add_argument('--bl', type=int, default=0, help='backlight pin (0: the backlight is wired to 3.3 V)')
    parser.add_argument('--tp-rst', type=int, default=0)
    parser.add_argument('--i2c-bus', type=int, default=1)
    parser.add_argument('--i2c-address', type=lambda v: int(v, 0), default=0x1A)
    parser.add_argument('--rotation', type=int, default=0, choices=(0, 90, 180, 270))
    parser.add_argument('--brightness', type=int, default=80)
    parser.add_argument('--sleep-after', type=int, default=0, help='seconds without a touch before the display goes off (0: never)')
    parser.add_argument('--show-title', action='store_true')
    parser.add_argument('--touch-swap', action='store_true')
    parser.add_argument('--touch-flip-x', action='store_true')
    parser.add_argument('--touch-flip-y', action='store_true')
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    stop = {'now': False}

    def on_signal(_signo, _frame):
        stop['now'] = True

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    spi = pins = i2c = display = covers = None
    off = False
    try:
        try:
            import PIL  # noqa: F401
        except ImportError as error:
            import lcd
            raise lcd.LcdError('no_pil', 'a Python package is missing: %s' % error)
        import lcd
        from PIL import Image

        spi = lcd.Spi(args.spi, args.spi_mhz * 1000000)
        pin_list = [args.dc, args.rst] + ([args.bl] if args.bl else []) + ([args.tp_rst] if args.tp_rst else [])
        pins = lcd.Pins(args.chip, pin_list)
        i2c = lcd.I2C(args.i2c_bus, args.i2c_address)
        touch = lcd.Touch(i2c, pins, args.tp_rst, lcd.WIDTH, lcd.HEIGHT, args.rotation, args.touch_swap, args.touch_flip_x, args.touch_flip_y)
        if not touch.found():
            raise lcd.LcdError('no_touch', 'the touch chip (CST328 at 0x%02X) does not answer: SDA, SCL, TP_RST and the power supply' % args.i2c_address)
        display = lcd.Display(spi, pins, args.dc, args.rst, args.bl, args.rotation, args.brightness)
        app_holder = {}
        covers = Covers(max(display.width, display.height), on_ready=lambda: app_holder['app'].dirty.set())
        app = App(display, touch, lambda event: emit(**event), covers, args.show_title, args.sleep_after)
        app_holder['app'] = app
        display.show(Image.new('RGB', (display.width, display.height)))  # (the memory of the chip holds noise until then)
        emit(event='ready', width=display.width, height=display.height)
        reader = LineReader(sys.stdin.fileno())
        quitting = False
        while not stop['now'] and not quitting:
            lines = reader.poll(TOUCH_POLL_S if not app.asleep else IDLE_POLL_S)
            if lines is None:
                break  # the extension is gone
            for line in lines:
                try:
                    message = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(message, dict):
                    continue
                if message.get('cmd') == 'quit':
                    off = message.get('off') is True
                    quitting = True
                    break
                app.command(message)
            if not app.step():
                raise lcd.LcdError('touch_lost', 'the touch chip does not answer any more')
        # (SIGTERM: the box goes down or the server ends - the panel is switched off; a quit leaves the picture)
        off = off or stop['now']
        return 0
    except Exception as error:
        code = getattr(error, 'code', 'other')
        message = getattr(error, 'message', '%s: %s' % (type(error).__name__, error))
        emit(event='error', code=code, message=message)
        return 2
    finally:
        if covers:
            covers.stop = True
        if display and off:
            try:
                display.sleep()
            except Exception:
                pass
        for item in (i2c, spi, pins):
            if item:
                item.close()


if __name__ == '__main__':
    sys.exit(main())
