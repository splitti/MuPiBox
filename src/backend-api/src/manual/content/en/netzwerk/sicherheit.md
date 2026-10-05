# Password and HTTPS

**Settings › Security**

## Password

Under **Password & sign-in** you set the password for the whole app. It applies on the phone as on the PC, and also to the previous admin interface.

| Card | What you do there |
| --- | --- |
| **Password** | **Set password** (the first time) or **Change password**: enter the current password and the new one twice, at least 6 characters. A new password signs out all other devices |
| **Sign-in** | **Require sign-in**: the app asks for the password in the home network. This additionally protects the box's display page and interface against access from the network. Takes effect at once and can only be switched on once a password is set |
| **Signed-in devices** | the devices that are currently signed in. You sign out single ones with **Sign out**, all except this one with **Sign out all others** |

If the card shows **Default password**, the password from the admin interface still applies. Then set one of your own.

Signing in also works without a password: by **QR code on the display** (long-press the status icons at the top, see [Settings on the display](../bedienung/eltern-zugang.md)) or with a **link via Telegram** (`/login`, see [Telegram](telegram.md)).

**Forgot your password?** Get into the app via the QR code or Telegram. After that a new password can be set without the old one for 10 minutes.

> [!NOTE]
> The box's own display, its scripts and the Telegram bot run on the box and are never affected by the sign-in. It only hinders access from other devices in the network.

## Encryption (HTTPS)

Without HTTPS, password and entries travel unencrypted through your home network. The page **Settings › Security › Encryption (HTTPS)** takes care of the secure connection.

### Certificate

The box has a **certificate of its own**. It checks it at every start and once a day and renews it in good time itself, also when its address has changed. Nothing has to be installed again on the devices for this. Alternatively you upload a certificate of your own with its key under **Own certificate (advanced)**. The box then reminds you before it expires. If your own certificate is valid for none of the addresses under which the box is currently reachable, the page warns: the browser reports a warning there. **Back to the box certificate** puts the box's own certificate back in place.

### Trusting the certificate

Because the certificate comes from the box itself and not from a public authority, the browser warns on the first visit. The page shows at the top whether **this device trusts the box** and whether it is connected securely. If it does not trust it yet, follow the steps under **Make this device trust the box** once: **Download certificate**, **Install on the device** (with instructions for **Android**, **iPhone / iPad**, **Windows** and **Mac**) and **Open via https**. After that the browser no longer warns.

### Secure connection only

With **Redirect http to https** the app always opens via https, also via the QR code on the display and via Telegram links. The switch can only be turned on once your device trusts the box. Otherwise you would lock yourself out. Excluded are the box's display and port 8200: there the app can always be reached via http.

### Address for links

Under **Address for links** you set the name that the QR code and Telegram links use for the box. Empty means the box's IP address.

### Installing the app

With a secure connection the app can be installed like an app: on Android in Chrome with “Install app” in the menu, on the iPhone in Safari via Share › “Add to Home Screen”. After that it starts without an address bar.
