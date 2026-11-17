# Jellyfin

If your audio plays, audiobooks and music are in a **Jellyfin** server (on the NAS or a PC in your home network, for example), the box plays them straight from there. You choose albums, audiobooks, artists and playlists the way Jellyfin orders them – with their covers. Jellyfin is free and runs at your home; the box needs no internet for it, only the home network.

## Connecting

The page is under **Settings › Services › Jellyfin**. An assistant leads you through three steps:

1. **Server:** **Search the home network** finds Jellyfin servers that answer in the same network; tap yours. If the server is in another network (VLAN), type its address, e.g. `http://192.168.1.20:8096`. Without a port the box takes 8096. If your Jellyfin uses https with a certificate of its own (self-signed), the box shows its fingerprint – compare it in the browser via the lock symbol and confirm it only if it matches.
2. **Sign in:** The box shows a six-digit **Quick Connect code**. Open Jellyfin on the phone or in the browser, signed in with the account whose library the box should play, and enter the code under **Profile › Quick Connect**. If Quick Connect is switched off in Jellyfin (Dashboard › General), sign in with **username and password**. The box uses the password only for signing in; it keeps only an access token, encrypted on the box.
3. **Libraries:** Choose the libraries the app offers content from. None chosen means: all the box can play (music, books, playlists).

It is best to create an account of its own for the box in Jellyfin, with access only to the children's libraries.

Then the page shows server, version, account and libraries. In Jellyfin the box appears under **Devices** as "MuPiBox" with the box's name.

- **Use Jellyfin** switches Jellyfin off without deleting the sign-in. Entries from Jellyfin then stay in the library but are neither shown nor played.
- **Change address** is for the same server under a new address (a new IP, for example); the sign-in stays. For another server you sign in anew. Entries from the Jellyfin before then no longer play; delete them in the library and add them from the new server.
- **Sign out** ends the sign-in in Jellyfin too (the device disappears there). The entries stay in the library and play again after a new sign-in.

## Adding content

**Library › Add › From Jellyfin** lists the chosen libraries; above them you search all of them by name.

- **Music:** artists or albums. Tap an **album**, choose the category and **Add**. An **artist** shows its albums to add one by one; **Add the whole artist** creates one entry for all its albums – also for those added to Jellyfin later. The box and the app show it as a folder.
- **Audiobooks:** an audiobook in several files (one folder per book) is one entry; its files are the tracks. If several books lie in one folder, the box keeps them apart by the files' album tag. A book in one file (M4B) is an entry as well. A book whose files lie in subfolders (CD1, CD2 …) appears as one entry per subfolder.
- **Playlists:** your audio playlists from Jellyfin. As with Spotify, you choose under **On the start page** whether it gets a tile of its own or stands in a folder.

For a whole artist you set the **Order on the display** in the **library** (tap the entry) and switch single albums off with their switch.

If an album or a playlist changes in Jellyfin, the box plays the new state at its next start.

## Playing

A Jellyfin album plays like an album from the memory card: with a track list, next and previous, seeking, **Continue listening**, heard ticks and the daily limit of its tile. In the app you start it under **Listen**. Playing time and quiet hours apply here too.

The box plays the files as they are. For large files (FLAC) and weak Wi-Fi, **Convert for weak Wi-Fi** (on the **Jellyfin** page under **Playback**) helps: Jellyfin then converts every track to MP3 at 192 kbit. Seeking does not work then, and **Continue listening** starts the track from its beginning (at the right place in the album).

## Sharing progress with Jellyfin

With **Share progress with Jellyfin** (off by default) the box keeps Jellyfin up to date:

- It reports what it plays and where it is in the track. Tracks heard to their end are set to **played** by Jellyfin.
- If you start an album or audiobook anew at the box (not via **Continue listening**), it begins where the account left off in Jellyfin – also when it was heard on a phone meanwhile. For audiobooks that is the first chapter not played yet.
- An album played completely in Jellyfin gets the green heard tick at the box – within ten minutes at the latest.

For audiobooks Jellyfin keeps a place inside a chapter only after 5 minutes and counts the last minutes as played (adjustable in the Jellyfin dashboard under Playback › Resume).

> [!NOTE]
> If Jellyfin does not answer (server off, asleep, another network), the display leaves its entries out until it answers again – the box asks every minute. They stay in the app’s library. If the box was signed out in Jellyfin, the **Jellyfin** page says so and offers **Sign in again**.
