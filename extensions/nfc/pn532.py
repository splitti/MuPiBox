#!/usr/bin/env python3
"""NFC-Reader extension: the driver of the PN532 (NXP) over I2C, SPI or the serial port, run by the API part (api.js).

It says what it sees as one JSON object per line on stdout, the same lines as pn5180.py:

    {"event": "ready", "firmware": "1.6", "product": "PN532"}
    {"event": "tag", "tech": "ISO14443A", "uid": "04A1B2C3"}
    {"event": "gone"}
    {"event": "error", "code": "no_chip", "message": "..."}

The PN532 reads ISO 14443 A (NTAG, MIFARE and most cards and stickers), not ISO 15693. The boards (Elechouse, Adafruit, the blue
ones) have two switches that choose the interface: I2C, SPI or HSU (the serial port). The driver needs no package but Python itself
for I2C and the serial port, and python3-spidev for SPI. It talks to the chip with the frames of the chip's "normal information
frame": preamble, length, TFI, command and data, check sums.

The three ways to the chip differ in how the host learns that an answer is ready: I2C and SPI give a status (bit 0 is "ready"),
the serial port just sends the bytes. The Transport classes hide that; the PN532 class above them knows the frames only.
"""

import argparse
import os
import signal
import sys
import time

from pn5180 import ReaderError, Scanner, Tag, emit_line

HOST_TO_CHIP = 0xD4
CHIP_TO_HOST = 0xD5
ACK = bytes([0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00])
I2C_ADDRESS = 0x24
I2C_SLAVE = 0x0703  # the ioctl that chooses the device of the bus

CMD_GET_FIRMWARE_VERSION = 0x02
CMD_SAM_CONFIGURATION = 0x14
CMD_RF_CONFIGURATION = 0x32
CMD_IN_LIST_PASSIVE_TARGET = 0x4A

# the chip does not answer this many looks in a row: it is gone (a look without a tag is an answer, too)
MAX_SILENT_LOOKS = 10


def encode_frame(data):
    """The frame for the data (command and its bytes): 00 00 FF LEN LCS D4 data DCS 00."""
    body = bytes([HOST_TO_CHIP]) + bytes(data)
    if len(body) > 255:
        raise ValueError('frame too long')
    length = len(body)
    checksum = (-sum(body)) & 0xFF
    return bytes([0x00, 0x00, 0xFF, length, (-length) & 0xFF]) + body + bytes([checksum, 0x00])


def parse_frame(buffer):
    """The data of the first frame in the bytes (without D5): b'' for an ACK, None when there is no whole, correct frame (yet).
    An error frame of the chip (the application level) is a ReaderError."""
    buffer = bytes(buffer)
    start = buffer.find(b'\x00\x00\xff')
    if start < 0 or len(buffer) < start + 5:
        return None
    length, length_check = buffer[start + 3], buffer[start + 4]
    if length == 0x00 and length_check == 0xFF:
        return b''  # ACK
    if length == 0xFF and length_check == 0x00:
        raise ReaderError('other', 'an extended frame of the PN532 (not expected)')
    if (length + length_check) & 0xFF != 0:
        return None
    end = start + 5 + length
    if len(buffer) < end + 1:
        return None
    body = buffer[start + 5:end]
    if (sum(body) + buffer[end]) & 0xFF != 0:
        return None
    if length == 1 and body[0] == 0x7F:
        raise ReaderError('other', 'the PN532 answers with an error frame')
    if not body or body[0] != CHIP_TO_HOST:
        return None
    return body[1:]


def reverse_bits(data):
    """The SPI of the PN532 sends the least significant bit first; the Raspberry Pi's SPI cannot, so the bytes are turned over here."""
    return bytes(int('{:08b}'.format(b)[::-1], 2) for b in data)


class Timeout(Exception):
    pass


# ------------------------------------------------------------------------------------------------------------------------------
# the three ways to the chip: write(frame), read_ack(timeout), read_frame(timeout) -> the raw bytes with the frame in them
# ------------------------------------------------------------------------------------------------------------------------------
class I2CTransport:
    def __init__(self, bus, sleep=time.sleep, clock=time.monotonic):
        self.sleep = sleep
        self.clock = clock
        path = '/dev/i2c-%d' % bus
        try:
            self.fd = os.open(path, os.O_RDWR)
        except FileNotFoundError:
            raise ReaderError('no_i2c', '%s does not exist: I2C is switched off (dtparam=i2c_arm=on in config.txt and the module i2c-dev)' % path)
        except PermissionError:
            raise ReaderError('i2c_access', 'no access to %s (the udev rule of the extension)' % path)
        try:
            import fcntl

            fcntl.ioctl(self.fd, I2C_SLAVE, I2C_ADDRESS)
        except OSError as error:
            os.close(self.fd)
            raise ReaderError('i2c_access', 'the I2C address 0x%02X cannot be used: %s' % (I2C_ADDRESS, error))

    def wake(self):
        pass  # the chip wakes with its address

    def write(self, frame):
        for attempt in range(5):  # (a sleeping chip does not acknowledge its address the first time)
            try:
                os.write(self.fd, frame)
                return
            except OSError:
                if attempt == 4:
                    raise ReaderError('no_chip', 'the PN532 does not answer on the I2C bus (address 0x%02X)' % I2C_ADDRESS)
                self.sleep(0.01)

    def _read_when_ready(self, length, timeout):
        deadline = self.clock() + timeout
        while True:
            try:
                data = os.read(self.fd, length + 1)
            except OSError:
                data = b''
            if data and data[0] & 0x01:
                return data[1:]
            if self.clock() > deadline:
                raise Timeout()
            self.sleep(0.005)

    def read_ack(self, timeout):
        return self._read_when_ready(len(ACK), timeout)

    def read_frame(self, timeout):
        return self._read_when_ready(64, timeout)

    def close(self):
        try:
            os.close(self.fd)
        except OSError:
            pass


class SPITransport:
    def __init__(self, spi_device, sleep=time.sleep, clock=time.monotonic, speed_hz=1000000):
        self.sleep = sleep
        self.clock = clock
        try:
            import spidev  # the Debian package python3-spidev
        except ImportError as error:
            raise ReaderError('no_python', 'a Python package is missing: %s' % error)
        bus, device = (int(x) for x in spi_device.split('.'))
        self.spi = spidev.SpiDev()
        try:
            self.spi.open(bus, device)
        except FileNotFoundError:
            raise ReaderError('no_spi', '/dev/spidev%d.%d does not exist: SPI is switched off (dtparam=spi=on in config.txt)' % (bus, device))
        except PermissionError:
            raise ReaderError('spi_access', 'no access to /dev/spidev%d.%d (the udev rule of the extension)' % (bus, device))
        self.spi.mode = 0
        self.spi.max_speed_hz = speed_hz
        self.spi.bits_per_word = 8

    def _xfer(self, data):
        return reverse_bits(self.spi.xfer2(list(reverse_bits(data))))

    def wake(self):
        self._xfer([0x00])  # chip select low for a moment wakes the chip
        self.sleep(0.05)

    def write(self, frame):
        self._xfer(bytes([0x01]) + frame)  # 0x01: data write

    def _ready(self):
        return bool(self._xfer([0x02, 0x00])[1] & 0x01)  # 0x02: status read

    def _read_when_ready(self, length, timeout):
        deadline = self.clock() + timeout
        while not self._ready():
            if self.clock() > deadline:
                raise Timeout()
            self.sleep(0.005)
        return self._xfer(bytes([0x03]) + bytes(length))[1:]  # 0x03: data read

    def read_ack(self, timeout):
        return self._read_when_ready(len(ACK), timeout)

    def read_frame(self, timeout):
        return self._read_when_ready(64, timeout)

    def close(self):
        try:
            self.spi.close()
        except Exception:
            pass


class SerialTransport:
    """HSU, the serial port of the board: 115200 baud, 8N1. Done with termios, no package needed."""

    def __init__(self, device, sleep=time.sleep, clock=time.monotonic):
        import termios

        self.sleep = sleep
        self.clock = clock
        self.pending = b''  # what came in behind the ACK: the start of the answer
        try:
            self.fd = os.open(device, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        except FileNotFoundError:
            raise ReaderError('no_serial', '%s does not exist: the serial port is switched off (enable_uart=1 in config.txt, the console off)' % device)
        except PermissionError:
            raise ReaderError('serial_access', 'no access to %s' % device)
        try:
            attrs = termios.tcgetattr(self.fd)
            attrs[0] = 0  # iflag
            attrs[1] = 0  # oflag
            attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL  # cflag
            attrs[3] = 0  # lflag: raw
            attrs[4] = attrs[5] = termios.B115200
            attrs[6][termios.VMIN] = 0
            attrs[6][termios.VTIME] = 0
            termios.tcsetattr(self.fd, termios.TCSANOW, attrs)
            termios.tcflush(self.fd, termios.TCIOFLUSH)
        except termios.error as error:
            os.close(self.fd)
            raise ReaderError('no_serial', '%s is not a serial port: %s' % (device, error))

    def wake(self):
        import termios

        os.write(self.fd, bytes([0x55, 0x55]) + bytes(14))
        self.sleep(0.05)
        termios.tcflush(self.fd, termios.TCIFLUSH)

    def write(self, frame):
        os.write(self.fd, frame)

    def _read_until(self, done, timeout):
        import select

        deadline = self.clock() + timeout
        buffer = self.pending
        self.pending = b''
        while True:
            if done(buffer):
                return buffer
            remaining = deadline - self.clock()
            if remaining <= 0:
                raise Timeout()
            ready, _, _ = select.select([self.fd], [], [], min(remaining, 0.05))
            if ready:
                try:
                    buffer += os.read(self.fd, 64)
                except BlockingIOError:
                    pass

    def read_ack(self, timeout):
        buffer = self._read_until(lambda b: b.find(ACK) >= 0, timeout)
        end = buffer.find(ACK) + len(ACK)
        self.pending = buffer[end:]
        return buffer[:end]

    def read_frame(self, timeout):
        def whole(buffer):
            try:
                return parse_frame(buffer) is not None
            except ReaderError:
                return True

        return self._read_until(whole, timeout)

    def close(self):
        try:
            os.close(self.fd)
        except OSError:
            pass


# ------------------------------------------------------------------------------------------------------------------------------
# the chip
# ------------------------------------------------------------------------------------------------------------------------------
class PN532:
    def __init__(self, transport, sleep=time.sleep):
        self.transport = transport
        self.sleep = sleep
        self.silent = 0

    def command(self, command, params=b'', timeout=1.0):
        """Sends a command, waits for the ACK and the answer, returns the data of the answer (behind D5 and the command + 1)."""
        self.transport.write(encode_frame(bytes([command]) + bytes(params)))
        try:
            ack = self.transport.read_ack(timeout)
        except Timeout:
            raise ReaderError('no_chip', 'the PN532 does not answer (no ACK): the switches for the interface, the wiring and the power supply')
        if parse_frame(ack) != b'':
            raise ReaderError('no_chip', 'the PN532 answers with something that is no ACK')
        try:
            raw = self.transport.read_frame(timeout)
        except Timeout:
            return None
        data = parse_frame(raw)
        if data is None or not data or data[0] != command + 1:
            return None
        return data[1:]

    def reset(self):
        """Wakes the chip, reads its version and switches it to the normal mode. Returns (firmware, product)."""
        self.transport.wake()
        answer = None
        for _ in range(3):  # (the first command after the wake-up may be lost)
            try:
                answer = self.command(CMD_GET_FIRMWARE_VERSION, timeout=0.5)
            except ReaderError:
                answer = None
            if answer:
                break
            self.sleep(0.1)
        if not answer or len(answer) < 4:
            raise ReaderError('no_chip', 'the PN532 does not answer: the switches for the interface, the wiring and the power supply')
        ic, version, revision = answer[0], answer[1], answer[2]
        if ic != 0x32:
            raise ReaderError('no_chip', 'the chip says 0x%02X, a PN532 says 0x32' % ic)
        self.command(CMD_SAM_CONFIGURATION, bytes([0x01, 0x14, 0x00]))  # normal mode, no SAM
        # (look for a tag only twice: with the default the chip waits for ever)
        self.command(CMD_RF_CONFIGURATION, bytes([0x05, 0xFF, 0x01, 0x02]))
        return '%d.%d' % (version, revision), 'PN532'

    def poll_a(self):
        """A tag of ISO 14443 A in the field (106 kbit/s), or None."""
        try:
            answer = self.command(CMD_IN_LIST_PASSIVE_TARGET, bytes([0x01, 0x00]), timeout=0.5)
            self.silent = 0
        except ReaderError:
            # (one look that goes wrong is a tag that is not there; the chip that says nothing for good is an error)
            self.silent += 1
            if self.silent >= MAX_SILENT_LOOKS:
                raise
            return None
        # NbTg, Tg, SENS_RES (2), SEL_RES, NFCID length, NFCID ...
        if not answer or answer[0] < 1 or len(answer) < 6:
            return None
        length = answer[5]
        uid = answer[6:6 + length]
        if length < 4 or len(uid) != length:
            return None
        return Tag('ISO14443A', bytes(uid))

    def poll_v(self):
        return None  # ISO 15693 is not what this chip does

    def close(self):
        self.transport.close()


def parse_args(argv):
    parser = argparse.ArgumentParser(description='PN532 NFC reader for the MuPiBox')
    parser.add_argument('--link', choices=('i2c', 'spi', 'uart'), default='i2c', help='the interface the board is switched to')
    parser.add_argument('--i2c-bus', type=int, default=1, help='number of the I2C bus (1 is /dev/i2c-1)')
    parser.add_argument('--spi', default='0.0', help='SPI bus and chip select, 0.0 is /dev/spidev0.0 (CE0)')
    parser.add_argument('--uart', default='/dev/serial0', help='the serial port')
    parser.add_argument('--interval', type=float, default=0.15, help='seconds between two looks')
    return parser.parse_args(argv)


def open_transport(args):
    if args.link == 'spi':
        return SPITransport(args.spi)
    if args.link == 'uart':
        return SerialTransport(args.uart)
    return I2CTransport(args.i2c_bus)


def main(argv=None):
    args = parse_args(argv)
    stop = {'now': False}

    def on_signal(_signo, _frame):
        stop['now'] = True

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    chip = None
    try:
        emit_line({'event': 'starting'})
        chip = PN532(open_transport(args))
        firmware, product = chip.reset()
        emit_line({'event': 'ready', 'firmware': firmware, 'product': product})
        Scanner(chip, 'a', emit_line).run(lambda: stop['now'], args.interval)
        return 0
    except ReaderError as error:
        emit_line({'event': 'error', 'code': error.code, 'message': error.message})
        return 2
    except Exception as error:  # nothing of a reader may bring the box down: say it and end (the API part starts it again later)
        emit_line({'event': 'error', 'code': 'other', 'message': '%s: %s' % (type(error).__name__, error)})
        return 2
    finally:
        if chip:
            chip.close()


if __name__ == '__main__':
    sys.exit(main())
