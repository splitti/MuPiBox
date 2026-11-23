# USB CD drive

The extension **USB CD drive** plays **audio CDs** from a CD drive connected to the box by USB, with track names and cover from the internet.

## What you need

- an external CD or DVD drive with a USB connection. Some drives need more power than a USB port of the Raspberry Pi supplies: in that case use a drive with its own power supply or a powered USB hub
- the extension, [installed](installieren.md) under **Settings › System › Extensions**

When it is installed, the box sets up access to the drive (an access rule and the group `cdrom`). The app shows that beforehand.

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

## If the CD does not appear

- Does the drive spin up? If not, it may be getting too little power (see above).
- The tab **CD** only appears for pure **audio CDs**, not for data CDs with MP3 files and not for mixed CDs (audio and data). Copy such files into the library ([Your own audiobooks and music](../inhalte/lokale-medien.md)).
- Is the extension switched on under **Settings › System › Extensions**?
