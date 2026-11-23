# When photos are missing

| What you see | Why | What to do |
| --- | --- | --- |
| No **Photos** tab on the display | photo display off, or no album visible | switch it on under **Settings › Photos**; set an album to **Visible on the display** under **Library › Photos** |
| iPhone photos (HEIC) are not taken | the converting program is missing | **Try again** under **Settings › Photos** (needs the internet) |
| Clips are missing | **Show videos** is off, or the clip is longer than 3 minutes | switch videos on; take shorter clips |
| A clip shows **Being prepared** for long | the box is still converting it | wait; 4K clips take longer on the Raspberry Pi |
| NAS folders: "no photos found" | the box's account lacks read rights on the NAS | give read rights for the folders **and** the files in them |
| An album shows **Not there right now** | an album shown live, and the service cannot be reached | check Wi-Fi and the service, tap **Try again**, or switch on **Keep photos on the box** |
| Immich: **Permissions missing** | the API key lacks permissions | create a new key with `album.read`, `asset.read`, `asset.view` |
| Synology: **Synology Photos not allowed** | the account may not use the app | allow it in DSM under **User & Group › Edit › Applications** |
| Synology: **Box blocked by DSM** | too many failed attempts | unblock it in DSM under **Security › Protection › Auto Block** |
| Nextcloud: **Photos app missing** | the Photos app is off in the Nextcloud | enable it in Nextcloud under **Apps** |
| Note "the cache is full" | the limit for kept photos is reached | raise the limit or choose fewer albums/folders |
| **The pictures are taking a break** | the picture time for today is used up | **+10 min** or **Free today** under **Playtime › Picture time** ([Picture time](bildzeit.md)) |

See also [Other cases](../fehlerbehebung/weitere-faelle.md).
