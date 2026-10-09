# The app is not reachable

The box's address cannot be opened in the browser? Check in order:

## 1. Is the box running?

After switching on, the box needs a minute or two until everything is ready. If the display shows the start page, it is running.

## 2. Same network

Phone or PC must be **in the same network** as the box (the same Wi-Fi or the same home network). A guest Wi-Fi of the router or mobile data is not enough.

## 3. Right address

- Has the box got a **new IP address** after a Wi-Fi change? The current one is shown on the network page on the display ([Settings on the display](../bedienung/eltern-zugang.md)) or in your router's device list.
- If `mupibox.local` does not work, use the IP address. Some networks and devices do not resolve `.local` names.
- The app works with `http://` and with `https://`. The box takes care of its certificate by itself at every start ([Password and HTTPS](../netzwerk/sicherheit.md)).

## 4. Browser warning with HTTPS

If the browser warns about an **insecure certificate**, that is normal with the box: the certificate comes from the box itself. You can confirm the warning and go on anyway. To make it go away, install the certificate once on the device ([Password and HTTPS](../netzwerk/sicherheit.md)). Or open the app via `http://`.

> [!WARNING]
> If you have switched on **Redirect http to https** and the certificate is not installed on your device, the browser warns on every visit. Switch to a device that trusts the box, or open the app via port 8200 (`http://<IP address>:8200/app/`). There it can always be reached via http. Then you can switch the redirect off again.

## 5. Getting in with the display

If you cannot get into the app at all, scan the **QR code on the display**: hold the status indicator ([Settings on the display](../bedienung/eltern-zugang.md)). It leads straight into the app and signs you in.

## 6. Restart the service

If the display runs but the app does not answer, restarting the box restarts the server ([Restart and shut down](../wartung/neustart.md)).
