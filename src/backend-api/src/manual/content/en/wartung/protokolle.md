# Logs and status

## Box health

**Settings › System › Box health** shows at a glance whether everything is in order: **Storage space**, **Temperature**, **Power supply**, **SD card**, **Memory (RAM)**, **Box services**, **Internet**, **NAS**, **Spotify login**, **Certificate (HTTPS)** and **Saved podcast episodes**. If something is wrong, it says what to do. **Check again** checks once more.

Similar things are on the **About the box** page: **version**, **hostname**, **uptime**, **CPU load**, **temperature**, **memory** and the space on the **SD card**. Below it a **history** of the last 1, 6 or 24 hours shows how the values have developed. It is measured once a minute, only in the box's memory. After a restart the history starts over.

## Logs

**Settings › System › Logs** shows the box's log files and the status of its services.

1. Under **Log or service** choose an entry: a **log**, or a service under **Services (status)**. The logs are those of the server (`server-out.log`, `server-error.log`), the player (`spotify-control-out.log`, `spotify-control-error.log`), the automatic shutdown (`idle_shutdown.log`) and the shutdown button (`shutdown_control.log`).
2. With **Search** you filter for a term.
3. **Refresh** reloads, **Follow along** keeps showing new lines (**Pause** stops that), **Download** saves the chosen entry.

### Troubleshooting

With **Detailed player log** the player writes much more into its log (`spotify-control`). The player restarts for this. Switch it on only if you are on the trail of a problem, and off again afterwards, because it fills the logs.

## Support info for getting help

If you need help, for example on [Discord](https://discord.gg/4EjCgpCbbe), tap **Download support info** under **Settings › System › About the box › Support**. The zip contains the library (`data.json`), the settings without passwords, tokens and accounts, the state of the display and the network, and the versions. Logs are not included: download them under **Logs** with **Download** if needed.

## The logs spare the SD card

By default the logs of the server and the player end up on the memory card. If you want to spare it, switch on **PM2 logs in RAM** under **System options**. The logs are then lost on restart ([System and expert settings](system.md)).
