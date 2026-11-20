# Without DSI display

With the switch **Run without DSI display** the box runs without a screen. It is meant for a box that is operated with **NFC tags** and **buttons**, say, with or without an [OLED display](oled.md). It is then set up with the **web app**.

Since MuPiBox 5.1 this is a switch of the box itself. Before, only the OLED display extension had it. A switch that was on there stays on.

## What changes

After the **next restart**:

- **No kiosk** starts: no X server and, without Keep Spotify ready, no Chromium. That saves memory and power.
- The box **does not wait** for the display at start; the other services start at once.
- An **NFC tag starts its medium directly**, without a display picking it up: the server sends the start to the player. That works with own files, audio play folders, NAS, radio, podcasts, TIDAL, Jellyfin and Audible.
- **Spotify** works only with **Keep Spotify ready** (see below): the box's Spotify player runs in the display's browser. Without this switch a tag with a Spotify album plays nothing.
- The box is operated with the **web app**, **NFC**, **buttons** and, if there is one, the **OLED display**.

## Switching it on

1. In the web app open **Settings › Display**.
2. In the card **Without DSI display**, switch on **Run without DSI display**.
3. **Restart** the box.

Until the restart the card says **applies after the restart**. While a **DSI display is connected**, the switch cannot be turned on: the box would start with a dark display.

For this the box sets DietPi's start from the kiosk login to the manual login (`dietpi-autostart 0`) and enters `mupibox.headless` in its configuration. It remembers what was set before.

## Keep Spotify ready

When **Run without DSI display** is on, the switch **Keep Spotify ready** appears below it. With it the box starts the browser **invisibly in the background**, without a screen. The box's Spotify player runs in it as it does on the display: Spotify tiles, NFC tags with Spotify albums and Spotify Connect then play without a display too.

- The browser needs about **600 MB of memory** and a little more power. On a box with 1 GB (a Raspberry Pi 3, say) it can get tight; the app points this out.
- If the box already runs without a display, Spotify is there right after switching it on. Otherwise after the next restart.
- Switching it off ends the browser at once.

## Back to the DSI display

Switch it off and restart the box: the box sets the start back to the kiosk (`dietpi-autostart 11`) or to what was set before.

If a **DSI display** is plugged in at the start while the switch is on (after restoring the backup of another box, say, or when the display was connected later), the box switches the kiosk back on by itself. After the next restart the display is back.

> [!NOTE]
> Without the kiosk there is nothing on the DSI display, not even error messages or the setup. Before switching it on, check that the box's **web app** can be reached.
