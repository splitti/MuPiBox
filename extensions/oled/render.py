"""The screens of the OLED display: what is drawn for a state of the box, as a 1-bit picture.

Pure drawing (Pillow only): no hardware, no clock of its own besides the `now` it is given, so the screens can be tried
and tested without a display. The layouts are made for 128 x 64 and 128 x 32 pixels.
"""
import os

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSansMono.ttf',
)
BOLD_CANDIDATES = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSansMono-Bold.ttf',
)

# marquee: a long line waits a moment, scrolls to its end, waits again and starts over
SCROLL_PX_PER_S = 28.0
SCROLL_WAIT_S = 1.6
SCROLL_GAP_PX = 24


def _load(candidates, size):
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    try:
        return ImageFont.load_default(size)
    except TypeError:  # an old Pillow: only the small bitmap font
        return ImageFont.load_default()


class Fonts:
    """The sizes the screens use, loaded once."""

    def __init__(self):
        self.text = _load(FONT_CANDIDATES, 11)
        self.small = _load(FONT_CANDIDATES, 9)
        self.row = _load(FONT_CANDIDATES, 10)
        self.big = _load(BOLD_CANDIDATES, 30)
        self.huge = _load(BOLD_CANDIDATES, 44)
        self.clock = _load(BOLD_CANDIDATES, 26)


def clock_text(seconds):
    """67 -> '1:07', 3725 -> '1:02:05' (nothing known -> '--:--')."""
    if seconds is None or seconds < 0:
        return '--:--'
    seconds = int(seconds)
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    return '%d:%02d:%02d' % (h, m, s) if h else '%d:%02d' % (m, s)


def fit(text, font, draw, width):
    """The text cut to the width with '…' at its end (for a line that does not scroll)."""
    if draw.textlength(text, font=font) <= width:
        return text
    while text and draw.textlength(text + '…', font=font) > width:
        text = text[:-1]
    return text + '…'


def scroll_cycle(text_width, width):
    """How long one pass of a long line takes: it waits, scrolls to its end and waits again."""
    run = (text_width - width + SCROLL_GAP_PX) / SCROLL_PX_PER_S
    return SCROLL_WAIT_S + run + SCROLL_WAIT_S


def scroll_offset(text_width, width, since):
    """How far a line of `text_width` pixels is moved to the left after `since` seconds (0 while it fits)."""
    if text_width <= width:
        return 0
    travel = text_width - width + SCROLL_GAP_PX
    run = travel / SCROLL_PX_PER_S
    cycle = SCROLL_WAIT_S + run + SCROLL_WAIT_S
    t = since % cycle
    if t < SCROLL_WAIT_S:
        return 0
    if t < SCROLL_WAIT_S + run:
        return int((t - SCROLL_WAIT_S) * SCROLL_PX_PER_S)
    return int(travel)


# ---- the status bar of the layout (see Screens.status_bar): small pictures, drawn from text (# is a lit pixel) ----------
DIGITS = {
    '0': ('.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'),
    '1': ('..#.', '.##.', '..#.', '..#.', '..#.', '..#.', '.###'),
    '2': ('.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'),
    '3': ('.##.', '#..#', '...#', '.##.', '...#', '#..#', '.##.'),
    '4': ('...#', '..##', '.#.#', '#..#', '####', '...#', '...#'),
    '5': ('####', '#...', '###.', '...#', '...#', '#..#', '.##.'),
    '6': ('.##.', '#...', '###.', '#..#', '#..#', '#..#', '.##.'),
    '7': ('####', '...#', '..#.', '..#.', '.#..', '.#..', '.#..'),
    '8': ('.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '.##.'),
    '9': ('.##.', '#..#', '#..#', '.###', '...#', '..#.', '.##.'),
    'A': ('.##.', '#..#', '#..#', '####', '#..#', '#..#', '#..#'),
    '-': ('....', '....', '....', '####', '....', '....', '....'),
}
DIGIT_ADVANCE = 5
# (the pictures of the status bar are the ones of the layout drawing, pixel by pixel; the digits of the drawing are "88" for the battery
# and "100" for the volume - the other digits follow their style)
ANTENNA = ('#########', '#...#...#', '.#..#..#.', '..#.#.#..', '...###...', '....#....', '....#....', '....#....', '....#....')
# (the bars of the aerial: five of them, 2 to 6 pixels high, at x 6, 8, 10, 12 and 14)
ANTENNA_BARS = (6, 8, 10, 12, 14)
BATTERY = ('..##################', '..#................#', '###.##.##.##.##.##.#', '#.#.##.##.##.##.##.#', '#.#.##.##.##.##.##.#',
           '#.#.##.##.##.##.##.#', '###.##.##.##.##.##.#', '..#................#', '..##################')
BATTERY_SEGMENT_X = (4, 7, 10, 13, 16)
REPEAT = ('........#.....', '........##....', '..#########.#.', '........##..#.', '..#...#.#...#.', '.##..##.....#.', '..#.#########.', '..#..##.......', '..#...#.......')
SHUFFLE = ('.........#...', '.........##..', '.####.######.', '....#.#..##..', '.....#...#...', '....#.#..##..', '.####.######.', '.........##..', '.........#...')
# (nine pixels high, five wide, the battery's charge)
CHARGE_DIGITS = {
    '0': ('.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
    '1': ('...#.', '...#.', '...#.', '...#.', '...#.', '...#.', '...#.', '...#.', '...#.'),
    '2': ('.###.', '....#', '....#', '....#', '.###.', '#....', '#....', '#....', '.###.'),
    '3': ('.###.', '....#', '....#', '....#', '.###.', '....#', '....#', '....#', '.###.'),
    '4': ('#...#', '#...#', '#...#', '#...#', '.####', '....#', '....#', '....#', '....#'),
    '5': ('.###.', '#....', '#....', '#....', '.###.', '....#', '....#', '....#', '.###.'),
    '6': ('.###.', '#....', '#....', '#....', '.###.', '#...#', '#...#', '#...#', '.###.'),
    '7': ('.###.', '....#', '....#', '....#', '....#', '....#', '....#', '....#', '....#'),
    '8': ('.###.', '#...#', '#...#', '#...#', '.###.', '#...#', '#...#', '#...#', '.###.'),
    '9': ('.###.', '#...#', '#...#', '#...#', '.###.', '....#', '....#', '....#', '.###.'),
    '-': ('.....', '.....', '.....', '.....', '.###.', '.....', '.....', '.....', '.....'),
}
# (seven pixels high, five wide, the volume; the zero has its dot, the one is a bar)
VOLUME_DIGITS = {
    '0': ('.###.', '#...#', '#...#', '#.#.#', '#...#', '#...#', '.###.'),
    '1': ('...#.', '...#.', '...#.', '...#.', '...#.', '...#.', '...#.'),
    '2': ('.###.', '....#', '....#', '.###.', '#....', '#....', '.###.'),
    '3': ('.###.', '....#', '....#', '.###.', '....#', '....#', '.###.'),
    '4': ('#...#', '#...#', '#...#', '.####', '....#', '....#', '....#'),
    '5': ('.###.', '#....', '#....', '.###.', '....#', '....#', '.###.'),
    '6': ('.###.', '#....', '#....', '.###.', '#...#', '#...#', '.###.'),
    '7': ('.###.', '....#', '....#', '....#', '....#', '....#', '....#'),
    '8': ('.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'),
    '9': ('.###.', '#...#', '#...#', '.###.', '....#', '....#', '.###.'),
    '-': ('.....', '.....', '.....', '.###.', '.....', '.....', '.....'),
}
BIG_ADVANCE = 6
HEADPHONES = ('..#####..', '.#.....#.', '#.......#', '#.......#', '#.......#', '##.....##', '###...###', '###...###', '##.....##')
BLUETOOTH = ('..#....', '..##...', '#.#.#..', '.###...', '..#....', '.###...', '#.#.#..', '..##...', '..#....')
# (a monitor with a network plug at its left and the cable going down: the box is on the wired network)
LAN = ('###############', '#####.........#', '#.#.#.........#', '#...#.........#', '#####.........#', '..#...........#', '..#############', '..#......#.....', '..#...#####....')
SPEAKER = ('......#.', '.....##.', '..#####.', '.#..###.', '.#..###.', '.#..###.', '..#####.', '.....##.', '......#.')


class Screens:
    def __init__(self, width=128, height=64, fonts=None):
        self.width = width
        self.height = height
        self.tall = height >= 48
        self.fonts = fonts or Fonts()
        # (the text of the lines that scroll and the moment it was set: a new text starts at its beginning)
        self._line_since = {}
        # (set while a picture is drawn: does a line of it scroll? Then the driver draws again soon)
        self.scrolling = False
        # (what a line that is too long does: 'loop' scrolls again and again, 'once' scrolls through one time, 'off' cuts it)
        self.scroll_mode = 'loop'
        self._image = None

    # ---- helpers --------------------------------------------------------------------------------------------------
    def _canvas(self):
        image = Image.new('1', (self.width, self.height), 0)
        self._image = image
        return image, ImageDraw.Draw(image)

    def _marquee(self, draw, key, text, y, font, now, x0=0, width=None):
        """A line of text that scrolls when it is wider than the room it has."""
        width = self.width - x0 if width is None else width
        seen = self._line_since.get(key)
        if not seen or seen[0] != text:
            seen = (text, now)
            self._line_since[key] = seen
        w = draw.textlength(text, font=font)
        if w <= width:
            draw.text((x0, y), text, font=font, fill=1)
            return False
        since = now - seen[1]
        if self.scroll_mode == 'off' or (self.scroll_mode == 'once' and since >= scroll_cycle(w, width)):
            draw.text((x0, y), fit(text, font, draw, width), font=font, fill=1)
            return False
        shift = scroll_offset(w, width, since)
        # (drawn on a strip of its own so that the part that is moved out at the left does not run over the neighbours)
        strip = Image.new('1', (width, font.size + 4), 0)
        ImageDraw.Draw(strip).text((-shift, 0), text, font=font, fill=1)
        self._image.paste(strip, (x0, y))
        self.scrolling = True
        return True

    def _wifi(self, draw, level, x, y, lan=False):
        """Four bars of growing height at x, y (the lower left); level 0 to 4, below 0: no wireless (a dash).
        On the wired network (`lan`) the network plug is drawn in their place."""
        if lan:
            self._art(draw, x, y - 8, LAN)
            return
        if level < 0:
            draw.line((x, y - 3, x + 12, y - 3), fill=1)
            return
        for i in range(4):
            h = 3 + i * 2
            bx = x + i * 4
            if i < level:
                draw.rectangle((bx, y - h, bx + 2, y), fill=1)
            else:
                draw.rectangle((bx, y - 1, bx + 2, y), fill=1)

    def _speaker(self, draw, x, y, muted=False):
        draw.rectangle((x, y + 8, x + 6, y + 20), fill=1)
        draw.polygon([(x + 6, y + 8), (x + 20, y), (x + 20, y + 28), (x + 6, y + 20)], fill=1)
        if muted:
            draw.line((x + 28, y + 6, x + 44, y + 22), fill=1, width=3)
            draw.line((x + 28, y + 22, x + 44, y + 6), fill=1, width=3)

    def _art(self, draw, x, y, rows):
        """A picture given as lines of text ('#' is lit)."""
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch == '#':
                    draw.point((x + dx, y + dy), fill=1)

    def _digits(self, draw, x, y, text, right=False):
        """Text in the 4 x 7 digit font (digits, 'A' and '-'); with `right` it ends at x. Returns where it starts."""
        text = str(text)
        if right:
            x -= len(text) * DIGIT_ADVANCE - 1
        start = x
        for ch in text:
            self._art(draw, x, y, DIGITS.get(ch, DIGITS['-']))
            x += DIGIT_ADVANCE
        return start

    def _big_digits(self, draw, x, y, text, font, right=False):
        """Text in one of the 5 pixel wide digit fonts of the status bar (a step of 6); with `right` its last pixel is at x."""
        text = str(text)
        if right:
            x -= len(text) * BIG_ADVANCE - 2
        start = x
        for ch in text:
            self._art(draw, x, y, font.get(ch, font['-']))
            x += BIG_ADVANCE
        return start

    def _antenna(self, draw, x, y, level, lan=False):
        """The wireless access: the aerial and, to its right, five bars of growing height (the bars that carry are full).
        `level` is 0 to 4 as the extension reports it. On the wired network (`lan`) the network plug takes the place of both."""
        if lan:
            self._art(draw, x, y, LAN)
            return
        self._art(draw, x, y, ANTENNA)
        if level < 0:
            return
        carrying = 0 if level <= 0 else min(5, (level * 5 + 3) // 4)
        for i, bx in enumerate(ANTENNA_BARS):
            if i < carrying:
                draw.line((x + bx, y + 8 - (i + 1), x + bx, y + 8), fill=1)
            else:
                draw.point((x + bx, y + 8), fill=1)

    def _battery(self, draw, x, y, percent):
        """The two digits of the charge (x is the left of the digits) and the battery with five segments."""
        value = max(0, min(99, int(percent)))
        self._big_digits(draw, x, y, '%02d' % value, CHARGE_DIGITS)
        bx = x + 13
        self._art(draw, bx, y, BATTERY)
        segments = 0 if value < 5 else min(5, (value + 15) // 20)
        # (the picture has all five segments: the ones the charge does not reach are taken out again)
        for i in range(segments, 5):
            draw.rectangle((bx + BATTERY_SEGMENT_X[i], y + 2, bx + BATTERY_SEGMENT_X[i] + 1, y + 6), fill=0)

    def _repeat(self, draw, x, y, kind):
        """The two arrows and, to their right, an A (the whole list) or a 1 (this track)."""
        self._art(draw, x, y, REPEAT)
        self._art(draw, x + 15, y + 1, DIGITS['1' if kind == 'track' else 'A'])

    def _shuffle(self, draw, x, y):
        self._art(draw, x, y, SHUFFLE)

    def _info_icon(self, draw, x, y):
        draw.ellipse((x, y, x + 8, y + 8), outline=1)
        draw.point((x + 4, y + 2), fill=1)
        draw.line((x + 4, y + 4, x + 4, y + 6), fill=1)

    def status_bar(self, draw, state, info=False):
        """The top row of the 128 x 64 layout: wireless, battery (with a MuPiHAT), repeat, shuffle, the info mark while the
        network page is shown, and at the right the volume with the picture of where it plays."""
        self._antenna(draw, 0, 0, state.get('wifi', -1), bool(state.get('lan')))
        battery = state.get('battery')
        if isinstance(battery, (int, float)) and battery >= 0:
            self._battery(draw, 17, 0, battery)
        repeat = state.get('repeat')
        if repeat in ('all', 'track'):
            self._repeat(draw, 51, 0, repeat)
        if state.get('shuffle'):
            self._shuffle(draw, 72, 0)
        if info:
            self._info_icon(draw, 88, 0)
        volume = state.get('volume')
        output = state.get('output')
        # (the speaker, as drawn, ends at the edge; the picture of the headphones or of Bluetooth is a bit wider or narrower)
        picture, left = (HEADPHONES, self.width - 9) if output == 'headphone' else (BLUETOOTH, self.width - 7) if output == 'bluetooth' else (SPEAKER, self.width - 8)
        first = min(i for row in picture for i, ch in enumerate(row) if ch == '#')
        self._art(draw, left, 0, picture)
        self._big_digits(draw, left + first - 3, 1, '%d' % int(volume) if isinstance(volume, (int, float)) else '--', VOLUME_DIGITS, right=True)

    def bottom_row(self, draw, state):
        """The row at the bottom: what the player does and the time (up from the start, or down to the end), the track at the right."""
        font = self.fonts.row
        y = self.height - 11
        if state.get('playing'):
            draw.polygon([(0, y + 2), (5, y + 5), (0, y + 8)], fill=1)
        else:
            draw.rectangle((0, y + 2, 1, y + 8), fill=1)
            draw.rectangle((4, y + 2, 5, y + 8), fill=1)
        elapsed, duration = state.get('elapsed'), state.get('duration')
        if state.get('timeMode') == 'down' and isinstance(elapsed, (int, float)) and isinstance(duration, (int, float)) and duration > 0:
            text = '-' + clock_text(max(0, duration - elapsed))
        else:
            text = clock_text(elapsed)
        draw.text((9, y), text, font=font, fill=1)
        track, tracks = state.get('track'), state.get('tracks')
        if track and tracks:
            end = 9 + draw.textlength(text, font=font)
            for template in ('Track:%d/%d', '%d/%d'):
                label = template % (track, tracks)
                w = draw.textlength(label, font=font)
                if end + 4 + w <= self.width:
                    draw.text((self.width - w, y), label, font=font, fill=1)
                    break

    # ---- the screens ----------------------------------------------------------------------------------------------
    def boot(self):
        image, draw = self._canvas()
        self._note(draw, self.width // 2 - 14, 2 if self.tall else 0, 28 if self.tall else 24)
        if self.tall:
            text = 'MuPiBox'
            w = draw.textlength(text, font=self.fonts.text)
            draw.text(((self.width - w) // 2, 46), text, font=self.fonts.text, fill=1)
        return image

    def _note(self, draw, x, y, size):
        """A music note: head, stem and flag."""
        r = max(4, size // 4)
        draw.ellipse((x + 2, y + size - 2 * r, x + 2 + 2 * r, y + size), fill=1)
        stem_x = x + 2 + 2 * r - 1
        draw.line((stem_x, y + size - r, stem_x, y + 2), fill=1, width=2)
        draw.polygon([(stem_x, y + 2), (stem_x + size // 2, y + size // 3), (stem_x + size // 2 - 2, y + size // 2), (stem_x, y + size // 4)], fill=1)

    def poweroff(self):
        image, draw = self._canvas()
        size = 30 if self.tall else 22
        cx, cy = self.width // 2, self.height // 2
        draw.arc((cx - size // 2, cy - size // 2, cx + size // 2, cy + size // 2), 310, 230, fill=1, width=3)
        draw.line((cx, cy - size // 2 - 2, cx, cy - 2), fill=1, width=3)
        return image

    def blank(self):
        return Image.new('1', (self.width, self.height), 0)

    def idle(self, state, now):
        """Nothing plays: the clock (with the date) when it is wanted, else the note."""
        image, draw = self._canvas()
        if state.get('clock') and state.get('time'):
            time_text = state['time']
            w = draw.textlength(time_text, font=self.fonts.clock)
            if self.tall:
                draw.text(((self.width - w) // 2, 6), time_text, font=self.fonts.clock, fill=1)
                date = state.get('date') or ''
                dw = draw.textlength(date, font=self.fonts.text)
                draw.text(((self.width - dw) // 2, 40), date, font=self.fonts.text, fill=1)
            else:
                draw.text((4, 2), time_text, font=self.fonts.clock, fill=1)
            self._wifi(draw, state.get('wifi', -1), self.width - 18, self.height - 2, bool(state.get('lan')))
        else:
            self._note(draw, self.width // 2 - 14, 4 if self.tall else 2, 38 if self.tall else 26)
            self._wifi(draw, state.get('wifi', -1), self.width - 18, self.height - 2, bool(state.get('lan')))
        return image

    def overlay(self, state):
        """The short pictures for play, pause and a change of the volume."""
        image, draw = self._canvas()
        kind = state.get('overlay')
        cy = self.height // 2
        if kind == 'play':
            r = 22 if self.tall else 14
            draw.polygon([(self.width // 2 - r // 2, cy - r), (self.width // 2 + r, cy), (self.width // 2 - r // 2, cy + r)], fill=1)
        elif kind == 'pause':
            r = 22 if self.tall else 14
            bar = max(6, r // 2)
            draw.rectangle((self.width // 2 - bar - 4, cy - r, self.width // 2 - 4, cy + r), fill=1)
            draw.rectangle((self.width // 2 + 4, cy - r, self.width // 2 + bar + 4, cy + r), fill=1)
        elif kind in ('volume', 'mute'):
            volume = int(state.get('volume') or 0)
            y = cy - 14
            self._speaker(draw, 14, y, muted=(kind == 'mute' or volume == 0))
            if kind == 'volume' and volume > 0:
                x0, x1 = 44, self.width - 14
                draw.rectangle((x0, cy - 4, x1, cy + 4), outline=1)
                fill = x0 + 2 + int((x1 - x0 - 4) * min(100, volume) / 100)
                draw.rectangle((x0 + 2, cy - 2, max(x0 + 2, fill), cy + 2), fill=1)
        return image

    def info(self, state, now=0):
        """WLAN name, address and version of the box. On 128 x 64: the layout of the status bar, three lines and the bottom row."""
        image, draw = self._canvas()
        lines = ['LAN' if state.get('lan') else 'SSID:%s' % (state.get('ssid') or '-'), 'IP:%s' % (state.get('ip') or '-'), str(state.get('version') or '')]
        if self.tall:
            self.status_bar(draw, state, info=True)
            for i, line in enumerate(lines):
                self._marquee(draw, ('info', i), line, 12 + i * 13, self.fonts.row, now)
            if state.get('title') or state.get('playing') or state.get('elapsed') is not None:
                self.bottom_row(draw, state)
            return image
        font = self.fonts.small
        for i, line in enumerate(lines):
            draw.text((0, 1 + i * 10), fit(line, font, draw, self.width - 8), font=font, fill=1)
        left = max(0.0, min(1.0, float(state.get('infoLeft', 1.0))))
        draw.rectangle((self.width - 4, 0, self.width - 1, int((self.height - 1) * left)), fill=1)
        return image

    def play(self, state, now):
        """The picture of a medium that plays or is paused, in the chosen mode ('full', 'mix' or 'lite')."""
        mode = state.get('mode') or 'full'
        if not self.tall:
            return self._play_compact(state, now)
        if mode == 'lite':
            return self._play_lite(state)
        if mode == 'mix':
            return self._play_mix(state)
        return self._play_full(state, now)

    def _progress(self, draw, state):
        pos, dur = state.get('elapsed'), state.get('duration')
        if isinstance(pos, (int, float)) and isinstance(dur, (int, float)) and dur > 0:
            width = int(self.width * min(1.0, max(0.0, pos / dur)))
            draw.rectangle((0, 0, max(0, width - 1), 1), fill=1)
        elif state.get('stream'):
            draw.rectangle((0, 0, self.width - 1, 1), fill=1)

    def _status_bar(self, draw, state):
        """The row at the bottom: time, track, volume, wireless."""
        y = self.height - 11
        draw.line((0, y - 2, self.width, y - 2), fill=1)
        font = self.fonts.small
        paused = not state.get('playing')
        left = 'PAUSE' if paused else clock_text(state.get('elapsed'))
        draw.text((1, y), left, font=font, fill=1)
        draw.line((40, y - 2, 40, self.height), fill=1)
        track, tracks = state.get('track'), state.get('tracks')
        mid = '%s/%s' % (track, tracks) if track and tracks else (str(track) if track else '')
        draw.text((43, y), mid[:5], font=font, fill=1)
        draw.line((76, y - 2, 76, self.height), fill=1)
        volume = state.get('volume')
        draw.text((79, y), 'V%s' % (int(volume) if isinstance(volume, (int, float)) else '--'), font=font, fill=1)
        draw.line((106, y - 2, 106, self.height), fill=1)
        self._wifi(draw, state.get('wifi', -1), 110, self.height - 2, bool(state.get('lan')))

    def _play_full(self, state, now):
        """The layout: status bar, title, artist and album (the ones there are), and the row with time and track."""
        image, draw = self._canvas()
        self.status_bar(draw, state)
        lines = [state.get('title') or '', state.get('artist') or '', state.get('album') or '']
        # (only the lines there are, from the top: a radio station has no album)
        shown = [text for text in lines if text] or ['']
        for i, text in enumerate(shown[:3]):
            self._marquee(draw, ('full', i), text, 12 + i * 13, self.fonts.row, now)
        self.bottom_row(draw, state)
        return image

    def _big_text(self, state):
        track, tracks = state.get('track'), state.get('tracks')
        if track and tracks and tracks > 1:
            return str(track), self.fonts.huge
        return clock_text(state.get('elapsed')), self.fonts.big

    def _play_mix(self, state):
        image, draw = self._canvas()
        self._progress(draw, state)
        text, font = self._big_text(state)
        w = draw.textlength(text, font=font)
        draw.text(((self.width - w) // 2, 2), text, font=font, fill=1)
        self._status_bar(draw, state)
        return image

    def _play_lite(self, state):
        image, draw = self._canvas()
        self._progress(draw, state)
        text, font = self._big_text(state)
        w = draw.textlength(text, font=font)
        draw.text(((self.width - w) // 2, 8), text, font=font, fill=1)
        self._wifi(draw, state.get('wifi', -1), self.width - 18, self.height - 2, bool(state.get('lan')))
        if not state.get('playing'):
            draw.text((1, self.height - 11), 'PAUSE', font=self.fonts.small, fill=1)
        return image

    def _play_compact(self, state, now):
        """128 x 32: progress bar, the title and a row with time, volume and wireless."""
        image, draw = self._canvas()
        self._progress(draw, state)
        title = state.get('title') or state.get('artist') or state.get('album') or ''
        self._marquee(draw, ('compact', 0), title, 3, self.fonts.text, now)
        sub = state.get('artist') or state.get('album') or ''
        if sub and sub != title:
            self._marquee(draw, ('compact', 1), sub, 13, self.fonts.small, now)
        y = self.height - 9
        draw.text((1, y), 'PAUSE' if not state.get('playing') else clock_text(state.get('elapsed')), font=self.fonts.small, fill=1)
        volume = state.get('volume')
        draw.text((60, y), 'V%s' % (int(volume) if isinstance(volume, (int, float)) else '--'), font=self.fonts.small, fill=1)
        self._wifi(draw, state.get('wifi', -1), self.width - 18, self.height - 2, bool(state.get('lan')))
        return image

    def render(self, state, now):
        """The picture for the state the extension reported (`view`: boot, off, overlay, info, idle or play)."""
        view = state.get('view') or 'idle'
        self.scrolling = False
        self.scroll_mode = state.get('scroll') if state.get('scroll') in ('loop', 'once', 'off') else 'loop'
        if view == 'boot':
            return self.boot()
        if view == 'bye':
            return self.poweroff()
        if view == 'off':
            return self.blank()
        if view == 'overlay' or state.get('overlay'):
            return self.overlay(state)
        if view == 'info':
            return self.info(state, now)
        if view == 'play':
            return self.play(state, now)
        return self.idle(state, now)
