# NFC: Connecting a USB reader

Cheap USB readers (Neuftech, Sycreader and similar, often "RFID Reader 125 kHz / 13.56 MHz") report as a **keyboard** and **type the card number**, usually ten digits and Enter. They need **no wiring**, only the plug: plug it into **any USB port** of the box.

![A USB reader on the box](wiring-usb.svg)

The extension reads the keys of the device and **takes the device for itself**: the digits end up neither in the console nor in the display's browser.

## USB Reader 1 and USB Reader 2

The box assigns the USB devices itself: you do not type a name. At **Type** there are **USB Reader 1** and **USB Reader 2**:

- **USB Reader 1** is the first USB device the box finds, **USB Reader 2** the second, by the port the device is plugged into.
- In the **Type** menu the device that is meant stands behind the name (for example "USB Reader 1 · Tera 5100 dongle").
- **USB Reader 2** is **greyed out** while no second USB device is found.
- If you plug a device into another port the assignment may change; then check in the **Type** menu which device stands behind **USB Reader 1** and **USB Reader 2**.

Two USB readers side by side: one reader on **USB Reader 1**, the other on **USB Reader 2** (see [Adding readers](nfc-leser.md)). Two readers of the same type want the same device.

## The status

The **Status** card shows the **name of the reader** at **Device**: what the device calls itself, else what the box's USB database calls its ids (for example "Tera 5100 dongle" instead of "HID 0581:011c"); the same name stands beside the **Last tag**.

## What a USB reader does differently

- The **number** of the tag is the card number as the reader types it. It stands so in the list of tags (without colons). A tag that another reader (PN5180, RC522, PN532) reads has another number: tags are **not** interchangeable between the types of reader.
- A USB reader reports **only the laying on**, never the taking off. **When taken off** therefore does not work with it; playback just goes on. The page does not show "Tag in the field".
- A **USB barcode reader** is such a reader too: it types the number of the barcode (digits, also the letters A to F) and Enter. Its number is the number of the tag; a label with a barcode can start a medium this way.
- When setting up for the first time (or after plugging in another reader) **plug the device in again** so that the permission (the udev rule of the extension) takes effect.
