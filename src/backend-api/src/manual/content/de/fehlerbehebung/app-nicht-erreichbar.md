# Die App ist nicht erreichbar

Die Adresse der Box lässt sich im Browser nicht öffnen? Prüfe der Reihe nach:

## 1. Läuft die Box?

Nach dem Einschalten braucht die Box ein bis zwei Minuten, bis alles bereit ist. Zeigt das Display die Startseite, läuft sie.

## 2. Gleiches Netzwerk

Handy oder PC müssen **im selben Netzwerk** sein wie die Box (dasselbe WLAN oder dasselbe Heimnetz). Ein Gäste-WLAN des Routers oder mobile Daten reichen nicht.

## 3. Richtige Adresse

- Hat die Box nach einem WLAN-Wechsel eine **neue IP-Adresse** bekommen? Die aktuelle zeigt die Netzwerkseite am Display ([Einstellungen am Display](../bedienung/eltern-zugang.md)) oder die Geräteliste deines Routers.
- Funktioniert `mupibox.local` nicht, nimm die IP-Adresse. Manche Netzwerke und Geräte lösen `.local`-Namen nicht auf.
- Die App geht mit `http://` und mit `https://`. Die Box sorgt bei jedem Start selbst für ihr Zertifikat ([Passwort und HTTPS](../netzwerk/sicherheit.md)).

## 4. Browser-Warnung bei HTTPS

Warnt der Browser vor einem **unsicheren Zertifikat**, ist das bei der Box normal: Das Zertifikat stammt von der Box selbst. Du kannst die Warnung bestätigen und trotzdem weitergehen. Damit sie verschwindet, installierst du das Zertifikat einmal auf dem Gerät ([Passwort und HTTPS](../netzwerk/sicherheit.md)). Oder du öffnest die App über `http://`.

> [!WARNING]
> Hast du **http auf https umleiten** eingeschaltet und das Zertifikat auf deinem Gerät ist nicht installiert, warnt der Browser bei jedem Besuch. Wechsle auf ein Gerät, das der Box vertraut, oder öffne die App über Port 8200 (`http://<IP-Adresse>:8200/app/`). Dort ist sie immer per http erreichbar. Dann kannst du die Umleitung wieder ausschalten.

## 5. Mit dem Display hineinkommen

Kommst du gar nicht in die App, scannst du den **QR-Code am Display**: Statusanzeige gedrückt halten ([Einstellungen am Display](../bedienung/eltern-zugang.md)). Er führt direkt in die App und meldet dich an.

## 6. Dienst neu starten

Läuft das Display, aber die App antwortet nicht, startet ein Neustart der Box den Server neu ([Neu starten und Ausschalten](../wartung/neustart.md)).
