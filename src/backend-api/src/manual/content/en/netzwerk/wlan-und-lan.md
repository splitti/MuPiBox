# Wi-Fi and LAN

**Settings › Network › Wi-Fi** and **Settings › Network › LAN**. The display has the same settings, see [Settings on the display](../bedienung/eltern-zugang.md).

## Wi-Fi

### Connection and networks

The **Wi-Fi** page shows the current **connection**, the **networks in range** (with **Scan again**) and the **saved networks**. The box knows any number of networks and connects to the one it finds.

> [!NOTE]
> The **active** network cannot be removed, otherwise the box would be offline.

### Adding a new Wi-Fi

Enter the **network name (SSID)** and the **password** (8 to 63 characters; an empty password stands for an open network) and tap **Add**. The box stays in the current network and only switches when the new one is reachable. So it stays reachable even after a typing mistake.

### Fixed IP address

For every saved network a **fixed IP address** can be set, the others stay on DHCP. Before saving, the box checks the address in the network it is currently in, without cutting the connection for it.

### Wi-Fi watchdog

| Setting | Effect |
| --- | --- |
| **Wi-Fi watchdog** | rebuilds the connection when it drops |
| **Find best connection** | automatically switches to the strongest of several networks |
| **Restart Wi-Fi** | restarts the Wi-Fi |

### Address and DHCP

**DHCP timeout** makes sure the box does not wait forever for an IP address at start. **Get address again** renews only the Wi-Fi's address.

### Wi-Fi hardware

The built-in Wi-Fi can be switched off (**Onboard Wi-Fi on**). For a **USB Wi-Fi stick** you choose the **driver** (RTL88X2BU or RTL8821AU) and install it. **Power saving of the USB adapter** is off, because the connection is usually more stable without it.

## LAN (cable)

The **LAN** page belongs to the cable connection:

- **LAN on** switches it on or off,
- **Get address**: **DHCP** or **Static**,
- with a fixed address, router and DNS are optional. Without a router the internet stays with the Wi-Fi. That is handy when a PC is connected directly to the box,
- **Get address again** renews only the cable's address.

## The box has a new address

After changing the network or the connection the box usually has a different IP address. Then open the app via `mupibox.local` or the new address ([Opening the app and signing in](../erste-schritte/app-oeffnen.md)). The **Wi-Fi** page shows the address, and the IPv6 address too if there is one.
