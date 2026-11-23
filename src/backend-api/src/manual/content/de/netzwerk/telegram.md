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

## Bildzeit

Ist die [Fotoanzeige](../fotos/index.md) an, nennt `/status` auch die **Bildzeit** von heute: wie lange schon Fotos angesehen wurden, und mit eigenem Limit, wie viel noch übrig ist. Hat die Bildzeit ein eigenes Limit ([Bildzeit](../fotos/bildzeit.md)), gibt es dafür zwei Befehle, die auch als Knöpfe unter `/help` stehen:

| Befehl | Wirkung |
| --- | --- |
| `/photoextend 10` | heute 10 Minuten Bildzeit dazu (ohne Zahl 10) |
| `/photofree` | Bildzeit heute ohne Limit |

Beides gilt nur heute, wie **+10 min** und **Heute frei** in der App.

## Kacheln mit Tageslimit

Haben einzelne Kacheln eine eigene Grenze am Tag ([Kacheln mit Tageslimit](../spielzeit/kachel-limit.md)), nennt `/status` sie mit den Minuten von heute. `/tiles` (auch als Knopf **Kacheln mit Limit** unter `/help`) zeigt sie mit je zwei Knöpfen: **+10** gibt der Kachel heute 10 Minuten mehr, **frei** hebt ihre Grenze für heute auf.

## Mehrere Benutzer

Sind [mehrere Benutzer](../bedienung/mehrere-benutzer.md) an, meint ein **Name am Ende** eines Befehls dieses Kind, ohne Namen gilt der Befehl für das aktive. Das geht bei `/status`, `/extend`, `/photoextend`, `/photofree`, `/tiles` und `/limit set`, zum Beispiel `/status Leni` oder `/extend 30 Leni`. Für ein Kind, das gerade nicht hört, nennt `/status` seinen Stand von heute. Bonus-Minuten zählen, sobald es an der Reihe ist. `/release` und `/quietnow` gelten für die ganze Box. Der Wochenrückblick kommt für jedes Kind einzeln.

## Anmelden mit einem Link

Der Bot schickt dir mit `/login` einen **Link**, der dich in der App anmeldet, auch ohne Passwort ([Die App öffnen und anmelden](../erste-schritte/app-oeffnen.md)).

## Sprache

Der Bot spricht **Deutsch**, wenn die **Sprache der Box** (**Einstellungen › System › Sprache**) Deutsch ist. Bei jeder anderen Sprache spricht er **Englisch**.
