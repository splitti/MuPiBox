# The box hangs when shutting down

When switching off, the box shows the goodbye picture but does not shut down properly, and cannot be started again with the on/off button. Only disconnecting the power helps?

## Common cause: the pin is assigned twice

Boxes with an **OnOff SHIM** or a similar button use the overlay `gpio-poweroff`, so that the Raspberry Pi sends a signal to the board when shutting down. If this overlay appears **twice** in the file `/boot/config.txt`, the box hangs when shutting down.

That happens if you had to enter a driver of your own for your display and its line already contains the overlay, for example:

```
dtoverlay=vc4-fkms-v3d,gpio-poweroff,gpiopin=4,active_low=1
```

Earlier versions of the update did not recognise this line and appended a **second** definition:

```
dtoverlay=gpio-poweroff,gpiopin=4,active_low=1
```

> [!NOTE]
> Newer versions of the MuPiBox recognise `gpio-poweroff` in any `dtoverlay` line and only add it if it is still missing. The duplicate line that an earlier update has already entered is **not** removed by the new update either.

## How to check and fix it

Sign in to the box via SSH (or open a terminal in the DietPi dashboard) and look for the overlay:

```
grep -n gpio-poweroff /boot/config.txt
```

- **One** line (whether standalone or as a parameter of another overlay): fine, the cause lies elsewhere.
- **Two or more** lines with `gpio-poweroff`: keep the line that belongs to your display and remove the additional standalone line `dtoverlay=gpio-poweroff,gpiopin=4,active_low=1`. You can edit the file with `sudo nano /boot/config.txt`.

Restart the box afterwards. The pin is also in the box's configuration (`shim.poweroffPin`) and must match what is in the line ([GPIO assignment](../anhang/gpio.md)).

> [!WARNING]
> Make a copy before changing `/boot/config.txt` (`sudo cp /boot/config.txt /boot/config.txt.bak`). A wrong line can keep the box from starting.

## If it is not that

- If music is still playing when switching off, it is paused before the goodbye sound. If the box still hangs, look in the logs ([Logs and status](../wartung/protokolle.md)): the log `shutdown_control.log` belongs to switching off with the button. It is kept in memory and is gone once the power is off - so look at it while the box is still running.
- Check the power supply: voltage dips during shutdown can make it hang.
- If that does not help, ask the community or report the bug on GitHub ([splitti/MuPiBox](https://github.com/splitti/MuPiBox/issues)). Download the **support info** and the log `shutdown_control.log` for it ([Logs and status](../wartung/protokolle.md)).
