# NFC: Assigned tags

The sub page **Assigned tags** (**Settings › NFC extension › Assigned tags**) shows all tags that have a medium. New tags are added from the library (see [Linking a tag to an album](nfc-tag-zuordnen.md)); this page manages them.

![The Assigned tags page](nfc-tags-page.png)

## The tiles

Every tag is a tile. On a phone (up to 575 pixels wide) there is one tile in each row, from 576 pixels two, from 1000 pixels three side by side.

![Three tiles side by side](nfc-tags-page-wide.png)

From top to bottom a tile shows:

| Item | Meaning |
| --- | --- |
| **Title** | the medium the tag starts |
| **Picture** | the cover of the medium or a picture of your own (see [Changing the picture of a tag](nfc-bild.md)) |
| **Text** | the kind (SD card, NAS, Spotify, radio, podcast, TIDAL, Jellyfin or Audible), the number of the tag (the UID, for example `04:A1:B2:C3:D4:E5:F6`; for a USB reader the card number as the reader types it) and **Flex tag** when the tag is the flex tag |
| **Buttons** | five symbols, see below |

The newest tags are at the top.

## The five buttons

From left to right:

| Symbol | Effect |
| --- | --- |
| Picture | **Change picture**: choose a picture of your own for the tag, or give it up again with **Use the cover of the medium** in the same window, see [Changing the picture of a tag](nfc-bild.md) |
| Play | **Play album**: starts the medium of the tag as if you had laid the tag on |
| Arrows | **Change tag**: the tag gets another album, see below |
| Bin | **Remove**: takes the tag out of the list, after a question. A removed tag counts as new the next time it is laid on and plays nothing |

A tag you lay on that has no medium is not in the list. It plays nothing.

## The player at the bottom

At the bottom of the page, always in view, is a small player. It shows what the box is playing right now and steers it:

- **Back**, **Play/Pause** and **Next**,
- the cover and the title,
- the time and a bar showing how far the medium is,
- the **volume** (with the box's hearing protection).

When you tap **Play album** on a tile, the player shows the new medium after a second or two. If something is playing already, it is replaced. The player also shows what a tag you lay on or a tap on the display starts.

## Change tag

With **Change tag** the tag gets another album without being laid on:

1. Tap **Change tag** on the tile. The app switches to the **Library**; a note appears at the bottom (with **Cancel**).
2. Open the album, station or podcast the tag is to start from now on.
3. Under the **NFC tag** button there is now **Assign the tag to this album.** Tap it.

The app goes back to **Assigned tags**; the tile shows the new medium. An own picture of the tag goes with that (the tag shows the cover of the new medium), the flex tag stays the flex tag.

![The library waits for the new album](nfc-change-library.png)

![The album with the button "Assign the tag to this album."](nfc-change-sheet.png)

## When taken off

Under the list is the setting **When taken off**: **Pause** (default), **Stop** or **Keep playing**. Only a tag that has a medium triggers this, and only while what it started still plays: if the child chose something else on the display meanwhile, that goes on.

With **Pause** an audio play goes on where it was if the same tag is laid on again within half an hour. With another tag its medium starts as when you tap the tile. A tag laid on again while its medium still plays (with a USB reader: every time it is held there) lets it play on instead of starting it from the beginning. With **Pause** or **Stop**, a tag laid on only briefly and taken off before playback begins starts nothing.

A **USB reader** reports only the laying on, never the taking off. **When taken off** does not work with it; playback just goes on.

## Where the assignments are kept

The assignments are in `tags.json` in the extension's data folder (`~/.mupibox/data/extensions/data/nfc/`) and stay through updates. In addition the extension writes them to a file of their own, **`tag-assignments.json`**, in the same folder at every change (see below). The box starts through the **display** (so tile times, playtime and "Continue" count as with a tap); with no display running a tag therefore starts nothing.

## Backup, export and import

Which tag starts which medium is not lost when a file breaks:

- The assignments are kept in a file of their own, **`tag-assignments.json`**, in the extension's data folder. It is written anew at every change. The version before stays as `tag-assignments.json.bak`, and there is one copy per day (the version before the first change of the day) in the folder `backup/`, for seven days.
- The file is part of the **box backup** (**Settings › System › Backup**) and comes back with a restore. At its next start the extension takes the assignments from the file if it differs from the one it remembers. If `tags.json` is lost or damaged, it also fetches the assignments from the file (or its copy).
- Below the list, side by side, are the buttons **Export tags** and **Import tags**. **Export tags** saves the list of the tags with their medium as a **table** (`mupibox-nfc-tags-YYYY-MM-DD.csv`) on the device on which you opened the app; Excel (and LibreOffice) opens it with a double click. With **Import tags** you choose such a table (also one from another box, or one you wrote yourself). New tags are added; a tag the box already knows gets the medium from the table. What is not in the table stays as it is. Rows that cannot be played are skipped. Instead of the table the import also takes a JSON file.

### The table

One row for each tag, the columns (separated by semicolons):

| Column | Content |
| --- | --- |
| **UID** | the number of the tag, for example `04:A1:B2:C3` |
| **Titel**, **Interpret**, **Kategorie** | title, artist and category, as in the library |
| **Art** | `library` (library/SD card), `nas`, `spotify`, `radio`, `rss` (podcast) or `tidal` |
| **Adresse** | the folder (`library`), the path on the NAS, the Spotify ID, the address of the station or podcast |
| **Flex-Tag** | `ja` (yes) for the flex tag |
| **Bild**, **Cover** | the pictures of the tag |
| **Medium (technisch)** | the whole medium; if something is in it, it counts and the columns before it are only to read |

A table written by hand works too: the columns **UID**, **Art**, **Titel** and **Adresse** are enough (leave **Medium (technisch)** empty or leave it out). The column names may be English (`uid`, `type`, `title`, `address`), and commas or tabs work instead of semicolons.

The table holds only tags that have a medium, not when and how often they were laid on. The media are found by their path or address: on another box the tags therefore only work if the same albums are at the same path there, or if they are stations, podcasts and Spotify entries.
