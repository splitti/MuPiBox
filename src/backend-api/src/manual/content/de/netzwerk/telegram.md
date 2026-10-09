# Telegram

Der **Eltern-Bot** verbindet die Box mit Telegram. Er schickt dir Nachrichten und lässt dich die Box auch von unterwegs bedienen. Alles steht unter **Einstellungen › Dienste › Telegram**.

## Einrichten

1. Lege in Telegram mit dem **BotFather** (`/newbot`) einen eigenen Bot an. Du bekommst einen **Token**.
2. Trage den Token in der App unter **Bot-Token** ein und tippe auf **Speichern**. Ist schon ein Token eingerichtet, öffnet **Ändern** das Feld **Neuer Token**.
3. Trage unter **Erlaubte Chats** deine **Chat-ID** und einen **Namen** ein und tippe auf **Hinzufügen**. Die Chat-ID findest du mit **Chat-ID ermitteln**: Schreib dem Bot dann in Telegram eine Nachricht, die Box wartet bis zu 40 Sekunden darauf.
4. Schalte **Bot aktiv** ein und tippe auf **Speichern**.
5. Mit **Testnachricht senden** prüfst du, ob alles ankommt.

**Nur die erlaubten Chats dürfen die Box steuern.** Gruppen haben negative IDs (zum Beispiel −100…). Änderungen gelten erst mit **Speichern**, dabei startet der Telegram-Dienst neu. Die Karte **Befehle** zeigt die wichtigsten Befehle des Bots.

> [!WARNING]
> Gib den Token niemandem weiter und trage nur Chats ein, denen du die Box anvertraust. Wer einen erlaubten Chat hat, kann die Box bedienen.

## Was der Bot meldet

| Einstellung | Wirkung |
| --- | --- |
| **Wiedergabe melden** | **aus**: nur Wichtiges (Hörzeit aufgebraucht, Ruhezeit, Akku fast leer, Start und Ausschalten). **An**: zusätzlich jeder Titel mit Bildschirmfoto, Pause, Stopp und Weiter. Das ist meist zu viel |
| **Wochenrückblick** | sonntagabends: wie lange und was die Woche über gehört wurde |

Beim Ausschalten sagt die Nachricht auch warum: leerer Akku, zu lange keine Wiedergabe (Leerlauf) oder ein normales Ausschalten.

## Anmelden mit einem Link

Der Bot schickt dir mit `/login` einen **Link**, der dich in der App anmeldet, auch ohne Passwort ([Die App öffnen und anmelden](../erste-schritte/app-oeffnen.md)).

## Sprache

Der Bot spricht **Deutsch**, wenn die **Sprache der Box** (**Einstellungen › System › Sprache**) Deutsch ist. Bei jeder anderen Sprache spricht er **Englisch**.
