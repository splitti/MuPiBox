#!/usr/bin/python3
# Rotary encoder for the volume, with push button (KY-040 style).
#   GPIO 26 = encoder A (CLK), GPIO 24 = encoder B (DT), GPIO 10 = push button (to GND)
# Turning changes the volume by rotary.step percent per detent (the player keeps the max volume and the display in sync), the push button
# does what is chosen in the admin interface (rotary.button in mupiboxconfig.json, read again when it changed).
# With "next track" chosen the button works as a switch: the first press turns the knob into a track selector (every
# detent clockwise = next track, counter clockwise = previous track) for TRACK_MODE_S seconds - each turn starts the
# time anew, so it lasts as long as the knob is being turned - and the second press (or the time running out) brings
# the volume back.

import json
import os
import queue
import sys
import threading
import time
import urllib.request

try:
    import RPi.GPIO as GPIO
except Exception as error:  # no GPIO library (or a board it doesn't support): nothing to do, don't restart in a loop
    print("rotary control: no GPIO (%s), not started" % error, flush=True)
    sys.exit(0)

CONFIG = "/etc/mupibox/mupiboxconfig.json"
PLAYER = "http://localhost:5005"
PIN_A = 26
PIN_B = 24
PIN_BUTTON = 10

# Gray code: previous state (A<<1|B) and new state -> +1 clockwise (A falls first while B is high, as on a KY-040),
# -1 counter clockwise, 0 bounce / invalid. A rotary turning the wrong way: swap the A and B wires.
TRANSITIONS = {
    (3, 1): 1, (1, 0): 1, (0, 2): 1, (2, 3): 1,
    (3, 2): -1, (2, 0): -1, (0, 1): -1, (1, 3): -1,
}
STEPS_PER_DETENT = 4

# How long the knob stays a track selector after the last press or turn (button "next track")
TRACK_MODE_S = 10.0

# The pins are polled: every millisecond while the knob is being used, every 5 ms while it rests (a fifth of the
# wake-ups, the box runs on battery). A turn is caught at the first change and sampled fast from then on.
FAST_POLL_S = 0.001
IDLE_POLL_S = 0.005
FAST_FOR_S = 2.0

# The loop only reads the pins and queues what happened; the worker thread talks to the player and reads the
# config, so a slow answer never makes the loop miss steps of a turn.
events = queue.Queue()
_config = {"mtime": None, "value": {}}
track_mode_until = 0.0  # monotonic time until which the knob selects tracks (0 = it sets the volume); worker thread only


def player(command):
    try:
        with urllib.request.urlopen("%s/%s?src=rotary" % (PLAYER, command), timeout=3) as response:
            return response.read()
    except Exception as error:
        print("player call %s failed: %s" % (command, error), flush=True)
        return None


def rotary_config():
    # read again only when the file changed, so a change in the admin interface takes effect at once
    try:
        mtime = os.path.getmtime(CONFIG)
        if mtime != _config["mtime"]:
            with open(CONFIG) as file:
                _config["value"] = json.load(file).get("rotary", {}) or {}
            _config["mtime"] = mtime
    except Exception:
        pass
    return _config["value"]


def volume_step():
    # percent per detent (1..10)
    try:
        return min(10, max(1, int(rotary_config().get("step", 5))))
    except (TypeError, ValueError):
        return 5


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


def track_mode():
    # the knob selects tracks: only while the button is still set to "next track" and the time has not run out
    global track_mode_until
    if rotary_config().get("button", "off") != "next":
        track_mode_until = 0.0  # another function chosen meanwhile: the mode ends, also if it is chosen again later
    return time.monotonic() < track_mode_until


def button_pressed():
    global track_mode_until
    action = rotary_config().get("button", "off")
    if action == "next":
        # a switch: on the first press the knob selects tracks, on the second one it sets the volume again
        track_mode_until = 0.0 if track_mode() else time.monotonic() + TRACK_MODE_S
        print("rotary: %s" % ("track selection" if track_mode_until else "volume"), flush=True)
        return
    track_mode_until = 0.0
    if action == "playpause":
        player("pause" if playing() else "play")
    elif action == "ffwd":
        player("seek+30")


def worker():
    global track_mode_until
    while True:
        event = events.get()
        if event == "button":
            button_pressed()
        elif track_mode():
            track_mode_until = time.monotonic() + TRACK_MODE_S  # turning keeps the mode alive
            player("next" if event > 0 else "previous")
        else:
            player("%+d" % (event * volume_step()))


def main():
    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    for pin in (PIN_A, PIN_B, PIN_BUTTON):
        GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    threading.Thread(target=worker, daemon=True).start()

    state = (GPIO.input(PIN_A) << 1) | GPIO.input(PIN_B)
    accumulated = 0
    button_down = GPIO.input(PIN_BUTTON) == 0
    fast_until = 0.0
    print("rotary control started (A=%d B=%d button=%d)" % (PIN_A, PIN_B, PIN_BUTTON), flush=True)

    while True:
        new_state = (GPIO.input(PIN_A) << 1) | GPIO.input(PIN_B)
        if new_state != state:
            fast_until = time.monotonic() + FAST_FOR_S
            accumulated += TRANSITIONS.get((state, new_state), 0)
            state = new_state
            if accumulated >= STEPS_PER_DETENT:
                events.put(1)
                accumulated = 0
            elif accumulated <= -STEPS_PER_DETENT:
                events.put(-1)
                accumulated = 0
            if state == 3 and abs(accumulated) < STEPS_PER_DETENT:
                accumulated = 0  # resting position without a full detent: it was a bounce

        pressed = GPIO.input(PIN_BUTTON) == 0
        if pressed and not button_down:
            time.sleep(0.03)  # debounce
            if GPIO.input(PIN_BUTTON) == 0:
                button_down = True
                events.put("button")
        elif not pressed:
            button_down = False
        time.sleep(FAST_POLL_S if time.monotonic() < fast_until else IDLE_POLL_S)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:  # e.g. no access to the GPIO or a board RPi.GPIO doesn't know
        print("rotary control: GPIO not usable (%s), stopped" % error, flush=True)
        sys.exit(0)
    finally:
        GPIO.cleanup()
