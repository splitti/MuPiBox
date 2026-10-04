# Rotary knob and button

A **rotary knob with button** (rotary encoder in the style of the KY-040) makes the volume easy to reach for children's hands. You switch it on in the app under **Settings › Audio › Rotary knob and button**.

## Connection

| Rotary knob connection | GPIO pin of the Raspberry Pi |
| --- | --- |
| A (CLK) | **26** |
| B (DT) | **24** |
| Button | **10** (the button switches to GND) |

If the knob turns the wrong way, swap connections A and B.

## Settings

| Setting | Effect |
| --- | --- |
| **Rotary knob for the volume** | switches the knob on (after installation it is off) |
| **Step per click** | how many percent each click changes the volume, 1 to 10 |
| **Function of the button on GPIO 10** | **Off**, **Play/Pause**, **Next track** or **Fast-forward** |

The volume **maximum** (**Audio › Volume › Maximum (hearing protection)**) also applies to the knob: it never turns louder than allowed ([Sound and volume](sound.md)). The choice of button behaviour and the step size take effect at once. Switching the knob on and off restarts its service.

## The button

| Function | One press |
| --- | --- |
| **Play/Pause** | pauses playback or starts it again |
| **Next track** | switches the knob between **volume** and **track selection** (see below) |
| **Fast-forward** | jumps 30 seconds ahead |
| **Off** | does nothing |

### “Next track”: choosing tracks with the knob

If **Next track** is chosen, the button is a switch:

1. **First press**: the knob now chooses **tracks** instead of the volume. Each click to the right jumps to the **next track**, each click to the left to the **previous** one.
2. **Second press**: the knob sets the **volume** again.

Track selection also ends by itself: **10 seconds** after the last press or the last turn. If you keep turning, you stay in track selection. The first press itself does not yet jump to the next track.

> [!TIP]
> This is handy for albums with many tracks: jump to the audiobook chapter without looking at the display, then with one press back to the volume.

## If it does not react

- Is the **rotary knob** switch on? The service only starts then.
- Check the wiring of pins 26, 24 and 10 ([GPIO assignment](../anhang/gpio.md)).
- The service is called `mupi_rotary`.
