"""Tests of the RC522 driver without a chip: a small model of the chip and of a tag answers what the driver sends.

Run: python -m unittest discover -s extensions/nfc/test -p "test_*.py"
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import rc522  # noqa: E402
from pn5180 import ReaderError, Scanner  # noqa: E402
from rc522 import RC522, crc_a, version_text  # noqa: E402


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


class ChipModel:
    """The chip as the driver sees it: registers behind the SPI frames, a FIFO, and a tag that answers what the chip sends."""

    def __init__(self, version=0x92, tag=None, reset_pin=False):
        self.reg = {}
        self.reg[rc522.VERSION] = version
        self.fifo = []
        self.tag = tag  # a function (data, valid_bits) -> bytes | None
        self.has_reset = reset_pin
        self.reset_levels = []
        self.sent = []

    def reset_level(self, high):
        self.reset_levels.append(high)

    def transfer(self, data):
        data = list(data)
        reg = (data[0] >> 1) & 0x3F
        if data[0] & 0x80:  # read
            return bytes([0, self._read(reg)])
        if reg == rc522.FIFO_DATA:
            self.fifo += data[1:]
        else:
            self._write(reg, data[1])
        return bytes(len(data))

    def _read(self, reg):
        if reg == rc522.FIFO_DATA:
            return self.fifo.pop(0) if self.fifo else 0
        if reg == rc522.FIFO_LEVEL:
            return len(self.fifo)
        return self.reg.get(reg, 0)

    def _write(self, reg, value):
        if reg == rc522.FIFO_LEVEL:
            if value & 0x80:
                self.fifo = []
            return
        if reg == rc522.COM_IRQ:
            self.reg[reg] = self.reg.get(reg, 0) & ~(value & 0x7F)
            return
        self.reg[reg] = value
        if reg == rc522.BIT_FRAMING and value & 0x80 and self.reg.get(rc522.COMMAND) == rc522.CMD_TRANSCEIVE:
            self._transceive(value & 0x07)

    def _transceive(self, valid_bits):
        data = bytes(self.fifo)
        self.fifo = []
        self.sent.append((data, valid_bits))
        answer = self.tag(data, valid_bits) if self.tag else None
        if answer is None:
            self.reg[rc522.COM_IRQ] = self.reg.get(rc522.COM_IRQ, 0) | 0x01  # the timer: nobody answered
            return
        self.fifo = list(answer)
        self.reg[rc522.COM_IRQ] = self.reg.get(rc522.COM_IRQ, 0) | 0x30


class TypeATag:
    """A tag of ISO 14443 A with a uid of 4 or 7 bytes, in the states the standard knows (idle, ready, active, halt)."""

    def __init__(self, uid):
        self.uid = bytes(uid)
        self.state = 'idle'
        self.level = 0

    def _block(self, level):
        if len(self.uid) == 4:
            part = self.uid
        elif level == 0:
            part = bytes([0x88]) + self.uid[0:3]
        else:
            part = self.uid[3:7]
        return part + bytes([part[0] ^ part[1] ^ part[2] ^ part[3]])

    def __call__(self, data, valid_bits):
        if valid_bits == 7:
            if data == b'\x52' or (data == b'\x26' and self.state == 'idle'):  # WUPA wakes a halted tag, REQA does not
                self.state = 'ready'
                self.level = 0
                return b'\x44\x00'
            return None
        if self.state == 'halt' or self.state == 'idle':
            return None
        if data[0] in (0x93, 0x95, 0x97) and len(data) == 2 and data[1] == 0x20:
            return self._block(self.level) if (0x93, 0x95, 0x97)[self.level] == data[0] else None
        if data[0] in (0x93, 0x95, 0x97) and len(data) == 9 and data[1] == 0x70:
            if data[7:9] != crc_a(data[:7]) or data[2:7] != self._block(self.level):
                return None
            more = len(self.uid) == 7 and self.level == 0
            self.level += 1
            if not more:
                self.state = 'active'
            sak = bytes([0x04 if more else 0x00])
            return sak + crc_a(sak)
        if data[:2] == b'\x50\x00' and data[2:4] == crc_a(b'\x50\x00'):
            self.state = 'halt'
            return None
        return None


def driver(tag=None, version=0x92, reset_pin=False):
    model = ChipModel(version, tag, reset_pin)
    clock = FakeClock()
    return RC522(model, sleep=clock.sleep, clock=clock.clock), model


class FramesTest(unittest.TestCase):
    def test_the_crc_of_a_halt_command_is_the_one_of_the_standard(self):
        self.assertEqual(crc_a(b'\x50\x00'), b'\x57\xcd')

    def test_the_versions_have_names(self):
        self.assertEqual(version_text(0x92), 'v2.0')
        self.assertEqual(version_text(0x91), 'v1.0')
        self.assertEqual(version_text(0x88), 'clone')
        self.assertEqual(version_text(0xB2), '0xB2')


class ChipTest(unittest.TestCase):
    def test_a_register_read_sets_bit_7_of_the_address_and_a_write_does_not(self):
        chip, model = driver()
        model.transfer = lambda data, real=model.transfer: (model.sent.append(list(data)), real(data))[1]
        chip.read_register(rc522.VERSION)
        chip.write_register(rc522.COMMAND, 0x0F)
        self.assertEqual(model.sent[0], [0xEE, 0])  # (0x37 << 1) | 0x80
        self.assertEqual(model.sent[1], [0x02, 0x0F])

    def test_the_chip_is_set_up_and_the_antenna_switched_on(self):
        chip, model = driver()
        self.assertEqual(chip.reset(), 0x92)
        self.assertEqual(model.reg[rc522.TX_CONTROL] & 0x03, 0x03)
        self.assertEqual(model.reg[rc522.MODE], 0x3D)
        self.assertEqual(model.reg[rc522.T_RELOAD_H], 0x03)

    def test_a_pin_for_reset_is_pulsed_low_then_high(self):
        chip, model = driver(reset_pin=True)
        chip.reset()
        self.assertEqual(model.reset_levels, [False, True])

    def test_without_a_pin_only_the_software_reset_is_used(self):
        chip, model = driver()
        chip.reset()
        self.assertEqual(model.reset_levels, [])

    def test_a_chip_that_is_not_there_answers_with_zeros_or_ones(self):
        for value in (0x00, 0xFF):
            chip, _ = driver(version=value)
            with self.assertRaises(ReaderError) as caught:
                chip.reset()
            self.assertEqual(caught.exception.code, 'no_chip')

    def test_the_versions_are_the_text_and_the_chip(self):
        chip, _ = driver()
        self.assertEqual(chip.versions(), ('v2.0', 'MFRC522'))


class PollTest(unittest.TestCase):
    def test_a_tag_with_a_uid_of_four_bytes_needs_one_level(self):
        chip, _ = driver(TypeATag(bytes.fromhex('04A1B2C3')))
        chip.reset()
        tag = chip.poll_a()
        self.assertEqual((tag.tech, tag.uid.hex().upper()), ('ISO14443A', '04A1B2C3'))

    def test_a_tag_with_a_uid_of_seven_bytes_is_read_over_two_cascade_levels(self):
        chip, _ = driver(TypeATag(bytes.fromhex('04A1B2C3D4E5F6')))
        chip.reset()
        self.assertEqual(chip.poll_a().uid.hex().upper(), '04A1B2C3D4E5F6')

    def test_the_wake_up_is_sent_with_seven_bits(self):
        chip, model = driver(TypeATag(bytes.fromhex('04A1B2C3')))
        chip.reset()
        chip.poll_a()
        self.assertEqual(model.sent[0], (b'\x52', 7))

    def test_the_tag_is_halted_after_it_was_read_and_found_again(self):
        tag = TypeATag(bytes.fromhex('04A1B2C3'))
        chip, model = driver(tag)
        chip.reset()
        self.assertIsNotNone(chip.poll_a())
        self.assertEqual(tag.state, 'halt')
        self.assertEqual(model.sent[-1][0], b'\x50\x00' + crc_a(b'\x50\x00'))
        self.assertIsNotNone(chip.poll_a())  # (the wake-up brings a halted tag back)

    def test_no_tag_in_the_field_is_none(self):
        chip, _ = driver(lambda data, bits: None)
        chip.reset()
        self.assertIsNone(chip.poll_a())

    def test_an_answer_with_a_wrong_check_byte_is_not_a_tag(self):
        def answers(data, bits):
            if bits == 7:
                return b'\x44\x00'
            return bytes([0x04, 0xA1, 0xB2, 0xC3, 0x00])  # (the check byte is wrong)

        chip, _ = driver(answers)
        chip.reset()
        self.assertIsNone(chip.poll_a())

    def test_a_collision_is_not_a_tag(self):
        chip, model = driver(TypeATag(bytes.fromhex('04A1B2C3')))
        chip.reset()
        real = model._transceive

        def colliding(valid_bits):
            real(valid_bits)
            if model.sent[-1][0][:1] == b'\x93' and len(model.sent[-1][0]) == 2:
                model.reg[rc522.ERROR] = 0x08

        model._transceive = colliding
        self.assertIsNone(chip.poll_a())

    def test_an_error_of_the_chip_is_not_an_answer(self):
        chip, model = driver(TypeATag(bytes.fromhex('04A1B2C3')))
        chip.reset()
        model.reg[rc522.ERROR] = 0x02  # parity error
        self.assertIsNone(chip.poll_a())

    def test_iso_15693_is_not_what_this_chip_does(self):
        chip, _ = driver()
        self.assertIsNone(chip.poll_v())


class ScannerTest(unittest.TestCase):
    def test_a_tag_is_reported_once_while_it_stays_and_the_scanner_says_when_it_has_gone(self):
        tag = TypeATag(bytes.fromhex('04A1B2C3'))
        chip, model = driver(tag)
        chip.reset()
        events = []
        scanner = Scanner(chip, 'a', events.append, sleep=lambda s: None)
        for _ in range(3):
            scanner.step()
        self.assertEqual([e['event'] for e in events], ['tag'])
        self.assertEqual(events[0]['uid'], '04A1B2C3')
        model.tag = lambda data, bits: None  # taken off
        for _ in range(3):
            scanner.step()
        self.assertEqual([e['event'] for e in events], ['tag', 'gone'])


class ArgumentsTest(unittest.TestCase):
    def test_everything_has_a_default_the_reset_pin_is_none(self):
        args = rc522.parse_args([])
        self.assertEqual((args.reset, args.chip, args.spi), (0, 0, '0.0'))

    def test_the_pin_the_chip_and_the_device_can_be_given(self):
        args = rc522.parse_args(['--reset', '25', '--chip', '4', '--spi', '0.1'])
        self.assertEqual((args.reset, args.chip, args.spi), (25, 4, '0.1'))


if __name__ == '__main__':
    unittest.main()
