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

## Volume

**Settings › Audio › Volume**:

| Setting | Effect |
| --- | --- |
| **Volume now** | the current volume, 0 to 100 % |
| **Maximum (hearing protection)** | the highest volume that can be set at all, 10 to 100 %. Applies to the display, the app, the rotary knob and Telegram |
| **Separate limit with Bluetooth** and **Maximum with Bluetooth** | a maximum of its own while headphones or a speaker are connected over Bluetooth (see below) |
| **Set to a fixed value at startup** | on: the box always starts with the **value at startup**. Off: it keeps the volume from before switching off |
| **Value at startup** | the start volume, never higher than the maximum |

> [!TIP]
> The **maximum** is the most important protection for the ears. Set it so that the speaker in your device stays pleasant even at full setting.

## With Bluetooth

For headphones and speakers over Bluetooth there is a maximum of its own, so that headphones may not get as loud as a speaker. Switch on **Separate limit with Bluetooth** and set **Maximum with Bluetooth**. If the box is louder when the device connects, it goes down to this value at once ([Bluetooth](bluetooth.md)).

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
