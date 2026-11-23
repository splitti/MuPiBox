# Wenn Fotos fehlen

| Was du siehst | Woran es liegt | Was tun |
| --- | --- | --- |
| Kein Reiter **Fotos** am Display | Fotoanzeige aus, oder kein Album sichtbar | **Einstellungen › Fotos** einschalten; unter **Bibliothek › Fotos** ein Album auf **Am Display sichtbar** stellen |
| iPhone-Fotos (HEIC) werden nicht angenommen | das Umwandlungsprogramm fehlt | unter **Einstellungen › Fotos** **Erneut versuchen** (braucht Internet) |
| Clips fehlen | **Videos anzeigen** ist aus, oder der Clip ist länger als 3 Minuten | Videos einschalten; kürzere Clips nehmen |
| Ein Clip zeigt lange **Wird vorbereitet** | die Box wandelt ihn noch um | warten; 4K-Clips brauchen auf dem Raspberry Pi länger |
| NAS-Ordner: „keine Fotos gefunden“ | dem Konto der Box fehlen Leserechte auf dem NAS | Leserechte für die Ordner **und** die Dateien darin geben |
| Album zeigt **Gerade nicht da** | ein live gezeigtes Album, und der Dienst ist nicht erreichbar | WLAN und Dienst prüfen, **Nochmal** tippen, oder **Fotos auf der Box speichern** einschalten |
| Immich: **Rechte fehlen** | dem API-Schlüssel fehlen Rechte | neuen Schlüssel mit `album.read`, `asset.read`, `asset.view` anlegen |
| Synology: **Synology Photos nicht erlaubt** | das Konto darf die App nicht nutzen | in DSM unter **Benutzer und Gruppe › Bearbeiten › Anwendungen** erlauben |
| Synology: **Box von DSM gesperrt** | zu viele Fehlversuche | in DSM unter **Sicherheit › Schutz › Automatische Blockierung** freigeben |
| Nextcloud: **Fotos-App fehlt** | die App „Fotos“ ist in der Nextcloud aus | in Nextcloud unter **Apps** einschalten |
| Hinweis „Zwischenspeicher ist voll“ | die Grenze für gespeicherte Fotos ist erreicht | Grenze erhöhen oder weniger Alben/Ordner wählen |
| **Die Bilder machen Pause** | die Bildzeit für heute ist um | unter **Spielzeit › Bildzeit** **+10 min** oder **Heute frei** ([Bildzeit](bildzeit.md)) |

Siehe auch [Weitere Fälle](../fehlerbehebung/weitere-faelle.md).
