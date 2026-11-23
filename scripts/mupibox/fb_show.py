#!/usr/bin/env python3
"""A picture on the display's framebuffer in one write - for a picture that changes while it stands (the progress of an
update, maintenance_screen.sh): fbv puts it there point by point, turned and scaled on the way, and on a Pi that can be
seen as a flicker every time the bar moves on.

  fb_show.py <picture> [fbv options: -o <0..3> -f -e]

The options as fbv takes them (fbv_options.sh): -o the turn (1 = 90 degrees clockwise ...), -f smaller when it is too big,
-e bigger when it is too small (the side ratio kept, the picture in the middle, the rest black). Exit 1 when it cannot
(no framebuffer, a depth it does not know, no PIL): the caller uses fbv then.
"""
import os
import sys

FB = '/dev/fb0'
SYS = '/sys/class/graphics/fb0'


def read_sys(name):
    with open(os.path.join(SYS, name)) as f:
        return f.read().strip()


def options(args):
    turn, shrink, enlarge, picture = 0, False, False, None
    i = 0
    while i < len(args):
        a = args[i]
        if a == '-o' and i + 1 < len(args):
            turn = int(args[i + 1]) % 4
            i += 2
            continue
        if a == '-f':
            shrink = True
        elif a == '-e':
            enlarge = True
        elif not a.startswith('-'):
            picture = a
        i += 1
    return picture, turn, shrink, enlarge


def frame(picture, width, height, turn, shrink, enlarge):
    from PIL import Image

    im = Image.open(picture).convert('RGB')
    # (fbv's turn: 1 = 90 degrees clockwise, 2 = 180, 3 = 270)
    if turn:
        im = im.rotate(-90 * turn, expand=True)
    scale = min(width / im.width, height / im.height)
    if (scale < 1 and shrink) or (scale > 1 and enlarge):
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGB', (width, height))
    # (in the middle; a picture bigger than the screen without -f: its middle)
    canvas.paste(im, ((width - im.width) // 2, (height - im.height) // 2))
    return canvas


def pixels(canvas, depth):
    from PIL import Image, ImageMath

    if depth == 32:
        return canvas.tobytes('raw', 'BGRX'), 4
    if depth == 24:
        return canvas.tobytes('raw', 'BGR'), 3
    if depth == 16:
        # RGB565 (red in the top bits), little endian - PIL has no packer for it: its two bytes worked out for every point
        # at once and put side by side (the low byte first)
        r, g, b = (band.convert('I') for band in canvas.split())

        def calc(fn, text):
            try:
                out = ImageMath.lambda_eval(fn, r=r, g=g, b=b)
            except AttributeError:
                out = ImageMath.eval(text, r=r, g=g, b=b)
            if not isinstance(out, Image.Image):
                raise ValueError('no picture')
            return out.convert('L')

        low = calc(lambda a: (((a['g'] >> 2) & 7) << 5) | (a['b'] >> 3), '(((g >> 2) & 7) << 5) | (b >> 3)')
        high = calc(lambda a: ((a['r'] >> 3) << 3) | (a['g'] >> 5), '((r >> 3) << 3) | (g >> 5)')
        return Image.merge('LA', (low, high)).tobytes(), 2
    raise ValueError('a depth of %d bits' % depth)


def main():
    picture, turn, shrink, enlarge = options(sys.argv[1:])
    if not picture:
        print(__doc__.strip().splitlines()[3], file=sys.stderr)
        return 2
    try:
        width, height = (int(v) for v in read_sys('virtual_size').split(','))
        depth = int(read_sys('bits_per_pixel'))
        stride = int(read_sys('stride'))
        data, size = pixels(frame(picture, width, height, turn, shrink, enlarge), depth)
        line = width * size
        if stride != line:
            # (rows with room behind them: every row padded to the stride)
            pad = bytes(stride - line)
            data = b''.join(data[y * line : (y + 1) * line] + pad for y in range(height))
        fd = os.open(FB, os.O_WRONLY)
        try:
            view = memoryview(data)
            while view:
                view = view[os.write(fd, view) :]
        finally:
            os.close(fd)
    except Exception as error:  # noqa: BLE001 - whatever it is, fbv takes over
        print('fb_show: %s' % error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
