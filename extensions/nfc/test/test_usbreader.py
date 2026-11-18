"""Tests of the USB reader driver (a reader that types the card number like a keyboard) without a device.

Run: python -m unittest discover -s extensions/nfc/test -p "test_*.py"
"""
import io
import json
import os
import struct
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import usbreader  # noqa: E402
from pn5180 import ReaderError  # noqa: E402
from usbreader import KeyReader, choose_device, describe, key_bit, list_readers, names_of, read_devices, usb_readers, usb_strings  # noqa: E402

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

    def test_of_the_devices_with_the_name_the_keyboard_is_taken(self):
        devices = [device('HXGCoLtd Keyboard Mouse', '/dev/input/event4', keyboard=False), device('HXGCoLtd Keyboard', '/dev/input/event0')]
        self.assertEqual(choose_device(devices, 'hxgco')['event'], '/dev/input/event0')

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


TERA = """I: Bus=0003 Vendor=0581 Product=011c Version=0110
N: Name="HID 0581:011c"
P: Phys=usb-xhci-hcd.0-2/input0
S: Sysfs=/devices/platform/usb1/1-2/1-2:1.0/0003:0581:011C.0001/input/input0
U: Uniq=
H: Handlers=sysrq kbd leds event0
B: PROP=0
B: EV=120013
B: KEY=1000000000007 ff800000000007ff f6beffdff3cfffff fffffffffffffffe
"""


SYSFS = '/devices/platform/usb1/1-2/interface/hid/input0'


class NamesTest(unittest.TestCase):
    """The name of a USB reader as the user knows it: its own text, else the database of the system, else the name of the system."""

    def sysroot(self, strings):
        """A made-up /sys: the folder of the USB device (with its ids and the texts it has) above the folder of the interface."""
        root = tempfile.mkdtemp()
        usb = os.path.join(root, 'devices', 'platform', 'usb1', '1-2')
        interface = os.path.join(usb, 'interface', 'hid', 'input0')  # (no colons in the names: this runs on Windows too)
        os.makedirs(interface)
        for name, value in dict(idVendor='0581', idProduct='011c', **strings).items():
            with open(os.path.join(usb, name), 'w', encoding='utf8') as handle:
                handle.write(value + chr(10))
        return root

    def test_the_ids_and_the_sysfs_path_are_read(self):
        device_ = read_devices(TERA)[0]
        self.assertEqual((device_['vendor'], device_['product']), ('0581', '011c'))
        self.assertTrue(device_['sysfs'].endswith('/input/input0'))

    def test_a_reader_that_carries_its_name_is_called_so(self):
        device_ = read_devices(TERA)[0]
        device_['sysfs'] = SYSFS
        root = self.sysroot({'manufacturer': 'Sycreader', 'product': 'RFID  Reader'})
        self.assertEqual(usb_strings(device_, root), ('Sycreader', 'RFID  Reader'))
        asked = []
        self.assertEqual(describe(device_, root, lambda v, p: asked.append((v, p)) or ('x', 'y')), 'RFID Reader')
        self.assertEqual(asked, [], 'the database is not asked when the device has a name')
        self.assertEqual(device_['maker'], 'Sycreader')

    def test_a_reader_without_a_name_is_called_what_the_database_calls_its_ids(self):
        device_ = read_devices(TERA)[0]
        device_['sysfs'] = SYSFS
        root = self.sysroot({})
        self.assertEqual(describe(device_, root, lambda v, p: ('Racal Data Group', 'Tera 5100 dongle') if (v, p) == ('0581', '011c') else ('', '')), 'Tera 5100 dongle')
        self.assertEqual(device_['maker'], 'Racal Data Group')

    def test_a_reader_nobody_knows_keeps_the_name_of_the_system(self):
        device_ = read_devices(TERA)[0]
        device_['sysfs'] = SYSFS
        self.assertEqual(describe(device_, self.sysroot({}), lambda v, p: ('', '')), 'HID 0581:011c')
        # (no sysfs path at all, a device that is no USB device: the same)
        self.assertEqual(describe({'name': 'x', 'label': 'x', 'usb': True, 'vendor': '1', 'product': '2', 'sysfs': ''}, tempfile.mkdtemp(), lambda v, p: ('', '')), 'x')
        self.assertEqual(describe({'name': 'pwr', 'label': 'pwr', 'usb': False}), 'pwr')

    def test_the_reader_can_be_asked_for_by_any_of_its_names(self):
        devices = read_devices(TERA + chr(10) + NEUFTECH)
        for entry in devices:
            if entry['usb'] and entry['keyboard']:
                entry['sysfs'] = SYSFS
                describe(entry, self.sysroot({}), lambda v, p: ('Racal Data Group', 'Tera 5100 dongle') if v == '0581' else ('', ''))
        for wanted in ('Tera', 'tera 5100', 'racal', '0581:011c', 'HID 0581', '/dev/input/event0'):
            self.assertEqual(choose_device(devices, wanted)['vendor'], '0581', wanted)
        self.assertIn('tera 5100 dongle', names_of(devices[0]))
        with self.assertRaises(ReaderError) as caught:
            choose_device(devices, 'nothing like it')
        self.assertIn('Tera 5100 dongle', caught.exception.message, 'what is found is named as the user knows it')


class SecondInterfaceTest(unittest.TestCase):
    """A reader that shows two input devices of the same name (one with keys, one without): the name finds the one that types."""

    def test_a_name_finds_the_keyboard_not_the_other_interface_of_the_reader(self):
        other = {'name': 'RFID Reader RFID Reader', 'label': 'RFID Reader', 'maker': 'RFID Reader', 'event': '/dev/input/event5', 'usb': True, 'keyboard': False, 'vendor': '1a86', 'product': 'dd01'}
        typing = dict(other, name='RFID Reader RFID Reader Keyboard', event='/dev/input/event6', keyboard=True)
        devices = [device('HID 0581:011c', '/dev/input/event0'), other, typing]
        for wanted in ('RFID Reader', '1a86:dd01', 'rfid'):
            self.assertEqual(choose_device(devices, wanted)['event'], '/dev/input/event6', wanted)
        # (its path still names the node exactly; a name that only the other node has is still found, as before)
        self.assertEqual(choose_device(devices, '/dev/input/event5')['event'], '/dev/input/event5')
        self.assertEqual(choose_device([other], 'RFID')['event'], '/dev/input/event5')


class ByIndexTest(unittest.TestCase):
    """"USB reader 1", "USB reader 2": the devices that type, by the port they are plugged in, without a name to type."""

    def devices(self):
        def entry(name, event, sysfs, keyboard=True):
            return {'name': name, 'label': name, 'maker': '', 'event': event, 'usb': True, 'keyboard': keyboard, 'vendor': 'aaaa', 'product': '0001', 'sysfs': sysfs}
        return [entry('Second port', '/dev/input/event3', '/devices/usb3/3-2/x'), entry('Nothing types', '/dev/input/event2', '/devices/usb1/1-1/y', keyboard=False),
                entry('First port', '/dev/input/event0', '/devices/usb1/1-2/x'), device('vc4-hdmi', '/dev/input/event9', usb=False)]

    def test_the_readers_are_in_the_order_of_their_ports(self):
        self.assertEqual([d['name'] for d in usb_readers(self.devices())], ['First port', 'Second port'])

    def test_the_index_takes_the_first_second_reader(self):
        devices = self.devices()
        self.assertEqual(choose_device(devices, '', 1)['name'], 'First port')
        self.assertEqual(choose_device(devices, '', 2)['name'], 'Second port')
        with self.assertRaises(ReaderError) as caught:
            choose_device(devices, '', 3)
        self.assertEqual(caught.exception.code, 'no_device')

    def test_a_name_wins_over_the_index_and_no_index_is_as_before(self):
        devices = self.devices()
        self.assertEqual(choose_device(devices, 'second', 1)['name'], 'Second port')
        with self.assertRaises(ReaderError) as caught:
            choose_device(devices, '')
        self.assertEqual(caught.exception.code, 'several_devices')

    def test_the_list_says_the_readers_that_are_there(self):
        path = os.path.join(tempfile.mkdtemp(), 'devices')
        with open(path, 'w', encoding='utf8') as handle:
            handle.write(TERA)
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(list_readers(path), 0)
        found = json.loads(out.getvalue())
        self.assertEqual([(f['event'], f['ids']) for f in found], [('/dev/input/event0', '0581:011c')])
        # (nothing to read: an empty list, not an error)
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(list_readers(os.path.join(tempfile.mkdtemp(), 'none')), 0)
        self.assertEqual(json.loads(out.getvalue()), [])
