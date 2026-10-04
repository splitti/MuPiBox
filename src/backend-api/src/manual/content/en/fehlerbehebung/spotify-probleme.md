# Spotify does not play

## Basics

- For Spotify the box needs **internet** and a **Spotify Premium account**.
- The connection to Spotify is shown under **Library › Spotify**. There the status must show **Connected**.

## Setting up the connection again

If the page shows nothing or an error, go through the **setup wizard** again ([Spotify](../inhalte/spotify.md)):

1. Check the **Spotify app** on developer.spotify.com: **Client ID** and **Client Secret** must match those in the app.
2. The **redirect URI** that the box shows in step 2 must be entered in the Spotify app exactly like this. For this Spotify takes an address with `https://` over the box's port. Under **Why two addresses?** the app shows which address applies to your box.
3. **Connect to Spotify** and test the connection.

If that does not help, **Reset Spotify access** (**Library › Spotify**) resets the player's access data. Set it up again afterwards.

## Playlists do not show up

Smart-Sync only takes playlists whose name begins with the **playlist prefix**. Under **Library › Spotify › Sync settings** check whether the automatic sync is on, and start it with **Sync now**. Playlists that are already on the box by hand are reported by the page as **conflicts**.

## Spotify blocks requests

Spotify limits how often an app may ask questions. If that is exceeded, Spotify does not answer for a while until the block has expired. This can happen with very many playlists and changes in quick succession. In that case wait a little and only then start a new sync.

## One box, one device

If Spotify plays on another device with the same account at the same time, playback may stop there. End playback on the other device and start it again on the box.
