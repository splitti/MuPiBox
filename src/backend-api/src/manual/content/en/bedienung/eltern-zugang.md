# Settings on the display

A few things can be set directly on the display, without a phone. They are meant for parents and therefore not openly visible.

## The QR code for parents

Press and hold the **status indicator** on the display (the symbols for Wi-Fi, battery and the like). The hold time can be set from 1 to 10 seconds under **Settings › Display & controls › Controls on the display › Hold time for settings access**. A **QR code** appears.

Scan it with your phone: you are then signed in to the [app](../erste-schritte/app-oeffnen.md), even without a password. You change the text next to the QR code under **Settings › Appearance › Text on the display**.

![The settings on the display](display-settings.png)

## Network settings

The display has its own **Network settings**. At the top you choose between **Wi-Fi** and **LAN** (the LAN settings are also there when no cable is plugged in).

### Wi-Fi

- The list shows saved and found networks.
- **Connect** switches to that network at once. If the network is not saved yet, the box first asks for the password.
- **Change PW** changes the password of a saved network.
- **Renew address** gets a new IP address, for this connection only.
- For every saved network a **fixed IP address** can be set, the others stay on DHCP. Before saving, the box checks the address in the current network.

The same settings, with more room, are in the app: [Wi-Fi and LAN](../netzwerk/wlan-und-lan.md).

> [!NOTE]
> If you change the Wi-Fi, the box stays in the current network until the new one is reachable. After that it is in another network and has another IP address. Then open the app via the new address or via `mupibox.local`.

## Symbols in the status indicator

The status indicator shows at a glance whether the box is on Wi-Fi and how full the battery is (with MuPiHAT, see [Battery, MuPiHAT and power button](../hardware/strom.md)). If the Wi-Fi symbol is missing although the box is connected, [More cases](../fehlerbehebung/weitere-faelle.md) helps.
