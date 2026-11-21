"""What a finger does on the touch screen: a tap, a swipe to the left or right (the cube follows the finger while it moves) and a swipe up
with two fingers.

Pure logic, no hardware: touchlcd.py feeds it the positions the touch chip reports (x, y in points of the screen, or None when the finger
is up, and how many fingers touch) and gets events back:

    ('drag', dx)         the finger moves along the screen, dx points from where it touched (negative: to the left)
    ('swipe', 'next')    let go after a swipe to the left (the next face comes), 'prev' after a swipe to the right
    ('cancel', None)     let go after a short drag: the faces turn back
    ('swipe', 'up')      a swipe up with two fingers (one level up); with one finger a swipe up does nothing
    ('tap', (x, y))      a short touch that did not move
"""

TAP_MAX_MOVE = 14  # points the finger may wander and still make a tap
TAP_MAX_S = 0.7
AXIS_MIN = 10  # points before it is decided whether a drag goes along or across
COMMIT_SHARE = 0.25  # the cube turns on when the finger went this share of the screen width ...
FLICK_SPEED = 250  # ... or when a short quick flick was faster than this many points per second
FLICK_MIN = 24
UP_MIN = 40  # points a swipe up has to go


class Gesture:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.start = None  # (x, y, time) of the touch
        self.last = None  # (x, y, time) of the latest point
        self.axis = None  # 'h' or 'v' once it is decided
        self.fingers = 0  # the most fingers that touched together since it began
        self.dragged = False  # the cube followed the finger before a second one came

    def feed(self, point, now, fingers=1):
        """One reading: (x, y) while a finger touches, None when there is none. A list of events."""
        events = []
        if point is not None:
            x, y = point
            if self.start is None:
                self.start = (x, y, now)
                self.last = (x, y, now)
                self.axis = None
                self.fingers = max(1, fingers)
                self.dragged = False
                return events
            self.last = (x, y, now)
            self.fingers = max(self.fingers, fingers)
            dx, dy = x - self.start[0], y - self.start[1]
            if self.axis is None and max(abs(dx), abs(dy)) >= AXIS_MIN:
                # (a drag that is more along the screen than across is the cube's; the rest is the swipe up or nothing)
                self.axis = 'h' if abs(dx) >= abs(dy) else 'v'
            if self.axis == 'h' and self.fingers < 2:
                events.append(('drag', dx))
                self.dragged = True
            return events
        if self.start is None:
            return events
        sx, sy, st = self.start
        lx, ly, lt = self.last
        dx, dy = lx - sx, ly - sy
        duration = max(lt - st, 0.001)
        axis, fingers, dragged = self.axis, self.fingers, self.dragged
        self.start = self.last = self.axis = None
        self.fingers, self.dragged = 0, False
        if fingers >= 2:
            # two fingers: only the swipe up counts (no tap, no turn); a turn that began under one finger goes back
            if dragged:
                events.append(('cancel', None))
            if dy <= -UP_MIN and abs(dy) >= abs(dx):
                events.append(('swipe', 'up'))
        elif axis == 'h':
            quick = abs(dx) >= FLICK_MIN and abs(dx) / duration >= FLICK_SPEED
            if abs(dx) >= self.width * COMMIT_SHARE or quick:
                events.append(('swipe', 'next' if dx < 0 else 'prev'))
            else:
                events.append(('cancel', None))
        elif axis == 'v':
            pass  # (one finger up or down: nothing - the swipe up takes two fingers)
        elif duration <= TAP_MAX_S and abs(dx) <= TAP_MAX_MOVE and abs(dy) <= TAP_MAX_MOVE:
            events.append(('tap', (sx, sy)))
        return events
