"""A small QR code encoder for the display: byte mode, error correction level L, versions 1 to 6 (up to 134 bytes), the mask that
scores best. It needs nothing but Python itself (the box has no QR library); the display draws the matrix it returns.

    matrix = encode('http://192.168.1.128')   # list of rows, True = a dark module
"""

# (the tables of the standard, level L: error correction codewords per block, and the blocks of (count, data codewords) per version)
_ECC_PER_BLOCK = {1: 7, 2: 10, 3: 15, 4: 20, 5: 26, 6: 18}
_BLOCKS = {1: [(1, 19)], 2: [(1, 34)], 3: [(1, 55)], 4: [(1, 80)], 5: [(1, 108)], 6: [(2, 68)]}
_ALIGNMENT = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34]}
MAX_VERSION = 6


def _capacity(version):
    """Data bytes of the byte mode at level L: the data codewords less the mode and length (4 + 8 bits)."""
    data = sum(count * words for count, words in _BLOCKS[version])
    return data - 2


def _gf_tables():
    exp = [0] * 512
    log = [0] * 256
    x = 1
    for i in range(255):
        exp[i] = x
        log[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        exp[i] = exp[i - 255]
    return exp, log


_EXP, _LOG = _gf_tables()


def _generator(degree):
    poly = [1]
    for i in range(degree):
        nxt = [0] * (len(poly) + 1)
        for j, coef in enumerate(poly):
            nxt[j] ^= coef
            if coef:
                nxt[j + 1] ^= _EXP[_LOG[coef] + i]
        poly = nxt
    return poly


def _remainder(data, degree):
    """The Reed-Solomon error correction codewords of a block of data codewords."""
    gen = _generator(degree)
    result = list(data) + [0] * degree
    for i in range(len(data)):
        coef = result[i]
        if coef:
            for j in range(1, len(gen)):
                if gen[j]:
                    result[i + j] ^= _EXP[_LOG[gen[j]] + _LOG[coef]]
    return result[len(data):]


def _codewords(data, version):
    """The data bytes as the codewords of the symbol: mode, length, data, terminator and padding, split in blocks with their error correction,
    and interleaved."""
    total = sum(count * words for count, words in _BLOCKS[version])
    bits = '0100' + format(len(data), '08b') + ''.join(format(b, '08b') for b in data)
    bits += '0' * min(4, total * 8 - len(bits))
    bits += '0' * (-len(bits) % 8)
    words = [int(bits[i:i + 8], 2) for i in range(0, len(bits), 8)]
    pad = 0xEC
    while len(words) < total:
        words.append(pad)
        pad = 0x11 if pad == 0xEC else 0xEC
    blocks = []
    at = 0
    for count, size in _BLOCKS[version]:
        for _ in range(count):
            blocks.append(words[at:at + size])
            at += size
    ecc = [_remainder(block, _ECC_PER_BLOCK[version]) for block in blocks]
    out = []
    for i in range(max(len(b) for b in blocks)):
        for block in blocks:
            if i < len(block):
                out.append(block[i])
    for i in range(_ECC_PER_BLOCK[version]):
        for block in ecc:
            out.append(block[i])
    return out


def _format_bits(mask):
    """The 15 format bits: level L (01) and the mask, with their BCH code and the mask of the standard."""
    data = (0b01 << 3) | mask
    rem = data
    for _ in range(10):
        rem = (rem << 1) ^ ((rem >> 9) * 0x537)
    return ((data << 10) | rem) ^ 0x5412


def _build(version, codewords, mask):
    size = version * 4 + 17
    modules = [[False] * size for _ in range(size)]
    function = [[False] * size for _ in range(size)]

    def put(x, y, dark):
        modules[y][x] = dark
        function[y][x] = True

    # finder patterns with their separators
    for cx, cy in ((3, 3), (size - 4, 3), (3, size - 4)):
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                x, y = cx + dx, cy + dy
                if 0 <= x < size and 0 <= y < size:
                    dist = max(abs(dx), abs(dy))
                    put(x, y, dist not in (2, 4))
    # timing patterns
    for i in range(size):
        if not function[6][i]:
            put(i, 6, i % 2 == 0)
        if not function[i][6]:
            put(6, i, i % 2 == 0)
    # alignment patterns
    centres = _ALIGNMENT[version]
    for ay in centres:
        for ax in centres:
            if function[ay][ax]:
                continue  # (it would lie on a finder pattern)
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    put(ax + dx, ay + dy, max(abs(dx), abs(dy)) != 1)
    # the format information (and the dark module); the bits are written once the mask is known - here the places are reserved
    for i in range(9):
        function[8][i] = True
        function[i][8] = True
    for i in range(8):
        function[8][size - 1 - i] = True
        function[size - 1 - i][8] = True
    put(8, size - 8, True)
    # the data: in pairs of columns from the right, upwards and downwards, the vertical timing column left out
    bits = [(word >> (7 - i)) & 1 for word in codewords for i in range(8)]
    at = 0
    upward = True
    x = size - 1
    while x > 0:
        if x == 6:
            x -= 1
        rows = range(size - 1, -1, -1) if upward else range(size)
        for y in rows:
            for dx in (0, 1):
                xx = x - dx
                if function[y][xx]:
                    continue
                dark = bool(bits[at]) if at < len(bits) else False
                at += 1
                if _MASKS[mask](xx, y):
                    dark = not dark
                modules[y][xx] = dark
        upward = not upward
        x -= 2
    # the format information
    fmt = _format_bits(mask)
    bit = lambda i: bool((fmt >> i) & 1)  # noqa: E731
    for i in range(6):
        modules[i][8] = bit(i)
    modules[7][8] = bit(6)
    modules[8][8] = bit(7)
    modules[8][7] = bit(8)
    for i in range(9, 15):
        modules[8][14 - i] = bit(i)
    for i in range(8):
        modules[8][size - 1 - i] = bit(i)
    for i in range(8, 15):
        modules[size - 15 + i][8] = bit(i)
    modules[size - 8][8] = True
    return modules


_MASKS = [
    lambda x, y: (x + y) % 2 == 0,
    lambda x, y: y % 2 == 0,
    lambda x, y: x % 3 == 0,
    lambda x, y: (x + y) % 3 == 0,
    lambda x, y: (x // 3 + y // 2) % 2 == 0,
    lambda x, y: x * y % 2 + x * y % 3 == 0,
    lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0,
    lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0,
]


def _penalty(modules):
    size = len(modules)
    score = 0
    for rows in (modules, [list(col) for col in zip(*modules)]):
        for line in rows:
            run = 1
            for i in range(1, size):
                if line[i] == line[i - 1]:
                    run += 1
                else:
                    if run >= 5:
                        score += run - 2
                    run = 1
            if run >= 5:
                score += run - 2
            # a pattern like the finder (1:1:3:1:1) with four light modules beside it
            text = ''.join('1' if m else '0' for m in line)
            score += 40 * (text.count('10111010000') + text.count('00001011101'))
    for y in range(size - 1):
        for x in range(size - 1):
            if modules[y][x] == modules[y][x + 1] == modules[y + 1][x] == modules[y + 1][x + 1]:
                score += 3
    dark = sum(sum(row) for row in modules)
    percent = dark * 100 / (size * size)
    score += int(abs(percent - 50) // 5) * 10
    return score


def encode(text):
    """The QR code of a text as a list of rows (True = dark module), the smallest version that holds it. ValueError when it is too long."""
    data = text.encode('utf-8')
    for version in range(1, MAX_VERSION + 1):
        if len(data) <= _capacity(version):
            break
    else:
        raise ValueError('the text is too long for a QR code of this display')
    words = _codewords(data, version)
    best = None
    for mask in range(8):
        modules = _build(version, words, mask)
        score = _penalty(modules)
        if best is None or score < best[0]:
            best = (score, modules)
    return best[1]
