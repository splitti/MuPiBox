# Dateien, Ports und Dienste

Diese Seite ist für alle, die der Box „unter die Haube“ schauen wollen, zum Beispiel per SSH. Im Normalbetrieb brauchst du sie nicht.

## Wichtige Dateien und Ordner

| Pfad | Inhalt |
| --- | --- |
| `/etc/mupibox/mupiboxconfig.json` | die Konfiguration der Box. Die App schreibt hier hinein, ebenso der Editor unter **Experten** |
| `/home/dietpi/.mupibox/Sonos-Kids-Controller-master/` | die installierte Software: Server, App (`mupi-app/`), Display (`www/`) und dieses Handbuch (`manual/`) |
| `/home/dietpi/.mupibox/spotifycontroller-main/` | der Player (Spotify und lokale Wiedergabe) |
| `/home/dietpi/MuPiBox/media/` | die Medien auf der Speicherkarte (das ist auch die Samba-Freigabe `mupibox`) |
| `/home/dietpi/MuPiBox/sysmedia/` | Systemdateien: Startbilder, Töne |
| `/home/dietpi/mupibox-backups/` | die Sicherungen vor einem Update (`before-update-….zip`, die drei neuesten) |
| `/usr/local/bin/mupibox/` | die Skripte der Box (Ausschalten, Drehregler, Netzwerk und mehr) |
| `/tmp/playerstate` | der Zustand des Players: `play` oder `pause` |
| `/tmp/shutdown_control.log` | Log des Ausschalt-Tasters |
| `/tmp/idle_shutdown.log` | Log des automatischen Ausschaltens |

> [!WARNING]
> Die Konfigurationsdatei enthält Zugangsdaten (Telegram-Token, Spotify, NAS). Gib sie nicht weiter. Wenn du Hilfe brauchst, nimm die **Support-Infos** unter **Einstellungen › System › Über die Box**: Sie lassen Passwörter, Tokens und Konten weg ([Protokolle und Zustand](../wartung/protokolle.md)).

## Ports

| Port | Wer | Wofür |
| --- | --- | --- |
| 80 und 443 | Webserver | die App (`/app/`), dieses Handbuch (`/manual/`) und die Admin-Oberfläche. Anfragen für App und Schnittstelle leitet er an den Server weiter |
| 8200 | Server | Display und Schnittstelle der Box selbst. Das Display läuft über `http://localhost:8200`. Die App ist hier immer per http erreichbar (`/app/`) |
| 5005 | Player | die Schnittstelle des Players. Sie nimmt nur Befehle von der Box selbst an, nicht aus dem Netzwerk |

## Programme (PM2)

Zwei Programme laufen unter **PM2**:

- `server`: Server mit App, Schnittstelle und Handbuch,
- `spotify-control`: der Player.

Ihre Meldungen stehen unter **Einstellungen › System › Protokolle** in den Logs `server-out.log`, `server-error.log`, `spotify-control-out.log` und `spotify-control-error.log`.

## Dienste (systemd)

Weitere Aufgaben erledigen Dienste, deren Namen mit `mupi_` beginnen. Die wichtigsten:

| Dienst | Aufgabe |
| --- | --- |
| `mupi_startstop` | startet und beendet die Box-Abläufe beim Hoch- und Herunterfahren |
| `mupi_idle_shutdown` | schaltet die Box nach langer Stille aus |
| `mupi_check_internet` | prüft die Verbindung (Statusanzeige) |
| `mupi_rotary` | Drehregler |
| `mupi_fan` | Lüfter |
| `mupi_hat`, `mupi_hat_control` | MuPiHAT und Akku |
| `mupi_powerled` | Betriebs-LED |
| `mupi_telegram` | Telegram-Bot |
| `mupi_mqtt` | MQTT und Home Assistant |
| `mupi_tls` | Zertifikat für HTTPS (bei jedem Start und täglich über `mupi_tls.timer` geprüft) |
| `mupi_vnc`, `mupi_novnc` | Fernsteuerung des Displays |
| `mupi_wifi`, `mupi_autoconnect-wifi`, `mupi_ethernet` | WLAN und LAN |
| `mupi_autoconnect_bt` | Bluetooth automatisch verbinden |
| `mupi_goodbye` | das Abschiedsbild bis zum Stromaus |
