# Switching on and settings

You switch the photo display on under **Settings › Photos** with **Photo display**. Then **Photos** appear in the app's library and the **Picture time** under Playtime. The display gets the **Photos** tab as soon as an album is visible.

When it is switched on, the box sets up a program that converts iPhone photos (HEIC). That needs the internet once. If it fails, the page shows a note with **Try again**. Photos other than HEIC work anyway.

If you switch the photo display off again, photos disappear from the app and the display. The albums and photos stay on the box and are back when you switch it on.

## Albums and slideshow

| Setting | Effect |
| --- | --- |
| **Album starts as a slideshow** | For the youngest: an album opens straight as a slideshow, without the grid. |
| **Slideshow speed** | how long a picture stays (slow, medium, fast); it can also be changed on the display while looking |
| **Order** | **Shuffled**, **Newest first** or **By date taken** |

## Videos

With **Show videos**, short clips appear in the albums too. The box sets up a program for converting videos for that (ffmpeg, needs the internet once).

- A clip may be at most **3 minutes** long. The box does not take longer ones.
- The box brings every clip to a size the display plays well, in the background. Until then the album says **Being prepared**. A long 4K clip can take a few minutes on the Raspberry Pi.
- In the album a clip plays with sound. While an audio book or music plays, it stays silent. In the slideshow clips are always silent, and only those up to 30 seconds play; longer ones show their still.
- Live photos from an iPhone show only their still.

## Screensaver

See [Screensaver](bildschirmschoner.md).
