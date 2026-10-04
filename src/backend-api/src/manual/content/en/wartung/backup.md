# Backup

**Settings › System › Backup**

## Backing up

| Kind | Content |
| --- | --- |
| **Configuration backup** | the covers, the configuration (`mupiboxconfig.json`) and the list of content (`data.json`) |
| **Full backup** | additionally **all media files**. Can become very large |

Both download as a file to your PC or phone. Do not keep them only on the box itself.

## Restoring

Under **Restore** choose the **backup file** and tap **Restore backup**.

> [!WARNING]
> Restoring **overwrites** the current configuration and the content. It is meant as a way back when something is broken, not as a change during operation.

## When to back up

- **before every update** ([Updates](updates.md)),
- before changes with the JSON editor ([System and expert settings](system.md)),
- after larger changes to the library,
- before moving the box to a new memory card.

> [!NOTE]
> The configuration backup contains the settings **including** the access data stored in them. Do not hand the file out, and do not attach it to an error report. For error reports there is the [problem report](problem-melden.md), which leaves out passwords and keys.
