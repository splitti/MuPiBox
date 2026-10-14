# MQTT and Home Assistant

Over **MQTT** the box reports its state to a broker in your home network and can be controlled through it. With **Home Assistant** the box sets itself up there (MQTT discovery). The settings are under **Settings › Services › MQTT**.

> [!TIP]
> For Home Assistant there is also a way without a broker and with more functions (announcements, messages on the display): the direct pairing under [Home Assistant](home-assistant.md). Use only one of them, or the box shows up twice.

## Connection

| Setting | Meaning |
| --- | --- |
| **MQTT active** | switches the connection on (off after installation) |
| **Device name** | the name under which the box appears |
| **Broker** | address of the MQTT broker |
| **Port** | the broker's port, 1883 is usual |
| **Topic** | common beginning of all the box's topics |
| **Client ID** | the box's identifier at the broker |
| **User** and **Password** | if the broker requires them |

## Intervals

| Setting | Effect |
| --- | --- |
| **Update (playback)** | how often the box reports during playback, 1 to 90 seconds |
| **Update (idle)** | how often it reports when nothing is playing, 1 to 90 seconds |
| **Timeout** | waiting time for the broker, 10 to 180 seconds |

## Topics

All topics begin with the topic and the client ID, and the client ID appears twice. With topic `MuPiBox/Kidsroom` and client ID `MuPiBox`, for example, the box reports under `MuPiBox/Kidsroom/MuPiBox/MuPiBox/state`.

| Topic (after the beginning) | Content |
| --- | --- |
| `state` | `online`, or `offline` as soon as the box is no longer connected |
| `volume` | volume in percent |
| `play_text` | what is playing |
| `bat_soc`, `vbat`, `charger_status` | battery level, battery voltage, charging state (with MuPiHAT) |
| `temperature`, `ssid`, `signal_quality` | CPU temperature, WiFi, reception |

The box can be controlled over the same topics with `/set` at the end:

| Topic | Value | Effect |
| --- | --- | --- |
| `volume/set` | number, e.g. `20` | volume, at most up to the configured maximum volume |
| `play/set` | `play` | resume playback |
| `pause/set` | `pause` | pause |
| `take_screenshot/set` | `take_screenshot` | picture of the display under `screenshot` |
| `reboot/set` | `reboot` | restart |
| `power/set` | `shutdown` | shut down |

## Home Assistant

With **Report to Home Assistant** the box creates its devices in Home Assistant by itself (MQTT discovery). The **discovery prefix** must match what is set in Home Assistant (there it is normally called `homeassistant`).

> [!TIP]
> If you do not need Home Assistant, you can still use MQTT: for example to integrate state and control into a smart-home system of your own.
