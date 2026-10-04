# Password and HTTPS

**Settings › Security**

## Password

Under **Password & sign-in** you set the password for the whole app. It applies on the phone as on the PC.

| Action | Note |
| --- | --- |
| **Change password** | enter the current and the new password, at least 6 characters |
| **Remove password** | the app is then reachable without a password, but only in the home network |
| **Require sign-in** | additionally protects the box's display page and interface against access from the network. Takes effect at once |

Signing in also works without a password: by **QR code on the display** (long-press the status indicator, see [Settings on the display](../bedienung/eltern-zugang.md)) or with a **link via Telegram** ([Telegram](telegram.md)). The page also shows the **signed-in devices**.

> [!NOTE]
> The box's own display, its scripts and the Telegram bot run on the box and are never affected by the sign-in. It only hinders access from other devices in the network.

## Encryption (HTTPS)

Without HTTPS, password and entries travel unencrypted through your home network. The page **Settings › Security › Encryption (HTTPS)** takes care of the secure connection.

### Certificate

The box creates a **certificate of its own** and renews it in good time itself (a service checks this daily). Alternatively you upload a **certificate of your own**. The box then reminds you before it expires. If a custom certificate is valid for none of the addresses under which the box is currently reachable, the page warns: the browser reports a warning there.

### Trusting the certificate

Because the certificate comes from the box itself and not from a public authority, the browser warns on the first visit. The page shows at the top whether **this device trusts the box** and whether it is connected securely. If it does not trust it yet, you install the certificate **once** on the device. The page explains the steps for **Android**, **iPhone/iPad**, **Windows** and **Mac**, each with **Load certificate**. After that the browser no longer warns.

### Secure connection only

With **Redirect http to https** the app always opens via https, also via the QR code on the display and via Telegram links. The switch can only be turned on once your device trusts the box. Otherwise you would lock yourself out.

### Installing the app

With a secure connection the app can be **installed like an app**: Android installs it directly if you wish, on the iPhone you choose “Add to Home Screen”. After that it starts without an address bar.
