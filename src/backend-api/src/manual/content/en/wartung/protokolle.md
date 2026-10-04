# Logs and status

## Box health

**Settings › System › Box health** shows at a glance whether everything is in order: **memory**, **temperature**, **power**, **SD card**, the running **services** and the **sign-ins**.

Similar things are on the **About the box** page: **version**, **hostname**, **uptime**, **CPU load**, **temperature**, **memory** and the space on the **SD card**. Below it a **history** of the last 1, 6 or 24 hours shows how the values have developed. It is measured once a minute, only in the box's memory. After a restart the history starts over.

## Logs

**Settings › System › Logs** shows the box's log files and the status of its services.

1. Under **Log or service** choose a file: a **log** (for example from automatic shutdown), a **PM2 log** (the messages of the server and the Spotify player) or the **status** of a service.
2. With **Search (grep)** you filter for a term.
3. **Refresh** reloads, **Pause** freezes the view, **Download** saves the file.

### Troubleshooting

With **Controller debugging** the player writes more detailed logs. Switch it on only if you are on the trail of a problem, because it fills the logs. **Download PM2 log** saves the services' log.

> [!TIP]
> If you want to report a problem, you do not need to collect the logs yourself: the [problem report](problem-melden.md) packs the end of the logs for you.

## The logs spare the SD card

By default the services' logs end up on the memory card. If you want to spare it, switch on **PM2 logs in RAM** under **System options**. The logs are then lost on restart ([System and expert settings](system.md)).
