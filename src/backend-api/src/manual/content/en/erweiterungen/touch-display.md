# Touch display cover

The **Touch display cover** extension shows only a **cover** on a small touch display: after the start the one of the first artist. A **swipe to the left or right** turns the cover like a **cube** to the next or the previous one; the picture follows the finger. A **tap** opens the artist (its albums) or, on an album, **plays it**. A **swipe up** goes one level back.

It supports the **Waveshare 2.8inch Capacitive Touch LCD** (240 × 320 points, display chip ST7789, touch chip CST328) on the **SPI and I2C connectors**, on the **Raspberry Pi 4 and the Pi 5**. The extension needs the packages `python3-pil`, `python3-spidev` and `python3-lgpio`, which its installation brings along.

After the [installation](installieren.md) the settings are under **Settings › Touch display cover**.

## The levels

| Level | What the display shows | Tap | Swipe up |
| --- | --- | --- | --- |
| **Artists** | the cover of the artist, in the order of the names as in the library of the box | opens the albums of the artist | does nothing |
| **Albums** | the cover of an album of the artist | **plays the album** (a play symbol shows for a moment) | back to the artists, on the same artist |
| **A folder in a folder** (a series on the SD card or the NAS) | the albums of the series | plays the album | one level back |

An entry without an artist, such as a **playlist** or a **radio station**, stands on the first level and **plays** at a tap. What is shown is what the library of the box knows: Spotify, podcasts, radio, TIDAL, Jellyfin, Audible, the folders of the SD card and of the NAS. A Spotify entry for a **whole artist** (not for an album) has no album to play from here and is left out. Swiping goes round: after the last cover comes the first one again. Where there is only one cover, nothing turns.

A cover that is still loading is replaced at first by the name of the artist on a colour. If there is no cover at all, the name stays.

## Connecting

The module connects to the SPI and the I2C bus of the pin header. Wire it with the box switched off:

| Module | Raspberry Pi | Pin of the header |
| --- | --- | --- |
| VCC | 3.3 V | 1 |
| GND | ground | 6 |
| LCD_DIN | GPIO 10 (SPI MOSI) | 19 |
| LCD_CLK | GPIO 11 (SPI SCLK) | 23 |
| LCD_CS | GPIO 7 (**CE1**) | 26 |
| LCD_DC | a free GPIO, for example GPIO 24 | 18 |
| LCD_RST | a free GPIO, for example GPIO 22 | 15 |
| LCD_BL | a free GPIO, for example GPIO 18 | 12 |
| TP_SDA | GPIO 2 (I2C SDA) | 3 |
| TP_SCL | GPIO 3 (I2C SCL) | 5 |
| TP_RST | a free GPIO, for example GPIO 17 | 11 |
| TP_INT | stays free (the extension asks the touch chip) | – |

> [!NOTE]
> Waveshare describes pin 24 (CE0) for CS, GPIO 25 for DC and GPIO 27 for RST. That does not go together with an **NFC reader (PN5180)**, which needs CE0 and GPIO 25 and 23. That is why CS is on **CE1 (pin 26)** here, and you choose DC, RST, BL and TP_RST on free pins yourself. You set the pins in the app: the list blocks what is taken already and says by whom.

The I2C bus can be shared with other devices, for example an OLED display; the touch chip has the address **0x1A**.

If SPI or I2C is still off, the **Display** card shows the block **SPI** or **I2C** as **Off**. Tap **Switch SPI on** and **Switch I2C on** and then **restart** the box.

## Settings

| Setting | Meaning |
| --- | --- |
| **CS connector of the display** | **CE1 · pin 26** (default) or **CE0 · pin 24**; the NFC reader usually takes CE0 |
| **GPIO pin DC**, **RST** | needed; different pins, not those of the SPI and I2C connectors (2, 3, 7 to 11) |
| **GPIO pin BL** | the backlight: only with it can the display be **dimmed** and switched off. Without a pin BL is on 3.3 V and the display always shines at full brightness |
| **GPIO pin TP_RST** | reset of the touch chip; without a pin TP_RST is on 3.3 V |
| **What is shown** | everything, only music, only audiobooks, only “other” or only the NAS |
| **Show names under the cover** | writes the name in the black strip under the cover |
| **Rotation** | portrait, landscape and the turned positions, if the display is built in differently |
| **Brightness**, **Display off after** | as with the OLED display; a touch wakes a display that is off (it does nothing else) |
| **Darker in the evening** | darker at the times of “Darker in the evening” in the settings of the display |
| **Touch** | **Swap axes**, **mirror left and right**, **mirror up and down**: only needed if a swipe counts in the wrong direction |

## If it does not work

The **Display** line of the card says what is missing:

| Message | What to do |
| --- | --- |
| **Please choose the pins DC and RST** | choose two different free pins |
| **SPI is off** / **I2C is off** | tap **Switch SPI on** / **Switch I2C on**, restart the box |
| **No access to the SPI bus** / **I2C bus** | restart the box once (the rule for the access becomes active then) |
| **The touch chip does not answer** | check SDA, SCL, TP_RST and the power supply; the module comes in two versions, the one with the touch chip **CST328** is supported (the newer one with CST3530 is not) |
| **The pins cannot be used** | another program has one of the pins; choose another one |
| **The packages … are missing** | install the extension again (it fetches the packages) |

If the display stays white or black although the line says **Ready**, the wiring of **DC**, **RST** or **CS** is usually wrong, or **CS** is on the wrong SPI device. If a swipe runs in the wrong direction, the **Touch** card helps.

> [!NOTE]
> The program for the display is an implementation of its own after the information from Waveshare: it writes through `spidev` and `lgpio` and needs neither `RPi.GPIO` nor `smbus`; it therefore runs the same on the Pi 4 and the Pi 5.
