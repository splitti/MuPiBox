#!/usr/bin/env python3
"""Wiring pictures of the NFC readers for the manual (src/backend-api/src/manual/img/wiring-*.svg).

The pictures say only pin names and numbers, so one file serves every language of the manual. Run:  python tools/manual-shots/wiring.py
"""
import os
from xml.sax.saxutils import escape

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'backend-api', 'src', 'manual', 'img')

# the 40 pin header of the Raspberry Pi: number -> what the pin is (BCM names)
PI = {
    1: '3V3', 2: '5V', 3: 'GPIO2 SDA', 4: '5V', 5: 'GPIO3 SCL', 6: 'GND', 7: 'GPIO4', 8: 'GPIO14 TXD', 9: 'GND', 10: 'GPIO15 RXD',
    11: 'GPIO17', 12: 'GPIO18', 13: 'GPIO27', 14: 'GND', 15: 'GPIO22', 16: 'GPIO23', 17: '3V3', 18: 'GPIO24', 19: 'GPIO10 MOSI', 20: 'GND',
    21: 'GPIO9 MISO', 22: 'GPIO25', 23: 'GPIO11 SCLK', 24: 'GPIO8 CE0', 25: 'GND', 26: 'GPIO7 CE1', 27: 'ID_SD', 28: 'ID_SC', 29: 'GPIO5', 30: 'GND',
    31: 'GPIO6', 32: 'GPIO12', 33: 'GPIO13', 34: 'GND', 35: 'GPIO19', 36: 'GPIO16', 37: 'GPIO26', 38: 'GPIO20', 39: 'GND', 40: 'GPIO21',
}

RED, ORANGE, BLACK, BLUE, GREEN, YELLOW, PURPLE, CYAN, PINK, BROWN, GREY, TEAL = (
    '#d32f2f', '#ef6c00', '#222222', '#1e88e5', '#2e9e44', '#f2b01e', '#8e24aa', '#00acc1', '#e91e63', '#8d5a3b', '#78909c', '#00897b')

INK = '#1f2933'
ROW = 22  # distance of two rows of the header
HEADER_Y = 78
ODD_X, EVEN_X = 190, 400
BOARD = (120, 40, 360)  # x, y, width of the board
MOD_X = 900
LANE_X = 520  # the first lane of the wires between board and module


def diagram(name, title, module, wires, sub=''):
    """module: the labels of the pins of the module from top to bottom, wires: [(pin of the Pi, label of the module pin, colour)]."""
    pitch = 28
    mod_y = HEADER_Y + 10
    mod_h = len(module) * pitch + 56
    board_h = 20 * ROW + 70
    height = max(board_h, mod_h + 40) + 90
    width = 1120
    used = {pin: color for pin, _l, color in wires}
    out = []
    add = out.append
    add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-label="{escape(title)}" font-family="Helvetica, Arial, sans-serif">')
    add(f'<rect x="0.5" y="0.5" width="{width - 1}" height="{height - 1}" rx="14" fill="#f4f6f8" stroke="#cdd5dd"/>')
    add(f'<text x="24" y="30" font-size="17" font-weight="700" fill="{INK}">{escape(title)}</text>')
    if sub:
        add(f'<text x="{width - 24}" y="30" font-size="12" text-anchor="end" fill="#52606d">{escape(sub)}</text>')
    # the board with its header
    bx, by, bw = BOARD
    add(f'<rect x="{bx}" y="{by + 26}" width="{bw}" height="{board_h - 30}" rx="12" fill="#0e7a37" stroke="#095a28" stroke-width="2"/>')
    add(f'<text x="{bx + bw / 2}" y="{by + 50}" font-size="13" font-weight="700" fill="#e8f5ec" text-anchor="middle">Raspberry Pi</text>')
    add(f'<rect x="{ODD_X - 16}" y="{HEADER_Y - 12 + 8}" width="{EVEN_X - ODD_X + 32}" height="{20 * ROW + 4}" rx="4" fill="#1b1b1b"/>')
    pin_y = {}
    for n in range(1, 41):
        row = (n - 1) // 2
        x = ODD_X if n % 2 else EVEN_X
        y = HEADER_Y + 8 + row * ROW + 10
        pin_y[n] = (x, y)
        color = used.get(n)
        add(f'<circle cx="{x}" cy="{y}" r="6.5" fill="{color or "#b9bfc6"}" stroke="#000" stroke-opacity=".35"/>')
        weight = '700' if color else '400'
        label = f'{n}  {PI[n]}' if n % 2 else f'{PI[n]}  {n}'
        if n % 2:
            add(f'<text x="{x + 12}" y="{y + 4}" font-size="10.5" font-weight="{weight}" fill="#ffffff">{escape(label)}</text>')
        else:
            add(f'<text x="{x - 12}" y="{y + 4}" font-size="10.5" font-weight="{weight}" fill="#ffffff" text-anchor="end">{escape(label)}</text>')
    # the module
    add(f'<rect x="{MOD_X}" y="{mod_y - 20}" width="{width - MOD_X - 24}" height="{mod_h}" rx="10" fill="#0b4a64" stroke="#073447" stroke-width="2"/>')
    add(f'<text x="{MOD_X + (width - MOD_X - 24) / 2}" y="{mod_y - 20 + mod_h - 14}" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">{escape(module_title(name))}</text>')
    mod_pin = {}
    for i, label in enumerate(module):
        y = mod_y + 8 + i * pitch
        mod_pin[label] = (MOD_X, y)
        color = next((c for _p, l, c in wires if l == label), None)
        add(f'<circle cx="{MOD_X}" cy="{y}" r="6.5" fill="{color or "#b9bfc6"}" stroke="#000" stroke-opacity=".35"/>')
        add(f'<text x="{MOD_X + 14}" y="{y + 4}" font-size="12" font-weight="{"700" if color else "400"}" fill="#ffffff">{escape(label)}</text>')
    # the wires: the pins on the right row of the header go straight out, those of the left row round the top of the board
    odd = sorted([w for w in wires if w[0] % 2 == 1], key=lambda w: mod_pin[w[1]][1])
    # each wire has a lane of its own between board and module (the wires that go down first), the wires of the left row of the
    # header go round the top of the board, each at its own height
    lanes = sorted(wires, key=lambda w: mod_pin[w[1]][1] - pin_y[w[0]][1])
    paths = []
    for wire in wires:
        pin, label, color = wire
        x, y = pin_y[pin]
        mx, my = mod_pin[label]
        lx = LANE_X + lanes.index(wire) * 24
        if pin % 2 == 0:
            pts = [(x, y), (lx, y), (lx, my), (mx, my)]
        else:
            k = odd.index(wire)
            ty = 52 + k * 7
            ox = bx - 12 - k * 6
            pts = [(x, y), (ox, y), (ox, ty), (lx, ty), (lx, my), (mx, my)]
        paths.append((color, pts))
    for color, pts in paths:
        d = ' '.join(('M' if i == 0 else 'L') + f'{px},{py}' for i, (px, py) in enumerate(pts))
        add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>')
    add('</svg>')
    path = os.path.join(OUT, f'{name}.svg')
    with open(path, 'w', encoding='utf8', newline='\n') as f:
        f.write('\n'.join(out) + '\n')
    print(path)


TITLES = {
    'wiring-pn5180': 'PN5180',
    'wiring-rc522': 'RC522',
    'wiring-pn532-i2c': 'PN532',
    'wiring-pn532-spi': 'PN532',
    'wiring-pn532-uart': 'PN532',
}


def module_title(name):
    return TITLES[name]


diagram('wiring-pn5180', 'PN5180 - Raspberry Pi (SPI, CE0)', ['+5V', '+3.3V', 'RST', 'NSS', 'MOSI', 'MISO', 'SCK', 'BUSY', 'GND', 'GPIO', 'IRQ', 'AUX', 'REQ'],
        [(2, '+5V', RED), (1, '+3.3V', ORANGE), (16, 'RST', PINK), (24, 'NSS', PURPLE), (19, 'MOSI', GREEN), (21, 'MISO', YELLOW), (23, 'SCK', BLUE), (22, 'BUSY', CYAN), (6, 'GND', BLACK)],
        '5 V and 3.3 V both')
diagram('wiring-rc522', 'RC522 - Raspberry Pi (SPI, CE0)', ['SDA', 'SCK', 'MOSI', 'MISO', 'IRQ', 'GND', 'RST', '3.3V'],
        [(1, '3.3V', ORANGE), (6, 'GND', BLACK), (23, 'SCK', BLUE), (19, 'MOSI', GREEN), (21, 'MISO', YELLOW), (24, 'SDA', PURPLE), (22, 'RST', PINK)],
        '3.3 V only')
diagram('wiring-pn532-i2c', 'PN532 - Raspberry Pi (I2C)', ['VCC', 'GND', 'SDA', 'SCL'],
        [(1, 'VCC', ORANGE), (6, 'GND', BLACK), (3, 'SDA', BROWN), (5, 'SCL', GREY)], 'switches SEL0 1 / SEL1 0')
diagram('wiring-pn532-spi', 'PN532 - Raspberry Pi (SPI, CE0)', ['VCC', 'GND', 'SCK', 'MISO', 'MOSI', 'SS'],
        [(1, 'VCC', ORANGE), (6, 'GND', BLACK), (23, 'SCK', BLUE), (21, 'MISO', YELLOW), (19, 'MOSI', GREEN), (24, 'SS', PURPLE)], 'switches SEL0 0 / SEL1 1')
diagram('wiring-pn532-uart', 'PN532 - Raspberry Pi (UART)', ['VCC', 'GND', 'TX', 'RX'],
        [(1, 'VCC', ORANGE), (6, 'GND', BLACK), (10, 'TX', TEAL), (8, 'RX', BROWN)], 'switches SEL0 0 / SEL1 0; TX to RXD, RX to TXD')


def usb_picture():
    """No wires: the USB readers are plugged into any USB port of the Raspberry Pi."""
    width, height = 900, 300
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-label="USB reader - Raspberry Pi" font-family="Helvetica, Arial, sans-serif">',
           f'<rect x="0.5" y="0.5" width="{width - 1}" height="{height - 1}" rx="14" fill="#f4f6f8" stroke="#cdd5dd"/>',
           f'<text x="24" y="30" font-size="17" font-weight="700" fill="{INK}">USB Reader - Raspberry Pi</text>',
           '<rect x="40" y="60" width="300" height="200" rx="12" fill="#0e7a37" stroke="#095a28" stroke-width="2"/>',
           '<text x="190" y="90" font-size="13" font-weight="700" fill="#e8f5ec" text-anchor="middle">Raspberry Pi</text>']
    # four USB ports on the edge of the board (two USB 2.0, two USB 3.0)
    for i, blue in enumerate((False, False, True, True)):
        x = 60 + i * 70
        out.append(f'<rect x="{x}" y="206" width="58" height="62" rx="4" fill="#c9ced4" stroke="#7b8794"/>')
        out.append(f'<rect x="{x + 9}" y="222" width="40" height="14" fill="{"#1e66c1" if blue else "#2b2b2b"}"/>')
    out.append(f'<text x="190" y="196" font-size="11" fill="#e8f5ec" text-anchor="middle">USB</text>')
    # the cable from the second port to the reader
    out.append('<path d="M118,268 L118,286 L520,286 L520,160 L560,160" fill="none" stroke="#222" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>')
    out.append('<rect x="560" y="110" width="250" height="100" rx="12" fill="#0b4a64" stroke="#073447" stroke-width="2"/>')
    out.append('<text x="685" y="152" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">USB Reader</text>')
    out.append('<text x="685" y="178" font-size="13" fill="#d6e6ee" text-anchor="middle">(keyboard)</text>')
    out.append('<text x="685" y="240" font-size="12" fill="#52606d" text-anchor="middle">any USB port</text>')
    out.append('</svg>')
    path = os.path.join(OUT, 'wiring-usb.svg')
    with open(path, 'w', encoding='utf8', newline='\n') as f:
        f.write('\n'.join(out) + '\n')
    print(path)


usb_picture()
