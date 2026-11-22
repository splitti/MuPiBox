"""The screens of the OLED display: what is drawn for a state of the box, as a 1-bit picture.

Pure drawing (Pillow only): no hardware, no clock of its own besides the `now` it is given, so the screens can be tried
and tested without a display. The layouts are made for 128 x 64 and 128 x 32 pixels.
"""
import io
import os
import re

from PIL import Image, ImageChops, ImageDraw, ImageFont

import qr

FONT_CANDIDATES = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSansMono.ttf',
)
BOLD_CANDIDATES = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSansMono-Bold.ttf',
)

# The pictures of the display (128 x 64, white on black): the ones the extension brings in images/ and, for the four the user may
# change, their own ones in the data folder of the extension. What each view shows:
CHANGEABLE = ('boot', 'idle', 'update', 'rest')
# The picture a tag brings: the top 50 rows of the 128 x 64 display, in place of the progress bar and the big time (Mix and Compact mode);
# its file is <custom>/tags/<id of the tag>.png
TAG_PICTURE_SIZE = (128, 50)
TAG_FOLDER = 'tags'
PODCAST_LINES = 3  # lines the title of a podcast episode may take (it is wrapped at the words)
TAG_ID = re.compile(r'^[0-9A-Za-z_-]{1,40}$')
VIEW_PICTURES = {'boot': 'boot', 'bye': 'shutdown', 'update': 'update', 'rest': 'rest'}
# (the picture of the idle display: the reader that waits for a tag, the scanner that waits for a code, or the user's own one)
IDLE_PICTURES = {'nfc': 'nfc', 'barcode': 'barcode', 'custom': 'idle'}

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
        # (the number of the compact mode: the digits are 37 pixels high and 30 apart there, as measured on the photo of the display - the largest
        # that leaves the bar of the progress above and the wireless bars below free; a long text takes a smaller size that fits)
        self._lite = {}

    def lite(self, size):
        """The bold font of the compact mode in that size (loaded once)."""
        if size not in self._lite:
            self._lite[size] = _load(BOLD_CANDIDATES, size)
        return self._lite[size]


def fit_picture(image, width, height):
    """A picture (any mode and size) as a 1-bit picture of width x height: scaled to fit (not stretched), black around it."""
    image = image.convert('L')
    if image.size != (width, height):
        scale = min(width / image.width, height / image.height)
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(size, Image.LANCZOS)
        canvas = Image.new('L', (width, height), 0)
        canvas.paste(image, ((width - size[0]) // 2, (height - size[1]) // 2))
        image = canvas
    return image.point(lambda v: 255 if v > 127 else 0).convert('1')


class PictureError(ValueError):
    """A picture the user chose that the display does not take: `code` says why (bad_size, not_1bit)."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def check_picture(data, width=128, height=64):
    """A picture the user chose (the bytes of a PNG, JPEG ...) as a 1-bit picture of width x height, white on black - only if it is one
    already: exactly width x height points, every point pure black or pure white (no grey, no colour, nothing transparent). Nothing is
    scaled, turned around or dithered: PictureError('bad_size' | 'not_1bit') for any other picture."""
    source = Image.open(io.BytesIO(data))
    # (the size from the file's head, before it is unpacked: a small file can hold a picture of many million points)
    if source.size != (width, height):
        raise PictureError('bad_size', 'the picture is %d x %d points, not %d x %d' % (source.width, source.height, width, height))
    rgba = source.convert('RGBA')
    if rgba.getchannel('A').getextrema()[0] != 255:
        raise PictureError('not_1bit', 'the picture has transparent points')
    red, green, blue = rgba.convert('RGB').split()
    for channel in (red, green, blue):
        histogram = channel.histogram()
        if any(histogram[1:255]):
            raise PictureError('not_1bit', 'the picture has grey or coloured points')
    if ImageChops.difference(red, green).getbbox() or ImageChops.difference(green, blue).getbbox():
        raise PictureError('not_1bit', 'the picture has coloured points')
    return red.point(lambda v: 255 if v else 0).convert('1')


class Pictures:
    """Finds and loads the pictures: images/<name>.png of the extension, and for the changeable ones <custom>/<name>.png first.
    A picture is read again when its file changed (the user chose another one); a file that cannot be read is no picture."""

    def __init__(self, builtin=None, custom=None, width=128, height=64):
        self.builtin = builtin if builtin is not None else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'images')
        self.custom = custom
        self.width = width
        self.height = height
        self._kept = {}

    def path(self, name):
        if name in CHANGEABLE and self.custom:
            own = os.path.join(self.custom, name + '.png')
            if os.path.isfile(own):
                return own
        if name in ('idle',):
            return None  # (no ready-made picture: the idle display shows the reader then)
        built = os.path.join(self.builtin, name + '.png') if self.builtin else None
        return built if built and os.path.isfile(built) else None

    def tag(self, uid):
        """The picture a tag has (TAG_PICTURE_SIZE, white on black) or None: <custom>/tags/<uid>.png, read again when the file changed."""
        if not self.custom or not TAG_ID.match(str(uid or '')):
            return None
        path = os.path.join(self.custom, TAG_FOLDER, str(uid) + '.png')
        try:
            stat = os.stat(path)
        except OSError:
            return None
        key = (path, stat.st_mtime_ns, stat.st_size)
        kept = self._kept.get(('tag', uid))
        if kept and kept[0] == key:
            return kept[1]
        try:
            with Image.open(path) as source:
                # (a file that is not of the size - made by hand in the folder - is no picture: nothing is cut or stretched)
                image = source.convert('1') if source.size == TAG_PICTURE_SIZE else None
        # (anything PIL may raise on a broken or oversized file made by hand - DecompressionBombError, SyntaxError - is no picture,
        # and kept as none: the driver must not stop on it)
        except Exception:
            image = None
        self._kept[('tag', uid)] = (key, image)
        return image

    def is_own(self, name):
        return name in CHANGEABLE and bool(self.custom) and os.path.isfile(os.path.join(self.custom, name + '.png'))

    def get(self, name):
        path = self.path(name)
        if not path:
            return None
        try:
            stat = os.stat(path)
        except OSError:
            return None
        key = (path, stat.st_mtime_ns, stat.st_size)
        kept = self._kept.get(name)
        if kept and kept[0] == key:
            return kept[1]
        try:
            with Image.open(path) as source:
                image = fit_picture(source, self.width, self.height)
        except (OSError, ValueError):
            return None
        self._kept[name] = (key, image)
        return image


def clock_text(seconds):
    """67 -> '1:07', 3725 -> '1:02:05' (nothing known -> '--:--')."""
    if seconds is None or seconds < 0:
        return '--:--'
    seconds = int(seconds)
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    return '%d:%02d:%02d' % (h, m, s) if h else '%d:%02d' % (m, s)


def shown_time(state, short=False):
    """The time of the player the way the user chose ("Zeit zeigen"): up from the start, or - with `timeMode` 'down' - a minus and what is left
    (a stream has no end to count down to: it counts up). `short` leaves out the seconds of a time with hours."""
    elapsed, duration = state.get('elapsed'), state.get('duration')
    if state.get('timeMode') == 'down' and isinstance(elapsed, (int, float)) and isinstance(duration, (int, float)) and duration > 0:
        seconds, sign = max(0, duration - elapsed), '-'
    else:
        seconds, sign = elapsed, ''
    text = clock_text(seconds)
    if short and text.count(':') == 2:
        text = text.rsplit(':', 1)[0]
    return sign + text


def played_time(state, short=False):
    """The time of the playing as the bottom row shows it: '' for a radio stream (how long it has been on says nothing), else shown_time."""
    return '' if state.get('stream') else shown_time(state, short)


def fit(text, font, draw, width):
    """The text cut to the width with '…' at its end (for a line that does not scroll)."""
    if draw.textlength(text, font=font) <= width:
        return text
    while text and draw.textlength(text + '…', font=font) > width:
        text = text[:-1]
    return text + '…'


def wrap_lines(text, font, draw, width, max_lines):
    """The text in lines of at most `width` pixels, broken between the words (a word that is wider than a line alone is broken where
    the line ends). The last of `max_lines` takes all that is left - it is longer than the width then, and scrolls."""
    words = str(text).split()
    lines = []
    while words:
        if len(lines) == max_lines - 1:
            lines.append(' '.join(words))
            break
        word = words.pop(0)
        while draw.textlength(word, font=font) > width and len(word) > 1 and len(lines) < max_lines - 1:
            cut = len(word) - 1
            while cut > 1 and draw.textlength(word[:cut], font=font) > width:
                cut -= 1
            lines.append(word[:cut])
            word = word[cut:]
        if len(lines) == max_lines - 1:
            words.insert(0, word)
            continue
        line = word
        while words and draw.textlength(line + ' ' + words[0], font=font) <= width:
            line += ' ' + words.pop(0)
        lines.append(line)
    return lines or ['']


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
IPV4 = re.compile(r'^\d{1,3}(\.\d{1,3}){3}$')
# (the pictures of the status bar are the ones of the layout drawing, pixel by pixel; the digits of the drawing are "88" for the battery
# and "100" for the volume - the other digits follow their style)
ANTENNA = ('#########', '#...#...#', '.#..#..#.', '..#.#.#..', '...###...', '....#....', '....#....', '....#....', '....#....')
# (the bars of the aerial: five of them, 2 to 6 pixels high, at x 6, 8, 10, 12 and 14)
ANTENNA_BARS = (6, 8, 10, 12, 14)
BATTERY = ('..##################', '..#................#', '###.##.##.##.##.##.#', '#.#.##.##.##.##.##.#', '#.#.##.##.##.##.##.#',
           '#.#.##.##.##.##.##.#', '###.##.##.##.##.##.#', '..#................#', '..##################')
BATTERY_SEGMENT_X = (4, 7, 10, 13, 16)
# (where the battery stands from the left of its two digits, the last column of the A beside the arrows of the repeat, and the gap between the
# elements of the top row)
BATTERY_X = 13
REPEAT_MARK_END = 18
STATUS_GAP = 5
# (the loop of the two arrows without the stroke at its left, which looked like a 1 beside them)
REPEAT = ('........#.....', '........##....', '..#########.#.', '........##..#.', '......#.#...#.', '.....##.....#.', '....#########.', '.....##.......', '......#.......')
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
# (the text of the bottom row - time, track, volume - and of the network page: the chunky 5 x 7 pixels of the box's display, a step of 6;
# copied pixel by pixel from photos of the real display. The slash goes one row below the line, the colon and the point are single dots)
ROW_FONT = {
    '0': ('.###.', '#...#', '#...#', '#.#.#', '#...#', '#...#', '.###.'),
    '1': ('###..', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'),
    '2': ('.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'),
    '3': ('.###.', '#...#', '....#', '.###.', '....#', '#...#', '.###.'),
    '4': ('...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'),
    '5': ('#####', '#....', '####.', '....#', '....#', '#...#', '.###.'),
    '6': ('.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'),
    '7': ('#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'),
    '8': ('.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'),
    '9': ('.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'),
    'V': ('#...#', '#...#', '.#.#.', '.#.#.', '.#.#.', '..#..', '..#..'),
    '/': ('....#', '...#.', '...#.', '..#..', '..#..', '.#...', '.#...', '#....'),
    ':': ('.....', '.....', '..#..', '.....', '.....', '..#..', '.....'),
    '.': ('.....', '.....', '.....', '.....', '.....', '.....', '.#...'),
    '-': ('.....', '.....', '.....', '.###.', '.....', '.....', '.....'),
    'P': ('####.', '#...#', '#...#', '####.', '#....', '#....', '#....'),
    'A': ('.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'),
    'U': ('#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
    'S': ('.####', '#....', '#....', '.###.', '....#', '....#', '####.'),
    'E': ('#####', '#....', '#....', '####.', '#....', '#....', '#####'),
    'I': ('.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'),
}
# (the bottom row of the Mix mode and of the 128 x 32 display: the V of the volume, and where the track and the volume end)
VOLUME_V_X = 79
TRACK_END = 73
VOLUME_END = 103
HEADPHONES = ('..#####..', '.#.....#.', '#.......#', '#.......#', '#.......#', '##.....##', '###...###', '###...###', '##.....##')
BLUETOOTH = ('..#....', '..##...', '#.#.#..', '.###...', '..#....', '.###...', '#.#.#..', '..##...', '..#....')
# (a monitor with a network plug at its left and the cable going down: the box is on the wired network)
LAN = ('###############', '#####.........#', '#.#.#.........#', '#...#.........#', '#####.........#', '..#...........#', '..#############', '..#......#.....', '..#...#####....')
SPEAKER = ('......#.', '.....##.', '..#####.', '.#..###.', '.#..###.', '.#..###.', '..#####.', '.....##.', '......#.')


def extent(rows):
    """The first and the last lit column of a picture given as lines of text."""
    lit = [i for row in rows for i, ch in enumerate(row) if ch == '#']
    return min(lit), max(lit)


class Screens:
    def __init__(self, width=128, height=64, fonts=None, pictures=None):
        self.width = width
        self.height = height
        self.tall = height >= 48
        self.fonts = fonts or Fonts()
        self.pictures = pictures or Pictures(width=width, height=height)
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

    @staticmethod
    def row_width(text):
        """How wide a text of the row font is (its last pixel included)."""
        return len(text) * BIG_ADVANCE - 1 if text else 0

    def _row_text(self, draw, x, y, text, right=False):
        """Text in the row font (see ROW_FONT) with its top at y; with `right` its last pixel is at x. Unknown characters are a dash."""
        text = str(text)
        if right:
            x -= self.row_width(text) - 1
        for ch in text:
            self._art(draw, x, y, ROW_FONT.get(ch.upper(), ROW_FONT['-']))
            x += BIG_ADVANCE

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
        bx = x + BATTERY_X
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
        # (the elements stand in a row from the left, each 5 pixels after the one before - the ones that are not shown leave no gap)
        x = 0
        wifi, lan = state.get('wifi', -1), bool(state.get('lan'))
        first, last = extent(LAN) if lan else extent(ANTENNA) if wifi < 0 else (0, ANTENNA_BARS[-1])
        self._antenna(draw, x - first, 0, wifi, lan)
        x += last - first + 1 + STATUS_GAP
        battery = state.get('battery')
        if isinstance(battery, (int, float)) and battery >= 0:
            self._battery(draw, x, 0, battery)
            x += BATTERY_X + extent(BATTERY)[1] + 1 + STATUS_GAP
        repeat = state.get('repeat')
        if repeat in ('all', 'track'):
            first, last = extent(REPEAT)
            self._repeat(draw, x - first, 0, repeat)
            x += REPEAT_MARK_END - first + 1 + STATUS_GAP
        if state.get('shuffle'):
            first, last = extent(SHUFFLE)
            self._shuffle(draw, x - first, 0)
            x += last - first + 1 + STATUS_GAP
        if info:
            self._info_icon(draw, x, 0)
        volume = state.get('volume')
        output = state.get('output')
        # (the speaker, as drawn, ends at the edge; the picture of the headphones or of Bluetooth is a bit wider or narrower)
        picture, left = (HEADPHONES, self.width - 9) if output == 'headphone' else (BLUETOOTH, self.width - 7) if output == 'bluetooth' else (SPEAKER, self.width - 8)
        first = min(i for row in picture for i, ch in enumerate(row) if ch == '#')
        self._art(draw, left, 0, picture)
        self._big_digits(draw, left + first - 3, 1, '%d' % int(volume) if isinstance(volume, (int, float)) else '--', VOLUME_DIGITS, right=True)

    def bottom_row(self, draw, state, right=None):
        """The row at the bottom: what the player does and the time (up from the start, or down to the end), the track at the right
        (`right`: that text instead of the track - '' for none)."""
        font = self.fonts.row
        y = self.height - 11
        if state.get('playing'):
            draw.polygon([(0, y + 2), (5, y + 5), (0, y + 8)], fill=1)
        else:
            draw.rectangle((0, y + 2, 1, y + 8), fill=1)
            draw.rectangle((4, y + 2, 5, y + 8), fill=1)
        text = played_time(state)
        draw.text((9, y), text, font=font, fill=1)
        track, tracks = state.get('track'), state.get('tracks')
        end = 9 + draw.textlength(text, font=font)
        if right is not None:
            w = draw.textlength(right, font=font)
            if right and end + 4 + w <= self.width:
                draw.text((self.width - w, y), right, font=font, fill=1)
        elif track and tracks:
            # (a podcast counts episodes)
            for template in (('Folge: %d/%d', 'Folge:%d/%d', '%d/%d') if state.get('broadcast') else ('Track:%d/%d', '%d/%d')):
                label = template % (track, tracks)
                w = draw.textlength(label, font=font)
                if end + 4 + w <= self.width:
                    draw.text((self.width - w, y), label, font=font, fill=1)
                    break

    # ---- the screens ----------------------------------------------------------------------------------------------
    def boot(self):
        # (the picture of the start: the logo, or the user's own one)
        picture = self.pictures.get('boot')
        if picture is not None:
            return picture
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
        picture = self.pictures.get('shutdown')
        if picture is not None:
            return picture
        image, draw = self._canvas()
        size = 30 if self.tall else 22
        cx, cy = self.width // 2, self.height // 2
        draw.arc((cx - size // 2, cy - size // 2, cx + size // 2, cy + size // 2), 310, 230, fill=1, width=3)
        draw.line((cx, cy - size // 2 - 2, cx, cy - 2), fill=1, width=3)
        return image

    def blank(self):
        return Image.new('1', (self.width, self.height), 0)

    def idle(self, state, now):
        """Nothing plays: the picture the settings name (state['idle']: nfc, barcode or custom), the clock (with the date) when it is
        wanted, else the note."""
        slot = IDLE_PICTURES.get(state.get('idle'))
        if slot:
            # (the user's own picture, as long as there is none: the one of the reader)
            picture = self.pictures.get(slot) or self.pictures.get('nfc')
            if picture is not None:
                return picture
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

    def address_qr(self, ip):
        """The address of the box as a QR code and nothing else: dark modules on a lit square (a phone reads that best), as large as the
        display allows with a quiet zone of two modules. None when there is no address to make a code of."""
        if not IPV4.match(str(ip or '')):
            return None
        matrix = qr.encode('http://%s' % ip)
        n = len(matrix)
        module = max(1, self.height // (n + 4))
        side = (n + 4) * module
        image, draw = self._canvas()
        left, top = (self.width - side) // 2, (self.height - side) // 2
        draw.rectangle((left, top, left + side - 1, top + side - 1), fill=1)
        for y, row in enumerate(matrix):
            for x, dark in enumerate(row):
                if dark:
                    px, py = left + (x + 2) * module, top + (y + 2) * module
                    draw.rectangle((px, py, px + module - 1, py + module - 1), fill=0)
        return image

    def info(self, state, now=0):
        """The address of the box as a QR code (see address_qr). Without an address (the box has no network): WLAN name, address and version -
        on 128 x 64 the layout of the status bar, three lines and the bottom row."""
        code = self.address_qr(state.get('ip'))
        if code is not None:
            return code
        image, draw = self._canvas()
        lines = ['LAN' if state.get('lan') else 'SSID:%s' % (state.get('ssid') or '-'), 'IP:%s' % (state.get('ip') or '-'), str(state.get('version') or '')]
        if self.tall:
            self.status_bar(draw, state, info=True)
            for i, line in enumerate(lines):
                # (the address in the pixels of the row font, as the other numbers of the display)
                if i == 1 and re.match(r'^IP:(\d{1,3}(\.\d{1,3}){3}|-)$', line):
                    self._row_text(draw, 0, 12 + i * 13 + 1, line)
                else:
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

    def select(self, state, now):
        """What the rotary knob is on while it chooses an album, a folder or an episode: where it is (the artist or folder), its name and
        its place in the list. On 128 x 64 below the status bar, with the bottom row of the player when something plays."""
        image, draw = self._canvas()
        pick = state.get('pick') or {}
        title, artist = pick.get('title') or '', pick.get('artist') or ''
        index, count = pick.get('index') or 0, pick.get('count') or 0
        place = '< %d/%d >' % (index, count) if count else ''
        if self.tall:
            self.status_bar(draw, state)
            line = 12
            if artist:
                self._marquee(draw, ('select', 0), artist, line, self.fonts.row, now)
                line += 13
            self._marquee(draw, ('select', 1), title, line, self.fonts.text, now)
            line += 14
            if place:
                w = draw.textlength(place, font=self.fonts.row)
                draw.text(((self.width - w) // 2, line), place, font=self.fonts.row, fill=1)
            if state.get('title') or state.get('playing') or state.get('elapsed') is not None:
                self.bottom_row(draw, state)
            return image
        self._marquee(draw, ('select', 1), title, 2, self.fonts.text, now)
        if artist:
            self._marquee(draw, ('select', 0), artist, 14, self.fonts.small, now, width=self.width - 50)
        if place:
            w = draw.textlength(place, font=self.fonts.small)
            draw.text((self.width - w, 14), place, font=self.fonts.small, fill=1)
        return image

    def play(self, state, now):
        """The picture of a medium that plays or is paused, in the chosen mode ('full', 'mix' or 'lite')."""
        mode = state.get('mode') or 'full'
        # (a podcast or a radio station: no picture of a tag to show - or the user wants the title - then the whole title over up to three
        # lines; a station without a time of day shows the usual picture)
        if state.get('broadcast') and not self._has_tag_picture(state):
            radio = bool(state.get('stream'))
            if self.tall and (not radio or state.get('time')):
                return self._play_titled(state, now, mode)
            if radio and state.get('time'):
                return self._play_broadcast(state, now)
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
        # (a stream has no end: no bar - a full one would only look like a medium that is over)

    def _progress_over_picture(self, image, state):
        """The bar of the progress over the top rows of a picture of a tag: where the bar goes, the picture's points are turned round, so it
        shows on white as on black. Only a podcast has one (a radio station has no length; an album keeps its picture whole)."""
        pos, dur = state.get('elapsed'), state.get('duration')
        if state.get('broadcast') and isinstance(pos, (int, float)) and isinstance(dur, (int, float)) and dur > 0:
            width = max(1, int(self.width * min(1.0, max(0.0, pos / dur))))
            box = (0, 0, width, 2)
            image.paste(ImageChops.invert(image.crop(box)), box)

    def _volume_cell(self, draw, state, y):
        """The volume of the bottom row: the V at the left of its cell, the number ending 3 pixels before the line that closes the cell
        (`y` is the top of the pixel text)."""
        volume = state.get('volume')
        self._row_text(draw, VOLUME_V_X, y, 'V')
        self._row_text(draw, VOLUME_END, y, '%d' % int(volume) if isinstance(volume, (int, float)) else '--', right=True)

    def _status_bar(self, draw, state, mid=None):
        """The row at the bottom: time, track, volume, wireless. `mid`: the text of the middle cell instead of the track ('' for none)."""
        y = self.height - 11
        draw.line((0, y - 2, self.width, y - 2), fill=1)
        paused = not state.get('playing')
        left = 'PAUSE' if paused else played_time(state)
        # (the cell is 38 pixels wide: a time with hours and a minus has no room for its seconds)
        if self.row_width(left) > 38:
            left = played_time(state, short=True)
        y += 1
        self._row_text(draw, 1, y, left)
        draw.line((40, y - 3, 40, self.height), fill=1)
        track, tracks = state.get('track'), state.get('tracks')
        if mid is None:
            mid = '%s/%s' % (track, tracks) if track and tracks and not state.get('broadcast') else (str(track) if track else '')
        self._row_text(draw, TRACK_END, y, mid[:5], right=True)
        draw.line((76, y - 3, 76, self.height), fill=1)
        self._volume_cell(draw, state, y)
        draw.line((106, y - 3, 106, self.height), fill=1)
        self._wifi(draw, state.get('wifi', -1), 110, self.height - 2, bool(state.get('lan')))

    def _play_full(self, state, now):
        """The layout: status bar, title, artist and album (the ones there are), and the row with time and track."""
        image, draw = self._canvas()
        if self._tag_picture(image, state):
            # (a radio station or a podcast: the time of day where the track number is)
            self.bottom_row(draw, state, right=self._broadcast_time(state))
            return image
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
        return shown_time(state), self.fonts.big

    def _tag_picture(self, image, state):
        """The picture of the tag that started the medium in the top rows - only on the 128 x 64 display, whose top 50 rows it is made for.
        True when it was drawn (then no progress bar and no big time: the picture is in their place)."""
        if (self.width, self.height) != (TAG_PICTURE_SIZE[0], 64) or not state.get('tagPicture'):
            return False
        picture = self.pictures.tag(state.get('tagPicture'))
        if picture is None:
            return False
        image.paste(picture, (0, 0))
        return True

    def _broadcast_time(self, state):
        """The time of day for the place of the track number while a radio station plays; None for any other medium (a podcast shows its
        episode there)."""
        return str(state.get('time') or '') if state.get('broadcast') and state.get('stream') and state.get('time') else None

    def _has_tag_picture(self, state):
        """Is there a picture of the tag to show (the display is 128 x 64 and the tag has its file)?"""
        if (self.width, self.height) != (TAG_PICTURE_SIZE[0], 64) or not state.get('tagPicture'):
            return False
        return self.pictures.tag(state.get('tagPicture')) is not None

    def _clock_centred(self, draw, state, top, bottom, size):
        """The time of day in the middle of the display (by its digits), in the band from `top` to `bottom`."""
        text = str(state.get('time') or '')
        font = self.fonts.lite(size)
        while size > 12 and draw.textlength(text, font=font) > self.width - 4:
            size -= 2
            font = self.fonts.lite(size)
        left, ink_top, right, ink_bottom = draw.textbbox((0, 0), text, font=font)
        x = round((self.width - draw.textlength(text, font=font)) / 2)
        draw.text((x, round((top + bottom) / 2 - (ink_top + ink_bottom) / 2)), text, font=font, fill=1)

    def _play_broadcast(self, state, now):
        """A radio station on the 128 x 32 display: the title and the time of day in the middle at twice its size."""
        image, draw = self._canvas()
        title = state.get('title') or state.get('artist') or state.get('album') or ''
        self._marquee(draw, ('broadcast', 0), title, 1, self.fonts.small, now)
        self._clock_centred(draw, state, 11, self.height, self.fonts.small.size * 2)
        return image

    def _play_titled(self, state, now, mode):
        """A podcast or a radio station (128 x 64): the title over up to three lines, broken between the words - what does not fit in the
        third line scrolls there. Full: the status bar at the top and the bottom row with the time of the playing and, at the right, the
        episode of a podcast (`Folge: 3/123`) or the time of day of a station; Mix: the bar of the progress (a podcast), the status line
        at the bottom with the number of the episode or the time of day in the middle; Compact: the bar and only the wireless symbol and PAUSE."""
        image, draw = self._canvas()
        title = state.get('title') or state.get('artist') or state.get('album') or ''
        font = self.fonts.text
        top, step = (12, 13) if mode not in ('mix', 'lite') else (4, 14)
        if mode in ('mix', 'lite'):
            self._progress(draw, state)
        else:
            self.status_bar(draw, state)
        for i, line in enumerate(wrap_lines(title, font, draw, self.width, PODCAST_LINES)):
            self._marquee(draw, ('broadcast', i), line, top + i * step, font, now)
        if mode == 'lite':
            self._wifi(draw, state.get('wifi', -1), self.width - 18, self.height - 2, bool(state.get('lan')))
            if not state.get('playing'):
                self._row_text(draw, 1, self.height - 10, 'PAUSE')
        elif mode == 'mix':
            self._status_bar(draw, state, mid=self._broadcast_time(state))
        else:
            self.bottom_row(draw, state, right=self._broadcast_time(state))
        return image

    def _play_mix(self, state):
        image, draw = self._canvas()
        if self._tag_picture(image, state):
            self._progress_over_picture(image, state)
        else:
            self._progress(draw, state)
            text, font = self._big_text(state)
            w = draw.textlength(text, font=font)
            draw.text(((self.width - w) // 2, 2), text, font=font, fill=1)
        self._status_bar(draw, state, mid=self._broadcast_time(state))
        return image

    def _play_lite(self, state):
        """The compact mode: the track number (or the time) as large as the display allows, in the middle of it."""
        image, draw = self._canvas()
        if self._tag_picture(image, state):
            self._progress_over_picture(image, state)
            self._wifi(draw, state.get('wifi', -1), self.width - 18, self.height - 2, bool(state.get('lan')))
            if not state.get('playing'):
                self._row_text(draw, 1, self.height - 10, 'PAUSE')
            return image
        self._progress(draw, state)
        text, font = self._big_text(state)
        size = 50 if font is self.fonts.huge else 34
        font = self.fonts.lite(size)
        # (a text that is wider than the display - a time with hours - takes the next smaller size)
        while size > 20 and draw.textlength(text, font=font) > self.width - 4:
            size -= 2
            font = self.fonts.lite(size)
        left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
        x = round((self.width - draw.textlength(text, font=font)) / 2)
        # (centred on the display by its digits, not by the line the font reserves above and below them)
        draw.text((x, round(self.height / 2 - (top + bottom) / 2)), text, font=font, fill=1)
        self._wifi(draw, state.get('wifi', -1), self.width - 18, self.height - 2, bool(state.get('lan')))
        if not state.get('playing'):
            self._row_text(draw, 1, self.height - 10, 'PAUSE')
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
        self._row_text(draw, 1, y + 1, 'PAUSE' if not state.get('playing') else played_time(state))
        self._volume_cell(draw, state, y + 1)
        self._wifi(draw, state.get('wifi', -1), self.width - 18, self.height - 2, bool(state.get('lan')))
        return image

    def render(self, state, now):
        """The picture for the state the extension reported (`view`: boot, off, overlay, info, select, idle or play)."""
        view = state.get('view') or 'idle'
        self.scrolling = False
        self.scroll_mode = state.get('scroll') if state.get('scroll') in ('loop', 'once', 'off') else 'loop'
        if view == 'boot':
            return self.boot()
        if view == 'bye':
            return self.poweroff()
        if view == 'off':
            return self.blank()
        # (an update runs, or a rest time or the limit stops the box: the picture that says so)
        if view in ('update', 'rest'):
            picture = self.pictures.get(VIEW_PICTURES[view])
            return picture if picture is not None else self.blank()
        if view == 'overlay' or state.get('overlay'):
            return self.overlay(state)
        if view == 'info':
            return self.info(state, now)
        if view == 'select':
            return self.select(state, now)
        if view == 'play':
            return self.play(state, now)
        return self.idle(state, now)
