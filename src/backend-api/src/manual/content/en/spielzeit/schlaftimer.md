# Instant actions and sleep timer

Both are at the top of the **Playtime** page and take effect at once.

## Instant actions

First enter the **minutes** (1 to 1440). Then:

| Action | Effect |
| --- | --- |
| **+ bonus time** | adds these minutes to today's daily limit |
| **Lift lock** | lifts limit and quiet time for these minutes, the box plays freely |
| **Quiet now** | stops playback for these minutes |

The actions change neither the daily limits nor the quiet times themselves. After the minutes have passed, what is set applies again.

## Sleep timer

The **sleep timer** switches the box **completely off** after a time has passed, whether or not something is playing. It is meant for falling asleep: start an audiobook, set the timer to 60 minutes, done.

1. Choose the **minutes** (15 to 360, in steps of 15).
2. Tap **Start**. **Stop** cancels it.

In the last 20 seconds before the end the box fades the volume out slowly, so playback ends quietly instead of abruptly. Then it sets the volume back for the next start and shuts down as usual, with the goodbye picture and sound.

### One timer, whoever sets it

The box always has **exactly one** sleep timer. The app, Telegram (`/sleep` and the buttons), the old admin interface and [Home Assistant](../netzwerk/home-assistant.md) all set the same timer and see the same time left:

- **A new timer replaces the running one.** Set 30 minutes and then 60, and only the 60 count. The old timer can no longer switch the box off.
- **Stop** cancels it, wherever it was set. Stopping twice in a row is no error either. Shortly before the end, while the volume fades, it goes back to where it was.
- **Once the time is up**, the box starts shutting down. From then on the timer can no longer be stopped; the app says so.
- The timer runs **on its own**, apart from the app, Telegram and Home Assistant. A restart of the app or a lost connection to Home Assistant does not change it. After the box is switched on again, no old timer is left.

### How it differs from the other times

| What | Effect |
| --- | --- |
| **Sleep timer** | switches the **whole box off** when the time is up |
| **Quiet now**, quiet times, daily limit | only stop **playback**, the box stays on |
| **Box off after … without playback** | switches off when nothing has been played **for a while** |

### If it does not work

For advanced users, by SSH on the box:

- `sudo /usr/local/bin/mupibox/sleep_timer.sh status` shows whether a timer runs and until when.
- `journalctl -u mupi-sleep-timer` shows what the timer did (started, replaced, stopped, ran out).
- `sudo /usr/local/bin/mupibox/sleep_timer.sh stop` stops it by hand.

> [!NOTE]
> After the timer has switched the box off, it must be switched on again at the device ([Restart and shut down](../wartung/neustart.md)).

## Automatic shutdown and display

Independent of the sleep timer, the box switches itself off when nothing has been listened to for a long time. You set that and **Display off after** right here on the page **Playtime** in the card **Switch off**, so all the times are in one place. The same settings are also under **Settings › Battery & Power › Automatic shutdown** and **Display & controls › Display**.

- **Box off after … without playback**: up to 300 minutes, 0 = never (that is how it is set after installation) ([Battery, MuPiHAT and power button](../hardware/strom.md)).
- **Display off after**: this long without use of the display, then it goes dark. 0 = never.
