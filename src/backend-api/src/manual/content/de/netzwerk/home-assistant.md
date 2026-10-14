# Home Assistant

Mit **Home Assistant** kannst du die Box anzeigen und steuern: was gerade läuft (mit Cover), Lautstärke, Pause, Weiter und Zurück, Springen im Titel und wo die Box spielt (Lautsprecher, Kopfhörerbuchse, Bluetooth-Kopfhörer). Dazu zeigt Home Assistant Akkustand, WLAN-Signal, Prozessorlast, Temperatur, Arbeitsspeicher und Speicherplatz. Die Verbindung läuft verschlüsselt (HTTPS) und nur im Heimnetz. In Home Assistant brauchst du dafür die Integration **MuPiBox** aus HACS.

> [!NOTE]
> Das ist die neue Anbindung über die Home-Assistant-Schnittstelle der Box. Die ältere Anbindung über einen MQTT-Broker mit MQTT-Discovery gibt es weiter ([MQTT](mqtt.md#mqtt-discovery)). Du brauchst nur eine von beiden.

## Einschalten

Unter **Einstellungen › Dienste › Home Assistant** schaltest du **Home Assistant erlauben** ein. Die Box nimmt dann auf Port 8443 Verbindungen an und meldet sich im Heimnetz (mDNS), damit Home Assistant sie von selbst findet. Ist der Schalter aus, läuft dafür nichts auf der Box.

## Koppeln

1. In Home Assistant die Integration **MuPiBox** hinzufügen. Die Box erscheint von selbst; sonst die Adresse eingeben, die die App anzeigt.
2. Home Assistant fragt nach dem **Schlüssel** der Box. In der App unter **Koppeln** auf **Schlüssel kopieren** tippen und ihn in Home Assistant einfügen. Dort lassen sich auch die zusätzlichen Rechte wählen (**Nachrichten und Ansagen**, **Neustart und Ausschalten**).
3. In der App auf **Koppeln erlauben (60 s)** tippen, dann in Home Assistant auf **Weiter**.
4. Hat Home Assistant mehr als anzeigen und steuern gewählt, fragt das Display zuerst: **Alles erlauben** oder **Nur anzeigen und steuern**.
5. Das Display zeigt einen **sechsstelligen Code** und die Rechte, die Home Assistant bekommt. Den Code in Home Assistant eingeben.

Der Schlüssel beweist, dass Home Assistant wirklich mit deiner Box spricht und nicht mit einem anderen Gerät im Netz. Nimm ihn deshalb nur aus der App (oder vom Display der Box, das ihn beim Koppeln ebenfalls zeigt), nie aus einer anderen Quelle. Klappt das Kopieren im Browser nicht, markiert die App den Schlüssel, dann kopierst du ihn selbst.

Der Code steht nur auf dem Display der Box. Wer ihn eingibt, hat die Box also vor sich. Er gilt 5 Minuten und nur einmal. Nach fünf falschen Versuchen ist die Kopplung beendet, und es geht nach einer Minute neu. Auch die zusätzlichen Rechte lassen sich nur am Display erlauben. Sollen sie später dazukommen oder wegfallen, in Home Assistant bei der MuPiBox auf **Konfigurieren** gehen: Home Assistant koppelt dann neu (wieder mit **Koppeln erlauben** in der App, Freigabe und Code am Display) und entfernt die alte Kopplung danach selbst.

## Was Home Assistant noch kann

- **Bildschirmfoto**: Home Assistant kann zeigen, was gerade auf dem Display der Box steht. Während eine Kopplung offen ist, gibt es kein Bildschirmfoto: Der Code ist nur für den, der vor der Box steht.
- **Update**: Home Assistant zeigt, ob es eine neuere Version der Box gibt. Installiert wird das Update weiter in der App.
- **Nachrichten** (Recht „Nachrichten und Ansagen“): Ein kurzer Text erscheint auf dem Display, bis seine Zeit um ist oder jemand darauf tippt.
- **Ansagen** (Recht „Nachrichten und Ansagen“): Die Box spricht einen Text mit der Sprachausgabe. Dafür muss unter **Einstellungen › Audio › Sprachausgabe** eine Stimme eingestellt sein.
- **Neustart und Ausschalten** (Recht „Neustart und Ausschalten“): Die Box startet neu oder fährt herunter, wie mit dem Knopf in der App.

Während einer Ruhezeit zeigt die Box keine Nachrichten und spricht keine Ansagen.

## Gekoppelte Home Assistants

Die App listet unter **Gekoppelt** jedes Home Assistant mit seinen Rechten. **Entfernen** beendet die Kopplung sofort. Danach muss Home Assistant neu gekoppelt werden.

## Gut zu wissen

- Die Lautstärke aus Home Assistant hält sich an das Maximum der Box, bei Kopfhörern an die Grenze für Kopfhörer.
- Die Spielzeit und die Ruhezeiten gelten auch für Home Assistant. Ist die Wiedergabe gesperrt, startet auch Home Assistant nichts.
- Ändern sich die IP-Adresse oder der Name der Box, bleibt die Kopplung bestehen: Der Schlüssel der Box ändert sich dabei nicht.
