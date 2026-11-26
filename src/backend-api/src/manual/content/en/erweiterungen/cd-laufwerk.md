# USB CD drive

The extension **USB CD drive** plays **audio CDs** from a CD drive connected to the box by USB, with track names and cover from the internet.

## What you need

- an external CD or DVD drive with a USB connection. Some drives need more power than a USB port of the Raspberry Pi supplies: in that case use a drive with its own power supply or a powered USB hub
- the extension, [installed](installieren.md) under **Settings › System › Extensions**

When it is installed, the box sets up access to the drive (an access rule and the group `cdrom`) and fetches the programs for ripping. The app shows that beforehand. Afterwards the settings are on a page **Settings › USB CD drive**, with the cards **Titles and cover**, **Format and quality** and **Rip a CD**.

## Playing a CD

When an audio CD is in the drive, the display shows the tab **CD** at the top. A tap on it opens the CD in the player, at the first track.

The CD behaves like an album of its own: track list, next and previous track, seeking, shuffle and repeat work as usual ([The player](../bedienung/player.md)). A CD does not appear under **Continue**.

In the theme with the Winamp player, the **eject button** opens the drive's tray and closes it again.

## Track names and cover

| Setting | Effect |
| --- | --- |
| **Search the internet for titles and cover** | the box looks up the names of the tracks and the cover. Off: the tracks are then called "Track 1", "Track 2" … |
| **Discogs token** | an access key for Discogs (see below). Without it the box only asks MusicBrainz |

The box asks **Discogs** first, then **MusicBrainz**:

- **Discogs** only lets signed-in users search and finds a CD by the **barcode** that some CDs carry. You create the token on discogs.com under **Settings › Developers › Generate new token** and enter it in the settings of the extension.
- **MusicBrainz** needs no account and recognises a CD by its **table of contents** (number and length of the tracks).

Both need the internet. Without it the CD still plays, only without names and cover.

## Ripping a CD

The box can also **copy an audio CD into the library**: afterwards the tracks are files in the box's media folder and play without the CD ([Your own audiobooks and music](../inhalte/lokale-medien.md)).

1. Put the CD in. Under **Settings › USB CD drive** you choose the **format** and the **quality** on the card **Format and quality**.
2. As soon as the CD is recognised (a few seconds), the card **Rip a CD** shows the form with album, album artist, genre, year, the **cover** (the pencil below it picks another) and the name of every track with its contributing artist. What the internet knows about the CD is filled in already; **Update album info online** asks again.
3. Under **Save in** you choose **Audiobooks**, **Music** or **Other**. The **artist folder** suggests the existing folders of that category as you type; a new name creates a new folder. The same goes for the **album folder**. A line below says whether the folder exists or will be created.
4. Tap **Rip**. The card **Format and quality** shows the progress: how far each track is. **Cancel** there stops the rip as well; the tracks that are done stay in the folder, only the one in progress is dropped.

| Format | Good for |
| --- | --- |
| **MP3**, **AAC** | every device; the quality (128 to 320 kbit/s) sets the size |
| **WMA** | old players; no cover inside the file |
| **FLAC**, **ALAC** | no loss of quality, about three times the space |

The files are named "01 Title.mp3" and carry title, artist, album, genre, year and track number; the cover is inside the file and lies as `cover.jpg` in the album folder. While ripping, the CD does not play and the drive cannot be opened. If the album folder already has a file of the same name, the box does not rip: pick another folder then (for example "Album CD 2"). Ripping takes a few minutes and some room on the memory card; at installation the box fetches the programs `cdparanoia` and `ffmpeg` for it.

## If the CD does not appear

- Does the drive spin up? If not, it may be getting too little power (see above).
- The tab **CD** only appears for pure **audio CDs**, not for data CDs with MP3 files and not for mixed CDs (audio and data). Copy such files into the library ([Your own audiobooks and music](../inhalte/lokale-medien.md)).
- Is the extension switched on under **Settings › System › Extensions**?
