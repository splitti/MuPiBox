# Buttons & GPIO Input

With the extension **Buttons & GPIO Input**, **real buttons** control the box: play/pause, next track, louder, quieter and more. Each button is connected to a GPIO pin of the Raspberry Pi that you choose yourself.

After [installing](installieren.md) it, its settings are on a page of their own: **Settings › Buttons & GPIO Input**. The card **Rotary knob** ([Rotary knob and button](../hardware/drehregler.md)), otherwise found under **Settings › Audio**, is on that page too.

## Connection

A button connects its **GPIO pin to GND** (ground). Nothing else is needed: no resistor, no supply. The box switches on the pin's internal pull-up itself.

| Button connection | Raspberry Pi |
| --- | --- |
| Contact 1 | a free GPIO pin (chosen in the app) |
| Contact 2 | GND (for example pin 6, 9, 14, 20, 25, 30, 34 or 39 of the header) |

The list in the app names every pin with its **GPIO number** and its **number on the header**, for example "GPIO 5 (Pin 29)". The whole header is shown in the appendix [GPIO assignment](../anhang/gpio.md).

> [!WARNING]
> Connect a button only between a GPIO pin and GND, never to 3.3 V or 5 V. Do the wiring while the box is switched off.

## Adding buttons

At first the page shows only **Button 1**. **+ Button** at the bottom right adds another one (up to six), **+ Twin button** a twin button (up to two). The bin to the right of the name removes an added button again; its pins are free afterwards.

| Setting | Effect |
| --- | --- |
| **Name** (the field showing "Button 1") | a name of your own for the button, for example "Louder". Without a name it is called "Button 1", "Button 2" … |
| **GPIO pin** | the pin the button is connected to. **No pin** switches the button off. The other settings appear once a pin is chosen |
| **Short press** | the action for a short press |
| **Long press** | the action for a long press, or **No action** |
| **Hold time** | from when a press counts as long: 0.5 to 3 seconds (default 1 second) |
| **Repeat while held** | the action repeats as long as the button stays pressed (four times a second), for example for the volume |

Every change is saved at once and takes effect at once. No restart is needed.

### Pins in use

Pins that are already taken cannot be chosen. The list says **who** holds the pin: the box itself (power button, LED, fan, a switched-on rotary knob, MuPiHAT), the boot configuration (for example the sound card), another extension or another button of this page.

The three pins of the **rotary knob** (default 26, 24 and 10, changeable in its settings) are free as long as the rotary knob is switched off; the list then shows them with the note "Rotary knob (switched off)". If a button has one of these pins, the rotary knob cannot be switched on until the pin is free again. The other way round, the LED and the fan do not take a pin that a button has.

## Short and long press

A button can have two actions ("dual action"):

- **Without a long action** the short one takes effect **at once when the button is pressed**.
- **With a long action** the short one takes effect **when the button is released** and the long one **as soon as the hold time is reached**. So you do not have to let go for the long action.

Example: short = **Previous track**, long = **Start from the beginning**. A short press goes back one track; holding the button for a second restarts the album or playlist.

With **Repeat while held** the long action repeats as long as the button stays pressed. If the button has no long action, the short one repeats once it has been held for the hold time. That turns a button with **Louder** into one that keeps turning the volume up while it is held.

## Twin buttons

A **twin button** is two buttons (A and B) with **six actions** between them: each alone and both together, each short or long.

| Press | Example |
| --- | --- |
| **A short** | Previous track |
| **B short** | Next track |
| **A and B short** | Play/Pause |
| **A long** | Quieter |
| **B long** | Louder |
| **A and B long** | Switch output |

The short actions take effect on release, the long ones as soon as the hold time is reached. "Both together" means: the second button is pressed while the first is still held. **Repeat while held** applies to A or B alone only, never to both together.

A twin button needs **both** pins. As long as only one is chosen, the box does not read it.

## The actions

| Action | Effect |
| --- | --- |
| **Play/Pause** | pauses playback or resumes it |
| **Next track** / **Previous track** | skips one track forward or back |
| **Start from the beginning** | restarts the album or playlist at its first track |
| **Louder** / **Quieter** | changes the volume by the step chosen right next to it: 1, 2, 3, 5 or 10 % |
| **30 seconds forward** / **30 seconds back** | seeks within the track |
| **Shuffle on/off** | toggles shuffle |
| **Repeat all/one/off** | goes one step further with every press: first **all** (the album or playlist starts again at its end), then **one** (the track plays again and again), then **off** (no repeat). With the next album, playback starts without repeat again |
| **Switch output** | switches to the next output: the box's sound cards and paired Bluetooth devices in turn |
| **Show the IP address of the box as a QR code** | shows a QR code with the IP address of the box on the [OLED display](oled.md) for ten seconds (nothing else). A phone scans it and opens the box in the browser; without that extension nothing happens |
| **Change OLED screen (Voll / Mix / Kompakt)** | switches the display while playing on the [OLED display](oled.md) to the next layout with every press: **Full** (Voll), then **Mix**, then **Compact** (Kompakt), then **Full** again. The change lasts until the OLED settings are saved the next time; without that extension nothing happens |
| **Stop** | ends playback |
| **Switch off the box** | shuts the box down |
| **No action** | the press does nothing |

The **volume step** appears only next to **Louder** and **Quieter** and applies to exactly that one action. So a short press can adjust finely (1 %) and a long one coarsely (10 %). The **maximum** volume ([Sound and volume](../hardware/sound.md)) applies to the buttons too.

## If a button does not react

- Is a **GPIO pin** chosen, and an action other than **No action**? A button without an action is not read.
- Does the button really connect the chosen pin to **GND**? The app shows the number on the header in brackets.
- For a **twin button** both pins must be chosen and different.
- Is the extension switched on under **Settings › System › Extensions**?
- While nothing is playing, **Next track**, **Previous track** and **Start from the beginning** do nothing.
