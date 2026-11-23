# Backup

**Settings › System › Backup**

## Backing up

| Kind | Content |
| --- | --- |
| **Configuration backup** | the settings (`mupiboxconfig.json`), the library (`data.json`), your own covers and the settings of the installed [extensions](../erweiterungen/index.md) (such as the pins of the buttons or the place of the weather) |
| **Full backup** | additionally **all media on the SD card** and the uploaded photos and videos ([Photos](../fotos/hochladen.md#backup)). Can be several GB in size and take a while |

Tap **Download** next to the kind you want. The file lands on your PC or phone. Do not keep it only on the box itself.

## Restoring

Under **Restore** tap **Choose backup file**, choose the file and tap **Restore backup**. This works with backups of this app and of the former admin interface (up to MuPiBox 5.0). Afterwards the box restarts.

The extensions themselves are not in the backup, only their settings. If extensions are missing on the box after restoring, the app names them: install them again under **Settings › System › Extensions**, and their settings are already there. A backup of MuPiBox 5.1 cannot be restored on a box with 5.0; update the box first.

> [!WARNING]
> Restoring **overwrites** the current settings and the library. It is meant as a way back when something is broken, not as a change during operation.

## When to back up

- **before every update** ([Updates](updates.md)),
- before changes with the JSON editor ([System and expert settings](system.md)),
- after larger changes to the library,
- before moving the box to a new memory card.

> [!NOTE]
> The configuration backup contains the settings **including** the passwords and access data stored in them. Do not hand the file out, and do not attach it to an error report. If you need help, use the **support info** under **About the box**: it leaves out passwords, tokens and accounts ([Logs and status](protokolle.md)).
