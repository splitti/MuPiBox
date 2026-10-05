# More cases

## The Wi-Fi symbol is missing although the box is connected

The status indicator on the display reads the box's online state from a file kept by a small service (`mupi_check_internet`). In older versions this state could get stuck on “offline” although the box was on the network. Newer versions reconcile it with the real state.

- Restart the box ([Restart and shut down](../wartung/neustart.md)).
- Check whether the box is really online, for example whether Spotify or a podcast loads.
- If it stays that way, install an [update](../wartung/updates.md).

## The display is dark

- The display switches itself off after the set time. A tap wakes it ([Display](../hardware/display.md)).
- If it stays dark, check **Display off after** and the brightness.
- Does the display show an **old page** after an update? Restart only the display: **Settings › System › Restart & shut down › Display & services › Restart display**.

## Covers are missing

- If you see a **coloured card with the folder name**, the box has found no picture. That is intended. Upload a cover or switch on **Search for cover online** ([Covers](../inhalte/cover.md)).
- You discard a **wrong** cover under **Library › Cover** in the **Found covers** card with **Discard**. The album then falls back to the picture of the folder above it.

## A new album does not appear

Your own files appear by themselves once they are completely copied. With a **NAS**, **Update index** helps ([NAS](../inhalte/nas.md)). If the files are in the wrong folder, the category does not fit.

## The box is slow or the display stutters

- **Undervoltage**: a power supply or cable that is too weak is the most common cause ([System and expert settings](../wartung/system.md)).
- **Temperature**: if **Box health** shows high values, a [fan](../hardware/luefter.md) or a better case helps.
- **Memory card full**: the free space is shown under **About the box**. Clear up or move media to the [NAS](../inhalte/nas.md).

## An update failed

If already the download or the unpacking of the new version fails, the previous installation stays. Apart from that there is no complete way back to the old state. The **Updates** page shows under **Output** what happened.

The box saved settings, library and covers before the update: in `/home/dietpi/mupibox-backups/before-update-….zip`. If the box then does not run normally, restore the [backup](../wartung/backup.md) you made beforehand. If that does not help, ask the community or report the bug on GitHub ([splitti/MuPiBox](https://github.com/splitti/MuPiBox/issues)), ideally with the **support info** ([Logs and status](../wartung/protokolle.md)).

## The box does not report to Telegram

Check whether the **bot is active**, the **token** is right and your chat is under **Allowed chats** ([Telegram](../netzwerk/telegram.md)).
