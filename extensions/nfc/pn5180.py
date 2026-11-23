#!/usr/bin/env python3
"""NFC-Reader extension: the driver of the PN5180 (NXP) over SPI, run by the API part of the extension (api.js).

It talks to the chip, looks for tags and tells what it sees as one JSON object per line on stdout:

    {"event": "ready", "firmware": "4.0", "product": "3.5"}
    {"event": "tag", "tech": "ISO14443A", "uid": "04A1B2C3D4E5F6"}
    {"event": "gone"}
    {"event": "error", "code": "no_chip", "message": "..."}

What it needs: python3-spidev (the SPI bus), python3-lgpio (the BUSY and RST pins; it knows every Raspberry Pi, the 5 too), SPI
switched on in the boot configuration. The SPI device must be readable for the user (the udev rule of the extension).

The chip's handshake (PN5180 datasheet, "Host interface"): a frame is only sent while BUSY is low; after every frame the chip
pulls BUSY high while it works and low again when it is ready. A command that answers is two frames: the command, then the host
clocks the answer out. The Linux SPI driver lets NSS (the chip select) go high after every transfer, which is what the chip wants
at the end of a frame.
"""

import argparse
import json
import signal
import sys
import time

# --- the commands of the chip -------------------------------------------------------------------------------------------------
WRITE_REGISTER = 0x00
WRITE_REGISTER_OR_MASK = 0x01
WRITE_REGISTER_AND_MASK = 0x02
READ_REGISTER = 0x04
READ_EEPROM = 0x07
SEND_DATA = 0x09
READ_DATA = 0x0A
LOAD_RF_CONFIG = 0x11
RF_ON = 0x16
RF_OFF = 0x17

# --- registers ------------------------------------------------------------------------------------------------------------
SYSTEM_CONFIG = 0x00
IRQ_STATUS = 0x02
IRQ_CLEAR = 0x03
RX_STATUS = 0x13
CRC_RX_CONFIG = 0x12
CRC_TX_CONFIG = 0x19
RF_STATUS = 0x1D

# --- bits of IRQ_STATUS ---------------------------------------------------------------------------------------------------
IRQ_RX = 1 << 0
IRQ_IDLE = 1 << 2
IRQ_TX_RFOFF = 1 << 8
IRQ_TX_RFON = 1 << 9
IRQ_GENERAL_ERROR = 1 << 17

# --- the EEPROM: version numbers (two bytes each: minor, major) ----------------------------------------------------------------
EEPROM_PRODUCT_VERSION = 0x10
EEPROM_FIRMWARE_VERSION = 0x12

# the state of the transceiver (RF_STATUS bits 24 to 26)
STATE_WAIT_TRANSMIT = 1

# the set-ups of the RF part: (transmitter, receiver) for ISO 14443 A at 106 kbit/s and ISO 15693 (ASK 100 %, 26 kbit/s)
RF_ISO14443A = (0x00, 0x80)
RF_ISO15693 = (0x0D, 0x8D)

# a tag that did not answer this many times in a row has gone
GONE_AFTER = 3


class ReaderError(Exception):
    """Something the reader or the wiring does wrong. `code` is what the API part turns into a hint for the user."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def hexuid(data):
    return ''.join('%02X' % b for b in data)


class Tag:
    def __init__(self, tech, uid):
        self.tech = tech
        self.uid = bytes(uid)

    @property
    def key(self):
        return (self.tech, self.uid)

    def __repr__(self):
        return 'Tag(%s %s)' % (self.tech, hexuid(self.uid))


# ------------------------------------------------------------------------------------------------------------------------------
# the hardware: the SPI bus and two pins. Tests put a fake in its place.
# ------------------------------------------------------------------------------------------------------------------------------
class Hardware:
    def __init__(self, spi_device, chip, busy_pin, reset_pin, speed_hz=1000000):
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
        self._busy = busy_pin
        self._reset = reset_pin
        try:
            self._chip = lgpio.gpiochip_open(chip)
            lgpio.gpio_claim_input(self._chip, busy_pin)
            lgpio.gpio_claim_output(self._chip, reset_pin, 1)
        except Exception as error:  # lgpio raises its own error type
            self.close()
            raise ReaderError('gpio', 'the pins BUSY (GPIO %d) and RST (GPIO %d) cannot be used: %s' % (busy_pin, reset_pin, error))

    def busy(self):
        return self._lgpio.gpio_read(self._chip, self._busy) == 1

    def reset_level(self, high):
        self._lgpio.gpio_write(self._chip, self._reset, 1 if high else 0)

    def transfer(self, data):
        return bytes(self._spi.xfer2(list(data)))

    def close(self):
        try:
            self._spi.close()
        except Exception:
            pass
        chip = getattr(self, '_chip', None)
        if chip is not None:
            for pin in (self._busy, self._reset):
                try:
                    self._lgpio.gpio_free(chip, pin)
                except Exception:
                    pass
            try:
                self._lgpio.gpiochip_close(chip)
            except Exception:
                pass


# ------------------------------------------------------------------------------------------------------------------------------
# the chip
# ------------------------------------------------------------------------------------------------------------------------------
class PN5180:
    def __init__(self, hw, sleep=time.sleep, clock=time.monotonic):
        self.hw = hw
        self.sleep = sleep
        self.clock = clock
        self.mode = None  # 'a' or 'v': what the RF part is set up for

    # -- the handshake ---------------------------------------------------------------------------------------------------------
    def _wait_busy(self, high, timeout):
        end = self.clock() + timeout
        while self.hw.busy() != high:
            if self.clock() > end:
                return False
            self.sleep(0.0002)
        return True

    def _frame_done(self):
        # (the chip raises BUSY while it takes the frame in and works on it - it may be short; then it is low again when ready)
        self.sleep(0.0005)
        self._wait_busy(True, 0.005)
        if not self._wait_busy(False, 0.5):
            raise ReaderError('busy_timeout', 'BUSY stays high: the chip does not get ready (BUSY, RST, 5 V, 3.3 V?)')

    def command(self, send, answer=0):
        """Sends one command; with `answer` > 0 the answer of that many bytes is read as the second frame."""
        if not self._wait_busy(False, 0.5):
            raise ReaderError('busy_timeout', 'BUSY stays high: the chip does not get ready (BUSY, RST, 5 V, 3.3 V?)')
        self.hw.transfer(send)
        self._frame_done()
        if not answer:
            return b''
        data = self.hw.transfer([0xFF] * answer)
        self._frame_done()
        return bytes(data)

    # -- registers and the EEPROM ----------------------------------------------------------------------------------------------
    @staticmethod
    def _le(value):
        return [(value >> (8 * i)) & 0xFF for i in range(4)]

    def write_register(self, reg, value):
        self.command([WRITE_REGISTER, reg] + self._le(value & 0xFFFFFFFF))

    def or_mask(self, reg, mask):
        self.command([WRITE_REGISTER_OR_MASK, reg] + self._le(mask))

    def and_mask(self, reg, mask):
        self.command([WRITE_REGISTER_AND_MASK, reg] + self._le(mask))

    def read_register(self, reg):
        data = self.command([READ_REGISTER, reg], 4)
        return data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)

    def read_eeprom(self, address, length):
        return self.command([READ_EEPROM, address, length], length)

    def irq_status(self):
        return self.read_register(IRQ_STATUS)

    def clear_irq(self, mask=0xFFFFFFFF):
        self.write_register(IRQ_CLEAR, mask)

    def transceive_state(self):
        return (self.read_register(RF_STATUS) >> 24) & 0x07

    def _wait_irq(self, mask, timeout):
        end = self.clock() + timeout
        while True:
            irq = self.irq_status()
            if irq & mask:
                return irq
            if self.clock() > end:
                return 0
            self.sleep(0.001)

    # -- start ------------------------------------------------------------------------------------------------------------------
    def reset(self):
        """Pulls RST low, lets it go and waits until the chip says it is idle."""
        self.hw.reset_level(False)
        self.sleep(0.01)
        self.hw.reset_level(True)
        self.sleep(0.05)
        self.mode = None
        if not self._wait_busy(False, 0.5):
            raise ReaderError('busy_timeout', 'BUSY stays high after the reset: the chip does not start (RST, 5 V, 3.3 V?)')
        if not self._wait_irq(IRQ_IDLE, 0.5):
            raise ReaderError('no_chip', 'the chip does not report that it is idle after the reset (MISO, MOSI, SCK, NSS, power?)')

    def versions(self):
        """The version numbers the chip reports, as text: ("4.0", "3.5"). All 0x00 or all 0xFF means nobody answers."""
        firmware = self.read_eeprom(EEPROM_FIRMWARE_VERSION, 2)
        product = self.read_eeprom(EEPROM_PRODUCT_VERSION, 2)
        for raw in (firmware, product):
            if len(raw) != 2 or raw in (b'\x00\x00', b'\xff\xff'):
                raise ReaderError('no_chip', 'the chip answers with nothing but %s: MISO, MOSI, SCK, NSS and the power need a look' % ('zeros' if raw[:1] == b'\x00' else 'ones'))
        return ('%d.%d' % (firmware[1], firmware[0]), '%d.%d' % (product[1], product[0]))

    # -- the field --------------------------------------------------------------------------------------------------------------
    def rf_on(self):
        self.clear_irq(IRQ_TX_RFON)
        self.command([RF_ON, 0x00])
        if not self._wait_irq(IRQ_TX_RFON, 0.1):
            raise ReaderError('rf', 'the field does not come up')
        self.clear_irq(IRQ_TX_RFON)

    def rf_off(self):
        self.clear_irq(IRQ_TX_RFOFF)
        self.command([RF_OFF, 0x00])
        self._wait_irq(IRQ_TX_RFOFF, 0.1)
        self.clear_irq(IRQ_TX_RFOFF)

    def use(self, mode):
        """Sets the RF part up for ISO 14443 A ('a') or ISO 15693 ('v') and switches the field on (the field is off while it is changed)."""
        if self.mode == mode:
            return
        if self.mode is not None:
            self.rf_off()
        tx, rx = RF_ISO14443A if mode == 'a' else RF_ISO15693
        self.command([LOAD_RF_CONFIG, tx, rx])
        self.rf_on()
        self.sleep(0.01)  # (ISO 14443 asks for 5 ms after the field is on, before the first command)
        self.mode = mode

    def crc(self, on):
        if on:
            self.or_mask(CRC_RX_CONFIG, 0x1)
            self.or_mask(CRC_TX_CONFIG, 0x1)
        else:
            self.and_mask(CRC_RX_CONFIG, 0xFFFFFFFE)
            self.and_mask(CRC_TX_CONFIG, 0xFFFFFFFE)

    # -- one exchange with a tag -------------------------------------------------------------------------------------------------
    def exchange(self, data, valid_bits=0, wait=0.015):
        """Sends `data` to the tag and returns its answer, None when there is none in `wait` seconds (or it was damaged)."""
        self.and_mask(SYSTEM_CONFIG, 0xFFFFFFF8)  # idle ...
        self.or_mask(SYSTEM_CONFIG, 0x00000003)  # ... then transceive
        if self.transceive_state() != STATE_WAIT_TRANSMIT:
            raise ReaderError('state', 'the chip is not ready to send')
        self.clear_irq()
        self.command([SEND_DATA, valid_bits] + list(data))
        irq = self._wait_irq(IRQ_RX | IRQ_GENERAL_ERROR, wait)
        if not irq & IRQ_RX:
            return None
        status = self.read_register(RX_STATUS)
        length = status & 0x1FF
        # (bit 16: the data is damaged, bit 17: not a frame as the protocol has it)
        if length == 0 or status & 0x30000:
            return None
        return self.command([READ_DATA, 0x00], length)

    # -- ISO 14443 A: NTAG, MIFARE ... ---------------------------------------------------------------------------------------------
    def poll_a(self):
        self.use('a')
        self.crc(False)
        # WUPA (7 bits): wakes tags in the idle and the halt state; a tag we halted ourselves answers again
        atqa = self.exchange([0x52], valid_bits=7)
        if atqa is None or len(atqa) != 2:
            return None
        uid = bytearray()
        for sel in (0x93, 0x95, 0x97):  # the three cascade levels: UIDs of 4, 7 and 10 bytes
            self.crc(False)
            part = self.exchange([sel, 0x20])
            if part is None or len(part) != 5 or part[0] ^ part[1] ^ part[2] ^ part[3] != part[4]:
                return None
            self.crc(True)
            sak = self.exchange([sel, 0x70] + list(part))
            if sak is None or len(sak) < 1:
                return None
            if part[0] == 0x88:  # a cascade tag: the rest of the UID comes on the next level
                uid += part[1:4]
            else:
                uid += part[0:4]
            if not sak[0] & 0x04:
                break
        else:
            return None
        # halt it: an active tag does not answer the next WUPA, a halted one does (it has no answer to the halt itself)
        self.exchange([0x50, 0x00], wait=0.004)
        return Tag('ISO14443A', uid)

    # -- ISO 15693: ICODE, SLIX ... ------------------------------------------------------------------------------------------------
    def poll_v(self):
        self.use('v')
        # inventory, one slot, high data rate; no mask
        answer = self.exchange([0x26, 0x01, 0x00], wait=0.03)
        if answer is None or len(answer) < 10 or answer[0] & 0x01:
            return None
        return Tag('ISO15693', bytes(reversed(answer[2:10])))  # (the UID comes the least significant byte first)

    def close(self):
        try:
            self.rf_off()
        except Exception:
            pass


# ------------------------------------------------------------------------------------------------------------------------------
# the loop
# ------------------------------------------------------------------------------------------------------------------------------
class Scanner:
    """Looks for a tag again and again and says when one comes and when it has gone."""

    def __init__(self, chip, tech, emit, sleep=time.sleep):
        self.chip = chip
        self.emit = emit
        self.sleep = sleep
        self.modes = {'a': ['a'], 'v': ['v'], 'both': ['a', 'v']}[tech]
        self.current = None  # the tag in the field: (tech, uid)
        self.current_mode = None
        self.misses = 0

    def step(self):
        # (a tag in the field is looked for the way it was found; else every kind in turn)
        modes = [self.current_mode] if self.current_mode else self.modes
        tag = None
        for mode in modes:
            tag = self.chip.poll_a() if mode == 'a' else self.chip.poll_v()
            if tag:
                self.current_mode = mode
                break
        if tag:
            self.misses = 0
            if tag.key != self.current:
                self.current = tag.key
                self.emit({'event': 'tag', 'tech': tag.tech, 'uid': hexuid(tag.uid)})
        elif self.current:
            self.misses += 1
            if self.misses >= GONE_AFTER:
                self.current = None
                self.current_mode = None
                self.misses = 0
                self.emit({'event': 'gone'})
        return tag

    def run(self, stopped, interval=0.15):
        while not stopped():
            self.step()
            self.sleep(interval)


def emit_line(obj):
    sys.stdout.write(json.dumps(obj) + '\n')
    sys.stdout.flush()


def parse_args(argv):
    parser = argparse.ArgumentParser(description='PN5180 NFC reader for the MuPiBox')
    parser.add_argument('--busy', type=int, required=True, help='BCM number of the pin on the BUSY line')
    parser.add_argument('--reset', type=int, required=True, help='BCM number of the pin on the RST line')
    parser.add_argument('--chip', type=int, default=0, help='number of the gpiochip of the header pins')
    parser.add_argument('--spi', default='0.0', help='SPI bus and chip select, 0.0 is /dev/spidev0.0 (CE0)')
    parser.add_argument('--tech', choices=('both', 'a', 'v'), default='both', help='a: ISO 14443 A, v: ISO 15693')
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
        hw = Hardware(args.spi, args.chip, args.busy, args.reset)
        chip = PN5180(hw)
        chip.reset()
        firmware, product = chip.versions()
        emit_line({'event': 'ready', 'firmware': firmware, 'product': product})
        Scanner(chip, args.tech, emit_line).run(lambda: stop['now'], args.interval)
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
