"""Tests of the PN5180 driver without a chip: a small model of the chip answers the frames the driver sends.

Run: python -m unittest discover -s extensions/nfc/test -p "test_*.py"
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pn5180  # noqa: E402
from pn5180 import PN5180, ReaderError, Scanner, Tag  # noqa: E402


class FakeClock:
    """Time that only moves when the driver sleeps, so that waiting for a timeout costs nothing."""

    def __init__(self):
        self.now = 0.0

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


class ChipModel:
    """The chip as the driver sees it: the SPI frames in, BUSY and the answers out."""

    def __init__(self, tag=None):
        self.registers = {pn5180.IRQ_STATUS: pn5180.IRQ_IDLE, pn5180.SYSTEM_CONFIG: 0, pn5180.RF_STATUS: 0, pn5180.RX_STATUS: 0}
        self.eeprom = {pn5180.EEPROM_FIRMWARE_VERSION: bytes([0, 4]), pn5180.EEPROM_PRODUCT_VERSION: bytes([5, 3])}
        self.frames = []  # (what was written) of every frame the host sent
        self.pending = b''  # the answer the chip has ready for the next read frame
        self.rx = b''
        self.tag = tag  # a function (data, valid_bits) -> bytes | None
        self.rf_config = None
        self.rf = False
        self.reset_levels = []
        self.busy_forever = False
        self._busy_pulse = 0

    # -- what the driver calls ------------------------------------------------------------------------------------------------
    def busy(self):
        if self.busy_forever:
            return True
        if self._busy_pulse > 0:
            self._busy_pulse -= 1
            return True
        return False

    def reset_level(self, high):
        self.reset_levels.append(high)

    def transfer(self, data):
        data = bytes(data)
        self._busy_pulse = 1
        if data and all(b == 0xFF for b in data) and self.pending is not None and len(data) == len(self.pending):
            out, self.pending = self.pending, b''
            return out
        self.frames.append(data)
        self._handle(data)
        return b'\x00' * len(data)

    def close(self):
        pass

    # -- the commands -----------------------------------------------------------------------------------------------------------
    def _handle(self, f):
        cmd = f[0]
        value = lambda raw: int.from_bytes(raw[:4], 'little')
        if cmd == pn5180.WRITE_REGISTER:
            reg = f[1]
            if reg == pn5180.IRQ_CLEAR:
                self.registers[pn5180.IRQ_STATUS] &= ~value(f[2:])
            else:
                self.registers[reg] = value(f[2:])
        elif cmd == pn5180.WRITE_REGISTER_OR_MASK:
            self.registers[f[1]] = self.registers.get(f[1], 0) | value(f[2:])
        elif cmd == pn5180.WRITE_REGISTER_AND_MASK:
            self.registers[f[1]] = self.registers.get(f[1], 0) & value(f[2:])
        elif cmd == pn5180.READ_REGISTER:
            reg = f[1]
            if reg == pn5180.RF_STATUS:
                # (transceive state: wait for transmit once the command bits say "transceive")
                self.registers[reg] = (pn5180.STATE_WAIT_TRANSMIT << 24) if (self.registers[pn5180.SYSTEM_CONFIG] & 7) == 3 else 0
            self.pending = self.registers.get(reg, 0).to_bytes(4, 'little')
        elif cmd == pn5180.READ_EEPROM:
            self.pending = self.eeprom.get(f[1], b'\xff' * f[2])[: f[2]]
        elif cmd == pn5180.LOAD_RF_CONFIG:
            self.rf_config = (f[1], f[2])
        elif cmd == pn5180.RF_ON:
            self.rf = True
            self.registers[pn5180.IRQ_STATUS] |= pn5180.IRQ_TX_RFON
        elif cmd == pn5180.RF_OFF:
            self.rf = False
            self.registers[pn5180.IRQ_STATUS] |= pn5180.IRQ_TX_RFOFF
        elif cmd == pn5180.SEND_DATA:
            answer = self.tag(bytes(f[2:]), f[1]) if self.tag else None
            if answer:
                self.rx = bytes(answer)
                self.registers[pn5180.RX_STATUS] = len(self.rx)
                self.registers[pn5180.IRQ_STATUS] |= pn5180.IRQ_RX
        elif cmd == pn5180.READ_DATA:
            self.pending = self.rx
        else:
            raise AssertionError('the driver sent a command the model does not know: %r' % (f,))


def make_chip(model):
    clock = FakeClock()
    return PN5180(model, sleep=clock.sleep, clock=clock.clock)


def bcc(part):
    return part[0] ^ part[1] ^ part[2] ^ part[3]


class Type2Tag:
    """An ISO 14443 A tag (NTAG-like) with a UID of 4 or 7 bytes that goes through the anticollision and answers again after a halt."""

    def __init__(self, uid):
        self.uid = bytes(uid)
        self.halted = False
        self.log = []

    def __call__(self, data, valid_bits):
        self.log.append((data, valid_bits))
        if data == b'\x52' and valid_bits == 7:
            return b'\x44\x00' if len(self.uid) == 7 else b'\x04\x00'
        if data[:1] == b'\x50':
            self.halted = True
            return None
        if len(self.uid) == 7:
            first, second = bytes([0x88]) + self.uid[:3], self.uid[3:]
            if data == b'\x93\x20':
                return first + bytes([bcc(first)])
            if data[:2] == b'\x93\x70':
                return b'\x04'
            if data == b'\x95\x20':
                return second + bytes([bcc(second)])
            if data[:2] == b'\x95\x70':
                return b'\x00'
        else:
            if data == b'\x93\x20':
                return self.uid + bytes([bcc(self.uid)])
            if data[:2] == b'\x93\x70':
                return b'\x00'
        return None


class DriverTest(unittest.TestCase):
    def test_a_register_is_written_least_significant_byte_first(self):
        model = ChipModel()
        make_chip(model).write_register(0x03, 0x12345678)
        self.assertEqual(model.frames, [bytes([0x00, 0x03, 0x78, 0x56, 0x34, 0x12])])

    def test_a_register_read_is_a_frame_with_the_command_and_a_second_one_that_clocks_the_answer_out(self):
        model = ChipModel()
        model.registers[0x13] = 0x01020304
        self.assertEqual(make_chip(model).read_register(0x13), 0x01020304)
        self.assertEqual(model.frames, [bytes([0x04, 0x13])])

    def test_the_chip_is_reset_with_a_pulse_on_rst_and_must_say_it_is_idle(self):
        model = ChipModel()
        make_chip(model).reset()
        self.assertEqual(model.reset_levels, [False, True])
        model.registers[pn5180.IRQ_STATUS] = 0
        with self.assertRaises(ReaderError) as caught:
            make_chip(model).reset()
        self.assertEqual(caught.exception.code, 'no_chip')

    def test_the_versions_are_major_dot_minor(self):
        self.assertEqual(make_chip(ChipModel()).versions(), ('4.0', '3.5'))

    def test_a_chip_that_answers_with_nothing_but_zeros_or_ones_is_not_there(self):
        for raw in (bytes([0, 0]), bytes([0xFF, 0xFF])):
            model = ChipModel()
            model.eeprom[pn5180.EEPROM_FIRMWARE_VERSION] = raw
            with self.assertRaises(ReaderError) as caught:
                make_chip(model).versions()
            self.assertEqual(caught.exception.code, 'no_chip')

    def test_a_busy_line_that_never_goes_low_is_reported_as_such(self):
        model = ChipModel()
        model.busy_forever = True
        with self.assertRaises(ReaderError) as caught:
            make_chip(model).write_register(0, 0)
        self.assertEqual(caught.exception.code, 'busy_timeout')

    def test_the_rf_part_is_set_up_for_the_kind_of_tag_and_the_field_switched_on(self):
        model = ChipModel()
        chip = make_chip(model)
        chip.use('a')
        self.assertEqual((model.rf_config, model.rf), ((0x00, 0x80), True))
        chip.use('v')
        self.assertEqual((model.rf_config, model.rf), ((0x0D, 0x8D), True))
        # (changing it switches the field off first)
        commands = [f[0] for f in model.frames]
        self.assertLess(commands.index(pn5180.RF_OFF), len(commands) - 1 - commands[::-1].index(pn5180.LOAD_RF_CONFIG))

    def test_a_tag_with_a_uid_of_seven_bytes_is_read_over_two_cascade_levels(self):
        uid = bytes([0x04, 0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6])
        tag = Type2Tag(uid)
        chip = make_chip(ChipModel(tag))
        found = chip.poll_a()
        self.assertEqual((found.tech, found.uid), ('ISO14443A', uid))
        self.assertTrue(tag.halted, 'the tag is halted so that it answers the next WUPA')

    def test_a_tag_with_a_uid_of_four_bytes_needs_one_level(self):
        uid = bytes([0xDE, 0xAD, 0xBE, 0xEF])
        found = make_chip(ChipModel(Type2Tag(uid))).poll_a()
        self.assertEqual(found.uid, uid)

    def test_the_same_tag_is_found_again_after_it_was_halted(self):
        tag = Type2Tag(bytes([0xDE, 0xAD, 0xBE, 0xEF]))
        chip = make_chip(ChipModel(tag))
        self.assertEqual(chip.poll_a().uid, chip.poll_a().uid)

    def test_no_tag_in_the_field_is_none(self):
        self.assertIsNone(make_chip(ChipModel()).poll_a())
        self.assertIsNone(make_chip(ChipModel()).poll_v())

    def test_an_answer_of_the_anticollision_with_a_wrong_check_byte_is_not_taken(self):
        class Broken(Type2Tag):
            def __call__(self, data, valid_bits):
                answer = super().__call__(data, valid_bits)
                if data == b'\x93\x20':
                    return answer[:4] + bytes([answer[4] ^ 0xFF])
                return answer

        self.assertIsNone(make_chip(ChipModel(Broken(bytes([1, 2, 3, 4])))).poll_a())

    def test_wake_up_is_sent_with_seven_bits_and_without_crc(self):
        tag = Type2Tag(bytes([1, 2, 3, 4]))
        make_chip(ChipModel(tag)).poll_a()
        self.assertEqual(tag.log[0], (b'\x52', 7))

    def test_an_iso_15693_tag_answers_the_inventory_with_its_uid_the_least_significant_byte_first(self):
        uid_lsb_first = bytes([0x78, 0x56, 0x34, 0x12, 0x00, 0x01, 0x04, 0xE0])

        def tag(data, valid_bits):
            self.assertEqual(data, b'\x26\x01\x00')
            return b'\x00\x00' + uid_lsb_first

        found = make_chip(ChipModel(tag)).poll_v()
        self.assertEqual((found.tech, pn5180.hexuid(found.uid)), ('ISO15693', 'E004010012345678'))

    def test_an_iso_15693_answer_with_the_error_flag_is_not_a_tag(self):
        self.assertIsNone(make_chip(ChipModel(lambda d, v: b'\x01\x00' + bytes(8))).poll_v())

    def test_damaged_data_is_not_an_answer(self):
        model = ChipModel(lambda d, v: b'\x44\x00')
        chip = make_chip(model)
        chip.use('a')
        orig = model._handle

        def damaged(frame):
            orig(frame)
            if frame[0] == pn5180.SEND_DATA:
                model.registers[pn5180.RX_STATUS] |= 1 << 16

        model._handle = damaged
        self.assertIsNone(chip.poll_a())


class FakeReader:
    """What the scanner asks: poll_a and poll_v, answered from a list."""

    def __init__(self, a=(), v=()):
        self.a, self.v = list(a), list(v)
        self.asked = []

    def poll_a(self):
        self.asked.append('a')
        return self.a.pop(0) if self.a else None

    def poll_v(self):
        self.asked.append('v')
        return self.v.pop(0) if self.v else None


class ScannerTest(unittest.TestCase):
    def run_steps(self, reader, tech, steps):
        out = []
        scanner = Scanner(reader, tech, out.append, sleep=lambda s: None)
        for _ in range(steps):
            scanner.step()
        return out, scanner

    def test_a_tag_is_reported_once_while_it_stays_and_once_when_it_has_gone(self):
        tag = Tag('ISO14443A', b'\x01\x02\x03\x04')
        reader = FakeReader(a=[tag, tag, tag])
        out, _ = self.run_steps(reader, 'a', 3 + pn5180.GONE_AFTER)
        self.assertEqual(out, [{'event': 'tag', 'tech': 'ISO14443A', 'uid': '01020304'}, {'event': 'gone'}])

    def test_one_missed_look_is_not_a_tag_that_has_gone(self):
        tag = Tag('ISO14443A', b'\x01\x02\x03\x04')
        reader = FakeReader(a=[tag, None, tag])
        out, _ = self.run_steps(reader, 'a', 3)
        self.assertEqual(len(out), 1)

    def test_another_tag_replaces_the_one_in_the_field(self):
        one, two = Tag('ISO14443A', b'\x01\x02\x03\x04'), Tag('ISO14443A', b'\x05\x06\x07\x08')
        out, _ = self.run_steps(FakeReader(a=[one, two]), 'a', 2)
        self.assertEqual([e['uid'] for e in out], ['01020304', '05060708'])

    def test_both_kinds_are_looked_for_in_turn_and_a_tag_found_is_followed_the_way_it_was_found(self):
        tag = Tag('ISO15693', bytes(8))
        reader = FakeReader(v=[tag, tag])
        out, _ = self.run_steps(reader, 'both', 3)
        self.assertEqual(reader.asked, ['a', 'v', 'v', 'v'])
        self.assertEqual(out[0]['tech'], 'ISO15693')

    def test_after_it_has_gone_both_kinds_are_looked_for_again(self):
        tag = Tag('ISO15693', bytes(8))
        reader = FakeReader(v=[tag])
        _, scanner = self.run_steps(reader, 'both', 2 + pn5180.GONE_AFTER)
        self.assertIsNone(scanner.current_mode)
        reader.asked.clear()
        scanner.step()
        self.assertEqual(reader.asked, ['a', 'v'])


class ArgumentsTest(unittest.TestCase):
    def test_the_pins_are_required_and_the_rest_has_defaults(self):
        args = pn5180.parse_args(['--busy', '25', '--reset', '23'])
        self.assertEqual((args.busy, args.reset, args.chip, args.spi, args.tech), (25, 23, 0, '0.0', 'both'))
        with self.assertRaises(SystemExit):
            pn5180.parse_args([])


if __name__ == '__main__':
    unittest.main()
