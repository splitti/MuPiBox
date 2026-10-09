# Wi-Fi and LAN

**Settings › Network › Wi-Fi** and **Settings › Network › LAN**. A Wi-Fi can also be set up on the display, see [Settings on the display](../bedienung/eltern-zugang.md).

## Wi-Fi

### Connection and saved networks

The **Wi-Fi** page shows the current **connection** (with the IP address, under **Details** also signal, gateway, DNS and MAC) and the **saved networks**. The box knows any number of networks and connects to the one it finds.

Each saved network has **Address** (fixed IP address, see below), **Password** (the new password if the router got one) and **Remove**.

> [!NOTE]
> The **connected** network cannot be removed, otherwise the box would be offline.

### Adding a network

1. Under **Add network**, tap **Search for networks in range**.
2. Choose your network from the list.
3. Enter the **password** (8 to 63 characters; an open network needs none) and tap **Add**.

A network that does not show its name is entered under **Enter hidden network**: **Network name (SSID)** and **Password** (empty for an open network), then **Add**.

The box stays in the current network and takes the new one when it is in range and better. So it stays reachable even after a typing mistake.

### Fixed IP address

For every saved network a **fixed IP address** can be set via **Address** (**Obtain address**: **DHCP** or **Static**), the others stay on DHCP. In the network the box is currently in, you check the values first with **Test**, without the connection dropping. If the box does not reach its router with the fixed address, it goes back to DHCP and keeps the values for correcting.

### Wi-Fi watchdog

| Setting | Effect |
| --- | --- |
| **Wi-Fi watchdog (DietPi-WiFi-Monitor)** | rebuilds the connection when it drops |
| **Look for the best connection** | switches to the strongest of several saved networks |
| **Restart Wi-Fi** | restarts the Wi-Fi |

### Address and DHCP

**DHCP timeout** makes sure the box waits at most 10 seconds for an IP address at startup. It applies to Wi-Fi and LAN. **Get a new address** renews only the Wi-Fi's address.

### Wi-Fi hardware

The built-in Wi-Fi can be switched off (**Onboard Wi-Fi on**). It can also be switched on again on the display: tap the Wi-Fi symbol at the top of the Wi-Fi page. If it was already off at the start, it is back after a restart – the display offers one. For a **USB Wi-Fi stick** you choose the **USB Wi-Fi driver** (RTL88X2BU or RTL8821AU) and tap **Install driver**. The driver is built on the box, which takes a few minutes. Then restart the box. Once the driver is installed, you set **Power saving for the USB adapter** (**Off**, **Minimum** or **Maximum**). **Off** makes the connection more stable with some adapters.

## LAN (cable)

The **LAN** page belongs to the cable connection:

- **LAN on** switches it on or off. With a cable, LAN has priority over the Wi-Fi,
- the page shows whether a cable is plugged in, and the current address,
- **Obtain address**: **DHCP** or **Static**,
- with **Static** you enter **IP address** and **Subnet mask**. **Router (optional)** and **DNS server (optional)** may stay empty. Without a router the internet stays with the Wi-Fi. That is handy when a PC is connected directly to the box,
- **Save** applies the values, **Restart LAN** restarts the connection,
- **Get a new address** renews only the cable's address.

## The box has a new address

After changing the network or the connection the box usually has a different IP address. Then open the app via `mupibox.local` or the new address ([Opening the app and signing in](../erste-schritte/app-oeffnen.md)). The **Wi-Fi** page shows the address, and the IPv6 address too if there is one.
