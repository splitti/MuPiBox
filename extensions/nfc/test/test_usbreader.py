"""Tests of the USB reader driver (a reader that types the card number like a keyboard) without a device.

Run: python -m unittest discover -s extensions/nfc/test -p "test_*.py"
"""
import os
import struct
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import usbreader  # noqa: E402
from pn5180 import ReaderError  # noqa: E402
from usbreader import KeyReader, choose_device, key_bit, read_devices  # noqa: E402

NEUFTECH = """I: Bus=0003 Vendor=ffff Product=0035 Version=0110
N: Name="HXGCoLtd Keyboard"
P: Phys=usb-0000:01:00.0-1.2/input0
S: Sysfs=/devices/platform/scb/fd500000.pcie/pci0000:00/0000:00:00.0/0000:01:00.0/usb1/1-1/1-1.2/1-1.2:1.0/0003:FFFF:0035.0001/input/input2
U: Uniq=
H: Handlers=sysrq kbd event0 leds
B: PROP=0
B: EV=120013
B: KEY=1000000000007 ff9f207ac14057ff febeffdfffefffff fffffffffffffffe
B: MSC=10
B: LED=7

I: Bus=0003 Vendor=046d Product=c31c Version=0110
N: Name="Logitech USB Keyboard"
P: Phys=usb-0000:01:00.0-1.3/input0
H: Handlers=sysrq kbd event1 leds
B: PROP=0
B: EV=120013
B: KEY=1000000000007 ff9f207ac14057ff febeffdfffefffff fffffffffffffffe

I: Bus=0000 Vendor=0000 Product=0000 Version=0000
N: Name="vc4-hdmi"
P: Phys=vc4-hdmi/input0
H: Handlers=kbd event2
B: PROP=0
B: EV=3
B: KEY=3e0000 0 0 0 0

I: Bus=0003 Vendor=222a Product=0001 Version=0110
N: Name="ILITEK ILITEK-TP"
H: Handlers=mouse0 event3
B: EV=b
B: KEY=400 0 0 0 0 0
"""


def device(name, event='/dev/input/event0', usb=True, keyboard=True):
    return {'name': name, 'event': event, 'usb': usb, 'keyboard': keyboard}


class DevicesTest(unittest.TestCase):
    def test_a_key_is_in_the_bitmap_when_its_bit_is_set(self):
        keys = '1000000000007 ff9f207ac14057ff febeffdfffefffff fffffffffffffffe'
        self.assertTrue(key_bit(keys, 2))  # KEY_1
        self.assertTrue(key_bit(keys, 28))  # KEY_ENTER
        self.assertFalse(key_bit(keys, 0))
        self.assertFalse(key_bit('', 2))
        self.assertFalse(key_bit('zz', 2))

    def test_the_list_of_the_system_is_read(self):
        devices = read_devices(NEUFTECH)
        self.assertEqual([d['event'] for d in devices], ['/dev/input/event0', '/dev/input/event1', '/dev/input/event2', '/dev/input/event3'])
        self.assertEqual([(d['usb'], d['keyboard']) for d in devices], [(True, True), (True, True), (False, False), (True, False)])
        self.assertEqual(devices[0]['name'], 'HXGCoLtd Keyboard')

    def test_the_only_usb_keyboard_is_the_reader(self):
        devices = [device('HXGCoLtd Keyboard', '/dev/input/event0'), device('vc4-hdmi', '/dev/input/event2', usb=False), device('Mouse', '/dev/input/event3', keyboard=False)]
        self.assertEqual(choose_device(devices, '')['event'], '/dev/input/event0')

    def test_with_several_keyboards_the_one_that_looks_like_a_reader_is_taken(self):
        devices = [device('Logitech USB Keyboard', '/dev/input/event1'), device('Sycreader RFID Technology Co., Ltd SYC ID&IC USB Reader', '/dev/input/event0')]
        self.assertEqual(choose_device(devices, '')['event'], '/dev/input/event0')

    def test_with_several_keyboards_and_no_reader_in_sight_the_user_must_say(self):
        devices = [device('Logitech USB Keyboard', '/dev/input/event1'), device('HXGCoLtd Keyboard', '/dev/input/event0')]
        with self.assertRaises(ReaderError) as caught:
            choose_device(devices, '')
        self.assertEqual(caught.exception.code, 'several_devices')

    def test_no_keyboard_at_all_is_no_device(self):
        with self.assertRaises(ReaderError) as caught:
            choose_device([device('vc4-hdmi', usb=False)], '')
        self.assertEqual(caught.exception.code, 'no_device')

    def test_the_device_can_be_named_by_a_part_of_its_name_or_by_its_path(self):
        devices = [device('Logitech USB Keyboard', '/dev/input/event1'), device('HXGCoLtd Keyboard', '/dev/input/event0')]
        self.assertEqual(choose_device(devices, 'hxgco')['event'], '/dev/input/event0')
        self.assertEqual(choose_device(devices, '/dev/input/event1')['name'], 'Logitech USB Keyboard')
        with self.assertRaises(ReaderError):
            choose_device(devices, 'nothing like it')


class KeysTest(unittest.TestCase):
    def reader(self):
        self.events = []
        self.now = 0.0
        return KeyReader(self.events.append, clock=lambda: self.now)

    def type(self, reader, text, enter=True, gap=0.01):
        codes = {v: k for k, v in usbreader.KEYS.items() if k < 60}
        for char in text:
            self.now += gap
            reader.key(codes[char], 1)
            reader.key(codes[char], 0)
        if enter:
            self.now += gap
            reader.key(usbreader.KEY_ENTER, 1)

    def test_ten_digits_and_enter_are_a_card(self):
        reader = self.reader()
        self.type(reader, '0004567890')
        self.assertEqual(self.events, [{'event': 'tag', 'tech': 'HID', 'uid': '0004567890'}])

    def test_the_number_pad_and_the_enter_of_it_work_too(self):
        reader = self.reader()
        for code in (79, 80, 81, 75, 76, 77, 71, 72, 73, 82):  # 1 2 3 4 5 6 7 8 9 0
            self.now += 0.01
            reader.key(code, 1)
        reader.key(usbreader.KEY_KPENTER, 1)
        self.assertEqual(self.events[0]['uid'], '1234567890')

    def test_a_number_in_hex_has_its_letters(self):
        reader = self.reader()
        self.type(reader, '04A1B2C3')
        self.assertEqual(self.events[0]['uid'], '04A1B2C3')

    def test_a_short_number_gets_zeros_in_front_so_that_it_is_a_tag_id(self):
        reader = self.reader()
        self.type(reader, '45678')
        self.assertEqual(self.events[0]['uid'], '00045678')

    def test_a_run_of_keys_that_is_too_short_is_no_card(self):
        reader = self.reader()
        self.type(reader, '12')
        self.assertEqual(self.events, [])

    def test_only_the_press_counts_not_the_release_nor_the_repeat(self):
        reader = self.reader()
        reader.key(2, 1)
        reader.key(2, 2)
        reader.key(2, 0)
        self.assertEqual(reader.text, '1')

    def test_keys_that_are_no_digit_are_ignored(self):
        reader = self.reader()
        self.type(reader, '1234', enter=False)
        reader.key(30 + 40, 1)  # some other key
        self.assertEqual(reader.text, '1234')

    def test_what_was_typed_long_ago_is_dropped(self):
        reader = self.reader()
        self.type(reader, '123', enter=False)
        self.now += 5
        self.type(reader, '0004567890')
        self.assertEqual(self.events[0]['uid'], '0004567890')

    def test_the_same_card_twice_is_two_events(self):
        reader = self.reader()
        self.type(reader, '0004567890')
        self.type(reader, '0004567890')
        self.assertEqual(len(self.events), 2)

    def test_something_that_types_for_ever_is_no_card(self):
        reader = self.reader()
        self.type(reader, '1' * 30)
        self.assertLess(len(reader.text), usbreader.MAX_LENGTH + 1)


@unittest.skipIf(os.name == 'nt', 'select on a pipe is for Linux')
class EventsTest(unittest.TestCase):
    def test_the_events_of_a_device_end_as_cards(self):
        read, write = os.pipe()
        events = []
        reader = KeyReader(events.append)
        packed = b''
        for code in (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, usbreader.KEY_ENTER):
            packed += struct.pack('llHHi', 0, 0, usbreader.EV_KEY, code, 1)
            packed += struct.pack('llHHi', 0, 0, 0, 0, 0)  # a sync event in between
        os.write(write, packed)
        os.close(write)
        with self.assertRaises(ReaderError):  # (the device is gone at the end of the pipe)
            usbreader.read_events(read, reader, lambda: False, wait=0.05)
        os.close(read)
        self.assertEqual(events[0]['uid'], '1234567890')


class ArgumentsTest(unittest.TestCase):
    def test_the_device_is_found_by_default(self):
        self.assertEqual(usbreader.parse_args([]).device, '')

    def test_a_name_can_be_given(self):
        self.assertEqual(usbreader.parse_args(['--device', 'IC Reader']).device, 'IC Reader')


if __name__ == '__main__':
    unittest.main()
