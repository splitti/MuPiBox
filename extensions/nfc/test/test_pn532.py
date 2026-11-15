"""Tests of the PN532 driver without a chip: the frames, and a small model of the chip behind a fake transport.

Run: python -m unittest discover -s extensions/nfc/test -p "test_*.py"
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pn532  # noqa: E402
from pn5180 import ReaderError, Scanner  # noqa: E402
from pn532 import PN532, Timeout, encode_frame, parse_frame, reverse_bits  # noqa: E402


def chip_frame(data):
    """What the chip sends: the frame with D5 (the host's frame has D4)."""
    body = bytes([0xD5]) + bytes(data)
    return bytes([0x00, 0x00, 0xFF, len(body), (-len(body)) & 0xFF]) + body + bytes([(-sum(body)) & 0xFF, 0x00])


class FakeChip:
    """The transport as the driver sees it, with a chip behind it that answers by command. `handlers`: command -> data of the answer."""

    def __init__(self, handlers=None, silent=False):
        self.handlers = handlers or {}
        self.silent = silent
        self.written = []
        self.woken = 0
        self.answer = b''

    def wake(self):
        self.woken += 1

    def write(self, frame):
        self.written.append(bytes(frame))
        data = parse_request(frame)
        command, params = data[0], data[1:]
        handler = self.handlers.get(command)
        result = handler(params) if callable(handler) else handler
        self.answer = chip_frame(bytes([command + 1]) + result) if result is not None else b''

    def read_ack(self, timeout):
        if self.silent:
            raise Timeout()
        return pn532.ACK

    def read_frame(self, timeout):
        if not self.answer:
            raise Timeout()
        return self.answer

    def close(self):
        pass


def parse_request(frame):
    """The command and its bytes of a frame the host sent (checking the frame on the way)."""
    assert frame[:3] == b'\x00\x00\xff'
    length = frame[3]
    assert (length + frame[4]) & 0xFF == 0
    body = frame[5:5 + length]
    assert body[0] == 0xD4
    assert (sum(body) + frame[5 + length]) & 0xFF == 0
    assert frame[6 + length] == 0x00
    return body[1:]


FIRMWARE = bytes([0x32, 0x01, 0x06, 0x07])


def in_list(uid, sens=b'\x00\x04', sel=b'\x08'):
    return bytes([1, 1]) + sens + sel + bytes([len(uid)]) + bytes(uid)


def chip(uid=None, **kwargs):
    handlers = {
        pn532.CMD_GET_FIRMWARE_VERSION: FIRMWARE,
        pn532.CMD_SAM_CONFIGURATION: b'',
        pn532.CMD_RF_CONFIGURATION: b'',
        pn532.CMD_IN_LIST_PASSIVE_TARGET: (lambda params: in_list(uid)) if uid else bytes([0]),
    }
    handlers.update(kwargs)
    fake = FakeChip(handlers)
    return PN532(fake, sleep=lambda s: None), fake


class FramesTest(unittest.TestCase):
    def test_the_frame_of_the_command_for_the_firmware_is_the_one_of_the_data_sheet(self):
        self.assertEqual(encode_frame(b'\x02'), bytes.fromhex('0000ff02fed4022a00'))

    def test_the_answer_with_the_firmware_is_read(self):
        frame = bytes.fromhex('0000ff06fad50332010607e800')
        self.assertEqual(parse_frame(frame), bytes.fromhex('0332010607'))

    def test_an_ack_is_an_empty_frame(self):
        self.assertEqual(parse_frame(pn532.ACK), b'')

    def test_a_frame_that_is_not_whole_yet_is_none(self):
        self.assertIsNone(parse_frame(b''))
        self.assertIsNone(parse_frame(bytes.fromhex('0000ff06fad5033201')))

    def test_a_frame_with_a_wrong_check_sum_is_none(self):
        self.assertIsNone(parse_frame(bytes.fromhex('0000ff06fad50332010607e900')))
        self.assertIsNone(parse_frame(bytes.fromhex('0000ff06fbd50332010607e800')))

    def test_noise_in_front_of_the_frame_is_skipped(self):
        self.assertEqual(parse_frame(bytes.fromhex('ff00') + bytes.fromhex('0000ff06fad50332010607e800')), bytes.fromhex('0332010607'))

    def test_the_error_frame_of_the_chip_is_an_error(self):
        with self.assertRaises(ReaderError):
            parse_frame(bytes.fromhex('0000ff01ff7f8100'))

    def test_the_bits_of_a_byte_are_turned_over_for_spi(self):
        self.assertEqual(reverse_bits(b'\x01\x02\x80\xff\x00'), b'\x80\x40\x01\xff\x00')
        self.assertEqual(reverse_bits(reverse_bits(bytes(range(256)))), bytes(range(256)))


class ChipTest(unittest.TestCase):
    def test_the_chip_is_woken_and_set_up_and_says_its_firmware(self):
        driver, fake = chip()
        self.assertEqual(driver.reset(), ('1.6', 'PN532'))
        self.assertEqual(fake.woken, 1)
        commands = [parse_request(f)[0] for f in fake.written]
        self.assertEqual(commands, [pn532.CMD_GET_FIRMWARE_VERSION, pn532.CMD_SAM_CONFIGURATION, pn532.CMD_RF_CONFIGURATION])

    def test_the_chip_looks_for_a_tag_only_twice_not_for_ever(self):
        driver, fake = chip()
        driver.reset()
        self.assertEqual(parse_request(fake.written[-1]), bytes([0x32, 0x05, 0xFF, 0x01, 0x02]))

    def test_a_chip_that_does_not_answer_is_not_there(self):
        fake = FakeChip(silent=True)
        driver = PN532(fake, sleep=lambda s: None)
        with self.assertRaises(ReaderError) as caught:
            driver.reset()
        self.assertEqual(caught.exception.code, 'no_chip')

    def test_a_chip_that_is_not_a_pn532_is_not_taken(self):
        driver, _ = chip()
        driver.transport.handlers[pn532.CMD_GET_FIRMWARE_VERSION] = bytes([0x33, 1, 6, 7])
        with self.assertRaises(ReaderError):
            driver.reset()

    def test_the_first_command_after_the_wake_up_may_be_lost(self):
        tries = []

        def firmware(params):
            tries.append(1)
            return FIRMWARE if len(tries) > 1 else None

        driver, _ = chip()
        driver.transport.handlers[pn532.CMD_GET_FIRMWARE_VERSION] = firmware
        self.assertEqual(driver.reset(), ('1.6', 'PN532'))
        self.assertEqual(len(tries), 2)


class PollTest(unittest.TestCase):
    def test_a_tag_with_a_uid_of_four_bytes(self):
        driver, _ = chip(uid=bytes.fromhex('04A1B2C3'))
        tag = driver.poll_a()
        self.assertEqual((tag.tech, tag.uid.hex().upper()), ('ISO14443A', '04A1B2C3'))

    def test_a_tag_with_a_uid_of_seven_bytes(self):
        driver, _ = chip(uid=bytes.fromhex('04A1B2C3D4E5F6'))
        self.assertEqual(driver.poll_a().uid.hex().upper(), '04A1B2C3D4E5F6')

    def test_the_look_asks_for_one_target_of_type_a_at_106_kbit(self):
        driver, fake = chip(uid=bytes.fromhex('04A1B2C3'))
        driver.poll_a()
        self.assertEqual(parse_request(fake.written[-1]), bytes([0x4A, 0x01, 0x00]))

    def test_no_tag_in_the_field_is_none(self):
        driver, _ = chip()
        self.assertIsNone(driver.poll_a())

    def test_an_answer_that_is_cut_off_is_not_a_tag(self):
        driver, _ = chip()
        driver.transport.handlers[pn532.CMD_IN_LIST_PASSIVE_TARGET] = bytes([1, 1, 0, 4, 8, 7, 4, 1])
        self.assertIsNone(driver.poll_a())

    def test_a_few_looks_without_an_answer_are_a_tag_that_is_not_there_many_are_an_error(self):
        fake = FakeChip(silent=True)
        driver = PN532(fake, sleep=lambda s: None)
        for _ in range(pn532.MAX_SILENT_LOOKS - 1):
            self.assertIsNone(driver.poll_a())
        with self.assertRaises(ReaderError):
            driver.poll_a()

    def test_iso_15693_is_not_what_this_chip_does(self):
        driver, _ = chip()
        self.assertIsNone(driver.poll_v())


class ScannerTest(unittest.TestCase):
    def test_a_tag_is_reported_once_and_has_gone_when_it_no_longer_answers(self):
        driver, fake = chip(uid=bytes.fromhex('04A1B2C3'))
        events = []
        scanner = Scanner(driver, 'a', events.append, sleep=lambda s: None)
        for _ in range(3):
            scanner.step()
        fake.handlers[pn532.CMD_IN_LIST_PASSIVE_TARGET] = bytes([0])
        for _ in range(3):
            scanner.step()
        self.assertEqual([e['event'] for e in events], ['tag', 'gone'])
        self.assertEqual(events[0]['uid'], '04A1B2C3')


class SpiTransportTest(unittest.TestCase):
    """The SPI transport talks least significant bit first, with a status read and a data read."""

    class Spi:
        def __init__(self, ready=True, answer=bytes(7)):
            self.sent = []
            self.ready = ready
            self.answer = answer

        def xfer2(self, data):
            data = list(data)
            self.sent.append(bytes(data))
            if data[0] == 0x40:  # status read, 0x02 turned over
                return [0, 0x80 if self.ready else 0]  # bit 0 set, turned over
            if data[0] == 0xC0:  # data read, 0x03 turned over
                return list(reverse_bits(bytes([0]) + self.answer[: len(data) - 1]))
            return [0] * len(data)

        def close(self):
            pass

    def transport(self, spi):
        t = pn532.SPITransport.__new__(pn532.SPITransport)
        t.spi = spi
        t.sleep = lambda s: None
        t.clock = lambda: 0.0
        return t

    def test_a_frame_is_sent_with_the_data_write_byte_and_the_bits_turned_over(self):
        spi = self.Spi()
        self.transport(spi).write(encode_frame(b'\x02'))
        self.assertEqual(reverse_bits(spi.sent[0]), b'\x01' + encode_frame(b'\x02'))

    def test_the_ack_is_read_when_the_chip_says_it_is_ready(self):
        spi = self.Spi(answer=pn532.ACK)
        self.assertEqual(self.transport(spi).read_ack(1.0), pn532.ACK)

    def test_a_chip_that_is_never_ready_is_a_timeout(self):
        clock = iter(range(1000))
        t = self.transport(self.Spi(ready=False))
        t.clock = lambda: next(clock)
        with self.assertRaises(Timeout):
            t.read_ack(5)


class ArgumentsTest(unittest.TestCase):
    def test_the_default_is_i2c_on_bus_1(self):
        args = pn532.parse_args([])
        self.assertEqual((args.link, args.i2c_bus, args.spi, args.uart), ('i2c', 1, '0.0', '/dev/serial0'))

    def test_the_interface_is_one_of_three(self):
        self.assertEqual(pn532.parse_args(['--link', 'uart', '--uart', '/dev/ttyAMA0']).uart, '/dev/ttyAMA0')
        with self.assertRaises(SystemExit):
            pn532.parse_args(['--link', 'usb'])


if __name__ == '__main__':
    unittest.main()
