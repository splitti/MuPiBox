# Sound and volume

## Sound card

**Settings › Audio › Sound card**: Choose the device through which the box outputs the sound. The choice is applied after a restart. The page also shows which sound card the system currently recognises. With the MuPiHAT the sound card belongs to the HAT (MAX98357A).

The choices include:

- the Raspberry Pi's **onboard 3.5 mm output** and **onboard HDMI output**,
- amplifier boards with **MAX98357A**,
- DACs and amplifiers from **HiFiBerry**, **Allo**, **IQaudIO**, **Pi-DAC**, **AudioPhonics** and others,
- **Any USB audio DAC** (recognised automatically).

> [!NOTE]
> The choice in the app lists the cards. If you do not find your card there, try the entry that matches the chip on the card (many cards share drivers). If the sound stays off, [No sound](../fehlerbehebung/kein-ton.md) helps.

### Headphone jack as well

If the box has a sound card of its own (for example the MuPiHAT or a HiFiBerry), DietPi switches off the Raspberry Pi's 3.5 mm output. With **Settings › Audio › Sound card › Headphone jack › 3.5 mm output as well** it stays on next to the sound card, for headphones on the jack. This applies after a restart, which the app offers right away.

Then there are several outputs: in the player a tap on the symbol next to the volume switches to the other one at once with two outputs, with more it opens **Listen with** with one tile per output ([The player](../bedienung/player.md)). In the app you choose under **Output** in **Now playing**. The box remembers the chosen output across a restart too. Without a choice it plays through the sound card chosen above.

- When you switch to the jack, it is not louder than the box just was. The **maximum for headphones** applies to the jack too, as does the **maximum (hearing protection)**.
- The box makes sure its sound card stays the first card in the system. If you change the sound card or switch the MuPiHAT on or off, it switches the jack back on afterwards.
- Switching it off puts everything back the way DietPi set it up for the sound card (also after a restart).
- If the onboard output is the sound card itself, there is no switch: the jack is on anyway.
- The Raspberry Pi 5 and Zero have no 3.5 mm jack, the switch is missing there. On a Raspberry Pi 1 to 3 the jack and the status LED (GPIO 12/13) share the PWM unit: with the jack switched on the LED keeps running in software. From the Pi 4 on it stays on the hardware PWM.

### HDMI sound as well

For a monitor or TV on the HDMI port switch on **Settings › Audio › Sound card › HDMI sound › HDMI output as well**. The HDMI output is then an output of its own next to the box's sound card and is chosen like the jack in the player or in the app. This too applies after a restart.

- The jack stays off as long as its own switch is off. Both can be switched on together.
- The box sets the HDMI output to HDMI instead of DVI (`hdmi_drive=2`), so a monitor without a setting of its own gets the sound too – only if the boot configuration has nothing about it yet.
- Switching it off takes out again everything that was written for it.
- If the onboard output is the sound card itself, there is no switch.

## Volume

**Settings › Audio › Volume**:

| Setting | Effect |
| --- | --- |
| **Volume now** | the current volume, 0 to 100 % |
| **Maximum (hearing protection)** | the highest volume that can be set at all, 10 to 100 %. Applies to the display, the app, the rotary knob and Telegram |
| **Own limit for headphones** and **Maximum for headphones** | a maximum of its own while playing over Bluetooth (headphones or speaker) or the headphone jack (see below) |
| **Set to a fixed value at startup** | on: the box always starts with the **value at startup**. Off: it keeps the volume from before switching off |
| **Value at startup** | the start volume, never higher than the maximum |

> [!TIP]
> The **maximum** is the most important protection for the ears. Set it so that the speaker in your device stays pleasant even at full setting.

## With Bluetooth

For headphones and speakers over Bluetooth and for the headphone jack there is a maximum of its own, so that headphones may not get as loud as the box's speaker. Switch on **Own limit for headphones** and set **Maximum for headphones**. If the box is louder when the device connects or you switch to the jack, it goes down to this value at once ([Bluetooth](bluetooth.md)).

## Level the loudness

**Level the loudness** brings audiobooks, music, podcasts and radio to a common loudness. A quiet audiobook is then not quieter than the album before it. When the switch is on, you choose the **Strength**: **Gentle** or **Strong**. Spotify stays as it is. After installation the switch is off. On a Pi 3 the start of a track may stutter briefly.

## Back in the player

**Back in the player** sets what the back button at the top left of the player on the display does:

- **Minimise**: the music keeps playing, “Now playing” at the top shows what is playing ([Continue and “Now playing”](../bedienung/fortsetzen.md)).
- **Stop**: the music stops, the display goes back one level.

## Speech output

The box can read out names and speak announcements. You set the voice and language under **Settings › Audio › Speech output**.

## When switching off

When switching off, the box plays a goodbye sound. If music is still playing at that moment, it is stopped first so that it does not briefly get louder before the sound comes.
