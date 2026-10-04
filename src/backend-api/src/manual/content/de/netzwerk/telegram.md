# Telegram

Der **Eltern-Bot** verbindet die Box mit Telegram. Er schickt dir Nachrichten und lässt dich die Box von unterwegs im Heimnetz-Rahmen bedienen. Alles steht unter **Einstellungen › Dienste › Telegram**.

## Einrichten

1. Lege in Telegram mit dem **BotFather** einen eigenen Bot an. Du bekommst einen **Token**.
2. Trage den Token in der App unter **Neuen Token setzen** ein. Ein leeres Feld lässt den bisherigen Token unverändert.
3. Schalte **Bot aktiv** ein.
4. Trage unter **Erlaubte Chats** deine **Chat-ID** und einen Namen ein. Die Chat-ID findest du mit der Schaltfläche **Chat-ID ermitteln**.

**Nur die erlaubten Chats dürfen die Box steuern.** Gruppen haben negative IDs (zum Beispiel −100…). Änderungen starten den Telegram-Dienst neu.

> [!WARNING]
> Gib den Token niemandem weiter und trage nur Chats ein, denen du die Box anvertraust. Wer einen erlaubten Chat hat, kann die Box bedienen.

## Was der Bot meldet

| Einstellung | Wirkung |
| --- | --- |
| **Wiedergabe melden** | **aus**: nur Wichtiges (Hörzeit aufgebraucht, Ruhezeit, Akku fast leer, Start und Ausschalten). **An**: zusätzlich jeder Titel mit Bildschirmfoto, Pause, Stopp und Weiter |
| **Wochenrückblick** | sonntagabends: wie lange und was die Woche über gehört wurde |

Beim Ausschalten sagt die Nachricht auch warum: leerer Akku, zu lange keine Wiedergabe (Leerlauf) oder ein normales Ausschalten.

## Anmelden mit einem Link

Der Bot kann dir einen **Link** schicken, der dich in der App anmeldet, auch ohne Passwort ([Die App öffnen und anmelden](../erste-schritte/app-oeffnen.md)).

## Sprache

Die Texte des Bots richten sich nach der **Sprache der Box** (**Einstellungen › System › Sprache**).
