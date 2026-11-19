# NFC: Rotary knob

A tag can start not just one album but a **whole artist cover**: all albums of an artist in the library, a **folder of the SD card** or a **folder on the NAS**. The tag then plays **one** album of it, and with the **album knob** (KY-040) you switch through the others.

The knob of the NFC extension is **only for choosing the album**. It has **pins of its own** and is a different knob from the one for volume and tracks (see [Rotary knob and button](../hardware/drehregler.md)). You can connect both at the same time.

## Assigning a tag to an artist cover

1. In the library open the **artist** (or the folder), not a single album. It has to have at least two albums.
2. Tap **NFC tag** and lay on the tag (just as for an album, see [Linking a tag to an album](nfc-tag-zuordnen.md)).

The tag carries the name of the artist cover. The first time it is laid on, it plays the **first album** of the list (sorted by name).

## Which album plays when the tag is laid on

On the **Assigned tags** page ([Assigned tags](nfc-zugeordnete-tags.md)) the tile of such a tag has a **drop-down list**: **Album when the tag is laid on**. Choose the album the tag is to play when it is laid on. The list shows all albums of the artist cover; what is no longer on the box is missing.

## Choosing another album with the rotary knob

The knob chooses only among the **albums of the artist cover whose tag is lying on the reader** (or was laid on last). After such a tag is laid on, this holds for a while:

| You | The box |
| --- | --- |
| **turn right** | goes to the **next** album of the list (after the last comes the first) |
| **turn left** | goes to the **previous** album |
| **press the button** | **plays** the album the knob is on |

The knob **changes nothing** about the tag: the next time it is laid on, it plays the album from the drop-down list again.

A press **before** you have turned does not choose anything. After a choice the knob stays on the album that plays now: you can keep turning at once and choose another album. If nobody turns, the choice ends after the set time. Every turn and every choice starts the time anew. With no tag laid on, the album knob does nothing.

## OLED display

If the [OLED display](oled.md) is connected, turning shows **in the information area** the artist (or folder) and below it the **name** of the album the knob is on, with its place in the list ("< 2/12 >"). Long names scroll. The status bar and the bottom row with the time stay, they show what is still playing. A press on the button plays the album, and the display shows the **normal player picture** again. If you turn but choose nothing, the display goes back by itself to what it showed before (the player) after **10 seconds** without turning. A press then chooses nothing until you turn again.

## Connection and settings

**Settings › NFC extension › Rotary knob**:

| Setting | Effect |
| --- | --- |
| **GPIO pin A (CLK)**, **GPIO pin B (DT)** | the two pins of the knob |
| **GPIO pin (button)** | the pin of the button (switched to ground): a press plays the chosen album |
| **Active after laying on (seconds)** | A slider from **0 to 120 seconds** (default 20): for this long after laying on, after each turn and after each choice, the knob chooses albums. **0** means **always active**: the knob chooses albums until you lay on another tag. |

The lists show **only free pins**: none that the box itself, the boot configuration, an NFC reader, another extension or another rotary knob uses. Without all **three** pins there is no album knob. **One detent is one album**, and the **button confirms** the album the knob is on. If the knob turns the wrong way, swap connections A and B.

## What it takes

- Three **free GPIO pins** for this knob. Pins of the SPI connection (GPIO 9, 10, 11, also 7 and 8) belong to the NFC readers.
- The artist cover has **at least two** albums. With a single one there is nothing to choose.

## If it does not work

- The knob does nothing: check the wiring (A and B not swapped, ground and pins right). Otherwise: the time after laying on is over (lay the tag on again), one of the three pins is missing, or the artist cover has only one album.
- The button chooses nothing: you have to **turn** first.
- You want a knob for volume or tracks as well: that is another one, under **Settings › Audio › Rotary knob and button**.
- The drop-down list is missing in the tile: the box could not read the albums (the NAS is not reachable, the folder is gone). It comes back when the albums can be read.
