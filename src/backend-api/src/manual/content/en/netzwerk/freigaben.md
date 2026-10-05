# Shares and remote control

**Settings › Services › Shares & remote access**

| Service | Purpose |
| --- | --- |
| **Samba (Windows share)** | open the box's media folder as a drive in the home network, to copy media |
| **FTP server** | access via FTP (port 21) |
| **VNC (remote control the display)** | see and operate the display in the browser |

Switching on installs what is still missing. This can take a few minutes. Switching off only stops the service.

## Samba

With Samba the box appears in the network of your Windows PC, Mac or Linux computer. The share is called `mupibox` (on Windows `\\<name or IP of the box>\mupibox`). Sign in with the user `dietpi` and the password `mupibox`. The share shows the box's folder `/home/dietpi/MuPiBox/media`. You copy folders into it as onto a USB stick ([Your own audiobooks and music](../inhalte/lokale-medien.md)).

## FTP

FTP is an older alternative, also for copying files. Switch it on only if you need it, because a service that is not running is also not a point of attack.

## VNC and “Live display”

VNC is needed for the **Remote control (VNC)** under **Settings › Display & controls › Live display**: there you operate the display in the browser, for example when the box stands somewhere you cannot reach the touch display. **Open remote control** shows the display in the page, also full screen or in a new tab. The remote control uses the app's sign-in and needs no password of its own.

> [!WARNING]
> With the remote control anything can be done that is possible on the display. Protect the app with a password ([Password and HTTPS](sicherheit.md)).
