# Settings on the display

A few things can be set directly on the display, without a phone. They are meant for parents and therefore not openly visible.

## Opening the settings

Press and hold the **status indicator** at the top right of the display (the symbols for Wi-Fi, battery and the like). The hold time can be set from 1 to 10 seconds under **Settings › Display & controls › Controls on the display › Hold times › Hold time for settings access**. Below 3 seconds children easily get in.

The settings on the display open with four tiles, labelled in the box's language (**Settings › System › Language**; English when none is chosen):

| Tile | Effect |
| --- | --- |
| **Network** | set up Wi-Fi and LAN (see below) |
| **Bluetooth** | pair headphones and speakers ([Bluetooth](../hardware/bluetooth.md)) |
| **Restart / Shut down** | restart the box or switch it off |
| **Parent web app** | shows the QR code for the app |

At the top you see the box's hostname and IP address.

![The settings on the display](display-settings.png)

## During a quiet time or after the daily limit

The lock screen ("Quiet time", "That's enough music for today") also shows the status indicator with Wi-Fi and battery at the top right, and the **time** at the top left. Press and hold the status indicator as usual: the lock screen steps back and the settings open. This way you reach the Wi-Fi and the QR code for the app while the box is locked.

The **lock still applies**: the box plays nothing while the quiet time runs or the limit is reached. A note at the bottom says so. When you go back to the start page, or do not touch the display for 2 minutes, the lock screen is back. You can only lift the lock in the app or through Telegram ([Instant actions](../spielzeit/schlaftimer.md)).

![The lock screen with time, Wi-Fi and battery](display-locked.png)

If **"Time not synchronised"** shows under the time, the box has not fetched the time from the network since it was switched on. The Raspberry Pi has no clock of its own: without a network it carries on from the time it was switched off, and a quiet time or the limit from back then may still apply. On the road, your phone's hotspot helps:

1. Switch on the hotspot on your phone.
2. Press and hold the status indicator on the display and connect the box to the hotspot under **Network**.
3. The box fetches the time. If the lock no longer applies, it goes away by itself.
4. If it still applies, tap **Parent web app**, scan the QR code (the phone is in the same network) and tap **Lift lock** in the app.

## The QR code for parents

Tap **Parent web app**. A **QR code** appears. Scan it with your phone: you are then signed in to the [app](../erste-schritte/app-oeffnen.md), even without a password. You change the text next to the QR code under **Settings › Appearance › Text on the display**.

## Network settings

The **Network** tile opens the network settings. If there is a LAN port, you choose between **WiFi** and **LAN** at the top (the LAN settings are also there when no cable is plugged in).

### Wi-Fi

- At the top you see the current network with the box's IP address. **Renew address** gets a new IP address, for this connection only.
- The list shows saved and found networks. **Scan** searches again, **Add network** enters a network by hand, for example a hidden one.
- A network that is not saved yet has **Connect**. It asks for the password and saves the network.
- Saved networks have three buttons: **Address** sets a **fixed IP address** for this network (the others stay on DHCP; if the box is in this network right now, **Test** checks the address before saving), **Change** changes the password, **Delete** removes the network.

The same settings, with more room, are in the app: [Wi-Fi and LAN](../netzwerk/wlan-und-lan.md).

> [!NOTE]
> If you change the Wi-Fi, the box stays in the current network until the new one is reachable. After that it is in another network and has another IP address. Then open the app via the new address or via `mupibox.local`.

## Symbols in the status indicator

The status indicator shows at a glance whether the box is on Wi-Fi and how full the battery is (with MuPiHAT, see [Battery, MuPiHAT and power button](../hardware/strom.md)). If the Wi-Fi symbol is missing although the box is connected, [More cases](../fehlerbehebung/weitere-faelle.md) helps.
