"""Pictures of the touch display (Waveshare 2.8 inch, 240 x 320): a cover as a face, and the movements between faces.

A face is one picture of the size of the screen (a cover, or its name when there is none). A swipe to the left or right turns the faces like
a cube around its vertical axis: `cube()` draws it at any angle, so the picture can follow the finger and run out by itself. A tap that
opens an artist or goes back one level zooms (`zoom()`). Only Pillow; nothing here touches the hardware, so it runs on a PC too
(tools/touchlcd-preview.py draws the movements as a GIF).
"""
import colorsys
import math

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

FONT_CANDIDATES = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    'DejaVuSans.ttf',
)
BOLD_CANDIDATES = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    'DejaVuSans-Bold.ttf',
)
BACKGROUND = (0, 0, 0)
# (the camera stands this many half widths in front of the axis of the cube: farther away = less perspective)
CAMERA = 4.0
# (a face that turns away gets darker, down to this share of its light)
SHADE_MIN = 0.55


def load_font(size, bold=False):
    """DejaVu Sans of the system in that size; Pillow's own font when the box has none."""
    for name in (BOLD_CANDIDATES + FONT_CANDIDATES) if bold else FONT_CANDIDATES:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size)
    except TypeError:  # (a Pillow before 10.1 has no size for its own font)
        return ImageFont.load_default()


def ease_out(t):
    return 1 - (1 - t) ** 3


def ease_in_out(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def wrap(text, font, draw, width, max_lines):
    """The text in at most max_lines lines of at most `width` points (a last line that does not fit ends with an ellipsis)."""
    lines, line = [], ''
    for word in str(text).split():
        trial = (line + ' ' + word).strip()
        if not line or draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and draw.textlength(last + '…', font=font) > width:
            last = last[:-1]
        lines[-1] = last.rstrip() + '…'
    out = []
    for text_line in lines:  # (one word wider than the line: cut it)
        while draw.textlength(text_line, font=font) > width and len(text_line) > 1:
            text_line = text_line[:-1]
        out.append(text_line)
    return out


def size_of(font):
    """The size of a font in points (the plain bitmap font of an old Pillow has none: about 11)."""
    return int(getattr(font, "size", 11))


def centered(draw, x, y, text, font, fill):
    """The text with its middle at x and its top at y (no `anchor`: the plain bitmap font of an old Pillow does not know it)."""
    draw.text((x - draw.textlength(text, font=font) / 2, y), text, font=font, fill=fill)


def make_face(cover, label, size, show_title=False):
    """One face of the size of the screen. `cover` is a PIL image or None, `label` the name (artist or album). The cover is cut to a square
    that fills the width; the rest is black. Without a cover the face shows the name on a colour that depends on it, so every artist
    looks different. With show_title the name is written under a cover."""
    width, height = size
    face = Image.new('RGB', size, BACKGROUND)
    side = min(width, height)
    left, top = (width - side) // 2, (height - side) // 2
    if cover is not None:
        face.paste(ImageOps.fit(cover.convert('RGB'), (side, side), Image.LANCZOS), (left, top))
        if show_title and label:
            draw = ImageDraw.Draw(face)
            room = height - (top + side)
            if room >= 18:
                font = load_font(max(12, min(20, room // 2)))
                text = wrap(label, font, draw, width - 16, 1)[0]
                centered(draw, width // 2, top + side + room // 2 - size_of(font) // 2 - 1, text, font, (235, 235, 235))
        return face
    seed = sum(ord(c) * (i + 3) for i, c in enumerate(str(label))) or 1
    hue = (seed % 360) / 360
    upper = tuple(int(v * 255) for v in colorsys.hsv_to_rgb(hue, 0.55, 0.55))
    lower = tuple(int(v * 255) for v in colorsys.hsv_to_rgb((hue + 0.11) % 1, 0.65, 0.25))
    blend = Image.linear_gradient('L').resize((side, side))
    face.paste(Image.composite(Image.new('RGB', (side, side), lower), Image.new('RGB', (side, side), upper), blend), (left, top))
    draw = ImageDraw.Draw(face)
    font = load_font(max(14, side // 9), bold=True)
    lines = wrap(label, font, draw, side - 24, 5)
    line_height = int(size_of(font) * 1.25)
    y = (height - line_height * len(lines)) // 2
    for text_line in lines:
        centered(draw, width // 2, y, text_line, font, (255, 255, 255))
        y += line_height
    return face


def shade(image, factor):
    """The picture with its light multiplied by `factor` (0 to 1)."""
    if factor >= 0.999:
        return image
    return image.point([int(i * factor) for i in range(256)] * 3)


def _solve(matrix, values):
    """The solution of a small system of linear equations (Gauss with the best pivot in each column)."""
    n = len(values)
    rows = [list(map(float, matrix[i])) + [float(values[i])] for i in range(n)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(rows[r][col]))
        rows[col], rows[pivot] = rows[pivot], rows[col]
        for r in range(n):
            if r != col:
                factor = rows[r][col] / rows[col][col]
                rows[r] = [a - factor * b for a, b in zip(rows[r], rows[col])]
    return [rows[i][n] / rows[i][i] for i in range(n)]


def _coefficients(target, source):
    """PIL's coefficients (Image.PERSPECTIVE): each point of the output gets its colour from a point of the source. From four pairs of
    corners: where the face's corners end up in the output (`target`) and where they are in its picture (`source`)."""
    rows, values = [], []
    for (x, y), (u, v) in zip(target, source):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        values.append(u)
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        values.append(v)
    return tuple(_solve(rows, values))


def _warp(canvas, face, quad):
    """The face drawn into `canvas` on the quadrilateral `quad` (top left, top right, bottom right, bottom left, in output points). Only the
    box around the quadrilateral is worked on; the mask is the quadrilateral itself."""
    width, height = face.size
    left, top = max(0, math.floor(min(x for x, _ in quad))), max(0, math.floor(min(y for _, y in quad)))
    right, bottom = min(canvas.width, math.ceil(max(x for x, _ in quad)) + 1), min(canvas.height, math.ceil(max(y for _, y in quad)) + 1)
    if right <= left or bottom <= top:
        return
    shifted = [(x - left, y - top) for x, y in quad]
    coefficients = _coefficients(shifted, [(0, 0), (width, 0), (width, height), (0, height)])
    box = (right - left, bottom - top)
    warped = face.transform(box, Image.PERSPECTIVE, coefficients, Image.BILINEAR)
    # (the mask: a point is the face's when its middle is inside - so two faces that share an edge leave no gap and do not overlap)
    mask = Image.new('L', face.size, 255).transform(box, Image.PERSPECTIVE, coefficients, Image.NEAREST)
    canvas.paste(warped, (left, top), mask)


def sides(count):
    """How many sides the prism has: a cube for up to four faces, a regular polygon for more (eight faces: 45 degrees from one to the next)."""
    return max(4, int(count or 4))


def cube(front, side, progress, direction='left', count=4):
    """The faces side by side on a prism, turned by `progress` (0 = the front face fills the screen, 1 = the side face does). `count` is the
    number of faces there are: four or fewer make a cube (90 degrees from one face to the next), more make a regular polygon with
    360 / count degrees from one face to the next (eight faces: 45 degrees), so the covers stand flatter the more there are, and they
    always touch each other. direction 'left': the front face goes to the left and the side face comes from the right (a swipe to the
    left); 'right' is the mirror image. Both pictures have the size of the screen. (No other face is ever on the screen: the front face
    and the next one cover it, whatever the angle.)"""
    if progress <= 0:
        return front
    if progress >= 1:
        return side
    if direction == 'right':
        front, side = ImageOps.mirror(front), ImageOps.mirror(side)
    width, height = front.size
    half = width / 2
    step = 2 * math.pi / sides(count)  # (the angle from one face to the next)
    apothem = half / math.tan(step / 2)  # (from the axis to the middle of a face)
    radius = half / math.sin(step / 2)  # (from the axis to a corner)
    distance = apothem + (CAMERA - 1) * half  # (the camera stands as far from the front face as it did from the cube's)
    focal = distance - apothem  # (the front face has the scale 1 when the prism stands still)
    turn = progress * step
    mid = height / 2

    def corner(angle):
        # (the corner at this angle from the front, to the right of it when it is positive)
        scale = focal / (distance - radius * math.cos(angle))
        return width / 2 + radius * math.sin(angle) * scale, scale

    canvas = Image.new('RGB', front.size, BACKGROUND)
    # the front face runs from its left corner to the one it shares with the side face, which runs on from there
    for image, middle in ((front, -turn), (side, step - turn)):
        (xl, sl), (xr, sr) = corner(middle - step / 2), corner(middle + step / 2)
        light = SHADE_MIN + (1 - SHADE_MIN) * max(0.0, math.cos(middle))
        _warp(canvas, shade(image, light), [(xl, mid - mid * sl), (xr, mid - mid * sr), (xr, mid + mid * sr), (xl, mid + mid * sl)])
    return ImageOps.mirror(canvas) if direction == 'right' else canvas


def _scaled(image, scale):
    width, height = image.size
    if scale >= 1:
        w, h = width / scale, height / scale
        box = ((width - w) / 2, (height - h) / 2, (width + w) / 2, (height + h) / 2)
        return image.resize((width, height), Image.BILINEAR, box=box)
    canvas = Image.new('RGB', image.size, BACKGROUND)
    small = image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.BILINEAR)
    canvas.paste(small, ((width - small.width) // 2, (height - small.height) // 2))
    return canvas


def zoom(old, new, progress, inward=True):
    """From one face to another by zooming. `inward` (an artist was opened): the old one grows and fades out while the new one grows to its
    size. Otherwise (one level back): the old one shrinks away and the new one comes from larger."""
    if progress <= 0:
        return old
    if progress >= 1:
        return new
    if inward:
        a, b = _scaled(old, 1 + 0.5 * progress), _scaled(new, 0.6 + 0.4 * progress)
    else:
        a, b = _scaled(old, 1 - 0.4 * progress), _scaled(new, 1.5 - 0.5 * progress)
    return Image.blend(a, b, progress)


def with_play_symbol(face, strength=1.0):
    """The face with a play symbol in a dark circle in the middle (what a tap on an album answers); `strength` 0 to 1 for fading."""
    width, height = face.size
    overlay = Image.new('RGBA', face.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    radius = min(width, height) // 5
    cx, cy = width // 2, height // 2
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(0, 0, 0, int(170 * strength)))
    r = radius * 0.5
    draw.polygon([(cx - r * 0.6, cy - r), (cx - r * 0.6, cy + r), (cx + r, cy)], fill=(255, 255, 255, int(255 * strength)))
    return Image.alpha_composite(face.convert('RGBA'), overlay).convert('RGB')


def rgb565(image):
    """The picture as bytes for the display: two per point, red 5, green 6, blue 5 bits, the high byte first."""
    red, green, blue = image.convert('RGB').split()
    high = ImageChops.add(red.point([v & 0xF8 for v in range(256)]), green.point([v >> 5 for v in range(256)]))
    low = ImageChops.add(green.point([(v << 3) & 0xE0 for v in range(256)]), blue.point([v >> 3 for v in range(256)]))
    out = bytearray(image.width * image.height * 2)
    out[0::2] = high.tobytes()
    out[1::2] = low.tobytes()
    return bytes(out)
