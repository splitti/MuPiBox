#!/usr/bin/env python3
"""The touch display extension on the PC: the real program (extensions/touchlcd/touchlcd.py - cube, gestures, animations) in a window of 240 x 320
points, with the mouse as the finger. Nothing of the box is needed: a few artists and albums stand in for the library, and a small model
does what api.js does (levels, play).

    python tools/touchlcd-sim.py [cover1.png cover2.png ...]

Drag to the left or right: the cube turns (the picture follows the mouse). Click: open an artist / play an album (the play symbol).
Ctrl+drag up (two fingers): one level up. Without covers the faces show the names on a colour. Esc ends.
"""
import os
import sys
import tkinter as tk

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'extensions', 'touchlcd'))
from PIL import Image, ImageTk  # noqa: E402

import cube  # noqa: E402
import touchlcd  # noqa: E402

ARTISTS = {
    'Lumi': ['Die Reise beginnt', 'Sternenlicht', 'Wolkenschaf'],
    'Trolles Trafikskola': ['Nummer eins', 'Nummer zwei'],
    'Gute-Nacht-Lieder': ['Schlaf gut'],
    'Batman': ['Der Anfang', 'Der Joker', 'Gotham bei Nacht', 'Rückkehr'],
    'Benjamin Blümchen': ['Der Zoo', 'Die Feuerwehr', 'Das Eis', 'Der Zirkus', 'Der Geburtstag'],
}


class Window:
    """The fake display and the fake touch chip: a Tk window and the state of the mouse."""

    def __init__(self, scale=2):
        self.root = tk.Tk()
        self.root.title('Touch-Display (Simulation)')
        self.width, self.height = 240, 320
        self.scale = scale
        self.label = tk.Label(self.root, bd=0)
        self.label.pack()
        self.photo = None
        self.finger = None
        self.fingers = 1  # hold Ctrl (or Shift) while you drag: two fingers
        self.on = True
        self.label.bind('<ButtonPress-1>', self._down)
        self.label.bind('<B1-Motion>', self._down)
        self.label.bind('<ButtonRelease-1>', self._up)
        self.root.bind('<Escape>', lambda _e: self.root.destroy())

    def _down(self, event):
        self.fingers = 2 if event.state & 0x5 else 1  # (Shift = 0x1, Ctrl = 0x4)
        self.finger = (min(max(event.x // self.scale, 0), self.width - 1), min(max(event.y // self.scale, 0), self.height - 1))

    def _up(self, _event):
        self.finger = None

    # the display
    def show(self, image):
        big = image.resize((self.width * self.scale, self.height * self.scale), Image.NEAREST)
        self.photo = ImageTk.PhotoImage(big)
        self.label.configure(image=self.photo)
        self.root.update_idletasks()

    def sleep(self):
        self.on = False
        self.show(Image.new('RGB', (self.width, self.height)))

    def wake(self):
        self.on = True

    def set_brightness(self, _percent):
        pass

    # the touch chip
    def read(self):
        return self.finger


class Library:
    """What api.js does: levels of faces, and the answers to nav, tap and up."""

    def __init__(self, covers):
        self.covers = covers
        self.stack = [(list(ARTISTS), 0, '')]

    def face(self, name, deep):
        return {'label': name, 'cover': 'cover:%d' % (sum(map(ord, name)) % max(1, len(self.covers))) if self.covers else ''}

    def faces(self):
        names, index, _title = self.stack[-1]
        deep = len(self.stack) > 1
        n = len(names)
        return {
            'cur': self.face(names[index], deep),
            'prev': self.face(names[(index - 1) % n], deep) if n > 1 else None,
            'next': self.face(names[(index + 1) % n], deep) if n > 1 else None,
        }

    def handle(self, event, app):
        names, index, title = self.stack[-1]
        if event['event'] == 'nav':
            step = 1 if event['dir'] == 'next' else -1
            self.stack[-1] = (names, (index + step) % len(names), title)
            app.command({'cmd': 'view', 'faces': self.faces(), 'transition': 'none'})
        elif event['event'] == 'tap':
            if len(self.stack) == 1:
                self.stack.append((ARTISTS[names[index]], 0, names[index]))
                app.command({'cmd': 'view', 'faces': self.faces(), 'transition': 'zoom-in'})
            else:
                app.command({'cmd': 'flash'})
                print('plays:', title, '-', names[index])
        elif event['event'] == 'up' and len(self.stack) > 1:
            self.stack.pop()
            app.command({'cmd': 'view', 'faces': self.faces(), 'transition': 'zoom-out'})


class PictureCovers:
    def __init__(self, pictures):
        self.pictures = pictures

    def get(self, url):
        if not url or not self.pictures:
            return None
        return self.pictures[int(url.split(':')[1])]


def main(paths):
    pictures = [Image.open(p).convert('RGB') for p in paths]
    window = Window()
    library = Library(pictures)
    holder = {}
    app = touchlcd.App(window, window, lambda event: library.handle(event, holder['app']), PictureCovers(pictures), sleep_after=0, pump=window.root.update_idletasks)
    holder['app'] = app
    app.command({'cmd': 'view', 'faces': library.faces(), 'transition': 'none'})

    def tick():
        app.step()
        window.root.after(12, tick)

    window.root.after(12, tick)
    window.root.mainloop()


if __name__ == '__main__':
    cube.FONT_CANDIDATES = ('C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf') + cube.FONT_CANDIDATES
    cube.BOLD_CANDIDATES = ('C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf') + cube.BOLD_CANDIDATES
    main(sys.argv[1:])
