# Spotify does not play

## Basics

- For Spotify the box needs **internet** and a **Spotify Premium account**.
- The connection to Spotify is shown under **Library › Spotify**. At the top the status must show **Signed in**. If it shows **Sign-in expires soon**, sign in again with **Sign in again**: Spotify asks for a new sign-in every 6 months.

## Setting up the connection again

If the page shows nothing or an error, go through the **setup wizard** again ([Spotify](../inhalte/spotify.md)):

1. Check the **Spotify app** on developer.spotify.com: **Client ID** and **Client Secret** must match those in the app (**Library › Spotify › Credentials**).
2. The **Redirect URI** that the app shows there (with **Copy**) must be entered in your Spotify app under “Redirect URIs” exactly like this. Otherwise Spotify refuses the sign-in. Under **Which address is in your Spotify app?** you choose `/app/spotify-callback` or, for boxes that were set up before the app, `/spotify.php`. **Why two addresses?** explains this.
3. **Sign in with Spotify**.

If that does not help, **Reset access** (under **Disconnect & reset** on **Library › Spotify**) deletes Client ID, Secret and sign-in. Set up the access again afterwards. The content in the library is kept.

## Playlists do not show up

Smart Sync only takes playlists whose name begins with the **playlist prefix**. Under **Library › Spotify › Sync settings** check whether **Automatic sync** is on, and start it with **Sync now**. If the sync is off there, it does not run at all, not even by hand. Content that is already on the box by hand and is also in a playlist is shown by the page as **Conflicts**.

## Spotify blocks requests

Spotify limits how often an app may ask questions. If that is exceeded, Spotify does not answer for a while until the block has expired. The page then shows **Spotify block** with the time until when it applies. This can happen with very many playlists and changes in quick succession. In that case wait and only then start a new sync.

## One box, one device

If Spotify plays on another device with the same account at the same time, playback may stop there. End playback on the other device and start it again on the box.
