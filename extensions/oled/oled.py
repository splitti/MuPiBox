#!/usr/bin/python3
"""OLED display driver of the box: draws what the extension reports on an SSD1306, SH1106 or SSD1309 at the I2C bus.

The extension (api.js) starts this program and talks to it by lines of JSON on stdin; it answers by lines of JSON on stdout:

    in:   {"cmd": "state", "state": {...}}   what to show (see render.py: view, mode, title, volume ...)
          {"cmd": "contrast", "value": 0..255}
          {"cmd": "quit"}                      leave the picture as it is and end (a restart of the extension)
          {"cmd": "quit", "off": true}         switch the panel off and end (another address or controller follows)
    out:  {"event": "ready", "controller": "ssd1306", "address": "0x3C"}
          {"event": "error", "code": "no_i2c" | "i2c_access" | "no_display" | "no_pil", "message": "..."}

Nothing but the Python standard library and Pillow (python3-pil): the display is written through /dev/i2c-N with the ioctl that
chooses the device, so it needs neither luma.oled nor RPi.GPIO and runs the same on a Raspberry Pi 4 and a Pi 5.
A SIGTERM or the end of stdin switches the panel off (no picture burns in); when the box goes down, the power-off picture is shown
for a moment first.
"""
import argparse
import errno
import json
import os
import select
import signal
import subprocess
import sys
import time

I2C_SLAVE = 0x0703  # the ioctl that chooses the device of the bus
CONTROLLERS = ('ssd1306', 'sh1106', 'ssd1309')
BOOT_SECONDS = 1.2
BYE_SECONDS = 0.8


def emit(**event):
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + '\n')
    sys.stdout.flush()


class DriverError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


class I2CBus:
    """One device at an I2C bus: bytes written to it."""

    def __init__(self, bus, address):
        path = '/dev/i2c-%d' % bus
        try:
            self.fd = os.open(path, os.O_RDWR)
        except FileNotFoundError:
            raise DriverError('no_i2c', '%s does not exist: I2C is switched off (dtparam=i2c_arm=on in config.txt and the module i2c-dev)' % path)
        except PermissionError:
            raise DriverError('i2c_access', 'no access to %s (the udev rule of the extension, the group gpio)' % path)
        try:
            import fcntl

            fcntl.ioctl(self.fd, I2C_SLAVE, address)
        except OSError as error:
            os.close(self.fd)
            raise DriverError('i2c_access', 'the I2C address 0x%02X cannot be used: %s' % (address, error))

    def write(self, data):
        os.write(self.fd, bytes(data))

    def close(self):
        try:
            os.close(self.fd)
        except OSError:
            pass


class Display:
    """The chip: the start-up commands, the contrast, on and off, and the picture as bytes of pages."""

    def __init__(self, bus, controller='ssd1306', width=128, height=64, rotate=False, contrast=127):
        if controller not in CONTROLLERS:
            raise DriverError('bad_controller', 'unknown controller %s' % controller)
        if height not in (32, 64) or width != 128:
            raise DriverError('bad_size', 'only 128 x 64 and 128 x 32 are supported')
        self.bus = bus
        self.controller = controller
        self.width = width
        self.height = height
        self.rotate = rotate
        self.pages = height // 8
        # (the SH1106 has a RAM of 132 columns, the glass shows the middle 128)
        self.column_offset = 2 if controller == 'sh1106' else 0
        self.last = None  # the bytes of the pages that are in the chip
        self.last_raw = None  # the picture they were made from (an unchanged one is not packed again)
        self.is_on = False
        self._init(contrast)

    def command(self, *values):
        # (control byte 0x00: all that follows is commands)
        try:
            self.bus.write([0x00, *values])
        except OSError as error:
            if error.errno in (errno.ENXIO, getattr(errno, 'EREMOTEIO', 121), errno.EIO, errno.ETIMEDOUT):
                raise DriverError('no_display', 'the display does not answer at the I2C address (wiring, address 0x3C or 0x3D): %s' % error)
            raise

    def _init(self, contrast):
        com_pins = 0x12 if self.height == 64 else 0x02
        if self.controller == 'sh1106':
            self.command(0xAE, 0xD5, 0x80, 0xA8, self.height - 1, 0xD3, 0x00, 0x40, 0xAD, 0x8B, 0xA1, 0xC8, 0xDA, com_pins, 0x81, contrast, 0xD9, 0x22, 0xDB, 0x35, 0xA4, 0xA6)
        else:
            # (the SSD1309 has no charge pump and ignores 0x8D 0x14)
            self.command(0xAE, 0xD5, 0x80, 0xA8, self.height - 1, 0xD3, 0x00, 0x40, 0x8D, 0x14, 0x20, 0x00, 0xA1, 0xC8, 0xDA, com_pins, 0x81, contrast, 0xD9, 0xF1, 0xDB, 0x40, 0xA4, 0xA6)
        self.power(True)

    def power(self, on):
        if on != self.is_on:
            self.command(0xAF if on else 0xAE)
            self.is_on = on
            if on:
                self.last = None  # (the RAM may have been lost)

    def contrast(self, value):
        self.command(0x81, max(0, min(255, int(value))))

    def pack(self, image):
        """The picture (mode '1', width x height) as the bytes the chip wants: pages of eight rows, one byte for each column."""
        from PIL import Image

        transpose = getattr(Image, 'Transpose', Image)
        if self.rotate:
            image = image.transpose(transpose.ROTATE_180)
        out = bytearray()
        for page in range(self.pages):
            # (a strip of eight rows turned clockwise: each column becomes a row of eight pixels, the lowest row of the strip first;
            # Pillow packs a row with its first pixel as the highest bit - so bit 0 is the top row of the page, as the chip wants)
            strip = image.crop((0, page * 8, self.width, page * 8 + 8)).transpose(transpose.ROTATE_270)
            out += strip.tobytes()
        return bytes(out)

    def show(self, image):
        """Draws the picture; only the pages that changed are sent, nothing while it is the one that is shown already."""
        raw = image.tobytes()
        if not self.is_on:
            # (switched off: the RAM may be gone)
            self.last = None
            self.last_raw = None
        if raw == self.last_raw:
            return False
        data = self.pack(image)
        old = self.last
        width = self.width
        changed = [p for p in range(self.pages) if old is None or data[p * width : (p + 1) * width] != old[p * width : (p + 1) * width]]
        if self.controller == 'sh1106':
            # (page mode: every page is addressed on its own)
            col = self.column_offset
            for page in changed:
                self.command(0xB0 + page, 0x00 + (col & 0x0F), 0x10 + (col >> 4))
                self._data(data[page * width : (page + 1) * width])
        else:
            # (horizontal mode: one window for each run of pages that changed, the chip moves on from page to page by itself)
            runs = []
            for page in changed:
                if runs and runs[-1][1] == page - 1:
                    runs[-1][1] = page
                else:
                    runs.append([page, page])
            for first, last in runs:
                self.command(0x21, 0, width - 1, 0x22, first, last)
                for page in range(first, last + 1):
                    self._data(data[page * width : (page + 1) * width])
        # (on only now that the picture is in the RAM: a display that wakes does not flash the one it had before)
        self.power(True)
        self.last = data
        self.last_raw = raw
        return bool(changed)

    def _data(self, chunk):
        self.bus.write([0x40, *chunk])


def read_commands(buffer, fd):
    """The complete lines that are there on stdin (and whether it is at its end); `buffer` keeps a half line."""
    commands = []
    eof = False
    try:
        chunk = os.read(fd, 65536)
    except OSError:
        chunk = b''
    if not chunk:
        eof = True
    buffer += chunk
    while b'\n' in buffer:
        line, buffer = buffer.split(b'\n', 1)
        line = line.strip()
        if not line:
            continue
        try:
            commands.append(json.loads(line.decode('utf8')))
        except (ValueError, UnicodeDecodeError):
            continue  # not one of ours
    return commands, buffer, eof


def run(display, screens, stdin_fd=0, clock=time.monotonic, stop=lambda: False, pause=select.select):
    """The loop: takes what the extension says, draws it, and draws again while a line scrolls."""
    state = {'view': 'boot'}
    started = clock()
    buffer = b''
    boot_until = started + BOOT_SECONDS
    while not stop():
        interval = 0.1 if screens.scrolling else 0.25
        ready, _, _ = pause([stdin_fd], [], [], interval)
        if ready:
            commands, buffer, eof = read_commands(buffer, stdin_fd)
            for command in commands:
                kind = command.get('cmd')
                if kind == 'state' and isinstance(command.get('state'), dict):
                    state = command['state']
                elif kind == 'contrast':
                    display.contrast(command.get('value', 127))
                elif kind == 'quit':
                    return 'quit-off' if command.get('off') is True else 'quit'
            if eof:
                return 'eof'
        now = clock()
        shown = state
        # (the first picture stays for a moment, whatever is reported meanwhile)
        if now < boot_until:
            shown = {'view': 'boot'}
        if shown.get('view') == 'off':
            # (the display sleeps: the panel off, nothing to draw - the picture is sent anew when it wakes)
            screens.scrolling = False
            display.power(False)
            continue
        display.show(screens.render(shown, now))
    return 'stop'


def system_stopping(run_command=subprocess.run):
    """Does the box go down (power off or restart)? systemd says 'stopping' from the moment the shutdown begins."""
    try:
        answer = run_command(['systemctl', 'is-system-running'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=2)
    except (OSError, subprocess.SubprocessError):
        return False
    return answer.stdout.decode('utf8', 'replace').strip() == 'stopping'


def finish(display, screens, reason, stopping=system_stopping, sleep=time.sleep):
    """The end of the driver. 'quit': a new driver follows at once, the picture stays (no blink). Otherwise ('quit-off': a driver for
    another address or controller follows; SIGTERM: the server ends, the extension is switched off or removed; the end of stdin: the
    server is gone) the panel goes off, so no picture burns in - when the box goes down, after the power-off picture for a moment."""
    if reason == 'quit':
        return
    if reason == 'stop' and stopping():
        display.show(screens.poweroff())
        sleep(BYE_SECONDS)
    display.power(False)


def main(argv=None):
    parser = argparse.ArgumentParser(description='OLED display driver of the MuPiBox')
    parser.add_argument('--controller', choices=CONTROLLERS, default='ssd1306')
    parser.add_argument('--width', type=int, default=128)
    parser.add_argument('--height', type=int, default=64)
    parser.add_argument('--bus', type=int, default=1, help='number of the I2C bus (1 is /dev/i2c-1)')
    parser.add_argument('--address', default='0x3C')
    parser.add_argument('--rotate', action='store_true', help='turn the picture by 180 degrees')
    parser.add_argument('--contrast', type=int, default=127)
    parser.add_argument('--preview', metavar='PNG', help='draw the state in --state (a JSON file) into a picture and end, no display needed')
    parser.add_argument('--state', help='the state to draw with --preview')
    args = parser.parse_args(argv)

    try:
        from PIL import Image  # noqa: F401
        import render
    except ImportError as error:
        emit(event='error', code='no_pil', message='python3-pil is missing: %s' % error)
        return 1

    screens = render.Screens(args.width, args.height)
    if args.preview:
        with open(args.state, encoding='utf8') as handle:
            state = json.load(handle)
        picture = screens.render(state, float(state.get('now', 0)))
        picture.convert('L').point(lambda v: 255 if v else 0).save(args.preview)
        return 0

    try:
        address = int(str(args.address), 0)
        bus = I2CBus(args.bus, address)
        display = Display(bus, args.controller, args.width, args.height, args.rotate, args.contrast)
    except DriverError as error:
        emit(event='error', code=error.code, message=error.message)
        return 2
    except ValueError:
        emit(event='error', code='bad_address', message='not an I2C address: %s' % args.address)
        return 2

    terminated = []
    signal.signal(signal.SIGTERM, lambda *_: terminated.append(True))
    signal.signal(signal.SIGINT, lambda *_: terminated.append(True))
    emit(event='ready', controller=args.controller, address='0x%02X' % address)
    try:
        reason = run(display, screens, stop=lambda: bool(terminated))
    except DriverError as error:
        emit(event='error', code=error.code, message=error.message)
        return 2
    except OSError as error:
        emit(event='error', code='no_display', message='the display cannot be written: %s' % error)
        return 2
    try:
        finish(display, screens, reason)
    except (OSError, DriverError):
        pass
    finally:
        bus.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
