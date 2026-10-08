# Bluetooth

The box can play over Bluetooth on headphones or speakers. Everything about it is under **Settings › Audio › Bluetooth**.

## Switching on

The **Bluetooth** switch turns Bluetooth for headphones and speakers on or off. It takes effect at once.

You switch the **Bluetooth chip** itself in the **Hardware** card (folded under **Bluetooth chip and controller**). If the chip is off, the Raspberry Pi's Bluetooth hardware is switched off completely: this can make the onboard Wi-Fi more stable (it shares the radio with Bluetooth) and saves a little power. The chip switch only applies after a **restart**. The address of the box's Bluetooth controller is shown there too.

## Pairing a device

1. Put the device (headphones, speaker) into **pairing mode**. Usually you hold a button down for a while.
2. In the app, under **Pair new device**, tap **Search**. The search takes about 20 to 25 seconds.
3. Tap **Pair** next to the device. It then appears under **Paired devices**. There you can also **connect**, **disconnect** or **remove** it.

Devices that do not send a name are folded away under “further devices without a name”.

## Connect automatically

**Connect automatically** connects a known device by itself as soon as it is on. This helps if devices do not connect by themselves after the box has been switched on.

## Which device does the box play on?

Once a device is paired, you choose the output: the box itself (**Speaker**) or the Bluetooth device.

- **In the app** on the start page above the volume slider (**Output**).
- **On the display** with a tap on the volume at the top of the player. This only works if the switch **Choose box or headphones on the display** is on under **Settings › Display & controls › Controls on the display** ([The player](../bedienung/player.md)).

If the device is not reachable, the box says so instead of simply staying silent.

## Battery of the headphones

If connected headphones report their battery, the box shows it: on the display in **Listen with** on their tile (red at 20 % and below), in the app next to their name at the output and under **Paired devices**. Many headphones report it in steps of 10, some not at all (AirPods, for example). Then nothing is shown there.

## Volume with Bluetooth

For headphones there is a **maximum of its own**. It applies to Bluetooth devices and to the headphone jack. That way headphones may stay quieter than a speaker. You set it in the app under **Settings › Audio › Volume** with **Own limit for headphones** ([Sound and volume](sound.md)).
