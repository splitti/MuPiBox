# WLED

Mit **WLED** zeigt ein Leuchtstreifen Lichteffekte, die zur Box passen: im Betrieb, beim Einschalten und beim Ausschalten. Die Box steuert einen WLED-Controller über eine **serielle Schnittstelle** (USB).

**Einstellungen › Dienste › WLED**

## Verbindung

| Einstellung | Bedeutung |
| --- | --- |
| **WLED aktiv** | schaltet die Anbindung ein (nach der Installation aus) |
| **Schnittstelle** | der USB-Anschluss des Controllers, meist `/dev/ttyUSB0` |
| **Baudrate** | Übertragungsgeschwindigkeit, 300 bis 921600, meist 115200 |

Oben zeigt die Karte, ob ein WLED-Gerät geantwortet hat. Antwortet keines, tippst du auf **Erneut suchen**. Speichern geht trotzdem.

## Presets

Ein **Preset** ist ein gespeicherter Lichteffekt im WLED-Controller:

- **Im normalen Betrieb**: der Effekt im Alltag,
- **Beim Start**: ein eigenes Preset beim Einschalten (Schalter an, dann das Preset wählen),
- **Beim Ausschalten**: ein eigenes Preset beim Ausschalten (Schalter an, dann das Preset wählen).

Hat das WLED-Gerät geantwortet, wählst du die Presets aus seiner Liste. Sonst trägst du ihre **Nummern** ein.

## Helligkeit

**Normal** und **Gedimmt**, jeweils von 0 bis 100 %.

**Speichern** übernimmt Verbindung, Presets und Helligkeit. Ist das WLED-Gerät erreichbar, gehen die Werte auch an das Gerät.

> [!NOTE]
> Die Presets legst du in WLED selbst an, mit der App oder Weboberfläche von WLED. Die MuPiBox ruft sie nur auf.
