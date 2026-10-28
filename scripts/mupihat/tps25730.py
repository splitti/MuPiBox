"""The USB-PD controller of the MuPiHAT (TI TPS25730, I2C address 0x20): which of the power supply's offers it took.

The chip asks the supply for its voltage (the MuPiHAT takes up to 12 V) and works on its own; the box only reads what it
agreed on, for the app's battery page ("Netzteil (USB-PD)"). It is powered from USB-C: with no power supply plugged in it
does not answer at all - asked only while the charger sees a USB voltage.

The chip holds the I2C clock low while it prepares an answer (clock stretching), which the I2C controller of the Pi 3/4
does not always get right: now and then a bit of a byte comes out wrong (seen on a Pi 4: one read of three differed).
So every register is read several times and taken only when two reads agree, and what it says has to make sense.

Registers (TPS25730 technical reference): the I2C read gives a byte count first, then the data.
  0x30 RX_SOURCE_CAPS       byte 0: number of offers (bits 2:0), then 4 bytes per offer (a PDO, little endian)
  0x35 ACTIVE_CONTRACT_RDO  the request the chip made: the offer's position (bits 30:28), the current (bits 19:10, 10 mA)
"""

TPS_ADDR = 0x20
REG_SOURCE_CAPS = 0x30
REG_CONTRACT = 0x35
# reads of one register at most, and how many have to agree
READS = 4
AGREE = 2


def _register(bus, reg, length):
    """The data of a register (without its byte count) as read the same way twice, or None."""
    seen = {}
    for _ in range(READS):
        try:
            raw = bus.read_i2c_block_data(TPS_ADDR, reg, length + 1)
        except OSError:
            continue
        # (the register may be longer than what is needed - 0x30 says 53 bytes: its first `length` are taken)
        count = raw[0]
        if count < 1:
            continue
        data = tuple(raw[1:1 + min(count, length)])
        seen[data] = seen.get(data, 0) + 1
        if seen[data] >= AGREE:
            return data
    return None


def read_contract(bus):
    """The power supply's offer the chip took: {"mv", "ma", "offer", "offers"}, or None (not known, not plugged in, no
    fixed voltage). mv: the voltage, ma: the current asked for (the most the box may take)."""
    rdo_bytes = _register(bus, REG_CONTRACT, 12)
    caps = _register(bus, REG_SOURCE_CAPS, 29)
    if not rdo_bytes or len(rdo_bytes) < 4 or not caps:
        return None
    rdo = int.from_bytes(bytes(rdo_bytes[0:4]), "little")
    position = (rdo >> 28) & 0x7
    offers = caps[0] & 0x7
    if position < 1 or position > offers or len(caps) < 1 + 4 * offers:
        return None
    pdo = int.from_bytes(bytes(caps[1 + 4 * (position - 1):1 + 4 * position]), "little")
    # (a fixed voltage only - a programmable one, PPS, says no single voltage; the MuPiHAT does not ask for it)
    if pdo >> 30 != 0:
        return None
    mv = ((pdo >> 10) & 0x3FF) * 50
    ma = ((rdo >> 10) & 0x3FF) * 10
    # (what makes sense for USB-PD and the MuPiHAT: 5-20 V, up to 5 A; anything else is a bad read)
    if not 5000 <= mv <= 20000 or not 0 < ma <= 5000:
        return None
    return {"mv": mv, "ma": ma, "offer": position, "offers": offers}
