"""Tests of scripts/mupibox/gpio_compat.py without a board: RPi.GPIO and lgpio are replaced by fakes.
    python -m unittest discover -s scripts/tests -p "test_*.py"
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mupibox"))
import gpio_compat  # noqa: E402


class FakeRpi(types.SimpleNamespace):
    """RPi.GPIO: a Pi 4 (works) or a Pi 5 (setmode raises, as the library does there)."""

    def __init__(self, refuses=False):
        super().__init__(BCM=11, IN=1, OUT=0, HIGH=1, LOW=0, PUD_UP=22, calls=[], levels={}, refuses=refuses)

    def setwarnings(self, flag):
        pass

    def setmode(self, mode):
        self.calls.append(("setmode", mode))

    def setup(self, pin, direction, pull_up_down=None):
        # (the real library fails at the first pin it sets up, not at setmode)
        if self.refuses:
            raise RuntimeError("Cannot determine SOC peripheral base address")
        self.calls.append(("setup", pin, direction, pull_up_down))

    def input(self, pin):
        return self.levels.get(pin, 1)

    def output(self, pin, value):
        self.calls.append(("output", pin, value))

    def cleanup(self):
        self.calls.append(("cleanup",))

    def PWM(self, pin, frequency):
        rpi = self

        class Pwm:
            def start(self, duty):
                rpi.calls.append(("pwm.start", pin, frequency, duty))

            def ChangeDutyCycle(self, duty):
                rpi.calls.append(("pwm.duty", pin, duty))

        return Pwm()


class FakeLgpio(types.SimpleNamespace):
    SET_PULL_UP = 32

    def __init__(self, chips=None):
        # chips: number -> (name, label) of the gpiochips that exist
        super().__init__(chips=chips or {0: ("gpiochip0", "pinctrl-rp1")}, calls=[], levels={})

    def gpiochip_open(self, number):
        if number not in self.chips:
            raise RuntimeError("no such chip")
        return 100 + number

    def gpio_get_chip_info(self, handle):
        name, label = self.chips[handle - 100]
        return (0, 54, name, label)

    def gpiochip_close(self, handle):
        self.calls.append(("close", handle))

    def gpio_claim_input(self, handle, pin, flags):
        self.calls.append(("claim_input", handle, pin, flags))

    def gpio_claim_output(self, handle, pin, value):
        self.calls.append(("claim_output", handle, pin, value))

    def gpio_read(self, handle, pin):
        return self.levels.get(pin, 1)

    def gpio_write(self, handle, pin, value):
        self.calls.append(("write", handle, pin, value))

    def tx_pwm(self, handle, pin, frequency, duty):
        self.calls.append(("tx_pwm", handle, pin, frequency, duty))


class GpioCompat(unittest.TestCase):
    def use(self, rpi=None, lg=None, model=""):
        gpio_compat.GPIO = rpi
        gpio_compat.lgpio = lg
        gpio_compat.board_model = lambda: model

    def tearDown(self):
        self.use(None, None)

    def test_a_pi_4_uses_rpi_gpio_as_before(self):
        rpi, lg = FakeRpi(), FakeLgpio()
        self.use(rpi, lg)
        gpio = gpio_compat.Gpio()
        self.assertEqual((gpio.name, gpio.refused, gpio.lgpio), ("RPi.GPIO", None, False))
        gpio.setup_input(26)
        rpi.levels[26] = 0
        self.assertEqual(gpio.read(26), 0)
        gpio.setup_output(13, 1)
        gpio.write(13, 0)
        pwm = gpio.pwm(13, 3000)
        pwm.start(0)
        pwm.ChangeDutyCycle(40)
        gpio.close()
        self.assertEqual(
            rpi.calls,
            [("setmode", 11), ("setup", 26, 1, 22), ("setup", 13, 0, None), ("output", 13, 1), ("output", 13, 0), ("pwm.start", 13, 3000, 0), ("pwm.duty", 13, 40), ("cleanup",)],
        )
        self.assertEqual(lg.calls, [], "lgpio is not touched on a board RPi.GPIO knows")

    def test_a_pi_4_never_loads_lgpio(self):
        rpi = FakeRpi()
        self.use(rpi, gpio_compat._UNLOADED, "Raspberry Pi 4 Model B Rev 1.4")
        gpio = gpio_compat.Gpio()
        gpio.setup_input(26)
        gpio.setup_output(13, 0)
        gpio.close()
        self.assertIs(gpio_compat.lgpio, gpio_compat._UNLOADED)

    def test_a_pi_5_takes_lgpio_on_the_chip_of_the_header(self):
        lg = FakeLgpio({0: ("gpiochip0", "pinctrl-rp1"), 10: ("gpiochip10", "gpio-brcmstb")})
        rpi = FakeRpi(refuses=True)
        self.use(rpi, lg, "Raspberry Pi 5 Model B Rev 1.0")
        gpio = gpio_compat.Gpio()
        self.assertEqual((gpio.name, gpio.lgpio), ("lgpio", True))
        self.assertIn("does not know", str(gpio.refused))
        self.assertEqual(rpi.calls, [], "RPi.GPIO is not touched on a Pi 5")
        gpio.setup_input(24)
        lg.levels[24] = 0
        self.assertEqual(gpio.read(24), 0)
        gpio.setup_output(12, 0)
        pwm = gpio.pwm(12, 100)
        pwm.start(0)
        pwm.ChangeDutyCycle(75)
        pwm.ChangeDutyCycle(250)  # (more than 100 is 100)
        pwm.stop()
        gpio.close()
        self.assertIn(("claim_input", 100, 24, 32), lg.calls)
        self.assertIn(("claim_output", 100, 12, 0), lg.calls)
        self.assertEqual([c for c in lg.calls if c[0] == "tx_pwm"], [("tx_pwm", 100, 12, 100, 0), ("tx_pwm", 100, 12, 100, 75), ("tx_pwm", 100, 12, 100, 100), ("tx_pwm", 100, 12, 100, 0)])
        self.assertEqual(lg.calls[-1], ("close", 100))

    def test_a_board_that_only_fails_at_the_first_pin_still_gets_lgpio(self):
        # (a model the check does not list: RPi.GPIO takes the board at setmode and refuses at the first pin)
        lg = FakeLgpio()
        self.use(FakeRpi(refuses=True), lg, "Some Future Pi")
        gpio = gpio_compat.Gpio()
        self.assertEqual(gpio.name, "RPi.GPIO")
        gpio.setup_input(26)
        self.assertEqual((gpio.name, gpio.lgpio), ("lgpio", True))
        self.assertIn("SOC peripheral", str(gpio.refused))
        self.assertIn(("claim_input", 100, 26, 32), lg.calls)
        gpio = gpio_compat.Gpio()
        gpio.setup_output(13, 1)
        self.assertIn(("claim_output", 100, 13, 1), lg.calls)

    def test_the_chip_of_the_header_is_found_by_its_label(self):
        self.use(None, FakeLgpio({4: ("gpiochip4", "pinctrl-rp1"), 0: ("gpiochip0", "gpio-brcmstb")}))
        self.assertEqual(gpio_compat.header_chip(), 4)
        self.use(None, FakeLgpio({0: ("gpiochip0", "pinctrl-bcm2711")}))
        self.assertEqual(gpio_compat.header_chip(), 0)
        self.use(None, None)
        self.assertEqual(gpio_compat.header_chip(), 0)

    def test_without_any_library_it_says_so(self):
        self.use(None, None)
        with self.assertRaises(RuntimeError):
            gpio_compat.Gpio()
        # (a board RPi.GPIO refuses and no lgpio: the reason of the refusal)
        self.use(FakeRpi(refuses=True), None)
        gpio = gpio_compat.Gpio()
        with self.assertRaises(RuntimeError) as caught:
            gpio.setup_input(26)
        self.assertIn("SOC peripheral", str(caught.exception))

    def test_the_pwm_chip_of_the_header_pins(self):
        # (on a Pi 5 the RP1's PWM0 is not always pwmchip0)
        import tempfile

        with tempfile.TemporaryDirectory() as root:
            base = os.path.join(root, "pwm")
            for chip, device in (("pwmchip0", "1f0009c000.pwm"), ("pwmchip2", "1f00098000.pwm")):
                os.makedirs(os.path.join(root, "devices", device))
                os.makedirs(os.path.join(base, chip))
                try:
                    os.symlink(os.path.join(root, "devices", device), os.path.join(base, chip, "device"), target_is_directory=True)
                except OSError:
                    self.skipTest("no symlinks here")
            real = gpio_compat.os.path.join
            original = gpio_compat.os.listdir
            gpio_compat.os.listdir = lambda path: original(base) if path == "/sys/class/pwm" else original(path)
            gpio_compat.os.path.join = lambda a, *rest: real(base if a == "/sys/class/pwm" else a, *rest)
            try:
                self.assertEqual(gpio_compat.pwm_chip(), real(base, "pwmchip2"))
            finally:
                gpio_compat.os.listdir = original
                gpio_compat.os.path.join = real


if __name__ == "__main__":
    unittest.main()
