# PhotoPrism

The box shows albums from **PhotoPrism** that you choose. Private and archived photos stay out.

## Preparing in PhotoPrism

The box signs in with an **app password**, not with the real password. An app password can be revoked on its own at any time.

1. In PhotoPrism, go to **Settings › Account › Apps and Devices** and tap **Add**.
2. Enter a name, “MuPiBox” for example. Leave **Scope** at **Full Access**, and set **Expires** to **Never** preferably.
3. Copy the app password shown. PhotoPrism shows it this one time only.

The photos the box is to show are in **albums** in PhotoPrism. Folders, moments and calendar albums are not shown on the box.

## Connecting

Under **Library › Photos › Connect a photo service › PhotoPrism**, an assistant leads through three steps:

1. **Sign-in**: the **PhotoPrism address** as in the browser, without `/library/…` after it (`http://192.168.1.20:2342` for example), and the **app password**.
2. **Test**: if PhotoPrism uses a certificate of its own (self-signed), the box shows its fingerprint. Compare it with the one in the browser via the padlock and tap **Trust and test** only if they match. Then the test shows the account, the albums and the number of photos and videos.
3. **Albums**: tick the albums and tap **Done**.

The app password is kept encrypted on the box and never shown again. It holds only for the address it was entered for. **Change sign-in** on PhotoPrism's page opens the assistant again.

| Message at the test | What to do |
| --- | --- |
| **App password refused** | check the app password, create a new one if need be; the login password does not work here |
| **No PhotoPrism found** | check the address, it usually ends in `:2342` |
| **PhotoPrism not reachable** | check the address and the network; the box has to reach PhotoPrism |

## What the box shows

The pictures come as PhotoPrism's previews in display size. PhotoPrism delivers clips the way it plays them in the browser (MP4). So videos are there **live too** ([Photo services: keep or live](speichern-oder-live.md)). Live photos are shown as a still.

If the app password has expired or was revoked, PhotoPrism's page shows **Sign-in refused**. Photos kept on the box stay on the display meanwhile.
