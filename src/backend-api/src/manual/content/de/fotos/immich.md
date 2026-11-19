# Immich

[Immich](https://immich.app) ist ein Fotodienst, den du selbst betreibst, etwa auf einem NAS oder Heimserver. Die Box zeigt deine Immich-Alben und alle Alben, die mit deinem Konto geteilt sind. Sie braucht Immich ab Version 1.106.

## API-Schlüssel anlegen

1. Immich im Browser öffnen und anmelden.
2. Oben rechts aufs Profilbild › **Kontoeinstellungen** › **API-Schlüssel** › **Neuer API-Schlüssel**.
3. Name „MuPiBox“ eingeben. Fragt Immich nach Rechten, nur diese anhaken: `album.read`, `asset.read` und `asset.view`. Mit `user.read` zeigt der Test zusätzlich deinen Kontonamen. Für Alben von Personen zusätzlich `person.read`, für die Erinnerungen `memory.read`.
4. Den Schlüssel sofort kopieren: Immich zeigt ihn nur einmal.

## Verbinden

Unter **Bibliothek › Fotos › Foto-Dienst verbinden › Immich** führt ein Assistent durch vier Schritte:

1. **Adresse**: die Adresse deines Immich mit Port, zum Beispiel `http://192.168.1.20:2283`.
2. **Schlüssel**: den API-Schlüssel einfügen.
3. **Test**: Die Box prüft Server, Version, Schlüssel und Rechte und zeigt Konto, Alben und Anzahl der Fotos und Videos.
4. **Alben**: die Alben anhaken, die am Display erscheinen sollen, und **Fertig**.

Der Schlüssel wird verschlüsselt auf der Box gespeichert und nie wieder angezeigt. Er gilt nur für die Adresse, für die er eingegeben wurde.

| Meldung beim Test | Was tun |
| --- | --- |
| **Server nicht erreichbar** | Adresse und Port prüfen; die Box muss Immich im Heimnetz erreichen |
| **Schlüssel ungültig** | den ganzen Schlüssel kopieren, notfalls einen neuen anlegen |
| **Rechte fehlen** | einen Schlüssel mit `album.read`, `asset.read` und `asset.view` anlegen |
| **Immich-Version zu alt** | Immich aktualisieren |

## Personen, Favoriten und Erinnerungen

Im letzten Schritt (**Alben und Personen**) gibt es neben den Alben:

- **Personen**: Personen, die Immich am Gesicht erkennt und die dort einen Namen haben. Jede angehakte Person wird ein eigenes Album; ein **gemeinsames Album** aus zwei oder drei Personen zeigt die Fotos, auf denen alle sind. Am Display steht vorne das Gesicht. Braucht `person.read`.
- **Favoriten**: alle Fotos mit Herz in Immich.
- **Erinnerungen**: die Fotos, die Immich heute als Erinnerung zeigt – „heute vor einem Jahr“ und mehr, und in den Tagen vor einem Geburtstag die Fotos der Person. Das Album ist jeden Tag neu; die Box gleicht es kurz nach Mitternacht ab. An Tagen ohne Erinnerung ist es nicht am Display. Braucht `memory.read`.

Personen und Favoriten können sehr viele Fotos haben: **Bilder je Personen-Album** begrenzt sie; gibt es mehr, wählt die Box gleichmäßig aus allen Jahren aus.

Auf der Seite von Immich änderst du danach Alben, Abgleich, Zwischenspeicher, Adresse und Schlüssel. Ob die Box die Fotos speichert oder live holt, steht unter [Foto-Dienste: speichern oder live](speichern-oder-live.md).
