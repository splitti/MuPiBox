# Spotify

On the box, Spotify plays in the display's browser, through Spotify's Web Playback SDK. For this you need a Spotify account and your own **Spotify app** on developer.spotify.com. That sounds more involved than it is: a wizard guides you in five steps.

> [!IMPORTANT]
> To play Spotify the box needs a Spotify Premium account. That is a requirement of Spotify, not of the box.

## Setting up

**Library › Spotify › Setup wizard**:

| Step | What you do |
| --- | --- |
| 1 | Sign in at developer.spotify.com with your Spotify account and choose **Create app** |
| 2 | Enter the values shown into the Spotify app (App name, App description, Redirect URI; the Redirect URI can be copied with a button). Under the APIs tick “Web API” and “Web Playback SDK” |
| 3 | Enter **Client ID** and **Client Secret** from the Spotify app. They are under **Settings** there; **View client secret** shows the secret. Then **Save and continue** |
| 4 | **Connect with Spotify**: sign in at Spotify and agree, then you come back to the app. Then **Next** |
| 5 | optional: set the **Playlist prefix** and **Turn on Smart Sync**, or finish with **Without Smart Sync** (see below) |

Spotify keeps a sign-in valid for 6 months. The box reminds you 14 and 3 days before, in the app and via Telegram. **Sign in again** is on the **Spotify** page.

You can look at and change the credentials later under **Library › Spotify › Credentials**. You delete them completely on the **Spotify** page under **Disconnect & reset › Reset access**. The content in the library stays.

## Adding content

### Search on Spotify

**Library › Search on Spotify**: enter a search term, choose whether to search in **All**, **Artist**, **Albums** or **Track**, and choose the category under **Add as**. From the hits you add with ＋:

- an **album**,
- an **artist**: this creates an artist subscription, all episodes come onto the box, new ones later by themselves ([Managing content](verwalten.md)),
- for a **track** the whole album it is on.

### Paste link

**Library › Paste link** takes a Spotify address directly: album, playlist, artist, podcast or audiobook. As the **Type** you choose **Spotify link**. More fields:

| Field | Meaning |
| --- | --- |
| **Artist / name** (optional) | your own name for the entry |
| **Category** | Audiobook, Music or Radio & podcasts |
| **Cover** and **Artist cover** (optional) | picture addresses, if Spotify's picture does not fit |
| **Sort order** | Default (podcasts: newest episode first, otherwise alphabetical), A–Z, Z–A, oldest or newest first |
| **Shuffle** | play the tracks in random order |
| **Only a part of the episodes** | e.g. only episodes 1 to 20 of a series, counted in the order of Spotify |

As a type there is also **Spotify search**: instead of a single album you save a search as an entry. The field is then called **Search term**. The box shows all albums found (at most 100) collected under one tile. You phrase the search with Spotify's search filters, for example:

```
artist:"Name of the series" AND album:"Episode"
```

The field **Tile name** is required: that is what the tile is called on the display. With a second entry, such as `artist:"Name of the series" AND album:"Volume"`, one artist gives two separate tiles.

## Smart Sync: playlists onto the box automatically

With **Smart Sync**, Spotify playlists whose name begins with the **playlist prefix** land on the box automatically. Example: if the prefix is “MuPiBox”, all playlists that start like this, such as “MuPiBox Audiobooks”, appear without further action.

Under **Library › Spotify › Sync settings** you set:

- the **Playlist prefix** (preset with the box's name),
- the **Sync interval**: how often the box checks Spotify for changes, 5 to 60 minutes,
- whether **Automatic sync** is on. If it is off, there is no sync at all, not even by hand. The content on the box stays.

**Save** applies the values. While Smart Sync is on, **Sync now** on the **Spotify** page starts a sync at once.

The **Spotify** page also shows the playlists found and **Conflicts**: items that are already on the box by hand and are also in a playlist. **Let sync manage it** hands such an entry over to the sync.

## If something does not work

[Spotify does not play](../fehlerbehebung/spotify-probleme.md).
