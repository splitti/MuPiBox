# Immich

[Immich](https://immich.app) is a photo service you run yourself, on a NAS or home server for example. The box shows your Immich albums and all albums shared with your account. It needs Immich 1.106 or later.

## Creating an API key

1. Open Immich in the browser and sign in.
2. Profile picture at the top right › **Account Settings** › **API Keys** › **New API Key**.
3. Enter the name "MuPiBox". If Immich asks for permissions, tick only these: `album.read`, `asset.read` and `asset.view`. With `user.read` the test also shows your account name. For albums of people also `person.read`, for the memories `memory.read`.
4. Copy the key at once: Immich shows it only once.

## Connecting

Under **Library › Photos › Connect a photo service › Immich**, an assistant leads through four steps:

1. **Address**: the address of your Immich with its port, for example `http://192.168.1.20:2283`.
2. **Key**: paste the API key.
3. **Test**: the box checks server, version, key and permissions and shows the account, the albums and the number of photos and videos.
4. **Albums**: tick the albums that are to appear on the display and tap **Done**.

The key is kept encrypted on the box and never shown again. It applies only to the address it was entered for.

| Message in the test | What to do |
| --- | --- |
| **Server not reachable** | check address and port; the box must reach Immich in the home network |
| **Key invalid** | copy the whole key, or create a new one |
| **Permissions missing** | create a key with `album.read`, `asset.read` and `asset.view` |
| **Immich version too old** | update Immich |

## People, favourites and memories

In the last step (**Albums and people**) there is more than the albums:

- **People**: people Immich recognises by their faces and who have a name there. Every person you tick becomes an album of its own; a **shared album** of two or three people shows the photos they are all on. On the display the face is in front. Needs `person.read`.
- **Favourites**: all photos with a heart in Immich.
- **Memories**: the photos Immich shows as a memory today – "a year ago today" and more, and in the days before a birthday the photos of that person. The album is new every day; the box syncs it shortly after midnight. On days without a memory it is not on the display. Needs `memory.read`.

People and favourites can have a great many photos: **Pictures per person album** limits them; if there are more, the box picks evenly from all years.

On the Immich page you then change albums, sync, cache, address and key. Whether the box keeps the photos or fetches them live is explained under [Photo services: keep or live](speichern-oder-live.md).
