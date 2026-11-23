# Installing and managing

The page **Settings › System › Extensions** shows the installed extensions as cards and, after them, what else the catalog offers. You can only reach it when signed in as a parent.

## Installing from the catalog

1. Open **Settings › System › Extensions**. The box fetches the catalog from the internet (GitHub).
2. Tap **Install** on the extension you want.
3. The app shows **what the extension sets up on the box** (for example access rights for a device, a service or a package) and **what it needs** (ports, GPIO pins, services). Confirm.

The box downloads the file, checks its checksum and installs it. After that the player, the server and the display restart briefly. **Playback stops when that happens**; the app tells you beforehand.

> [!NOTE]
> If the catalog cannot be reached, the box needs the internet. Installed extensions keep running without it.

## The test before installing

Before anything is installed, the box checks whether what the extension needs is still free: ports, GPIO pins and services. It compares with the box itself (power button, LED, fan, rotary knob, MuPiHAT), with the boot configuration (for example the sound card), with the other extensions and with what is running right now.

If something clashes, **nothing is installed**, and the app says who holds the port or pin. The same test runs when you switch a switched-off extension back on.

## Settings of an extension

From the card of an extension you open its details with the settings. Switches and choices are saved at once, text fields with **Save**.

Some extensions have a **page of their own**: it is then listed under **Settings › System** right after **Extensions**, and the card leads there with **Go to the settings**. [Buttons & GPIO Input](buttons.md) is one of them.

## Switching on and off, removing, updating

| Action | Effect |
| --- | --- |
| **Switch on the card** | switches the extension off or on again. Its settings are kept |
| **Remove** | deletes the extension. The box takes away again what it set up for it (access rules and services; groups and packages stay, because others may need them) |
| **New version** | if the catalog has a newer version, the card says so. If an update fails, the box restores the version before |

Here too the player, the server and the display restart briefly.

## Your own files: developer mode

An extension is a single file ending in `.mpx`. Normally it comes from the catalog. If you build one yourself or have a file from another source, switch on **Developer mode** on the page. Then there is the button **Upload file**:

1. Switch on **Developer mode** and confirm the warning.
2. Tap **Upload file** and choose the `.mpx` file (16 MB at most).
3. The box checks the file but installs nothing yet: the app shows the name, the version, what is set up and the checksum (SHA-256).
4. Confirm with **Install**.

> [!WARNING]
> An extension can do anything on the box, also as administrator. Only upload files you built yourself or whose source you trust. Switch developer mode off again afterwards.

How to build an extension is described in the guideline for developers in the repository (`extensions/README.md`).

## After an update of the MuPiBox

An extension is kept in your data (`~/.mupibox/data/extensions/`), not in the program of the box. An update of the MuPiBox leaves it alone, with its settings and data.

But after the update the box is another one: it may no longer accept the description of the extension, or a pin may be taken now. So **the box checks every extension that is on at every start**:

- The description (`manifest.json`) is there and is accepted, and the extension is not made for a newer MuPiBox.
- The files it names are there.
- The pins and ports it needs are not held by the box or by another extension. If two extensions want the same, the one installed last gives way.
- Its program can be started, and it has not crashed the box several times in a short time.

If an extension fails the check, **the box switches it off** and keeps the reason. Everything else keeps running. The next time you open the app a hint appears, and the card of the extension under **Settings › System › Extensions** has a yellow box with the cause (below it, in brackets, the technical line you can pass on in a bug report).

What you can do:

- **Remove the cause** (update the MuPiBox or the extension, install the extension again, free the pin that is taken twice) and tap **Try again**. That switches the extension on again; the box checks once more.
- **Remove** the extension if you do not need it any more.

**A pin is taken?** If the cause is a pin you chose in the settings of the extension (a button on a pin that the MuPiBox HAT needs for itself now, say), the app asks after **Try again** what should happen:

- **Move to a free pin**: the box looks for the lowest free pin (from GPIO 4 on, leaving out the serial port GPIO 14 and 15), enters it in the settings and switches the extension on. Then the app shows you which pin was changed to which. **Connect the device (the button, say) to this new pin.**
- **Remove connection**: the pin is set to "none" and the extension is switched on. The button then does nothing until you choose a pin in the settings.

After that the services of the box restart. If something other than a pin is taken (a port, a service, a pin the extension fixes itself), the app only shows the overlap and you have to remove it yourself.

If you switch an extension off or on yourself, the hint is gone.

## If something does not work

- **"Something else is running right now"**: an extension is already being installed or removed. Wait until that is done.
- **The installation reports a clash**: the app names the port or pin and who holds it. Free it there (for example by moving the fan to another pin) and try again.
- **An extension is missing in the catalog**: not every extension is in the catalog. You install a `.mpx` file from another source in developer mode.
