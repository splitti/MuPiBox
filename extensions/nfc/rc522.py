#!/usr/bin/env python3
"""NFC-Reader extension: the driver of the RC522 (NXP MFRC522, the cheap blue board) over SPI, run by the API part (api.js).

It says what it sees as one JSON object per line on stdout, the same lines as pn5180.py:

    {"event": "ready", "firmware": "v2.0", "product": "MFRC522"}
    {"event": "tag", "tech": "ISO14443A", "uid": "04A1B2C3"}
    {"event": "gone"}
    {"event": "error", "code": "no_chip", "message": "..."}

The RC522 reads ISO 14443 A only (NTAG, MIFARE and most cards and stickers), not ISO 15693. It needs python3-spidev (the SPI bus)
and python3-lgpio (the RST pin; the pin is optional, the board has a software reset too) and SPI switched on in the boot
configuration. The chip works on 3.3 V - never on 5 V.

A tag is looked for like this: wake-up (WUPA), anticollision and select for every cascade level, then halt. A halted tag answers
the next wake-up, so the same tag is found again and again while it lies on the reader, and a tag that does not answer any more
has gone (the Scanner of pn5180.py counts that).
"""

import argparse
import signal
import sys
import time

from pn5180 import ReaderError, Scanner, Tag, emit_line

# --- registers ------------------------------------------------------------------------------------------------------------------
COMMAND = 0x01
COM_IRQ = 0x04
ERROR = 0x06
FIFO_DATA = 0x09
FIFO_LEVEL = 0x0A
CONTROL = 0x0C
BIT_FRAMING = 0x0D
COLL = 0x0E
MODE = 0x11
TX_CONTROL = 0x14
TX_ASK = 0x15
T_MODE = 0x2A
T_PRESCALER = 0x2B
T_RELOAD_H = 0x2C
T_RELOAD_L = 0x2D
VERSION = 0x37

# --- commands -------------------------------------------------------------------------------------------------------------------
CMD_IDLE = 0x00
CMD_TRANSCEIVE = 0x0C
CMD_SOFT_RESET = 0x0F

# --- ISO 14443 A ----------------------------------------------------------------------------------------------------------------
WUPA = 0x52
HLTA = 0x50
SEL_LEVELS = (0x93, 0x95, 0x97)
CASCADE_TAG = 0x88


def crc_a(data):
    """The CRC_A of ISO 14443-3 (what a frame of a tag carries after its data): two bytes, the low one first."""
    crc = 0x6363
    for byte in data:
        byte ^= crc & 0xFF
        byte = (byte ^ (byte << 4)) & 0xFF
        crc = ((crc >> 8) ^ (byte << 8) ^ (byte << 3) ^ (byte >> 4)) & 0xFFFF
    return bytes([crc & 0xFF, crc >> 8])


def version_text(value):
    """What the version register says: 0x91 is 1.0, 0x92 is 2.0, 0x88 is a clone (FM17522), anything else is shown as it is."""
    known = {0x91: 'v1.0', 0x92: 'v2.0', 0x88: 'clone'}
    return known.get(value, '0x%02X' % value)


class Frame:
    """What the chip received: the bytes, how many bits of the last byte count, and whether two tags answered at once."""

    def __init__(self, data, last_bits=0, collision=False):
        self.data = data
        self.last_bits = last_bits
        self.collision = collision


class Hardware:
    """The SPI bus and the optional RST pin. Tests put a fake in its place."""

    def __init__(self, spi_device, chip, reset_pin, speed_hz=1000000):
        try:
            import spidev  # the Debian package python3-spidev
            import lgpio  # the Debian package python3-lgpio
        except ImportError as error:
            raise ReaderError('no_python', 'a Python package is missing: %s' % error)
        bus, device = (int(x) for x in spi_device.split('.'))
        self._spi = spidev.SpiDev()
        try:
            self._spi.open(bus, device)
        except FileNotFoundError:
            raise ReaderError('no_spi', '/dev/spidev%d.%d does not exist: SPI is switched off (dtparam=spi=on in config.txt)' % (bus, device))
        except PermissionError:
            raise ReaderError('spi_access', 'no access to /dev/spidev%d.%d (the udev rule of the extension)' % (bus, device))
        self._spi.mode = 0
        self._spi.max_speed_hz = speed_hz
        self._spi.bits_per_word = 8
        self._lgpio = lgpio
        self._reset = reset_pin
        self._chip = None
        if reset_pin:
            try:
                self._chip = lgpio.gpiochip_open(chip)
                lgpio.gpio_claim_output(self._chip, reset_pin, 1)
            except Exception as error:  # lgpio raises its own error type
                self.close()
                raise ReaderError('gpio', 'the pin RST (GPIO %d) cannot be used: %s' % (reset_pin, error))

    @property
    def has_reset(self):
        return bool(self._reset)

    def reset_level(self, high):
        if self._reset:
            self._lgpio.gpio_write(self._chip, self._reset, 1 if high else 0)

    def transfer(self, data):
        return bytes(self._spi.xfer2(list(data)))

    def close(self):
        try:
            self._spi.close()
        except Exception:
            pass
        if self._chip is not None:
            try:
                self._lgpio.gpio_free(self._chip, self._reset)
            except Exception:
                pass
            try:
                self._lgpio.gpiochip_close(self._chip)
            except Exception:
                pass
            self._chip = None


class RC522:
    def __init__(self, hw, sleep=time.sleep, clock=time.monotonic):
        self.hw = hw
        self.sleep = sleep
        self.clock = clock

    # -- registers: the first byte is the address (bit 7: read, bits 1 to 6: the register), a read clocks the value out behind it ---
    def read_register(self, reg):
        return self.hw.transfer([((reg << 1) & 0x7E) | 0x80, 0])[1]

    def write_register(self, reg, value):
        self.hw.transfer([(reg << 1) & 0x7E, value & 0xFF])

    def set_bits(self, reg, mask):
        self.write_register(reg, self.read_register(reg) | mask)

    def clear_bits(self, reg, mask):
        self.write_register(reg, self.read_register(reg) & ~mask)

    def reset(self):
        """Reset (the pin when there is one, always the soft reset), set the chip up, switch the antenna on. Returns the version."""
        if getattr(self.hw, 'has_reset', False):
            self.hw.reset_level(False)
            self.sleep(0.01)
            self.hw.reset_level(True)
            self.sleep(0.05)
        self.write_register(COMMAND, CMD_SOFT_RESET)
        self.sleep(0.05)
        version = self.read_register(VERSION)
        # (nothing connected: MISO floats to 0x00 or 0xFF)
        if version in (0x00, 0xFF):
            raise ReaderError('no_chip', 'the RC522 does not answer (version register 0x%02X)' % version)
        self.write_register(T_MODE, 0x80)  # the timer starts with the end of a frame
        self.write_register(T_PRESCALER, 0xA9)
        self.write_register(T_RELOAD_H, 0x03)  # about 25 ms until a tag that does not answer is given up
        self.write_register(T_RELOAD_L, 0xE8)
        self.write_register(TX_ASK, 0x40)  # 100 % ASK
        self.write_register(MODE, 0x3D)  # CRC preset 0x6363
        if not self.read_register(TX_CONTROL) & 0x03 == 0x03:
            self.set_bits(TX_CONTROL, 0x03)  # the antenna
        return version

    def versions(self):
        version = self.read_register(VERSION)
        return version_text(version), 'MFRC522'

    def transceive(self, data, valid_bits=0, timeout=0.05):
        """Sends the bytes and takes the answer: a Frame, or None when there is none (no tag, or one that answers wrongly)."""
        self.write_register(COMMAND, CMD_IDLE)
        self.write_register(COM_IRQ, 0x7F)  # all interrupt flags down
        self.write_register(FIFO_LEVEL, 0x80)  # flush the FIFO
        self.hw.transfer([(FIFO_DATA << 1) & 0x7E] + list(data))  # (the FIFO takes every byte after the address)
        self.write_register(BIT_FRAMING, valid_bits & 0x07)
        self.write_register(COMMAND, CMD_TRANSCEIVE)
        self.set_bits(BIT_FRAMING, 0x80)  # start sending
        deadline = self.clock() + timeout
        while True:
            irq = self.read_register(COM_IRQ)
            if irq & 0x30:  # received, or idle
                break
            if irq & 0x01 or self.clock() > deadline:  # the timer: nobody answered
                self.clear_bits(BIT_FRAMING, 0x80)
                return None
            self.sleep(0.001)
        self.clear_bits(BIT_FRAMING, 0x80)
        error = self.read_register(ERROR)
        collision = bool(error & 0x08)
        if error & 0x13:  # buffer overflow, parity, protocol
            return None
        count = self.read_register(FIFO_LEVEL)
        last_bits = self.read_register(CONTROL) & 0x07
        received = bytes(self.read_register(FIFO_DATA) for _ in range(min(count, 64)))
        return Frame(received, last_bits, collision)

    def poll_a(self):
        """A tag of ISO 14443 A in the field, or None. The tag is halted afterwards (so that it can be asked again)."""
        self.clear_bits(COLL, 0x80)
        atqa = self.transceive([WUPA], valid_bits=7)
        if not atqa or len(atqa.data) != 2:
            return None
        uid = bytearray()
        for sel in SEL_LEVELS:
            answer = self.transceive([sel, 0x20])  # anticollision: the uid (or three bytes of it behind 0x88) and the check byte
            if not answer or answer.collision or len(answer.data) != 5:
                return None
            block = answer.data
            if block[0] ^ block[1] ^ block[2] ^ block[3] != block[4]:
                return None
            frame = bytes([sel, 0x70]) + block
            sak = self.transceive(frame + crc_a(frame))
            if not sak or len(sak.data) != 3:
                return None
            if sak.data[0] & 0x04:  # the uid is not complete: the next level has the rest
                uid += block[1:4]
                continue
            uid += block[0:4]
            break
        else:
            return None
        halt = bytes([HLTA, 0x00])
        self.transceive(halt + crc_a(halt), timeout=0.005)  # (a tag does not answer a halt)
        return Tag('ISO14443A', bytes(uid))

    def poll_v(self):
        return None  # ISO 15693 is not what this chip does

    def close(self):
        try:
            self.clear_bits(TX_CONTROL, 0x03)  # the antenna off
        except Exception:
            pass


def parse_args(argv):
    parser = argparse.ArgumentParser(description='RC522 NFC reader for the MuPiBox')
    parser.add_argument('--reset', type=int, default=0, help='BCM number of the pin on the RST line (0: none)')
    parser.add_argument('--chip', type=int, default=0, help='number of the gpiochip of the header pins')
    parser.add_argument('--spi', default='0.0', help='SPI bus and chip select, 0.0 is /dev/spidev0.0 (CE0)')
    parser.add_argument('--interval', type=float, default=0.15, help='seconds between two looks')
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    stop = {'now': False}

    def on_signal(_signo, _frame):
        stop['now'] = True

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    hw = None
    chip = None
    try:
        emit_line({'event': 'starting'})
        hw = Hardware(args.spi, args.chip, args.reset)
        chip = RC522(hw)
        chip.reset()
        firmware, product = chip.versions()
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
        if hw:
            hw.close()


if __name__ == '__main__':
    sys.exit(main())
