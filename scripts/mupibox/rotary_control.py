#!/usr/bin/python3
# Rotary encoders with push button (KY-040 style): the first one for the volume, and up to MAX_EXTRA more.
#   First encoder, default pins: GPIO 26 = encoder A (CLK), GPIO 24 = encoder B (DT), GPIO 10 = push button (to GND);
#   rotary.pinA, rotary.pinB and rotary.pinButton in mupiboxconfig.json choose others. It runs while rotary.active is set.
#   More encoders: rotary.extra in mupiboxconfig.json, a list of { id, right, left, pinA, pinB, pinButton, button, step }.
#   Each pin is 2..27, or 0 for none (without pin A or B the knob does not turn, without a button pin it has no button). What a turn does is
#   chosen per direction (rotary.right / rotary.left of the first one, right / left of an entry): up = the volume up by `step` percent per
#   detent, down = the volume down, next = the next track, previous = the previous track, off = nothing. Each knob has its own pins.
#   (The pins are read when the service starts; the app restarts it when they change. What a turn does is read again while it runs.)
# The first encoder's push button does what is chosen in the admin interface (rotary.button, read again when it changed); the other
# encoders' buttons are chosen in their own entry (button: off, playpause, next, ffwd, address - the address of the box as a QR code on the display).
# With "track selection" chosen the first encoder's button works as a switch (with "next track" a press skips one track, as before): the first press
# turns the knob into a track selector (every detent clockwise = next track, counter clockwise = previous track) for TRACK_MODE_S seconds - each
# turn starts the time anew, so it lasts as long as the knob is being turned - and the second press (or the time running out) brings the volume back.
# (The album knob of the NFC extension is not handled here: the extension reads its own pins itself.)

import json
import os
import queue
import sys
import threading
import time
import urllib.request

import gpio_compat  # RPi.GPIO, or lgpio on a Raspberry Pi 5

CONFIG = "/etc/mupibox/mupiboxconfig.json"
PLAYER = "http://localhost:5005"
DEFAULT_PINS = (26, 24, 10)
MAX_EXTRA = 4
DIRECTIONS = ("off", "up", "down", "next", "previous")
BUTTONS = ("off", "playpause", "next", "ffwd", "address")
BOX = "http://localhost:8200"


def read_config():
    try:
        with open(CONFIG) as file:
            return json.load(file).get("rotary", {}) or {}
    except Exception:
        return {}


def pin_of(value):
    # a pin of 2..27, 0 for none, None for anything else
    try:
        number = int(str(value))
    except (TypeError, ValueError):
        return None
    return number if number == 0 or 2 <= number <= 27 else None


def first_pins(section):
    # each pin from the config (2..27 or 0 for none; one that is not set is the one the box shipped with), all different, else the shipped pins
    pins = tuple(DEFAULT_PINS[i] if section.get(key) in (None, "") else pin_of(section.get(key)) for i, key in enumerate(("pinA", "pinB", "pinButton")))
    chosen = [pin for pin in pins if pin]
    if None not in pins and len(set(chosen)) == len(chosen):
        return pins
    return DEFAULT_PINS


def direction_of(value, fallback):
    return value if value in DIRECTIONS else fallback


def kernel_pins():
    # pins a driver of the system has: SPI0 while its devices exist (an NFC reader), I2C1 while its bus exists - set up
    # as an input here, the pin was taken from the driver until the next restart (GPIO 10, the button's default, is the
    # data line of SPI: the NFC reader stopped at every start of the encoder)
    taken = set()
    if os.path.exists("/dev/spidev0.0") or os.path.exists("/dev/spidev0.1"):
        taken |= {9, 10, 11}
    if os.path.exists("/dev/spidev0.0"):
        taken.add(8)
    if os.path.exists("/dev/spidev0.1"):
        taken.add(7)
    if os.path.exists("/dev/i2c-1"):
        taken |= {2, 3}
    return taken


# Gray code: previous state (A<<1|B) and new state -> +1 clockwise (A falls first while B is high, as on a KY-040),
# -1 counter clockwise, 0 bounce / invalid. A rotary turning the wrong way: swap the A and B wires.
TRANSITIONS = {
    (3, 1): 1, (1, 0): 1, (0, 2): 1, (2, 3): 1,
    (3, 2): -1, (2, 0): -1, (0, 1): -1, (1, 3): -1,
}
STEPS_PER_DETENT = 4

# How long the first knob stays a track selector after the last press or turn (button "track selection")
TRACK_MODE_S = 10.0

# The pins are polled: every millisecond while a knob is being used, every 5 ms while they rest (a fifth of the
# wake-ups, the box runs on battery). A turn is caught at the first change and sampled fast from then on.
FAST_POLL_S = 0.001
IDLE_POLL_S = 0.005
FAST_FOR_S = 2.0

# The loop only reads the pins and queues what happened; the worker thread talks to the player and reads the
# config, so a slow answer never makes the loop miss steps of a turn.
events = queue.Queue()
_config = {"mtime": None, "value": {}}


def player(command):
    try:
        with urllib.request.urlopen("%s/%s?src=rotary" % (PLAYER, command), timeout=3) as response:
            return response.read()
    except Exception as error:
        print("player call %s failed: %s" % (command, error), flush=True)
        return None


def show_address():
    # the QR code with the address of the box on the OLED display (ten seconds; a route of the OLED extension that only the box itself may ask)
    try:
        request = urllib.request.Request("%s/api/ext/oled/address" % BOX, data=b"", method="POST")
        with urllib.request.urlopen(request, timeout=3) as response:
            response.read()
    except Exception as error:
        print("address not shown: %s" % error, flush=True)


def rotary_config():
    # read again only when the file changed, so a change in the admin interface takes effect at once
    try:
        mtime = os.path.getmtime(CONFIG)
        if mtime != _config["mtime"]:
            _config["value"] = read_config()
            _config["mtime"] = mtime
    except Exception:
        pass
    return _config["value"]


def playing():
    # the same test as the player's isActuallyPlaying(): Spotify reports "pause", mplayer "playing"
    body = player("local")
    try:
        meta = json.loads(body)
    except Exception:
        return False
    if meta.get("currentPlayer") == "spotify":
        return meta.get("pause") is False
    if meta.get("currentPlayer") == "mplayer":
        return meta.get("playing") is True
    return False


class Knob:
    """One encoder: its pins, what it does, and what its loop has seen so far."""

    def __init__(self, name, a, b, button, legacy=None):
        self.name = name  # "first", or the id of an entry of rotary.extra
        self.legacy = legacy  # an entry of the first version had a function (volume, tracks) instead of right and left
        self.a, self.b, self.button = a, b, button
        self.state = 0
        self.accumulated = 0
        self.button_ready = False  # the button's pin is set up: only while the button does something
        self.button_refused = False  # its pin belongs to a driver of the system: never set up
        self.button_down = False
        self.track_mode_until = 0.0  # first knob only: monotonic time until which it selects tracks (0 = it sets the volume); worker thread only

    def settings(self):
        # the live settings of this knob (the file is read again when it changed)
        section = rotary_config()
        if self.name == "first":
            return section
        for entry in section.get("extra") or []:
            if isinstance(entry, dict) and entry.get("id") == self.name:
                return entry
        return {}

    def direction(self, side):
        # what a turn to the right ("right") or to the left ("left") does now
        settings = self.settings()
        if self.legacy == "tracks":
            fallback = "next" if side == "right" else "previous"
        else:
            fallback = "up" if side == "right" else "down"
        return direction_of(settings.get(side), fallback)

    def turns(self):
        # a knob turns only with both of its pins
        return bool(self.a and self.b)

    def button_action(self):
        action = str(self.settings().get("button", "off"))
        allowed = BUTTONS + (("tracks",) if self.name == "first" else ())
        return action if action in allowed else "off"

    def step(self):
        # percent per detent (1..10)
        try:
            return min(10, max(1, int(self.settings().get("step", 5))))
        except (TypeError, ValueError):
            return 5

    def track_mode(self):
        # the first knob selects tracks: only while its button is still set to "track selection" and the time has not run out
        if self.name != "first":
            return False
        if self.button_action() != "tracks":
            self.track_mode_until = 0.0  # another function chosen meanwhile: the mode ends, also if it is chosen again later
        return time.monotonic() < self.track_mode_until

    def button_pressed(self):
        action = self.button_action()
        if action == "tracks":
            # a switch: on the first press the knob selects tracks, on the second one it sets the volume again
            self.track_mode_until = 0.0 if self.track_mode() else time.monotonic() + TRACK_MODE_S
            print("rotary: %s" % ("track selection" if self.track_mode_until else "volume"), flush=True)
            return
        self.track_mode_until = 0.0
        if action == "playpause":
            player("pause" if playing() else "play")
        elif action == "next":
            player("next")
        elif action == "ffwd":
            player("seek+30")
        elif action == "address":
            show_address()

    def turned(self, direction):
        if self.track_mode():
            self.track_mode_until = time.monotonic() + TRACK_MODE_S  # turning keeps the mode alive
            player("next" if direction > 0 else "previous")
            return
        action = self.direction("right" if direction > 0 else "left")
        if action == "up":
            player("%+d" % self.step())
        elif action == "down":
            player("%+d" % -self.step())
        elif action == "next":
            player("next")
        elif action == "previous":
            player("previous")


def worker():
    while True:
        knob, event = events.get()
        if event == "button":
            knob.button_pressed()
        else:
            knob.turned(event)


def configured_knobs():
    # the first encoder while it is switched on, and the valid entries of the list of the others (as extension-resources.ts reads them)
    section = read_config()
    knobs = []
    if section.get("active") is True or str(section.get("active")).lower() == "true":
        knobs.append(Knob("first", *first_pins(section)))
    seen = set()
    for entry in (section.get("extra") or [])[:MAX_EXTRA]:
        if not isinstance(entry, dict):
            continue
        pins = tuple(pin_of(entry.get(key)) for key in ("pinA", "pinB", "pinButton"))
        name = str(entry.get("id", ""))
        if not name.isalnum() or len(name) > 12 or name in seen:
            continue
        chosen = [pin for pin in pins if pin]
        if None in pins or len(set(chosen)) != len(chosen):
            continue
        seen.add(name)
        knobs.append(Knob(name, *pins, legacy=entry.get("function")))
    return knobs


pins = None
knobs = []


def setup():
    global pins, knobs
    held = kernel_pins()
    usable = []
    for knob in configured_knobs():
        if not knob.turns() and not knob.button:
            continue  # no pins at all: nothing to read (a knob just added, its pins not chosen yet)
        if knob.turns() and held & {knob.a, knob.b}:
            # (the app shows the clash on the page of the encoder; taking the pin would stop the other device)
            print("rotary control: GPIO %s of encoder %s belongs to SPI or I2C - not used" % (", ".join(str(p) for p in sorted(held & {knob.a, knob.b})), knob.name), flush=True)
            continue
        usable.append(knob)
    if not usable:
        raise RuntimeError("no encoder with usable pins")
    knobs = usable
    pins = gpio_compat.Gpio()
    for knob in knobs:
        if knob.turns():
            for pin in (knob.a, knob.b):
                pins.setup_input(pin)
    if pins.refused:
        print("rotary control: RPi.GPIO does not work here (%s), using %s" % (pins.refused, pins.name), flush=True)


def button_wanted(knob):
    # The button's pin is taken once the button has a function (it can be chosen later - read once a second); with the
    # button off it stays free for others. A pin of SPI or I2C is never taken: the knob works without the button then.
    if knob.button_ready or knob.button_refused or knob.button_action() == "off" or not knob.button:
        return knob.button_ready
    if knob.button in kernel_pins():
        knob.button_refused = True
        print("rotary control: the button's GPIO %d of encoder %s belongs to SPI or I2C - the button is not used" % (knob.button, knob.name), flush=True)
        return False
    try:
        pins.setup_input(knob.button)
        knob.button_ready = True
    except Exception as error:
        knob.button_refused = True
        print("rotary control: the button's GPIO %d of encoder %s cannot be used (%s)" % (knob.button, knob.name, error), flush=True)
    return knob.button_ready


def main():
    read = pins.read
    threading.Thread(target=worker, daemon=True).start()

    for knob in knobs:
        knob.state = (read(knob.a) << 1) | read(knob.b) if knob.turns() else 3
        button_wanted(knob)
        knob.button_down = knob.button_ready and read(knob.button) == 0
    button_checked = time.monotonic()
    fast_until = 0.0
    print("rotary control started (%s)" % ", ".join("%s: A=%d B=%d button=%s" % (k.name, k.a, k.b, k.button if k.button_ready else "off") for k in knobs), flush=True)

    while True:
        if time.monotonic() - button_checked >= 1.0:
            button_checked = time.monotonic()
            for knob in knobs:
                if not knob.button_ready and button_wanted(knob):
                    knob.button_down = read(knob.button) == 0
        for knob in knobs:
            new_state = (read(knob.a) << 1) | read(knob.b) if knob.turns() else knob.state
            if new_state != knob.state:
                fast_until = time.monotonic() + FAST_FOR_S
                knob.accumulated += TRANSITIONS.get((knob.state, new_state), 0)
                knob.state = new_state
                if knob.accumulated >= STEPS_PER_DETENT:
                    events.put((knob, 1))
                    knob.accumulated = 0
                elif knob.accumulated <= -STEPS_PER_DETENT:
                    events.put((knob, -1))
                    knob.accumulated = 0
                if knob.state == 3 and abs(knob.accumulated) < STEPS_PER_DETENT:
                    knob.accumulated = 0  # resting position without a full detent: it was a bounce

            pressed = knob.button_ready and read(knob.button) == 0
            if pressed and not knob.button_down:
                time.sleep(0.03)  # debounce
                if read(knob.button) == 0:
                    knob.button_down = True
                    events.put((knob, "button"))
            elif not pressed:
                knob.button_down = False
        time.sleep(FAST_POLL_S if time.monotonic() < fast_until else IDLE_POLL_S)


if __name__ == "__main__":
    try:
        try:
            setup()
        except Exception as error:  # no GPIO library, no access to the GPIO, a board neither library knows, no encoder to run: nothing to do, no restart loop
            print("rotary control: GPIO not usable (%s), stopped" % error, flush=True)
            sys.exit(0)
        try:
            main()
        except Exception as error:  # (a read that failed while it ran - lgpio on a Pi 5: systemd starts it again, Restart=on-failure)
            print("rotary control: stopped (%s)" % error, flush=True)
            sys.exit(1)
    finally:
        if pins is not None:
            pins.close()
