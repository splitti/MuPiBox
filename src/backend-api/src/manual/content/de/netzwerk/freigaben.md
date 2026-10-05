# Freigaben und Fernsteuerung

**Einstellungen › Dienste › Freigaben & Fernzugriff**

| Dienst | Wofür |
| --- | --- |
| **Samba (Windows-Freigabe)** | den Medien-Ordner der Box im Heimnetz als Laufwerk öffnen, um Medien zu kopieren |
| **FTP-Server** | Zugriff per FTP (Port 21) |
| **VNC (Display fernsteuern)** | das Display im Browser sehen und bedienen |

Einschalten installiert, was noch fehlt. Das kann ein paar Minuten dauern. Ausschalten hält den Dienst nur an.

## Samba

Mit Samba taucht die Box im Netzwerk deines Windows-PCs, Macs oder Linux-Rechners auf. Die Freigabe heißt `mupibox` (unter Windows `\\<Name oder IP der Box>\mupibox`). Melde dich mit dem Benutzer `dietpi` und dem Passwort `mupibox` an. Die Freigabe zeigt den Ordner `/home/dietpi/MuPiBox/media` der Box. Du kopierst Ordner hinein wie auf einen USB-Stick ([Eigene Hörspiele und Musik](../inhalte/lokale-medien.md)).

## FTP

FTP ist eine ältere Alternative, ebenfalls zum Kopieren von Dateien. Schalte es nur ein, wenn du es brauchst, denn ein Dienst, der nicht läuft, ist auch kein Angriffspunkt.

## VNC und „Display live“

VNC ist nötig für die **Fernsteuerung (VNC)** unter **Einstellungen › Display & Bedienung › Display live**: Dort bedienst du das Display im Browser, zum Beispiel wenn die Box an einem Ort steht, an dem du das Touch-Display nicht erreichst. **Fernsteuerung öffnen** zeigt das Display in der Seite, auch im Vollbild oder in einem neuen Tab. Die Fernsteuerung nutzt die Anmeldung der App und braucht kein eigenes Passwort.

> [!WARNING]
> Mit der Fernsteuerung kann man alles tun, was am Display möglich ist. Schütze die App deshalb mit einem Passwort ([Passwort und HTTPS](sicherheit.md)).
