#!/usr/bin/python3
"""Rotary encoder (KY-040 style) of the NFC extension: the knob that chooses an album. The program reads its two pins and the pin of its push
button and says what happened, one JSON object per line on stdout:
    {"event": "starting"}
    {"event": "ready"}
    {"event": "turn", "direction": 1}       one detent clockwise (-1: the other way)
    {"event": "button"}                     the push button was pressed
    {"event": "error", "code": "gpio", "message": "..."}
It needs python3-lgpio (the header's gpiochip: --chip). The pins are read by polling, as the box's own volume knob does (scripts/mupibox/rotary_control.py).
A knob that turns the wrong way: swap its A and B wires."""
import argparse
import atexit
import json
import os
import shutil
import signal
import sys
import tempfile
import time

# Gray code: previous state (A<<1|B) and new state -> +1 clockwise (A falls first while B is high, as on a KY-040), -1 counter clockwise, 0 bounce / invalid
TRANSITIONS = {
    (3, 1): 1, (1, 0): 1, (0, 2): 1, (2, 3): 1,
    (3, 2): -1, (2, 0): -1, (0, 1): -1, (1, 3): -1,
}
STEPS_PER_DETENT = 4
# every millisecond while the knob is used, every 5 ms while it rests (the box may run on a battery)
FAST_POLL_S = 0.001
IDLE_POLL_S = 0.005
FAST_FOR_S = 2.0
DEBOUNCE_S = 0.03


class KnobError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


class Decoder:
    """The turns of the knob out of the readings of its two pins: one event for each full detent."""

    def __init__(self, state=3):
        self.state = state
        self.accumulated = 0

    def feed(self, a, b):
        """The pins read now (0 or 1 each): +1 or -1 when a detent is complete, else 0."""
        new_state = (a << 1) | b
        if new_state == self.state:
            return 0
        self.accumulated += TRANSITIONS.get((self.state, new_state), 0)
        self.state = new_state
        if self.accumulated >= STEPS_PER_DETENT:
            self.accumulated = 0
            return 1
        if self.accumulated <= -STEPS_PER_DETENT:
            self.accumulated = 0
            return -1
        if new_state == 3 and abs(self.accumulated) < STEPS_PER_DETENT:
            self.accumulated = 0  # resting position without a full detent: it was a bounce
        return 0


class Hardware:
    """The pins of the knob. Tests put a fake in its place (read(pin) -> 0 or 1, close())."""

    def __init__(self, chip, pins):
        # (lgpio makes pipes in its working directory: the one of the server may not be writable, so it gets a directory of its own)
        if 'LG_WD' not in os.environ:
            directory = tempfile.mkdtemp(prefix='lgpio-')
            atexit.register(shutil.rmtree, directory, True)
            os.environ['LG_WD'] = directory
        try:
            import lgpio  # the Debian package python3-lgpio
        except ImportError as error:
            raise KnobError('no_python', 'a Python package is missing: %s' % error)
        self._lgpio = lgpio
        self._chip = None
        try:
            self._chip = lgpio.gpiochip_open(chip)
            for pin in pins:
                lgpio.gpio_claim_input(self._chip, pin, lgpio.SET_PULL_UP)
        except Exception as error:  # lgpio raises its own error type
            self.close()
            raise KnobError('gpio', 'the pins %s cannot be used: %s' % (', '.join('GPIO %d' % p for p in pins), error))

    def read(self, pin):
        return self._lgpio.gpio_read(self._chip, pin)

    def close(self):
        if self._chip is not None:
            try:
                self._lgpio.gpiochip_close(self._chip)
            except Exception:
                pass
            self._chip = None


def run(hardware, pin_a, pin_b, pin_button, emit, stop=lambda: False, sleep=time.sleep, clock=time.monotonic):
    """The loop: reads the pins until stop() says so. The button is a switch to ground (pressed = 0)."""
    read = hardware.read
    decoder = Decoder((read(pin_a) << 1) | read(pin_b))
    button_down = read(pin_button) == 0
    fast_until = 0.0
    while not stop():
        direction = decoder.feed(read(pin_a), read(pin_b))
        if decoder.state != 3 or direction:
            fast_until = clock() + FAST_FOR_S
        if direction:
            emit({'event': 'turn', 'direction': direction})
        pressed = read(pin_button) == 0
        if pressed and not button_down:
            sleep(DEBOUNCE_S)
            if read(pin_button) == 0:
                button_down = True
                emit({'event': 'button'})
        elif not pressed:
            button_down = False
        sleep(FAST_POLL_S if clock() < fast_until else IDLE_POLL_S)


def emit_line(obj):
    sys.stdout.write(json.dumps(obj) + '\n')
    sys.stdout.flush()


def parse_args(argv):
    parser = argparse.ArgumentParser(description='Rotary encoder of the NFC extension (album choice)')
    parser.add_argument('--chip', type=int, default=0, help='number of the gpiochip of the header pins')
    parser.add_argument('--a', type=int, required=True, help='BCM number of the pin A (CLK)')
    parser.add_argument('--b', type=int, required=True, help='BCM number of the pin B (DT)')
    parser.add_argument('--button', type=int, required=True, help='BCM number of the push button pin (to ground)')
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    stop = {'now': False}

    def on_signal(_signo, _frame):
        stop['now'] = True

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    hardware = None
    try:
        emit_line({'event': 'starting'})
        hardware = Hardware(args.chip, (args.a, args.b, args.button))
        emit_line({'event': 'ready'})
        run(hardware, args.a, args.b, args.button, emit_line, lambda: stop['now'])
        return 0
    except KnobError as error:
        emit_line({'event': 'error', 'code': error.code, 'message': error.message})
        return 2
    except Exception as error:  # nothing of a knob may bring the box down: say it and end (the API part starts it again later)
        emit_line({'event': 'error', 'code': 'other', 'message': '%s: %s' % (type(error).__name__, error)})
        return 2
    finally:
        if hardware:
            hardware.close()


if __name__ == '__main__':
    sys.exit(main())
