# Synology Photos

On a Synology NAS with **Synology Photos**, the box can show albums and folders. It signs in with an account of its own. You choose what appears on the display: the account's **albums** (also the ones shared with it) and **folders** from the account's **personal space** and from the **shared space**.

## Preparing in DSM

Best create an account just for the box. Then it sees only what you share with it on purpose.

1. In DSM under **Control Panel › User & Group**, create an account, "mupibox" for example, **without** two-factor sign-in.
2. For the account, allow the app **Synology Photos** under **Edit › Applications**.
3. For **albums**: in Synology Photos, open an album, choose **Share** and invite the account as a **viewer**. A public link is not needed.
4. For folders of the **shared space**: the space must be set up in Synology Photos, and the account needs access to the folders (a DSM administrator sets that). The **personal space** belongs to the box's own account; it has folders only when photos are put into its space.

## Connecting

Under **Library › Photos › Connect a photo service › Synology Photos**, an assistant leads through three steps:

1. **Sign-in**: the **DSM address** (as in the browser, usually `https://192.168.1.10:5001`; without one the box takes https and port 5001), **Username** and **Password**.
2. **Test**: if the NAS uses its own, self-issued certificate, the box shows its fingerprint. Compare it with the one on the NAS or in the browser via the padlock, and only if they match tap **Trust and test**. Then the test shows the account, the albums, how many of them are shared, and the number of photos and videos.
3. **Choice**: switch at the top between **Albums**, **Personal space**, **Shared space** and **Smart** and tick what the box should show, then tap **Done**. In the spaces you open the folders with the arrow. A chosen folder becomes an album and holds the photos of the folders inside it too; those are then not offered again one by one.

The password is kept encrypted on the box and never shown again. It applies only to the address and the account it was entered for. **Change sign-in** on the Synology Photos page opens the assistant again. If the certificate is renewed on the NAS, the box asks again at the next test.

| Message in the test | What to do |
| --- | --- |
| **Sign-in refused** | check username and password, and whether the account is active |
| **Synology Photos not allowed** | allow the app for the account in DSM (see above) |
| **Second confirmation required** | use an account without two-factor sign-in |
| **Box blocked by DSM** | unblock the box's address in DSM under **Security › Protection › Auto Block** |
| **DSM not reachable** | check address, port and firewall; the box must reach DSM (not the WebDAV port) |

> [!NOTE]
> When DSM refuses the sign-in, the box does not try again with the same data for 10 minutes, so that DSM does not block it. Only **Test connection** asks at once.

Synology Photos gives clips only as their original, often 4K from a phone. So the box converts them itself, and **videos are there only with "Keep photos on the box"**. Live, it shows only the photos ([Photo services: keep or live](speichern-oder-live.md)).

## Smart albums

Under **Smart** the box offers what Synology Photos puts together itself: **Recently added** (the newest 300) and **Videos**, plus an album for every **person**, **place**, **tag** and **subject** (for example "Beach") that Synology Photos knows. The lists can be folded (the number next to a list is how many entries it has) and are sorted by the number of photos, the most first. A list with ticked entries is open already when you come back. The albums change by themselves: the box syncs them like all the others.

> [!NOTE]
> The box shows people, places, tags and subjects from the personal **and** the shared space; those from the shared space are marked "Shared space". Named people are often only there. They exist only when the recognition of Synology Photos is switched on for the box's account; people must have a name. An account that is only given albums usually has none. A subject album searches Synology Photos for the name of the subject, so it can differ by a picture or two from the number shown in Synology Photos. The box does not offer **Favorites**: Synology Photos does not hand them out through its interface. The box shows **Videos** only with "Show videos" and "Keep photos on the box".
