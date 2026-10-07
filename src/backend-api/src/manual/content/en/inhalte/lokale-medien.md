# Your own audiobooks and music

Files that are stored on the box's memory card also play without internet. There are two ways to get them there.

## Upload from the app

**Library › Upload from device**:

1. Choose the **category**: Audiobooks, Music or Radio & podcasts.
2. Enter **Artist** and **Album**. The box builds the folders from these.
3. Choose the files with **Choose track**, **Choose folder** or **Choose cover**, or drag files and folders onto the window.
4. Tap **Upload**. A bar shows the progress, below it you see how much space is free on the memory card.

The tracks are copied to the memory card and then appear on the display by themselves.

## Copy over the network

Switch **Samba** on (**Settings › Services › Shares & remote access**), then the memory card can be opened in your home network as a drive. You then copy folders as onto a USB stick. Alternatively there is an FTP server, which you switch on if you need it ([Shares and remote control](../netzwerk/freigaben.md)).

> [!NOTE]
> This way you create the folders yourself. If you stick to “Artist/Album/Track”, the box sorts them in neatly. The app's upload page takes care of creating the folders for you.

## Download from the box

Under **Library › SD card** you get content back from the box, for example onto your phone or for a backup:

- In an **album** every track is listed with its size and a download button. **Download album as ZIP** gets the whole album.
- In a **folder** the number of tracks and the size of each album are shown. **Download folder as ZIP** gets everything in it, with subfolders and covers.

The box packs the ZIP while it is downloaded, without compressing it. So the Raspberry Pi has hardly anything to do, and the box keeps playing meanwhile. From about 1 GB on the app asks first, as that takes a while over WiFi and needs that much room on the device. Content from Spotify or the NAS cannot be downloaded here.

## Covers for your own files

If a picture lies in the album folder or is embedded in the files, the box uses it as the cover. Otherwise it can look for an online cover or shows the theme's placeholder picture ([Covers](cover.md)).

## Space on the card

Your own media take up space on the memory card. How much is free is shown under **Settings › System › About the box**. If space gets tight, move media to a [NAS](nas.md) or use Spotify.
