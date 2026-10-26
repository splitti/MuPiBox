# Display

**Settings › Display & controls › Display**

## Display model

A display on the ribbon cable (DSI) does not say what it is. So you choose here which one is connected. On a box that already shows a picture, the matching model is preselected.

| Model | Note |
| --- | --- |
| **Official 7″ (1st generation)** | 800 × 480, also for a display on the HDMI port or no display at all – this is how the boxes so far run |
| **Touch Display 2** | by Raspberry Pi, choose the size 5″, 7″ or 10″ – tested on a MuPiBox (7″) |
| **Waveshare 5″ DSI** / **Waveshare 4.3″ DSI** | 800 × 480 each |
| **Waveshare DSI 7″ to 12.3″** | choose the exact model, it is on the back or the box it came in. "DSI LCD" and "DSI-TOUCH" are different designs, even at the same size |
| **EDATEC DSI 7″ or 10″** | choose the size |
| **Own setting** | the app leaves `config.txt` alone – for displays you set up yourself |

With **Apply and restart** the box restarts with the new model. Then the app (on the start page too) and the display ask: **Do you see a picture?** Tap **Keep** on the display or **Yes, keep** in the app, and the model stays. Without an answer within **3 minutes** – for instance because the display stays dark – the box sets the previous display again and restarts once more. **No, back** does that at once.

> [!NOTE]
> If the display stays dark with the right model too, check its power: most DSI displays do not get their 5 V over the ribbon cable but over a cable of their own (on the MuPiHAT at **J2**, 5V on top, GND below). Apart from the official 7″, all models use the drivers of the Raspberry Pi kernel.

## Brightness and display off

| Setting | Range |
| --- | --- |
| **Brightness** | 5 to 100 % |
| **Display off after** | 0 to 120 minutes in steps, **0 = never** (10 minutes after installation) |

Both apply at once. If your display cannot be dimmed, the **Brightness** slider is locked.

The display switches itself off after the set time without use, the box itself keeps running. A tap on the screen wakes it up again.

## Evening dimming

With **Evening dimming** the display gets darker in the evening and normally bright again in the morning:

- **From** and **To**: the times,
- **Evening brightness**: 5 to 100 %, never brighter than the normal brightness,
- **Fade gently over**: at once or over 15, 30 or 60 minutes,
- **Also during quiet times**: darker also during a quiet time that lies outside these times.

## Rotation

If the display stands upside down or sideways, you rotate the picture. What you see for it depends on the display model:

- **Official 7″ (1st generation):** For a **Display on the HDMI port** you choose off, 90°, 180°, 270°, mirror horizontally or vertically. For a **Display on the ribbon cable (DSI/LCD)** there are (folded) **LCD rotation** and **Display LCD rotation**, each off or 180°. The rotation applies after a restart of the box.
- **All other models:** four tiles **0°**, **90°**, **180°** and **270°**. Picture and touch turn together, and so do the start, maintenance and goodbye pictures. The display restarts briefly, the box does not. **Landscape** marks the positions in which the MuPiBox stands right – many of these displays are built upright (such as the Touch Display 2), then it is 90° or 270°, depending on how the display is mounted.

## Resolution

With all models except the official 7″ the box takes the resolution from the display itself (after the rotation) – the **Resolution** section does not show then.

The default is **800 × 480** pixels (the size of the usual 7-inch touch displays). Under **Size** you choose one of the usual sizes or **Custom …** and then enter **Width** and **Height**. With **Apply resolution** the display restarts at once.

If the resolution is larger than 800 × 480, the box enlarges the interface to match: the layout and the themes stay the same, text, symbols and covers are drawn at full sharpness. With the Raspberry Pi Touch Display 2 (1280 × 720) that is 1.5 times. So set the real resolution of your display here. Background pictures for the theme “custom” fit best at exactly this size ([Covers and themes](../bedienung/cover-und-themes.md)).

## Live display

Under **Settings › Display & controls › Live display** you see the display's current picture (it refreshes every 5 seconds while the page is open) and can **remote-control** the display in the browser. The remote control needs VNC ([Shares and remote control](../netzwerk/freigaben.md)).

## Browser settings

The display is a browser in full-screen mode (Chromium). Its settings, such as GPU support and cache, are under **Settings › System › Browser (Chromium)** ([System and expert settings](../wartung/system.md)).
