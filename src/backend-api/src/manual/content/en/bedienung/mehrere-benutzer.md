# Several users

When several children share one box, each gets their own library, play time, quiet hours and settings. Everything for it is in the app under **Settings › Several users**. It is off by default: the box then has one user, as before.

## Switching it on

Switch on **Several users**. What the box has so far becomes the first user, **Standard**, which you can rename. **Add user** brings in another child:

- **Start empty**: an empty library.
- **Copy of the library of …**: another user's library as a start, with their Spotify subscriptions.

A new user takes the settings (theme, volume, start page …) of the active user, with a copy those of the user copied. Every user has a **colour** of their own, which the display shows as a dot at the top right. There are nine colours, so at most nine users.

## What each child has

| Their own | Shared by the whole box |
| --- | --- |
| Library with tiles, Spotify subscriptions and podcasts | Sign-ins to Spotify, TIDAL, Jellyfin, Audible |
| Recently played, resume, heard episodes | Wi-Fi, NAS, shares |
| [Listening history](../spielzeit/hoer-verlauf.md) and statistics | the box's own files (media folders) |
| [Daily limits](../spielzeit/tageslimits.md), [quiet hours](../spielzeit/ruhezeiten.md), [tile limits](../spielzeit/kachel-limit.md) | the photo albums themselves |
| Photo time and which photo albums the display shows | NFC cards, buttons, OLED and other extensions |
| Theme, volumes, start page, clock, brightness | Telegram, Home Assistant, MQTT, sleep timer |

The box shows its own files to every child. Each child has their own hidden covers: **No cover** hides one for the child who is listening.

## Switching

**In the app** you switch on the start page or under **Settings › Several users** with **Switch**. It takes about a second. Whatever is playing stops, and the display reloads with the other child's theme, start page and library.

**On the display** you tap the coloured **dot** at the top right. **Who is listening?** opens with one tile per child. How the display switches is set under **Switching on the display**:

| Setting | Effect |
| --- | --- |
| **Tap** | one tap on the tile switches |
| **Hold** | hold the tile for three seconds, so nobody switches by accident |
| **Only in the app** | the dot only shows who is listening; switching happens in the app only |

This works from the **lock screen** too. Play time belongs to each child, so a brother or sister with time left may listen. A pause you set with **Quiet now** in the app or in Telegram holds for the whole box, also after a switch.

## PIN

Every user can get a four-digit **PIN** (**PIN** in their row). The display asks for it before it switches **to that user**. That way a child cannot get to an adult's library or a sibling's play time. After five wrong tries the display takes no PIN for a minute. The app, Telegram, Home Assistant and MQTT ask for no PIN.

## Editing another child without switching

The pages **Library**, **Playtime** and **Listening history** have a choice at the top: which child you are working on. You can change a child's library, subscriptions, limits and quiet hours while another one is listening. The changes apply as soon as that child's turn comes. Bonus minutes for today count as well.

**Play**, **Lift lock**, **Quiet now**, **No cover** and keeping single episodes offline work only for the active child, because they act on what the box is doing or showing right now. Switching Smart-Sync on or off and its conflicts (**Library › Spotify**) are the active child's too.

## What runs for everyone in the background

- **Smart-Sync**: the box syncs every child's Spotify subscriptions, each into their own library, each at their own interval.
- **Offline episodes** of podcasts are on the SD card once. An episode stays as long as any child wants to keep it. If one child keeps 1 episode and another 3, the newest 3 are there.
- **Telegram**: a name at the end of a command means that child, no name the active one (`/status Leni`, `/extend 30 Leni`, see [Telegram](../netzwerk/telegram.md)). The weekly summary comes for each child separately.

## NFC cards

Cards belong to the whole box and never switch the child. If what a card starts is not in the active child's library, nothing plays and the display says so briefly. When in doubt the card plays: own files and the NAS always play, as does an album of an artist, a series or a search in the library.

## Switching it off

When you switch **Several users** off, you choose who the box goes on with. The others rest with everything they have: their subscriptions are not synced, their offline episodes stay. Switch it on again and they are back.

## Removing and the trash

**Remove** puts a user in the trash for 30 days, with library, settings and PIN. You can bring them back from there. The active user cannot be removed; switch first.

## Backup

A [backup](../wartung/backup.md) contains all users: their list, their libraries and settings, not the trash. A restore brings them all back as they were in the backup. Users the backup does not know go to the trash.
