# Nextcloud

The box shows albums of the Nextcloud **Photos** app: an account's own albums and all albums shared with it.

## Preparing in Nextcloud

Best create an account just for the box. Then it sees only what you share with it on purpose.

1. Create an account in Nextcloud, "mupibox" for example. The **Photos** app must be enabled (it usually is).
2. Sign in with this account and create an app password for the box under **Personal settings › Security** with **Create new app password**. The real password stays out of it, and the app password can be revoked on its own at any time.
3. In the **Photos** app, share an album with this account, or create albums with the account itself.

## Connecting

Under **Library › Photos › Connect a photo service › Nextcloud**, an assistant leads through three steps:

1. **Sign-in**: the **Nextcloud address** as in the browser, without `/apps/…` after it (for example `https://cloud.example.de`), the **Username** and the **App password**.
2. **Test**: if the Nextcloud uses its own, self-issued certificate, the box shows its fingerprint. Compare it with the one in the browser via the padlock, and only if they match tap **Trust and test**. Then the test shows the account, the albums, how many of them are shared, and the number of photos and videos.
3. **Albums**: tick the albums and tap **Done**.

The app password is kept encrypted on the box and never shown again. It applies only to the address and the account it was entered for. **Change sign-in** on the Nextcloud page opens the assistant again.

| Message in the test | What to do |
| --- | --- |
| **Sign-in refused** | check username and app password, or create a new app password |
| **Photos app missing** | enable the **Photos** app in Nextcloud under **Apps** |
| **Nextcloud not reachable** | check address and network; the box must reach the Nextcloud |

## What the box shows

The pictures come as Nextcloud's previews in display size. If Nextcloud cannot make a preview of a photo (iPhone photos, for example, when no HEIC previews are set up there), the box fetches the original with **Keep photos on the box** and converts it itself. Live, such a photo is missing.

Nextcloud gives clips as they were uploaded. So the box converts them itself, and **videos are there only with "Keep photos on the box"** ([Photo services: keep or live](speichern-oder-live.md)).
