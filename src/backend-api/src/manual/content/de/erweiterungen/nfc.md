# NFC-Extension

Die Erweiterung **NFC-Extension** bringt bis zu **drei NFC-Leser** an die Box. Ein Leser liest die **UID** von Tags und Karten, im Moment der Annäherung wie beim Entfernen. Jeder Tag kann ein **Album, einen Hörspiel-Ordner, einen Sender oder einen Podcast starten**; die Zuordnung funktioniert wie bei TeddyCloud: Medium wählen, Tag auflegen, fertig.

Nach der [Installation](installieren.md) stehen die Einstellungen unter **Einstellungen › NFC-Extension**. Die Seite hat drei Unterseiten:

- **NFC-Reader** richtet die Leser ein: pro Leser eine Karte mit Zustand, Typ und Einstellungen.
- **Zugeordnete Tags** zeigt alle Tags mit ihrem Medium.
- **Sprachausgabe** legt fest, was die Box mit ihrer Stimme sagt, wenn etwas im Weg ist (kein WLAN, NAS nicht erreichbar, Tag ohne Medium, Akku fast leer).

## Die Handbuchseiten zur NFC-Extension

| Seite | Inhalt |
| --- | --- |
| [Tag mit einem Album verknüpfen](nfc-tag-zuordnen.md) | Schritt für Schritt: Medium wählen, Tag auflegen, Flex-Tag |
| [Bild des Tags ändern](nfc-bild.md) | das Cover des Mediums oder ein eigenes Bild |
| [Zugeordnete Tags](nfc-zugeordnete-tags.md) | die Seite mit allen Tags als Kacheln (abspielen, ändern, entfernen) und die Einstellung beim Abnehmen |
| [Sprachnachrichten](nfc-sprachnachrichten.md) | die Ansagen der Box: WLAN, NAS, Spotify, Tag ohne Medium, Akku bei 10 % |
| [Leser hinzufügen](nfc-leser.md) | einen Leser einrichten, bis zu drei gleichzeitig, der Zustand |
| [PN5180 anschließen](nfc-pn5180.md) | Verdrahtung, SPI, Einstellungen |
| [RC522 anschließen](nfc-rc522.md) | Verdrahtung, SPI, Einstellungen |
| [PN532 anschließen](nfc-pn532.md) | Verdrahtung für I2C, SPI und seriell |
| [USB-Leser anschließen](nfc-usb.md) | USB Reader 1 und 2, Barcodeleser |

## Welcher Leser?

| Leser | liest | Anschluss | Hinweis |
| --- | --- | --- | --- |
| **PN5180** | ISO 14443 A und **ISO 15693** (NTAG, MIFARE, ICODE, SLIX) | SPI | liest beide Welten; braucht 5 V und 3,3 V |
| **RC522** | ISO 14443 A | SPI | die kleine blaue Platine; nur 3,3 V |
| **PN532** | ISO 14443 A | I2C, SPI oder seriell | der Anschluss wird mit zwei Schaltern auf der Platine gewählt |
| **USB-Leser** | ISO 14443 A oder Barcodes, je nach Gerät | USB | tippt die Nummer wie eine Tastatur; nur das Auflegen wird gemeldet |

## In Kürze

1. Den Leser an die Box anschließen (siehe die Seite des Lesers in der Tabelle oben) und bei SPI den Anschluss einschalten.
2. Auf der Unterseite **NFC-Reader** bei **Typ** den Leser wählen. Der **Zustand** zeigt **Bereit**, wenn alles stimmt.
3. In der Bibliothek ein Album öffnen, **NFC-Tag** antippen und den Tag auflegen. Ab dann startet der Tag das Album.

Die Erweiterung läuft als Programm im Hintergrund und startet sich nach einem Fehler selbst wieder, zuerst nach wenigen Sekunden, dann langsamer. Meldungen stehen im Protokoll der Box (`pm2 logs server`, Zeilen mit `[nfc]`).
