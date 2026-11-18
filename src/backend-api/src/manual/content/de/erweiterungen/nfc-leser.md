# NFC: Leser hinzufügen

Die Leser richtest du auf der Unterseite **NFC-Reader** ein (**Einstellungen › NFC-Extension › NFC-Reader**). Bis zu **drei Leser** arbeiten nebeneinander, zum Beispiel ein PN5180 am SPI-Anschluss und ein USB-Leser.

## Der erste Leser

Die Seite beginnt mit einer Karte, die die Seite erklärt. Darunter folgen die Karte **Anschlüsse** (siehe unten) und die Karte **Leser 1**. **Leser 1** hat:

- die Karte **Zustand**: ob der Leser läuft (siehe unten),
- den **Typ**: **Kein Leser** (Standard), **PN5180**, **RC522**, **PN532**, **USB Reader 1** oder **USB Reader 2**,
- darunter nur die Einstellungen, die zu diesem Typ gehören.

![Die Seite NFC-Reader mit Leser 1](nfc-reader-page.png)

Schließe den Leser an (siehe die Seiten der Leser unten), wähle den **Typ**, und stelle ein, was der Typ verlangt. Jede Änderung wirkt sofort, ein Neustart der Box ist nicht nötig (außer wenn du SPI, I2C oder die serielle Schnittstelle erst einschalten musst).

| Einstellung | Wirkung |
| --- | --- |
| **Typ** | der Leser, der an diesem Platz arbeitet |
| **NSS an** | der Chipselect, an dem NSS hängt: **CE0** (Pin 24, Standard) oder **CE1** (Pin 26) |
| **GPIO-Pin BUSY**, **GPIO-Pin RST** | die Pins für die beiden Leitungen; zwei verschiedene |
| **Erkennen** | nur PN5180: **Beide** (Standard), nur **ISO 14443 A** oder nur **ISO 15693** |
| **PN532 Anschluss**, **Serielle Schnittstelle** | nur PN532: I2C (Standard), SPI oder seriell, und bei seriell die Schnittstelle |

## SPI, I2C und seriell ein- und ausschalten

Die Anschlüsse der Box, über die die Leser sprechen, sind bei einer frischen Box aus. Die Karte **Anschlüsse** unter dem Text der Seite hat einen Block für **SPI**, **I2C** und **Seriell (UART)**. Jeder zeigt in der Zeile **Zustand**, ob der Anschluss an ist, und **rechts daneben** einen Knopf: Ist der Anschluss **Eingeschaltet**, heißt der Knopf **SPI ausschalten** (**I2C ausschalten**, **Seriell ausschalten**), ist er **Ausgeschaltet**, heißt er **SPI einschalten** (**I2C einschalten**, **Seriell einschalten**). Nach einer Rückfrage ändert die Box die Zeile in der Konfiguration; danach die Box **neu starten**. Ein USB-Leser braucht keinen dieser Anschlüsse.

| Block | Wer ihn braucht | Einschalten trägt ein | Ausschalten trägt ein | Das Gerät |
| --- | --- | --- | --- | --- |
| **SPI** | PN5180, RC522 und ein PN532 an SPI | `dtparam=spi=on` in der `config.txt` | `dtparam=spi=off` | `/dev/spidev0.0` |
| **I2C** | ein PN532 an I2C | `dtparam=i2c_arm=on` in der `config.txt` und `i2c-dev` in `/etc/modules` | `dtparam=i2c_arm=off` | `/dev/i2c-1` |
| **Seriell (UART)** | ein PN532 am seriellen Anschluss | `enable_uart=1` in der `config.txt`, und die Konsole auf der Schnittstelle wird abgeschaltet | `enable_uart=0` | `/dev/serial0` |

Der **Zustand** sagt **Eingeschaltet**, **Ausgeschaltet** oder, solange die Box nach einer Änderung noch nicht neu gestartet ist, **Eingeschaltet, die Box muss neu starten** und **Ausgeschaltet, die Box muss neu starten**. Die Zeile **Gerät** nennt die Gerätedatei, wenn es sie gibt. Der Block **Seriell (UART)** hat zusätzlich die Zeile **System-Konsole**. Das ist der Text-Zugang des Systems (Anmeldung per Kabel), der standardmäßig auf der seriellen Schnittstelle läuft. Steht dort **An, blockiert den Port für den PN532**, benutzt das System die Schnittstelle selbst, und ein PN532 geht nicht. Der Knopf **Konsole abschalten** neben dieser Zeile schaltet die Konsole ab. Schalte I2C nicht aus, wenn etwas anderes es braucht, zum Beispiel ein MuPiHAT. Die Einzelheiten stehen bei den Seiten der Leser, zum Beispiel [PN5180 anschließen](nfc-pn5180.md) und [PN532 anschließen](nfc-pn532.md).

## Einen weiteren Leser hinzufügen

Mit dem Knopf **+ Leser** unter der letzten Karte kommt **Leser 2** dazu, danach **Leser 3**. Jeder Leser steht in einer **eigenen Karte** mit eigenem **Zustand** und eigenem **Typ**.

![Die Seite NFC-Reader mit Leser 1 und Leser 2](nfc-reader-page-2.png)

1. **+ Leser** antippen. Die neue Karte erscheint und steht zuerst auf **Kein Leser**.
2. Den neuen Leser anschließen und bei **Typ** wählen.
3. Der **Zustand** der Karte zeigt **Bereit**, sobald der Leser läuft.

Das Papierkorb-Symbol oben in der Karte von **Leser 2** oder **Leser 3** nimmt den Leser wieder weg; seine Pins sind danach wieder frei und er läuft nicht mehr. Wenn alle drei Leser da sind, verschwindet der Knopf **+ Leser**.

## Die Leser dürfen sich nicht in die Quere kommen

Jeder Leser braucht seinen **eigenen Anschluss**:

- Ein **SPI-Gerät** (**CE0** oder **CE1**) gehört einem Leser, auch wenn es ein anderer Typ ist: PN5180 und RC522 an CE0 gleichzeitig geht nicht, ein RC522 an CE1 daneben schon.
- Der **PN532** an **I2C** belegt den I2C-Bus, an **SPI** ein SPI-Gerät, am **seriellen** Anschluss die gewählte Schnittstelle.
- **USB Reader 1** und **USB Reader 2** sind zwei verschiedene Geräte und kommen sich nicht in die Quere. Zwei Leser mit demselben Typ (zweimal **USB Reader 1**) wollen dasselbe Gerät.
- **Pins** (BUSY, RST) lassen sich nur einmal vergeben; die Auswahl sperrt belegte Pins.

Wer sich mit einem früheren Leser um denselben Anschluss streiten würde, startet nicht und meldet **Dieser Leser braucht denselben Anschluss wie ein anderer** (siehe **Zustand**). Der frühere Leser läuft weiter.

Ein Tag zählt bei jedem Leser gleich: Welches Medium er startet, hängt nur von seiner Nummer ab. Dieselbe Karte hat an einem USB-Leser aber eine andere Nummer als an einem PN5180: Tags sind **nicht** zwischen den Lesertypen austauschbar.

## Die Leser anschließen

| Leser | Seite |
| --- | --- |
| **PN5180** | [PN5180 anschließen](nfc-pn5180.md) |
| **RC522** | [RC522 anschließen](nfc-rc522.md) |
| **PN532** | [PN532 anschließen](nfc-pn532.md) |
| **USB Reader 1**, **USB Reader 2** | [USB-Leser anschließen](nfc-usb.md) |

## Zustand

Die Karte **Zustand** jedes Lesers zeigt, wie weit er ist, und aktualisiert sich selbst:

| Anzeige | Bedeutung |
| --- | --- |
| **Leser: Aus** | kein Leser gewählt |
| **Bereit**, **Firmware PN5180 4.0** | der Chip antwortet; die Versionsnummer kommt vom Chip selbst. Verdrahtung und SPI stimmen |
| **Gerät** | bei einem USB-Leser: sein Name (zum Beispiel „Tera 5100 dongle“) |
| **Tag im Feld** | ein Tag liegt gerade auf dem Leser (nicht bei USB-Lesern) |
| **Letzter Tag** | die UID (zum Beispiel `04:A1:B2:C3:D4:E5:F6`) und die Art des Tags |

Ist der Leser nicht bereit, steht unter **Hinweis**, was zu prüfen ist:

| Hinweis | Was tun |
| --- | --- |
| Bitte die Pins BUSY und RST wählen | zwei verschiedene Pins einstellen |
| Dieser Leser braucht denselben Anschluss wie ein anderer | ein anderes SPI-Gerät, eine andere Schnittstelle oder bei USB-Lesern verschiedene Typen (**USB Reader 1** und **USB Reader 2**) wählen |
| SPI ist aus: in der Karte Anschlüsse einschalten, dann neu starten | in der Karte **Anschlüsse** bei **SPI** den Knopf **SPI einschalten** antippen und die Box neu starten (siehe [PN5180 anschließen](nfc-pn5180.md)) |
| I2C ist aus: in der Karte Anschlüsse einschalten, dann neu starten | in der Karte **Anschlüsse** bei **I2C** den Knopf **I2C einschalten** antippen und die Box neu starten (siehe [PN532 anschließen](nfc-pn532.md)) |
| Die serielle Schnittstelle fehlt: in der Karte Anschlüsse Seriell einschalten, dann neu starten | in der Karte **Anschlüsse** bei **Seriell (UART)** den Knopf **Seriell einschalten** antippen und die Box neu starten (siehe [PN532 anschließen](nfc-pn532.md)) |
| Kein Zugriff auf den SPI-Bus | die Erweiterung neu installieren, sie legt die Zugriffsregel für `/dev/spidev` an |
| Die Pakete python3-spidev und python3-lgpio fehlen | die Erweiterung neu installieren (sie lädt die Pakete) |
| Die Pins BUSY und RST lassen sich nicht belegen | ein anderes Programm hat den Pin; einen anderen wählen |
| BUSY reagiert nicht: BUSY, RST und die Stromversorgung prüfen | BUSY und RST und beide Versorgungen (5 V und 3,3 V) prüfen |
| Der Leser antwortet nicht: MISO, MOSI, SCK, NSS und die Stromversorgung prüfen | die Leitungen und die Masse prüfen, und ob der Leser beide Versorgungen hat |
| Kein USB-Leser gefunden: einstecken oder im Menü Typ einen anderen USB Reader wählen | den Leser einstecken, oder bei **Typ** den anderen USB Reader wählen |
