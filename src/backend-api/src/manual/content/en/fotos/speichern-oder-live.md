# Photo services: keep or live

For albums from [Immich](immich.md), [Synology Photos](synology-photos.md), [Nextcloud](nextcloud.md), [PhotoPrism](photoprism.md) and [iCloud](icloud.md), **Keep photos on the box** on the service's page decides how the box handles the photos.

| | On (default) | Off (live) |
| --- | --- | --- |
| Where the photos are | in display size on the memory card | at the service; the box fetches each photo when it is shown |
| Without a network | everything is there | the album shows **Not there right now** |
| Room on the card | up to the limit under **Cache** | only the photos shown last, at most 200 MB |
| Videos | yes | Immich, PhotoPrism and iCloud: yes, straight from the service; Synology Photos and Nextcloud: no |

Live is worth it with fast Wi-Fi and large albums that should not fill the card.

## Sync

The box regularly looks for new, changed and deleted photos and takes over changed album names. How often is set by **Sync › Interval** (every 15 minutes to daily, or only by hand). **Sync now** looks at once, and **Cancel sync** stops a running sync. The photos fetched so far stay.

The line at the top of the page shows the state:

| Line | Meaning |
| --- | --- |
| **Synced** … | everything taken over |
| **Syncing** | busy, with progress |
| **Not reachable for** … | the service does not answer; the box keeps showing what it has and tries again after 15 minutes at the latest (except with **Only by hand**) |
| **Sync interrupted · trying again shortly** | the service had a fault in the middle of the sync; the rest comes with the next try |
| **Key refused** / **Sign-in refused** | enter the key or the sign-in again |

When the **Cache** is full, the box loads no more photos and shows a note. Then raise the limit or choose fewer albums.

## Albums from a service

Adding or deleting photos or renaming an album happens in the service itself. The box takes over changes at the next sync. If an album chosen no longer exists (or is no longer shared), the page says so.

**Disconnect** removes the service's albums and their photos from the box. Everything stays in the service.
