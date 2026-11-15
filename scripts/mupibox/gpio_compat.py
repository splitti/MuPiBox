"""GPIO pins for the scripts of the box (rotary encoder, fan, power LED) on every Raspberry Pi.

RPi.GPIO drives the pins of a Pi 4 and older. A Raspberry Pi 5 has its pins behind the RP1 chip, which RPi.GPIO 0.7 does not
know ("Cannot determine SOC peripheral base address"): there lgpio drives them, through the gpiochip of the header.
Gpio() takes RPi.GPIO where it works and lgpio where it does not, so the same script runs on both. lgpio is only loaded when it
is needed: a Pi 4 never touches it.

    gpio = Gpio()
    gpio.setup_input(26)            # an input with a pull-up
    gpio.read(26)                   # 0 or 1
    gpio.setup_output(13, 1)
    pwm = gpio.pwm(13, 3000)        # same calls as RPi.GPIO's PWM: start(duty), ChangeDutyCycle(duty), stop()
    gpio.close()
"""

import atexit
import os
import re
import shutil
import signal
import sys
import tempfile

try:
    import RPi.GPIO as GPIO
except Exception:  # not installed: lgpio may still do
    GPIO = None

_UNLOADED = object()
lgpio = _UNLOADED  # the module once it is loaded, None when there is none (tests put a fake here)

# the boards whose pins are behind the RP1 chip: RPi.GPIO 0.7 does not know them (it fails at the first pin it sets up)
RP1_BOARD = re.compile(r"Raspberry Pi (5|500)|Compute Module 5")


def _lg():
    """The lgpio module, loaded at the first use (None: not installed). It makes pipes in a working directory of its own: a
    directory for this process, so the scripts that run at the same time (rotary, LED, fan) and whatever user starts them never
    meet each other's files."""
    global lgpio
    if lgpio is _UNLOADED:
        directory = tempfile.mkdtemp(prefix="lgpio-")
        atexit.register(shutil.rmtree, directory, True)
        # (systemd ends the scripts with SIGTERM, which skips atexit: a directory with its pipes stayed behind at every stop -
        # a script with a handler of its own keeps it)
        if signal.getsignal(signal.SIGTERM) in (signal.SIG_DFL, None):
            signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
        os.environ["LG_WD"] = directory
        try:
            import lgpio as module

            lgpio = module
        except Exception:
            lgpio = None
    return lgpio


def board_model():
    try:
        with open("/proc/device-tree/model", "rb") as file:
            return file.read().decode("utf8", "replace").strip("\x00 \n")
    except OSError:
        return ""


def header_chip():
    """The number of the gpiochip that has the pins of the 40-pin header: the RP1 of a Pi 5 (its number differs between kernels), else 0."""
    lg = _lg()
    if lg is None:
        return 0
    for number in range(8):
        try:
            handle = lg.gpiochip_open(number)
        except Exception:
            continue
        try:
            info = lg.gpio_get_chip_info(handle)
            if "rp1" in (str(info[2]) + str(info[3])).lower():
                return number
        except Exception:
            pass
        finally:
            lg.gpiochip_close(handle)
    return 0


class _LgpioPwm:
    """PWM on a pin through lgpio (its own timing thread: for the frequencies of a fan, and for an LED without PWM hardware)."""

    def __init__(self, gpio, pin, frequency):
        self.gpio = gpio
        self.pin = pin
        self.frequency = frequency
        self.duty = 0

    def start(self, duty):
        self.ChangeDutyCycle(duty)

    def ChangeDutyCycle(self, duty):
        self.duty = max(0, min(100, duty))
        _lg().tx_pwm(self.gpio.handle, self.pin, self.frequency, self.duty)

    def stop(self):
        _lg().tx_pwm(self.gpio.handle, self.pin, self.frequency, 0)
        _lg().gpio_write(self.gpio.handle, self.pin, 0)


class Gpio:
    def __init__(self):
        self.handle = None
        self.name = "RPi.GPIO"
        # why RPi.GPIO was not taken (None: it was)
        self.refused = None
        model = board_model()
        pi5 = bool(RP1_BOARD.search(model))
        if GPIO is not None and not (pi5 and _lg() is not None):
            try:
                GPIO.setwarnings(False)
                GPIO.setmode(GPIO.BCM)
                return
            except RuntimeError as error:  # a board it does not know
                self.refused = error
        elif GPIO is not None:
            self.refused = RuntimeError("RPi.GPIO does not know the " + model)
        if _lg() is None:
            raise self.refused or RuntimeError("no GPIO library (python3-rpi.gpio or python3-lgpio)")
        self._to_lgpio()

    def _to_lgpio(self):
        self.name = "lgpio"
        self.handle = _lg().gpiochip_open(header_chip())

    @property
    def lgpio(self):
        return self.handle is not None

    def _setup(self, call):
        """A board RPi.GPIO does not know may only show at the first pin: then lgpio takes over (no pin was set up before)."""
        try:
            call()
        except RuntimeError as error:
            if _lg() is None or self.lgpio:
                raise
            self.refused = error
            self._to_lgpio()
            return False
        return True

    def setup_input(self, pin):
        if self.lgpio:
            _lg().gpio_claim_input(self.handle, pin, _lg().SET_PULL_UP)
        elif not self._setup(lambda: GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)):
            self.setup_input(pin)

    def read(self, pin):
        return _lg().gpio_read(self.handle, pin) if self.lgpio else GPIO.input(pin)

    def setup_output(self, pin, value=0):
        if self.lgpio:
            _lg().gpio_claim_output(self.handle, pin, 1 if value else 0)
        elif self._setup(lambda: GPIO.setup(pin, GPIO.OUT)):
            GPIO.output(pin, GPIO.HIGH if value else GPIO.LOW)
        else:
            self.setup_output(pin, value)

    def write(self, pin, value):
        if self.lgpio:
            _lg().gpio_write(self.handle, pin, 1 if value else 0)
        else:
            GPIO.output(pin, GPIO.HIGH if value else GPIO.LOW)

    def pwm(self, pin, frequency):
        """A PWM on a pin that setup_output has made an output (not started yet)."""
        return _LgpioPwm(self, pin, frequency) if self.lgpio else GPIO.PWM(pin, frequency)

    def close(self):
        if self.lgpio:
            try:
                _lg().gpiochip_close(self.handle)
            except Exception:
                pass
            self.handle = None
        else:
            GPIO.cleanup()


def pwm_chip():
    """The sysfs PWM chip that has the header pins 12 and 13 (channels 0 and 1): the PWM0 of the RP1 on a Pi 5 (the chip's number
    differs between kernels), the one PWM chip of a Pi 4 and older (pwmchip0). None: there is no PWM hardware."""
    base = "/sys/class/pwm"
    try:
        chips = sorted(name for name in os.listdir(base) if name.startswith("pwmchip"))
    except OSError:
        return None
    for name in chips:
        # (the RP1's PWM0 sits at 1f00098000, its PWM1 at 1f0009c000)
        if "1f00098000" in os.path.realpath(os.path.join(base, name, "device")):
            return os.path.join(base, name)
    return os.path.join(base, "pwmchip0") if "pwmchip0" in chips else None
