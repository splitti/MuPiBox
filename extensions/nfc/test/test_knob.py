"""Tests of the album knob driver: the decoding of the turns and the loop, with a fake of the pins - no GPIO needed."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import knob  # noqa: E402

# one detent clockwise on a KY-040 (A falls first while B is high), and the other way
CLOCKWISE = [(0, 1), (0, 0), (1, 0), (1, 1)]
COUNTER = [(1, 0), (0, 0), (0, 1), (1, 1)]


class FakePins:
    """The pins read in a given order: a list of (a, b, button) readings, the last one stays."""

    def __init__(self, readings):
        self.readings = list(readings)
        self.at = 0
        self.pins = (4, 5, 6)

    def read(self, pin):
        reading = self.readings[min(self.at, len(self.readings) - 1)]
        return reading[self.pins.index(pin)]

    def advance(self):
        self.at += 1


class DecoderTest(unittest.TestCase):
    def feed_all(self, steps):
        decoder = knob.Decoder()
        return [decoder.feed(a, b) for a, b in steps]

    def test_a_full_detent_clockwise_is_plus_one(self):
        self.assertEqual(self.feed_all(CLOCKWISE), [0, 0, 0, 1])

    def test_a_full_detent_the_other_way_is_minus_one(self):
        self.assertEqual(self.feed_all(COUNTER), [0, 0, 0, -1])

    def test_two_detents_are_two_events(self):
        self.assertEqual(sum(self.feed_all(CLOCKWISE * 2)), 2)
        self.assertEqual(sum(self.feed_all(COUNTER * 3)), -3)

    def test_a_bounce_back_to_rest_is_nothing(self):
        # (a step forward and the same step back: no detent)
        self.assertEqual(self.feed_all([(0, 1), (1, 1), (0, 1), (1, 1)]), [0, 0, 0, 0])
        decoder = knob.Decoder()
        for a, b in [(0, 1), (1, 1)]:
            decoder.feed(a, b)
        self.assertEqual(decoder.accumulated, 0)

    def test_an_unchanged_reading_is_nothing(self):
        decoder = knob.Decoder()
        self.assertEqual([decoder.feed(1, 1) for _ in range(5)], [0] * 5)

    def test_a_jump_over_a_state_is_not_counted(self):
        self.assertEqual(self.feed_all([(0, 0), (1, 1)]), [0, 0])


class LoopTest(unittest.TestCase):
    def run_loop(self, readings):
        pins = FakePins(readings)
        events = []
        clock = {'t': 0.0}

        def sleep(seconds):
            clock['t'] += seconds

        def stop():
            # one reading per round of the loop; the loop ends after the last
            done = pins.at >= len(readings)
            pins.advance()
            return done

        knob.run(pins, 4, 5, 6, events.append, stop, sleep, lambda: clock['t'])
        return events

    def test_a_turn_clockwise_and_back(self):
        readings = [(a, b, 1) for a, b in [(1, 1)] + CLOCKWISE + COUNTER]
        self.assertEqual(self.run_loop(readings), [{'event': 'turn', 'direction': 1}, {'event': 'turn', 'direction': -1}])

    def test_a_press_is_one_event_until_it_is_let_go(self):
        rest = (1, 1, 1)
        down = (1, 1, 0)
        events = self.run_loop([rest, rest, down, down, down, rest, down, down, rest])
        self.assertEqual(events, [{'event': 'button'}, {'event': 'button'}])

    def test_a_button_that_is_down_at_the_start_is_not_a_press(self):
        self.assertEqual(self.run_loop([(1, 1, 0)] * 4), [])

    def test_a_press_and_a_turn_do_not_disturb_each_other(self):
        readings = [(1, 1, 1), (0, 1, 1), (0, 0, 0), (1, 0, 0), (1, 1, 1)]
        self.assertEqual(self.run_loop(readings), [{'event': 'button'}, {'event': 'turn', 'direction': 1}])


class ErrorTest(unittest.TestCase):
    def test_a_missing_package_is_an_error_of_its_own(self):
        saved = sys.modules.get('lgpio')
        sys.modules['lgpio'] = None  # (an import of it fails)
        try:
            with self.assertRaises(knob.KnobError) as caught:
                knob.Hardware(0, (4, 5, 6))
            self.assertEqual(caught.exception.code, 'no_python')
        finally:
            if saved is None:
                sys.modules.pop('lgpio', None)
            else:
                sys.modules['lgpio'] = saved

    def test_the_arguments(self):
        args = knob.parse_args(['--chip', '4', '--a', '17', '--b', '27', '--button', '22'])
        self.assertEqual((args.chip, args.a, args.b, args.button), (4, 17, 27, 22))
        with self.assertRaises(SystemExit):
            knob.parse_args(['--a', '17'])


if __name__ == '__main__':
    unittest.main()
