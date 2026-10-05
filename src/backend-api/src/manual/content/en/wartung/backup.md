# Backup

**Settings › System › Backup**

## Backing up

| Kind | Content |
| --- | --- |
| **Configuration backup** | the settings (`mupiboxconfig.json`), the library (`data.json`) and your own covers |
| **Full backup** | additionally **all media on the SD card**. Can be several GB in size and take a while |

Tap **Download** next to the kind you want. The file lands on your PC or phone. Do not keep it only on the box itself.

## Restoring

Under **Restore** tap **Choose backup file**, choose the file and tap **Restore backup**. This works with backups of this app and of the admin interface. Afterwards the box restarts.

> [!WARNING]
> Restoring **overwrites** the current settings and the library. It is meant as a way back when something is broken, not as a change during operation.

## When to back up

- **before every update** ([Updates](updates.md)),
- before changes with the JSON editor ([System and expert settings](system.md)),
- after larger changes to the library,
- before moving the box to a new memory card.

> [!NOTE]
> The configuration backup contains the settings **including** the passwords and access data stored in them. Do not hand the file out, and do not attach it to an error report. If you need help, use the **support info** under **About the box**: it leaves out passwords, tokens and accounts ([Logs and status](protokolle.md)).
