# NAS

A **NAS** is a network drive in your home network, for example a router with storage or a Synology device. The box can play audiobooks and music stored there without them taking up space on the memory card.

You set it up under **Library › NAS**.

## Sign-in

First you choose how the box reaches your NAS:

- **Windows share (SMB)**: the way a Windows PC reaches the NAS. Synology, QNAP, a FRITZ!Box with USB storage and a Windows PC with a shared folder do this without further setup. For most people this is the easiest way.
- **WebDAV**: a WebDAV server has to run on the NAS for this (on Synology for example port 5005, for HTTPS 5006).

| Field | Meaning |
| --- | --- |
| **Share** (SMB) | the share as in Windows Explorer, for example `\\192.168.1.10\Musik`; `smb://192.168.1.10/Musik` works too. With a subfolder after it, the page opens the folder tree there |
| **Domain** (SMB) | mostly empty; only when the NAS belongs to a Windows domain |
| **Server (address:port)** (WebDAV) | address of the NAS with the WebDAV port, for example `192.168.1.10:5005` |
| **HTTPS** (WebDAV) | connect encrypted |
| **User** and **Password** | the login details for the NAS |
| **Remember sign-in** | without this switch the box forgets the password at the next restart, and the NAS tab is empty then; it is stored encrypted |

**Sign in** connects the box to the NAS. After that the page shows share or server, user and status. **Different sign-in** switches to another NAS or account, **Sign out** disconnects.

> [!TIP]
> With SMB, use the **IP address** of the NAS. The box often does not know a device's Windows name (for example `\\NAS`); a name with `.local` or `.fritz.box` mostly works.

Good to know with SMB:

- At the first sign-in the box sets up SMB (the package `cifs-utils`). This takes a minute or two and needs internet.
- The box uses SMB2 and SMB3. The app tells you when a NAS only speaks the old SMB1; then switch on SMB2 or SMB3 on the NAS.
- In the folder tree the share is the top folder. Folders you chose before over WebDAV on the same NAS stay chosen when they are in this share.
- When the NAS stops answering, the box plays the downloaded folders from the memory card and tries again after half a minute.
- A cover you choose in the app for a NAS folder is put into the folder over SMB too, when the user may write there.

## Choosing folders

After signing in, the box shows the NAS's folders as a tree. For every folder you decide:

- **Show**: appears on the box. You choose where: in the NAS tab or in Audiobooks, Music or Radio & podcasts, next to the content from the memory card and Spotify.
- **Hide**: stays hidden, including everything below it.
- **Download**: is copied to the memory card so that it also plays without the NAS.

Useful for this:

- The search field **Search folders across the whole NAS** also finds folders deep in the tree. For this the box needs a search index; **Update index** reads the folders in again if something has changed on the NAS.
- **Search in** sets below which folders the search index looks, for example only "Hörspiele". Without a choice it is the whole NAS; on a big NAS the index then takes long (over SMB half an hour and more for 40,000 folders). The choice belongs to the profile.
- **Show only the selection** lists only the folders you have shown, hidden or marked for download.
- **Show all**, **Show none**, **Download all** and **Download none** mark quickly.

With **Save selection** you apply the choice. **Download selected** copies the folders marked for download to the memory card; a bar shows the progress, **Cancel download** stops it. **Reload cover** fetches the covers again.

> [!NOTE]
> Before downloading, the box checks that everything fits on the memory card. If a download breaks off, run **Download selected** again: files that are already complete on the box are skipped. A folder only plays without the NAS once it has been downloaded completely.

## Profiles

A **profile** remembers the folder selection (show, hide, download) for one NAS and account, not the password. **Save selection as profile** creates a new one, for example one per child. With the button next to a profile you switch to its selection, **Delete** removes it. The default profile always stays.

On the display the shown folders appear in the **NAS** tab or in the category you chose. You can hide the NAS tab if you like ([The start page](../bedienung/startseite.md)).

Photos from the NAS are chosen separately under **Library › Photos** ([NAS folders](../fotos/nas-ordner.md)).
