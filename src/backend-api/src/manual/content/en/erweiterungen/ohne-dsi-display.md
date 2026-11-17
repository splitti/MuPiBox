# Without DSI display

With the switch **Run without DSI display** of the [OLED display](oled.md) extension the box runs without a screen. It is meant for a box that has only an OLED display, buttons and NFC and is operated with the web app.

## What changes

After the **next restart**:

- **No kiosk** starts: no X server and no Chromium. This saves memory and power.
- The box **does not wait** for the display at start; the other services start at once.
- An **NFC tag starts its medium directly**, without a display picking it up: the server sends the start to the player (album, audio-play folder, NAS, Spotify, radio, podcast and TIDAL).
- The box is operated through the **web app**, **buttons**, **NFC** and the **OLED display**.

## Switching on

1. Open **Settings › OLED display**.
2. Switch on **Run without DSI display** and save.
3. **Restart** the box.

The **DSI display** line of the **Display** card says what applies: **Will be switched off after the restart** while the kiosk still runs, afterwards **Off (without DSI display)**.

For this the extension sets the start of DietPi from the kiosk login to the manual login (`dietpi-autostart 0`) and enters `mupibox.headless` in the configuration of the box.

## Back to the DSI display

Switch the switch off, save and restart the box: the extension sets the start back to the kiosk (`dietpi-autostart 11`), or to what was set before.

> [!NOTE]
> Without the kiosk there is nothing on the DSI display, not even for error messages or the setup. Before switching on, check that the box's **web app** can be reached and the **OLED display** shows a picture. The daily limit counter of a tile does not count an NFC start without a display.
