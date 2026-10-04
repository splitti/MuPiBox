# WLED

Mit **WLED** zeigt ein Leuchtstreifen Lichteffekte, die zur Box passen: im Betrieb, beim Einschalten und beim Ausschalten. Die Box steuert einen WLED-Controller über eine **serielle Schnittstelle** (USB).

**Einstellungen › Dienste › WLED**

| Einstellung | Bedeutung |
| --- | --- |
| **WLED aktiv** | schaltet die Anbindung ein (nach der Installation aus) |
| **Serielle Schnittstelle** | der USB-Anschluss des Controllers, meist `/dev/ttyUSB0` |
| **Baudrate** | Übertragungsgeschwindigkeit, 300 bis 921600 bps, meist 115200 |

## Presets

Ein **Preset** ist ein gespeicherter Lichteffekt im WLED-Controller. Du trägst nur die **Nummern** ein:

- **Haupt-Preset**: der Effekt im normalen Betrieb,
- **Preset beim Start** mit seiner Nummer,
- **Preset beim Ausschalten** mit seiner Nummer.

## Helligkeit

**Helligkeit normal** und **Helligkeit gedimmt**, jeweils von 0 bis 255.

> [!NOTE]
> Die Presets legst du in WLED selbst an, mit der App oder Weboberfläche von WLED. Die MuPiBox ruft sie nur über ihre Nummer auf.
