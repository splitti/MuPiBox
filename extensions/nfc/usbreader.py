#!/usr/bin/env python3
"""NFC-Reader extension: the driver of a USB RFID reader that acts as a keyboard (HID; the Neuftech and Sycreader kind), run by the
API part (api.js).

Such a reader types the number of the card like a keyboard does - ten digits and Enter, or a hex number - when a card comes near.
It says nothing when the card goes away. The driver reads the key presses of the device from /dev/input/event* and takes the device for
itself (EVIOCGRAB), so that the digits do not land in the console or the browser of the display. It says what it sees as one JSON
object per line on stdout, the same lines as pn5180.py:

    {"event": "ready", "firmware": "", "product": "IC Reader"}
    {"event": "tag", "tech": "HID", "uid": "0004567890"}
    {"event": "error", "code": "no_device", "message": "..."}

No package is needed. The device must be readable for the user (the udev rule of the extension gives USB input devices to the group
gpio). The `uid` is the number as the reader typed it, at least eight characters (shorter numbers get zeros in front).
"""

import argparse
import json
import os
import re
import select
import signal
import struct
import subprocess
import sys
import time

from pn5180 import ReaderError, emit_line

EV_KEY = 1
EVIOCGRAB = 0x40044590
EVENT = struct.Struct('llHHi')  # struct input_event: the time (two longs), the type, the code, the value

KEY_ENTER = 28
KEY_KPENTER = 96
# the digits and the letters A to F (a reader that types its number in hex; Shift makes no difference)
KEYS = {2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9', 11: '0',
        79: '1', 80: '2', 81: '3', 75: '4', 76: '5', 77: '6', 71: '7', 72: '8', 73: '9', 82: '0',
        30: 'A', 48: 'B', 46: 'C', 32: 'D', 18: 'E', 33: 'F'}
MIN_LENGTH = 4  # (a shorter run of keys before Enter is no card)
MAX_LENGTH = 20
PAUSE = 1.0  # seconds between two keys of one number; longer and what was typed so far is dropped
NAME_HINTS = re.compile(r'rfid|reader|card|nfc|\bic\b|sycreader|neuftech|hid', re.IGNORECASE)


def key_bit(bitmap, code):
    """Whether the key `code` is in a bitmap of /proc/bus/input/devices ("B: KEY=1000 7 ff..."): 64-bit words, the highest first."""
    words = bitmap.split()
    index = len(words) - 1 - code // 64
    if index < 0:
        return False
    try:
        return bool(int(words[index], 16) >> (code % 64) & 1)
    except ValueError:
        return False


def read_devices(text):
    """The input devices of /proc/bus/input/devices: [{ name, event, usb, keyboard, vendor, product, sysfs }] (event: the path of its
    node; vendor and product: the USB ids as four hex digits; sysfs: the path below /sys)."""
    devices = []
    for block in re.split(r'\n\s*\n', text.strip()):
        name = bus = handlers = keys = vendor = product = sysfs = ''
        for line in block.splitlines():
            if line.startswith('N: Name='):
                name = line[len('N: Name='):].strip().strip('"')
            elif line.startswith('S: Sysfs='):
                sysfs = line[len('S: Sysfs='):].strip()
            elif line.startswith('I: '):
                m = re.search(r'Bus=([0-9a-fA-F]+)', line)
                bus = m.group(1) if m else ''
                m = re.search(r'Vendor=([0-9a-fA-F]{4})', line)
                vendor = m.group(1).lower() if m else ''
                m = re.search(r'Product=([0-9a-fA-F]{4})', line)
                product = m.group(1).lower() if m else ''
            elif line.startswith('H: Handlers='):
                handlers = line[len('H: Handlers='):]
            elif line.startswith('B: KEY='):
                keys = line[len('B: KEY='):]
        m = re.search(r'\bevent(\d+)\b', handlers)
        if not m:
            continue
        devices.append({
            'name': name,
            'event': '/dev/input/event%s' % m.group(1),
            'usb': int(bus or '0', 16) == 3,
            'vendor': vendor,
            'product': product,
            'sysfs': sysfs,
            # what the device is called for the user (describe() fills it in); until then the name the system gives it
            'label': name,
            'maker': '',
            # a device that has the digits and Enter is a keyboard to us
            'keyboard': key_bit(keys, 2) and key_bit(keys, KEY_ENTER),
        })
    return devices


def usb_strings(device, sysroot='/sys'):
    """The texts the USB device carries itself (manufacturer, product), from the folder of its sysfs path that has the USB ids; ('', '')
    when it has none (many cheap readers do not)."""
    path = os.path.join(sysroot, (device.get('sysfs') or '').lstrip('/'))
    for _ in range(8):
        if os.path.isfile(os.path.join(path, 'idVendor')):
            def read(name):
                try:
                    with open(os.path.join(path, name), encoding='utf8', errors='replace') as handle:
                        return handle.read().strip()
                except OSError:
                    return ''
            return read('manufacturer'), read('product')
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
    return '', ''


def hwdb_names(vendor, product):
    """(vendor, product) as the database of the system (usb.ids, through `systemd-hwdb`) names the ids; ('', '') when it does not."""
    try:
        out = subprocess.run(['systemd-hwdb', 'query', 'usb:v%sp%s' % (vendor.upper(), product.upper())], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return '', ''
    found = {}
    for line in out.splitlines():
        key, _, value = line.partition('=')
        found[key.strip()] = value.strip().replace('_', ' ')
    return found.get('ID_VENDOR_FROM_DATABASE', ''), found.get('ID_MODEL_FROM_DATABASE', '')


def describe(device, sysroot='/sys', names=hwdb_names):
    """What a USB device is called, for the user: its own product text, else the name of its ids in the database of the system
    (a reader with a "HID 0581:011c" for a name is the "Tera 5100 dongle" there), else the name the system gives it. Fills `label`
    (the product) and `maker` of the device and returns the label."""
    if not device.get('usb'):
        return device['label']
    maker, product = usb_strings(device, sysroot)
    if not product and device.get('vendor') and device.get('product'):
        db_maker, db_product = names(device['vendor'], device['product'])
        maker, product = maker or db_maker, db_product
    if product:
        device['label'] = re.sub(r'\s+', ' ', product)[:60]
    device['maker'] = re.sub(r'\s+', ' ', maker)[:60]
    return device['label']


def names_of(device):
    """Everything the user may call the device by, for the search by name: what it is called, its maker, the name of the system, its ids."""
    ids = '%s:%s' % (device.get('vendor', ''), device.get('product', '')) if device.get('vendor') else ''
    return ' '.join([device.get('label', ''), device.get('maker', ''), device['name'], ids]).lower()


def usb_readers(devices):
    """The USB devices that type, in a fixed order: by the place they are plugged in (their path in /sys), so that "USB reader 1" and
    "USB reader 2" stay the same devices as long as they stay in their ports."""
    return sorted((d for d in devices if d['usb'] and d['keyboard']), key=lambda d: (d.get('sysfs', ''), d['event']))


def choose_device(devices, wanted, index=0):
    """The device to read: the one named (a part of its name, or its path); else, with `index` (1, 2, ...), the first, second ... of the
    USB readers (usb_readers); else the only USB keyboard, else the one that looks like a reader. Returns the device; a ReaderError
    says what is missing or too many."""
    keyboards = [d for d in devices if d['usb'] and d['keyboard']]
    wanted = (wanted or '').strip()
    if index > 0 and not wanted:
        ordered = usb_readers(devices)
        if index > len(ordered):
            raise ReaderError('no_device', 'no USB reader %d: %d found' % (index, len(ordered)))
        return ordered[index - 1]
    if wanted:
        # (the path names a node exactly; a name is looked for among the keyboards first - a reader has other nodes too, which never type
        # a number: its second interface has the same name)
        for d in devices:
            if wanted == d['event']:
                return d
        for pool in (keyboards, devices):
            for d in pool:
                if wanted.lower() in names_of(d):
                    return d
        raise ReaderError('no_device', 'no input device "%s" (found: %s)' % (wanted, ', '.join(d.get('label') or d['name'] for d in keyboards) or 'no USB keyboard'))
    if len(keyboards) == 1:
        return keyboards[0]
    if not keyboards:
        raise ReaderError('no_device', 'no USB reader found: plug it in')
    hits = [d for d in keyboards if NAME_HINTS.search(d['name'] + ' ' + d.get('label', ''))]
    if len(hits) == 1:
        return hits[0]
    raise ReaderError('several_devices', 'several USB keyboards: %s - name the reader in the settings' % ', '.join(d.get('label') or d['name'] for d in keyboards))


class KeyReader:
    """Collects the keys of a reader to numbers: digits (or A to F) until Enter."""

    def __init__(self, emit, clock=time.monotonic):
        self.emit = emit
        self.clock = clock
        self.text = ''
        self.last = 0.0

    def key(self, code, value):
        if value != 1:  # only the press (not the release, not the repeat)
            return
        now = self.clock()
        if self.text and now - self.last > PAUSE:
            self.text = ''
        self.last = now
        if code in (KEY_ENTER, KEY_KPENTER):
            text, self.text = self.text, ''
            if MIN_LENGTH <= len(text) <= MAX_LENGTH:
                self.emit({'event': 'tag', 'tech': 'HID', 'uid': text.rjust(8, '0')})
            return
        char = KEYS.get(code)
        if char:
            self.text += char
            if len(self.text) > MAX_LENGTH:
                self.text = ''  # (not a card: something else is typing)


def read_events(fd, reader, stopped, wait=0.5):
    """Reads the key events of the device until `stopped()`; a device that goes away is an error."""
    size = EVENT.size
    buffer = b''
    while not stopped():
        ready, _, _ = select.select([fd], [], [], wait)
        if not ready:
            continue
        try:
            chunk = os.read(fd, size * 16)
        except OSError as error:
            raise ReaderError('no_device', 'the device is gone: %s' % error)
        if not chunk:
            raise ReaderError('no_device', 'the device is gone')
        buffer += chunk
        while len(buffer) >= size:
            _, _, kind, code, value = EVENT.unpack(buffer[:size])
            buffer = buffer[size:]
            if kind == EV_KEY:
                reader.key(code, value)


def parse_args(argv):
    parser = argparse.ArgumentParser(description='USB RFID reader (keyboard) for the MuPiBox')
    parser.add_argument('--device', default='', help='a part of the name of the device, or its path (/dev/input/event3); empty: find it')
    parser.add_argument('--index', type=int, default=0, help='no name: the first (1), second (2) ... USB reader, in the order of their ports')
    parser.add_argument('--list', action='store_true', help='say the USB readers that are plugged in as one JSON list, and end')
    parser.add_argument('--devices', default='/proc/bus/input/devices', help='the list of the input devices of the system')
    return parser.parse_args(argv)


def list_readers(path):
    """--list: [{ event, label, maker, ids }] of the USB readers in their order, on stdout (the API part asks for it to tell which
    "USB reader" there are). Nothing is opened or taken."""
    try:
        with open(path, encoding='utf8', errors='replace') as handle:
            devices = read_devices(handle.read())
    except OSError:
        devices = []
    found = []
    for entry in usb_readers(devices):
        describe(entry)
        found.append({'event': entry['event'], 'label': entry['label'], 'maker': entry['maker'], 'ids': '%s:%s' % (entry['vendor'], entry['product'])})
    sys.stdout.write(json.dumps(found) + chr(10))
    sys.stdout.flush()
    return 0


def main(argv=None):
    args = parse_args(argv)
    if args.list:
        return list_readers(args.devices)
    stop = {'now': False}

    def on_signal(_signo, _frame):
        stop['now'] = True

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    fd = None
    try:
        emit_line({'event': 'starting'})
        try:
            with open(args.devices, encoding='utf8', errors='replace') as handle:
                devices = read_devices(handle.read())
        except OSError as error:
            raise ReaderError('no_device', 'the input devices cannot be listed: %s' % error)
        # (the names the devices carry: what the user knows them by - the status shows it, and a part of it may be typed as the name)
        for entry in devices:
            if entry['usb'] and entry['keyboard']:
                describe(entry)
        device = choose_device(devices, args.device, args.index)
        try:
            fd = os.open(device['event'], os.O_RDONLY | os.O_NONBLOCK)
        except PermissionError:
            raise ReaderError('input_access', 'no access to %s (the udev rule of the extension; plug the reader in again)' % device['event'])
        except FileNotFoundError:
            raise ReaderError('no_device', '%s does not exist' % device['event'])
        try:
            import fcntl

            fcntl.ioctl(fd, EVIOCGRAB, 1)  # the digits are for us alone
        except OSError as error:
            raise ReaderError('input_access', 'the device %s is used by something else: %s' % (device['event'], error))
        emit_line({'event': 'ready', 'firmware': '', 'product': (device.get('label') or device['name'])[:60]})
        read_events(fd, KeyReader(emit_line), lambda: stop['now'])
        return 0
    except ReaderError as error:
        emit_line({'event': 'error', 'code': error.code, 'message': error.message})
        return 2
    except Exception as error:  # nothing of a reader may bring the box down: say it and end (the API part starts it again later)
        emit_line({'event': 'error', 'code': 'other', 'message': '%s: %s' % (type(error).__name__, error)})
        return 2
    finally:
        if fd is not None:
            os.close(fd)


if __name__ == '__main__':
    sys.exit(main())
