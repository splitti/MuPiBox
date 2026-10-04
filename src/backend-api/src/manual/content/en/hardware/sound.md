# Sound and volume

## Sound card

**Settings › Audio › Sound card**: Choose the device through which the box outputs the sound. The choice is applied after a restart.

The choices include:

- the Raspberry Pi's **onboard 3.5 mm output** and **onboard HDMI output**,
- amplifier boards with **MAX98357A**,
- DACs and amplifiers from **HiFiBerry**, **Allo**, **IQaudIO**, **Pi-DAC**, **AudioPhonics** and others,
- **Any USB audio DAC** (recognised automatically).

> [!NOTE]
> Which entries the choice contains is shown in the [settings reference](../referenz/audio/sound-card.md). If you do not find your card there, try the entry that matches the chip on the card (many cards share drivers). If the sound stays off, [No sound](../fehlerbehebung/kein-ton.md) helps.

## Volume

**Settings › Audio › Volume**:

| Setting | Effect |
| --- | --- |
| **Volume now** | the current volume, 0 to 100 % |
| **Maximum (hearing protection)** | the highest volume that can be set at all, 10 to 100 %. Applies to the display, the app and the rotary knob |
| **Set to a fixed value at start** | on: the box always starts with the **value at start**. Off: it keeps the volume from before switching off |
| **Value at start** | the start volume |
| **Keep playing when leaving the player** | whether playback continues when the child leaves the player ([Continue and “Now playing”](../bedienung/fortsetzen.md)) |

> [!TIP]
> The **maximum** is the most important protection for the ears. Set it so that the speaker in your device stays pleasant even at full setting.

## With Bluetooth

For headphones and speakers over Bluetooth there is a maximum of its own, so that headphones may not get as loud as a speaker ([Bluetooth](bluetooth.md)).

## Speech output

The box can read out names and speak announcements. You set the voice and language under **Settings › Audio › Speech output**.

## When switching off

When switching off, the box plays a goodbye sound. If music is still playing at that moment, it is stopped first so that it does not briefly get louder before the sound comes.
