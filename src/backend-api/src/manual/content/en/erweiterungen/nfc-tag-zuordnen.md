# NFC: Linking a tag to an album

A tag gets its medium where you find the medium: in the **library**. You need a reader whose **Status** shows **Ready** (see [Adding readers](nfc-leser.md)).

## Step by step

### 1. Open the medium

In the library open an **album, an audio-play folder, a station or a podcast**: for folders of the SD card and the NAS the window of the album, for Spotify, radio, podcast, TIDAL, Jellyfin and Audible entries the window of the entry.

### 2. Tap NFC tag

Tap **NFC tag**. The window shows which tags the medium already has (with picture, kind and number) and lets you change a picture there or **remove** a tag.

![The NFC tag window of an album with its tag](nfc-sheet-tags.png)

### 3. Add and lay the tag on

Tap **Add NFC tag** (for the first tag) or **Add another NFC tag**. The window shows the cover and "Now lay the NFC tag on the reader". Then lay the tag on a reader.

![The window waits for the tag](nfc-sheet-wait.png)

### 4. Done

The window says "Done – the tag (ID 04:A1:B2:C3) now belongs to this medium." with the number of the tag, and the medium starts on the display.

![Done: the tag now belongs to the album](nfc-sheet-done.png)

From then on the tag starts its medium every time it lies on a reader, without you setting anything.

## Good to know

- A medium can have **several tags**, for example one for each child: the **NFC tag** window lists them all, and **Add another NFC tag** adds one.
- If the tag had a medium already, the new one replaces it; the window names the old one ("Before: …").
- An assignment waits for at most **ten minutes**, and only while the window is open: if you close it, lock the phone or reload the app, it is cancelled after a few seconds.
- **One** reader is enough: the tag can be laid on any of the readers you have set up.

## Flex tag

With the **Flex tag** tick in the window the tag becomes the **flex tag** (it is called that in TeddyCloud too): a tag whose medium you can change at any time. If you later assign another medium with the tick, the flex tag has it **at once**, without lying on the reader. There is only one flex tag; a new one replaces the old one.

## Podcasts

A tag with a podcast plays one **episode** of it, and only one that the tile shows too (your choice of episodes and the entry's sorting count): the one you started that is not finished, else the first one not heard (without a sorting of your own the newest), else the first. For this the box needs the feed (internet or the box's cache); if it cannot be reached, nothing starts.

## What cannot be assigned

Not every entry can be put on a tag: a folder that holds only more folders, a whole artist (Spotify, TIDAL, Jellyfin) and a whole Audible series have no single medium; a single audiobook of the series can be added as an entry of its own and put on a tag. There the button is not shown, or the box says "This medium cannot be given to a tag".

Next: [Changing the picture of a tag](nfc-bild.md), [Assigned tags](nfc-zugeordnete-tags.md).
