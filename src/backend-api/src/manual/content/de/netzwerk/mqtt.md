# MQTT und Home Assistant

Über **MQTT** meldet die Box ihren Zustand an einen Broker im Heimnetz und lässt sich darüber steuern. Mit **Home Assistant** richtet sich die Box dort selbst ein. Die Einstellungen stehen unter **Einstellungen › Dienste › MQTT / Home Assistant**.

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

## Home Assistant

Mit **An Home Assistant melden** legt die Box ihre Geräte in Home Assistant von selbst an (MQTT Discovery). Das **Discovery-Präfix** muss zu dem passen, was in Home Assistant eingestellt ist (dort heißt es normalerweise `homeassistant`).

> [!TIP]
> Brauchst du kein Home Assistant, kannst du MQTT trotzdem nutzen: etwa um Zustand und Steuerung in ein eigenes Smarthome-System einzubinden.
