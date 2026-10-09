# What is the MuPiBox?

The MuPiBox is a home-built music and audiobook player based on a Raspberry Pi. The child uses it on a touch screen: tap a cover, it plays. Parents set the box up in the browser, without the child being able to change anything.

## What the box can play

- **Your own files**: audiobooks and music stored on the box's memory card ([Your own audiobooks and music](../inhalte/lokale-medien.md)).
- **Spotify**: albums, playlists, artists, podcasts and audiobooks, also automatically from playlists ([Spotify](../inhalte/spotify.md)).
- **Podcasts and radio**: podcasts via their RSS address, radio stations via their stream address ([Podcasts and radio](../inhalte/podcasts-und-radio.md)).
- **Files from a NAS**: media stored on a network drive in your home network ([NAS](../inhalte/nas.md)).

On the display the content is sorted into categories: Audiobooks, Music, NAS, and Radio & podcasts. Categories you do not need can be hidden ([The start page](../bedienung/startseite.md)).

## What parents can set

- how long and when the child may listen: [Playtime and quiet times](../spielzeit/index.md),
- how loud the box may get at most (hearing protection): [Sound and volume](../hardware/sound.md),
- how the box looks: themes, boot screens and texts ([Covers and themes](../bedienung/cover-und-themes.md)),
- how it reports: Telegram messages and Home Assistant ([Telegram](../netzwerk/telegram.md), [MQTT and Home Assistant](../netzwerk/mqtt.md)).

## What the box takes care of by itself

The box can switch itself off after a set time without playback, and the display goes off after 10 minutes without use. Both times can be changed ([Display](../hardware/display.md), [Battery, MuPiHAT and power button](../hardware/strom.md)).

> [!NOTE]
> The MuPiBox is a community project. The software is built on DietPi, Chromium, mpv and other open-source components. The player plays your own files, NAS, podcasts and radio with mpv (mplayer only as a fallback when mpv is missing). Spotify plays in the display's browser through Spotify's Web Playback SDK. The list of components is under **Settings › System › Legal**.
