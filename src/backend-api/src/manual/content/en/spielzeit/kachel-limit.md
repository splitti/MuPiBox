# Tiles with a day's limit

Single tiles of the start page get a limit per day of their own, for example an audio drama series at most 30 minutes. Everything else goes on within the normal [daily limits](tageslimits.md). A tile's minutes count on the listening time too.

Any tile of the start page can be limited: an artist (also from Spotify or TIDAL), a podcast, a folder of the SD card or the NAS, a single playlist or a radio station.

## Setting it

1. In the app open **Library** and tap the tile, for example the artist or the folder.
2. Choose the minutes under **At most per day**: 15, 30, 45, 60, 90 or 120. **No limit** takes the limit away again.

The choice holds at once and for every day. Below it stands how many minutes were listened to today.

> [!NOTE]
> For a NAS folder whose subfolders stand on the display one by one, the limit holds for all subfolders together.

## What happens at the end?

- When a tile's time runs out, playback ends as with the daily limit: at once, after the track or after the album, depending on **When the limit is reached** ([Daily limits](tageslimits.md)). Radio always stops at once.
- On the display the tile stays where it is, a little paler and with a **lock**. A tap on it opens nothing. At the top "… is over for today" shows for a moment.
- Shortly before the end, "5 more minutes of …" shows at the top.
- Other tiles go on playing as long as the listening time lasts. On the next day (at the hour set under **Day changes at** of the daily limits) the tile is free again.

## The pill on the display

At the top right the pill shows the time left:

- On the **start page** it is always the listening time.
- When a tile with a limit of its own is **open**, its albums or its player, the pill shows its small round picture and its minutes. If the listening time ends earlier, the listening time stays.

## Exceptions for today

Under **Playtime › Tiles with a limit** all tiles with a limit are listed, with today's minutes:

| Button | Effect |
| --- | --- |
| **+10 min** | 10 more minutes for this tile today |
| **Free today** | no limit for this tile today |

Both hold for today only. The app's start page shows a note as soon as a tile is used up for today. Via [Telegram](../netzwerk/telegram.md) the same works with `/tiles`.

**Lift lock** among the [instant actions](schlaftimer.md) also frees used-up tiles for that time.

> [!NOTE]
> What is counted is what was started from the display, the app or Home Assistant. Something sent to the box from outside via Spotify Connect counts on the listening time only.
