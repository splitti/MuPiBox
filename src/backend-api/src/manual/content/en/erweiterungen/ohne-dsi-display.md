# Without DSI display

With the switch **Run without DSI display** the box runs without a screen. It is meant for a box that is operated with **NFC tags** and **buttons**, say, with or without an [OLED display](oled.md). It is then set up with the **web app**.

Since MuPiBox 5.1 this is a switch of the box itself. Before, only the OLED display extension had it. A switch that was on there stays on.

## What changes

After the **next restart**:

- **No kiosk** starts: no X server and no Chromium. That saves memory and power.
- The box **does not wait** for the display at start; the other services start at once.
- An **NFC tag starts its medium directly**, without a display picking it up: the server sends the start to the player. That works with own files, audio play folders, NAS, radio, podcasts, TIDAL, Jellyfin and Audible.
- **Spotify does not work without the display**: the box's Spotify player runs in the display's Chromium. A tag with a Spotify album then plays nothing.
- The box is operated with the **web app**, **NFC**, **buttons** and, if there is one, the **OLED display**.

## Switching it on

1. In the web app open **Settings › Display**.
2. In the card **Without DSI display**, switch on **Run without DSI display**.
3. **Restart** the box.

Until the restart the card says **applies after the restart**. While a **DSI display is connected**, the switch cannot be turned on: the box would start with a dark display.

For this the box sets DietPi's start from the kiosk login to the manual login (`dietpi-autostart 0`) and enters `mupibox.headless` in its configuration. It remembers what was set before.

## Back to the DSI display

Switch it off and restart the box: the box sets the start back to the kiosk (`dietpi-autostart 11`) or to what was set before.

If a **DSI display** is plugged in at the start while the switch is on (after restoring the backup of another box, say, or when the display was connected later), the box switches the kiosk back on by itself. After the next restart the display is back.

> [!NOTE]
> Without the kiosk there is nothing on the DSI display, not even error messages or the setup. Before switching it on, check that the box's **web app** can be reached. The daily limit counter of a tile does not count an NFC start without a display.
