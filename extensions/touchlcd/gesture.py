"""What a finger does on the touch screen: a tap, a swipe to the left or right (the cube follows the finger while it moves) and a swipe up.

Pure logic, no hardware: touchlcd.py feeds it the positions the touch chip reports (x, y in points of the screen, or None when the finger
is up) and gets events back:

    ('drag', dx)         the finger moves along the screen, dx points from where it touched (negative: to the left)
    ('swipe', 'next')    let go after a swipe to the left (the next face comes), 'prev' after a swipe to the right
    ('cancel', None)     let go after a short drag: the faces turn back
    ('swipe', 'up')      a swipe up (one level up)
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

    def feed(self, point, now):
        """One reading: (x, y) while a finger touches, None when there is none. A list of events."""
        events = []
        if point is not None:
            x, y = point
            if self.start is None:
                self.start = (x, y, now)
                self.last = (x, y, now)
                self.axis = None
                return events
            self.last = (x, y, now)
            dx, dy = x - self.start[0], y - self.start[1]
            if self.axis is None and max(abs(dx), abs(dy)) >= AXIS_MIN:
                # (a drag that is more along the screen than across is the cube's; the rest is the swipe up or nothing)
                self.axis = 'h' if abs(dx) >= abs(dy) else 'v'
            if self.axis == 'h':
                events.append(('drag', dx))
            return events
        if self.start is None:
            return events
        sx, sy, st = self.start
        lx, ly, lt = self.last
        dx, dy = lx - sx, ly - sy
        duration = max(lt - st, 0.001)
        axis = self.axis
        self.start = self.last = self.axis = None
        if axis == 'h':
            quick = abs(dx) >= FLICK_MIN and abs(dx) / duration >= FLICK_SPEED
            if abs(dx) >= self.width * COMMIT_SHARE or quick:
                events.append(('swipe', 'next' if dx < 0 else 'prev'))
            else:
                events.append(('cancel', None))
        elif axis == 'v':
            if dy <= -UP_MIN:
                events.append(('swipe', 'up'))
        elif duration <= TAP_MAX_S and abs(dx) <= TAP_MAX_MOVE and abs(dy) <= TAP_MAX_MOVE:
            events.append(('tap', (sx, sy)))
        return events
