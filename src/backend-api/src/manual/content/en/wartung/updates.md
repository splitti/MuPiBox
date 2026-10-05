# Updates

**Settings › System › Updates**

## MuPiBox

The page shows the **installed version** and the available versions from the official MuPiBox repository (splitti/MuPiBox) in three channels:

| Channel | For whom |
| --- | --- |
| **Stable** | the tested version for everyday use |
| **Beta** | newer features, still being tried out |
| **Development** | the development version. At your own risk |

Tap **Install** at the channel you want (or **Reinstall** if this version is already on the box). While the update runs, the page shows the progress and the display shows the maintenance screen ([Covers and themes](../bedienung/cover-und-themes.md)). The box cannot be used for 10 to 30 minutes and then restarts by itself. Settings and library are kept.

> [!WARNING]
> **Make a backup first** ([Backup](backup.md)). The **development version can damage the installation.** For an update make sure the box is not interrupted: power and Wi-Fi must hold until the end. Ideally the box is on the power supply.

### If an update goes wrong

Before every update the box saves settings, library and covers on the memory card: in `/home/dietpi/mupibox-backups/before-update-….zip` (the newest three are kept). If already the download or the unpacking of the new version fails, the previous installation stays. Apart from that there is no complete rollback to the old state. If an update stops, the page shows under **Output** what happened.

## News

What is new in each version is under **Settings › System › About the box › News**.

## Operating system

Under **Operating system**, **Update operating system** updates the system's packages (DietPi, the system underneath the MuPiBox). On older Raspberry Pis this takes **up to 30 minutes**. The box keeps running and does **not** restart by itself. When the update is done, tap **Restart box**.

> [!WARNING]
> Here too: **always make a backup first.**
