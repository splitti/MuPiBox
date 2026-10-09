# MQTT and Home Assistant

Over **MQTT** the box reports its state to a broker in your home network and can be controlled through it. With **Home Assistant** the box sets itself up there. The settings are under **Settings › Services › MQTT / Home Assistant**.

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

## Home Assistant

With **Report to Home Assistant** the box creates its devices in Home Assistant by itself (MQTT discovery). The **discovery prefix** must match what is set in Home Assistant (there it is normally called `homeassistant`).

> [!TIP]
> If you do not need Home Assistant, you can still use MQTT: for example to integrate state and control into a smart-home system of your own.
