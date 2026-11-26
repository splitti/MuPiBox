# WLED

Med **WLED** visar en ljusslinga ljuseffekter som passar boxen: vid drift, vid påslagning och vid avstängning. Boxen styr en WLED-controller via ett **seriellt gränssnitt** (USB).

**Inställningar › Tjänster › WLED**

## Anslutning

| Inställning | Betydelse |
| --- | --- |
| **WLED aktiv** | slår på anslutningen (efter installationen av) |
| **Gränssnitt** | controllerns USB-anslutning, oftast `/dev/ttyUSB0` |
| **Baudrate** | överföringshastighet, 300 till 921600, oftast 115200 |

Högst upp visar kortet om en WLED-enhet har svarat. Svarar ingen trycker du på **Sök igen**. Att spara går ändå.

## Förinställningar

En **förinställning** är en sparad ljuseffekt i WLED-controllern:

- **I normal drift**: effekten i vardagen,
- **Vid start**: en egen förinställning vid påslagning (slå på reglaget, välj sedan förinställningen),
- **Vid avstängning**: en egen förinställning vid avstängning (slå på reglaget, välj sedan förinställningen).

Har WLED-enheten svarat väljer du förinställningarna ur dess lista. Annars skriver du in deras **nummer**.

## Ljusstyrka

**Normal** och **Dämpad**, var och en från 0 till 100 %.

**Spara** tar över anslutning, förinställningar och ljusstyrka. Går WLED-enheten att nå går värdena även till enheten.

> [!NOTE]
> Förinställningarna skapar du i WLED självt, med WLED:s app eller webbgränssnitt. MuPiBox anropar dem bara.
