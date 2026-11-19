#!/usr/bin/python3
"""The OLED driver of the virtual box: the same program as the extension's oled.py (it is imported as oled_real.py next to this file),
but the panel is a picture instead of a chip at the I2C bus. Everything above the panel is the real one - the extension starts it with
the same arguments, talks to it by the same lines of JSON, and the pictures are drawn by the real render.py, scrolling, boot picture,
sleeping and all.

What it writes (into the folder MUPIBOX_VIRTUAL_OUT, default: next to this file):
    oled.png    what the panel shows now: the 128 x 64 (or 128 x 32) points as a picture of lit dots on black, four times as large,
                as dim as the contrast says; black when the panel is off
    oled.json   {"on": true, "contrast": 127, "controller": "sh1106", "width": 128, "height": 64, "updated": <epoch seconds>}

virtual-box/start.mjs puts this file in place of oled.py when it sets up the extension (and the real one beside it as oled_real.py); the
real driver's other jobs (--check, --preview) are handed on to it unchanged. Nothing but the standard library and Pillow.
"""
import json
import os
import queue
import signal
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import oled_real as real  # noqa: E402

OUT = os.environ.get('MUPIBOX_VIRTUAL_OUT') or HERE
SCALE = 4
BORDER = 8
LIT = (204, 234, 255)
FRAME = (20, 20, 24)


class Panel:
    """What the chip is for the real driver: show(), power() and contrast(); the picture goes to a file."""

    def __init__(self, controller, width, height, contrast):
        self.controller = controller
        self.width = width
        self.height = height
        self.level = contrast
        self.is_on = False
        self.image = None
        self.last_raw = None
        self.last_key = None

    def contrast(self, value):
        self.level = max(0, min(255, int(value)))
        self._save()

    def power(self, on):
        if on != self.is_on:
            self.is_on = on
            self._save()

    def show(self, image):
        raw = image.tobytes()
        changed = raw != self.last_raw
        self.last_raw = raw
        self.image = image
        if changed or not self.is_on:
            self.is_on = True
            self._save()
        return changed

    def _picture(self):
        from PIL import Image

        out = Image.new('RGB', (self.width * SCALE + 2 * BORDER, self.height * SCALE + 2 * BORDER), FRAME)
        out.paste(Image.new('RGB', (self.width * SCALE, self.height * SCALE), (0, 0, 0)), (BORDER, BORDER))
        if not self.is_on or self.image is None:
            return out
        # (a dim panel is dim: a quarter of the light at contrast 0, as an OLED does)
        factor = 0.25 + 0.75 * self.level / 255
        colour = tuple(int(c * factor) for c in LIT)
        pixels = out.load()
        source = self.image.convert('L').load()
        for y in range(self.height):
            for x in range(self.width):
                if source[x, y]:
                    for dy in range(1, SCALE):
                        for dx in range(1, SCALE):
                            pixels[BORDER + x * SCALE + dx, BORDER + y * SCALE + dy] = colour
        return out

    def _save(self):
        key = (self.is_on, self.level, self.last_raw)
        if key == self.last_key:
            return
        self.last_key = key
        os.makedirs(OUT, exist_ok=True)
        # (written whole and put in place at once: whoever reads it never sees half a picture)
        temp = os.path.join(OUT, 'oled.png.new')
        self._picture().save(temp, format='PNG')
        os.replace(temp, os.path.join(OUT, 'oled.png'))
        info = {'on': self.is_on, 'contrast': self.level, 'controller': self.controller, 'width': self.width, 'height': self.height, 'updated': __import__('time').time()}
        temp = os.path.join(OUT, 'oled.json.new')
        with open(temp, 'w', encoding='utf8') as handle:
            json.dump(info, handle)
        os.replace(temp, os.path.join(OUT, 'oled.json'))


class Stdin:
    """Lines of JSON from stdin. A thread reads them: select() does not work on a pipe under Windows."""

    def __init__(self):
        self.lines = queue.Queue()
        self.ended = threading.Event()
        self.wake = threading.Event()
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        try:
            for line in sys.stdin.buffer:
                self.lines.put(line)
                self.wake.set()
        except (OSError, ValueError):
            pass
        self.ended.set()
        self.wake.set()

    def pause(self, _read, _write, _error, timeout):
        """select.select as run() uses it: [stdin] when there is something to read (or the end), else nothing after the time."""
        if self.lines.empty() and not self.ended.is_set():
            self.wake.wait(timeout)
        self.wake.clear()
        return ([0], [], []) if (not self.lines.empty() or self.ended.is_set()) else ([], [], [])

    def read(self, buffer, _fd):
        """oled.read_commands as run() uses it."""
        commands = []
        while True:
            try:
                line = self.lines.get_nowait()
            except queue.Empty:
                break
            try:
                commands.append(json.loads(line.decode('utf8')))
            except (ValueError, UnicodeDecodeError):
                continue
        return commands, buffer, self.ended.is_set() and self.lines.empty()


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    # (the jobs without a panel are the real driver's)
    if '--check' in argv or '--preview' in argv:
        return real.main(argv)
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--controller', default='ssd1306')
    parser.add_argument('--width', type=int, default=128)
    parser.add_argument('--height', type=int, default=64)
    parser.add_argument('--bus', type=int, default=1)
    parser.add_argument('--address', default='0x3C')
    parser.add_argument('--rotate', action='store_true')
    parser.add_argument('--contrast', type=int, default=127)
    parser.add_argument('--images')
    parser.add_argument('--custom')
    parser.add_argument('--show')
    parser.add_argument('--settings')
    args, _ = parser.parse_known_args(argv)

    try:
        import render
    except ImportError as error:
        real.emit(event='error', code='no_pil', message='Pillow is missing: %s' % error)
        return 1
    # (the box draws with DejaVu Sans Mono from /usr/share/fonts; this PC has none, and another font would make another picture)
    fonts = os.environ.get('MUPIBOX_VIRTUAL_FONTS')
    if fonts:
        render.FONT_CANDIDATES = (os.path.join(fonts, 'DejaVuSansMono.ttf'),) + tuple(render.FONT_CANDIDATES)
        render.BOLD_CANDIDATES = (os.path.join(fonts, 'DejaVuSansMono-Bold.ttf'),) + tuple(render.BOLD_CANDIDATES)
    pictures = render.Pictures(args.images, args.custom, args.width, args.height)
    screens = render.Screens(args.width, args.height, pictures=pictures)
    panel = Panel(args.controller, args.width, args.height, args.contrast)
    if args.show:
        picture = screens.pictures.get(args.show)
        if picture is None:
            real.emit(event='error', code='no_picture', message='there is no picture %s' % args.show)
            return 3
        panel.show(picture)
        return 0

    terminated = []
    signal.signal(signal.SIGTERM, lambda *_: terminated.append(True))
    signal.signal(signal.SIGINT, lambda *_: terminated.append(True))
    stdin = Stdin()
    real.read_commands = stdin.read
    real.emit(event='ready', controller=args.controller, address=str(args.address))
    panel.power(True)
    reason = real.run(panel, screens, stop=lambda: bool(terminated), pause=stdin.pause)
    # (a restart of the extension leaves the picture as it is; anything else: the panel goes dark)
    if reason != 'quit':
        panel.power(False)
    return 0


if __name__ == '__main__':
    sys.exit(main())
