"""The two chips of the Waveshare 2.8 inch Capacitive Touch LCD (240 x 320): the display (ST7789T3, SPI) and the touch controller (CST328,
I2C address 0x1A). The bus access is in the classes Spi, Pins and I2C, which the tests replace; the rest is what the chips want.

Nothing but the Python standard library, Pillow (cube.py), python3-spidev and python3-lgpio (the packages of the NFC extension too).
"""
import os
import tempfile
import time

from cube import rgb565

I2C_SLAVE = 0x0703  # the ioctl that chooses the device of an I2C bus
CHUNK = 4096  # what spidev takes in one write (its buffer: /sys/module/spidev/parameters/bufsiz)
WIDTH, HEIGHT = 240, 320  # the glass, upright

# MADCTL (0x36) for the four turns of the picture
MADCTL = {0: 0x00, 90: 0x70, 180: 0xC0, 270: 0xA0}

INIT = (
    (0xB2, (0x0B, 0x0B, 0x00, 0x33, 0x35)),
    (0xB7, (0x11,)),
    (0xBB, (0x35,)),
    (0xC0, (0x2C,)),
    (0xC2, (0x01,)),
    (0xC3, (0x0D,)),
    (0xC4, (0x20,)),
    (0xC6, (0x13,)),
    (0xD0, (0xA4, 0xA1)),
    (0xD6, (0xA1,)),
    (0xE0, (0xF0, 0x06, 0x0B, 0x0A, 0x09, 0x26, 0x29, 0x33, 0x41, 0x18, 0x16, 0x15, 0x29, 0x2D)),
    (0xE1, (0xF0, 0x04, 0x08, 0x08, 0x07, 0x03, 0x28, 0x32, 0x40, 0x3B, 0x19, 0x18, 0x2A, 0x2E)),
)


class LcdError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


class Spi:
    """The SPI device (/dev/spidevB.C) in mode 0."""

    def __init__(self, device, hz):
        try:
            import spidev  # the Debian package python3-spidev
        except ImportError as error:
            raise LcdError('no_python', 'a Python package is missing: %s' % error)
        bus, _, chip = device.partition('.')
        self.spi = spidev.SpiDev()
        try:
            self.spi.open(int(bus), int(chip or 0))
        except FileNotFoundError:
            raise LcdError('no_spi', '/dev/spidev%s does not exist: SPI is switched off (dtparam=spi=on in config.txt)' % device)
        except PermissionError:
            raise LcdError('spi_access', 'no access to /dev/spidev%s (the udev rule of the extension, the group gpio)' % device)
        self.spi.max_speed_hz = int(hz)
        self.spi.mode = 0

    def write(self, data):
        write = getattr(self.spi, 'writebytes2', None)
        if write:
            write(data)
            return
        for at in range(0, len(data), CHUNK):
            self.spi.writebytes(list(data[at:at + CHUNK]))

    def close(self):
        try:
            self.spi.close()
        except Exception:
            pass


class Pins:
    """Output pins (DC, RST, the backlight) and the PWM of the backlight, through lgpio."""

    def __init__(self, chip, pins):
        # (lgpio makes pipes in its working directory: the one of the server may not be writable)
        if 'LG_WD' not in os.environ:
            os.environ['LG_WD'] = tempfile.mkdtemp(prefix='lgpio-')
        try:
            import lgpio  # the Debian package python3-lgpio
        except ImportError as error:
            raise LcdError('no_python', 'a Python package is missing: %s' % error)
        self._lgpio = lgpio
        self._chip = None
        self._pwm = set()
        try:
            self._chip = lgpio.gpiochip_open(chip)
            for pin in pins:
                lgpio.gpio_claim_output(self._chip, pin, 0)
        except Exception as error:  # lgpio raises its own error type
            self.close()
            raise LcdError('gpio', 'the pins %s cannot be used: %s' % (', '.join('GPIO %d' % p for p in pins), error))

    def write(self, pin, value):
        self._lgpio.gpio_write(self._chip, pin, 1 if value else 0)

    def pwm(self, pin, percent):
        """The backlight at `percent` (0 to 100); full or off without PWM, the rest by PWM at 1 kHz."""
        try:
            if percent >= 100 or percent <= 0:
                self._lgpio.tx_pwm(self._chip, pin, 1000, 0)  # (a PWM that runs stops)
                self.write(pin, percent > 0)
            else:
                self._lgpio.tx_pwm(self._chip, pin, 1000, percent)
        except Exception:
            self.write(pin, percent > 0)

    def close(self):
        if self._chip is not None:
            try:
                self._lgpio.gpiochip_close(self._chip)
            except Exception:
                pass
            self._chip = None


class I2C:
    """The touch controller at a bus: a register address (16 bits, high byte first) is written, then bytes are read."""

    def __init__(self, bus, address):
        path = '/dev/i2c-%d' % bus
        try:
            self.fd = os.open(path, os.O_RDWR)
        except FileNotFoundError:
            raise LcdError('no_i2c', '%s does not exist: I2C is switched off (dtparam=i2c_arm=on in config.txt and the module i2c-dev)' % path)
        except PermissionError:
            raise LcdError('i2c_access', 'no access to %s (the udev rule of the extension, the group gpio)' % path)
        try:
            import fcntl

            fcntl.ioctl(self.fd, I2C_SLAVE, address)
        except OSError as error:
            os.close(self.fd)
            raise LcdError('i2c_access', 'the I2C address 0x%02X cannot be used: %s' % (address, error))

    def write(self, data):
        os.write(self.fd, bytes(data))

    def read(self, count):
        return list(os.read(self.fd, count))

    def close(self):
        try:
            os.close(self.fd)
        except OSError:
            pass


class Display:
    """The ST7789: start-up, the turn of the picture, the backlight, and a picture as RGB565."""

    def __init__(self, spi, pins, dc, rst, bl, rotation=0, brightness=80, sleep=time.sleep):
        if rotation not in MADCTL:
            raise LcdError('bad_rotation', 'the turn must be 0, 90, 180 or 270')
        self.spi, self.pins, self.dc, self.rst, self.bl = spi, pins, dc, rst, bl
        self.rotation = rotation
        self.width, self.height = (WIDTH, HEIGHT) if rotation in (0, 180) else (HEIGHT, WIDTH)
        self.on = False
        self._sleep = sleep
        self._reset()
        self._command(0x36, MADCTL[rotation])
        self._command(0x3A, 0x05)  # 16 bits a point (RGB565)
        for command, values in INIT:
            self._command(command, *values)
        self._command(0x21)  # inversion on: the panel wants it for true colours
        self._command(0x11)  # leave sleep
        self._sleep(0.12)
        self._command(0x29)  # display on
        self.set_brightness(brightness)

    def _reset(self):
        for value, wait in ((1, 0.01), (0, 0.01), (1, 0.12)):
            self.pins.write(self.rst, value)
            self._sleep(wait)

    def _command(self, command, *values):
        self.pins.write(self.dc, 0)
        self.spi.write(bytes([command]))
        if values:
            self.pins.write(self.dc, 1)
            self.spi.write(bytes(values))

    def set_brightness(self, percent):
        self.brightness = max(0, min(100, int(percent)))
        if self.bl:
            self.pins.pwm(self.bl, self.brightness)
        self.on = self.brightness > 0

    def show(self, image):
        """A picture of the size of the screen, in full."""
        if image.size != (self.width, self.height):
            raise ValueError('the picture is %dx%d, the screen %dx%d' % (image.width, image.height, self.width, self.height))
        w, h = self.width - 1, self.height - 1
        self._command(0x2A, 0, 0, w >> 8, w & 0xFF)
        self._command(0x2B, 0, 0, h >> 8, h & 0xFF)
        self._command(0x2C)
        self.pins.write(self.dc, 1)
        self.spi.write(rgb565(image))

    def sleep(self):
        """The backlight off and the panel asleep (a touch wakes it)."""
        if self.bl:
            self.pins.pwm(self.bl, 0)
        self._command(0x28)
        self._command(0x10)
        self.on = False

    def wake(self):
        self._command(0x11)
        self._sleep(0.12)
        self._command(0x29)
        if self.bl:
            self.pins.pwm(self.bl, self.brightness)
        self.on = True

    def close(self):
        # (the picture stays when the program ends, the backlight too: the next start takes over)
        pass


class Touch:
    """The CST328: finds it, reads the finger (the first one), and turns the reading into points of the screen."""

    REG_COUNT = 0xD005
    REG_POINTS = 0xD000
    REG_DEBUG = 0xD101
    REG_NORMAL = 0xD109
    REG_ID = 0xD1F4

    def __init__(self, i2c, pins, reset_pin, width, height, rotation=0, swap=False, flip_x=False, flip_y=False, sleep=time.sleep):
        self.i2c, self.pins, self.reset_pin = i2c, pins, reset_pin
        self.width, self.height = width, height
        self.rotation, self.swap, self.flip_x, self.flip_y = rotation, swap, flip_x, flip_y
        self._sleep = sleep
        self.mode = None
        if reset_pin:
            self.pins.write(reset_pin, 0)
            self._sleep(0.001)
            self.pins.write(reset_pin, 1)
            self._sleep(0.05)

    def _register(self, address):
        self.i2c.write([address >> 8, address & 0xFF])

    def _read(self, address, count):
        self._register(address)
        return self.i2c.read(count)

    def found(self):
        """Whether a CST328 answers: its identification (0xCACA at 0xD1F4 + 10) says so."""
        try:
            self._register(self.REG_DEBUG)
            self._sleep(0.002)
            data = self._read(self.REG_ID, 24)
            self._register(self.REG_NORMAL)
        except OSError:
            return False
        return len(data) >= 12 and ((data[11] << 8) | data[10]) == 0xCACA

    def read(self):
        """The first finger as (x, y) in points of the screen, or None while nothing touches. An OSError when the chip does not answer."""
        count = self._read(self.REG_COUNT, 1)[0] & 0x0F
        if count == 0:
            return None
        if count > 5:
            self.i2c.write([self.REG_COUNT >> 8, self.REG_COUNT & 0xFF, 0])
            return None
        data = self._read(self.REG_POINTS, 27)
        self.i2c.write([self.REG_COUNT >> 8, self.REG_COUNT & 0xFF, 0])  # (the reading is taken: the chip makes the next one)
        x = (data[1] << 4) + (data[3] >> 4)
        y = (data[2] << 4) + (data[3] & 0x0F)
        return self.to_screen(x, y)

    def to_screen(self, x, y):
        """The point the chip reports, turned as the picture is. The chip's own x and y are those of the glass upright; swap and the
        flips fit a module that is built in differently."""
        w, h = WIDTH, HEIGHT
        if self.swap:
            x, y = y, x
            w, h = h, w
        x = min(max(x, 0), w - 1)
        y = min(max(y, 0), h - 1)
        if self.flip_x:
            x = w - 1 - x
        if self.flip_y:
            y = h - 1 - y
        if self.rotation == 90:
            x, y, w, h = y, w - 1 - x, h, w
        elif self.rotation == 180:
            x, y = w - 1 - x, h - 1 - y
        elif self.rotation == 270:
            x, y, w, h = h - 1 - y, x, h, w
        return x, y
