#!/usr/bin/env python3
"""The movements of the touch display extension as a GIF, drawn by the extension's own cube.py: a swipe to the left (the cube turns), a
swipe to the right, a tap that opens an artist (zoom), a tap on an album (play symbol) and a swipe up (one level back).

    python tools/touchlcd-preview.py [cover1 cover2 ...] [-o out.gif] [--frames dir]

Without covers it draws faces with names. Frames are 240 x 320 (as the display), the GIF runs at 25 frames a second. With --frames it also
writes a few single frames of the cube as PNG files.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'extensions', 'touchlcd'))
from PIL import Image  # noqa: E402

import cube  # noqa: E402

SIZE = (240, 320)
NAMES = ['Lumi', 'Trolles Trafikskola', 'Gute-Nacht-Lieder', 'Batman']


def main(argv):
    out, frames_dir, paths = 'touchlcd-preview.gif', None, []
    args = list(argv)
    while args:
        a = args.pop(0)
        if a == '-o':
            out = args.pop(0)
        elif a == '--frames':
            frames_dir = args.pop(0)
        else:
            paths.append(a)
    covers = [Image.open(p) for p in paths] if paths else [None]
    faces = [cube.make_face(covers[i % len(covers)], NAMES[i], SIZE) for i in range(4)]
    frames = []

    def hold(face, n=8):
        frames.extend([face] * n)

    hold(faces[0], 14)
    for i in range(0, 8):  # the finger drags a little ...
        frames.append(cube.cube(faces[0], faces[1], 0.35 * i / 7, 'left'))
    for i in range(1, 9):  # ... lets go, and the cube runs out
        frames.append(cube.cube(faces[0], faces[1], 0.35 + 0.65 * cube.ease_out(i / 8), 'left'))
    hold(faces[1], 10)
    for i in range(1, 11):  # a swipe to the right: back
        frames.append(cube.cube(faces[1], faces[0], cube.ease_in_out(i / 10), 'right'))
    hold(faces[0], 8)
    for i in range(1, 9):  # a tap opens the artist
        frames.append(cube.zoom(faces[0], faces[2], cube.ease_in_out(i / 8), True))
    hold(faces[2], 8)
    for i in range(1, 5):  # a tap on the album plays it
        frames.append(cube.with_play_symbol(faces[2], i / 4))
    hold(cube.with_play_symbol(faces[2]), 14)
    for i in range(1, 5):
        frames.append(cube.with_play_symbol(faces[2], 1 - i / 4))
    for i in range(1, 9):  # a swipe up: one level back
        frames.append(cube.zoom(faces[2], faces[0], cube.ease_in_out(i / 8), False))
    hold(faces[0], 14)
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=40, loop=0)
    print(out, len(frames), 'frames')
    if frames_dir:
        os.makedirs(frames_dir, exist_ok=True)
        strip = Image.new('RGB', (SIZE[0] * 5 + 16, SIZE[1]), (40, 40, 40))
        for n, p in enumerate((0.0, 0.25, 0.5, 0.75, 1.0)):
            strip.paste(cube.cube(faces[0], faces[1], p, 'left'), (n * (SIZE[0] + 4), 0))
        strip.save(os.path.join(frames_dir, 'cube-left.png'))
        strip = Image.new('RGB', (SIZE[0] * 5 + 16, SIZE[1]), (40, 40, 40))
        for n, p in enumerate((0.0, 0.25, 0.5, 0.75, 1.0)):
            strip.paste(cube.cube(faces[1], faces[0], p, 'right'), (n * (SIZE[0] + 4), 0))
        strip.save(os.path.join(frames_dir, 'cube-right.png'))


if __name__ == '__main__':
    cube.FONT_CANDIDATES = ('C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf') + cube.FONT_CANDIDATES
    cube.BOLD_CANDIDATES = ('C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf') + cube.BOLD_CANDIDATES
    main(sys.argv[1:])
