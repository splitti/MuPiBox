# Spotify

The box plays Spotify with its own player. For this you need a Spotify account and your own **Spotify app** on developer.spotify.com. That sounds more involved than it is: a wizard guides you in five steps.

> [!IMPORTANT]
> To play Spotify the box needs a Spotify Premium account. That is a requirement of Spotify, not of the box.

## Setting up

**Library › Spotify › Setup wizard**:

| Step | What you do |
| --- | --- |
| 1 | Sign in at developer.spotify.com and choose **Create app** |
| 2 | Copy the values shown into the Spotify app (the fields can be copied with a button) |
| 3 | Copy **Client ID** and **Client Secret** from the Spotify app. They are under **Settings** there; **View client secret** shows the secret. Then **Save + continue** |
| 4 | **Connect to Spotify** and test the connection |
| 5 | Set the **playlist prefix** (see below) and **Done** |

You can look at and change the player's access data later under **Library › Spotify › Player access**. **Reset Spotify access** deletes it again.

## Adding content

### Search on Spotify

**Library › Search on Spotify**: Enter a search term, choose whether to search in **All**, **Artists**, **Albums** or **Tracks**, and choose the category the result should go into. From the hits you add albums, artists or tracks with a tap.

### Paste link

**Library › Paste link** takes a Spotify address directly: album, playlist, artist, podcast or audiobook. As the **type** you choose **Spotify link**. More fields:

| Field | Meaning |
| --- | --- |
| **Artist / Name** (optional) | your own name for the entry |
| **Category** | Audiobook, Radio play, Music or Radio & podcasts |
| **Cover** and **Artist cover** (optional) | picture addresses, if Spotify's picture does not fit |
| **Sort order** | Default (podcasts: newest episode first, otherwise alphabetical), A–Z, Z–A, oldest or newest first |
| **Shuffle** | play the tracks in random order |
| **Only part of the episodes** | e.g. only episodes 1 to 20 of a series, counted in the order of Spotify |

As a type there is also **Spotify search**: instead of a single album you save a search as an entry. The box then shows all hits as a collection. You phrase it with Spotify's search filters, for example:

```
artist:"LEGO Ninjago" AND album:"Folge"
```

The **name of the collection** (field “Artist / Name”) is the heading of the collection on the display. With a second entry `artist:"LEGO Ninjago" AND album:"Band"`, one artist gives two separate collections.

## Smart-Sync: playlists onto the box automatically

With **Smart-Sync**, Spotify playlists whose name begins with the **playlist prefix** land on the box automatically. Example: if the prefix is “MuPiBox-Audiobooks”, all playlists that start like this appear without further action.

Under **Library › Spotify › Sync settings** you set:

- the **playlist prefix** (preset with the box's name),
- the **sync interval**: how often the box checks Spotify for changes, 5 to 60 minutes,
- whether the **automatic sync** is on. If it is off, **Sync now** remains available by hand.

The **Spotify** page shows the **playlists found** and **conflicts**: items that are already on the box by hand.

## If something does not work

[Spotify does not play](../fehlerbehebung/spotify-probleme.md).
