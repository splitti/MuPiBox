# MQTT und Home Assistant

Über **MQTT** meldet die Box ihren Zustand an einen Broker im Heimnetz und lässt sich darüber steuern. Mit **Home Assistant** richtet sich die Box dort selbst ein (MQTT-Discovery). Die Einstellungen stehen unter **Einstellungen › Dienste › MQTT**.

> [!TIP]
> Für Home Assistant geht es auch ohne Broker und mit mehr Funktionen (Ansagen, Nachrichten aufs Display): die direkte Kopplung unter [Home Assistant](home-assistant.md). Nimm nur eine von beiden, sonst erscheint die Box zweimal.

## Verbindung

| Einstellung | Bedeutung |
| --- | --- |
| **MQTT aktiv** | schaltet die Anbindung ein (nach der Installation aus) |
| **Gerätename** | der Name, unter dem die Box erscheint |
| **Broker** | Adresse des MQTT-Brokers |
| **Port** | Port des Brokers, üblich ist 1883 |
| **Topic** | gemeinsamer Anfang aller Themen der Box |
| **Client-ID** | Kennung der Box beim Broker |
| **Benutzer** und **Passwort** | falls der Broker sie verlangt |

## Intervalle

| Einstellung | Wirkung |
| --- | --- |
| **Aktualisierung (Wiedergabe)** | wie oft die Box während der Wiedergabe meldet, 1 bis 90 Sekunden |
| **Aktualisierung (Leerlauf)** | wie oft sie meldet, wenn nichts läuft, 1 bis 90 Sekunden |
| **Timeout** | Wartezeit auf den Broker, 10 bis 180 Sekunden |

## Themen

Alle Themen beginnen mit Topic und Client-ID, die Client-ID steht dabei zweimal. Mit Topic `MuPiBox/Kinderzimmer` und Client-ID `MuPiBox` meldet die Box zum Beispiel unter `MuPiBox/Kinderzimmer/MuPiBox/MuPiBox/state`.

| Thema (nach dem Anfang) | Inhalt |
| --- | --- |
| `state` | `online`, oder `offline`, sobald die Box nicht mehr verbunden ist |
| `volume` | Lautstärke in Prozent |
| `play_text` | was gerade läuft |
| `bat_soc`, `vbat`, `charger_status` | Akkustand, Akkuspannung, Ladezustand (mit MuPiHAT) |
| `temperature`, `ssid`, `signal_quality` | CPU-Temperatur, WLAN, Empfang |

Steuern lässt sich die Box über dieselben Themen mit `/set` am Ende:

| Thema | Wert | Wirkung |
| --- | --- | --- |
| `volume/set` | Zahl, z. B. `20` | Lautstärke, höchstens bis zur eingestellten Maximallautstärke |
| `play/set` | `play` | Wiedergabe fortsetzen |
| `pause/set` | `pause` | Pause |
| `take_screenshot/set` | `take_screenshot` | Bild vom Display unter `screenshot` |
| `reboot/set` | `reboot` | Neustart |
| `power/set` | `shutdown` | Herunterfahren |

## Home Assistant

Mit **An Home Assistant melden** legt die Box ihre Geräte in Home Assistant von selbst an (MQTT Discovery). Das **Discovery-Präfix** muss zu dem passen, was in Home Assistant eingestellt ist (dort heißt es normalerweise `homeassistant`).

> [!TIP]
> Brauchst du kein Home Assistant, kannst du MQTT trotzdem nutzen: etwa um Zustand und Steuerung in ein eigenes Smarthome-System einzubinden.
