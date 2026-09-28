# Zielbild: eine MuPiBox-App für alles

Die MuPiBox bekommt **eine einzige Web-App**. Sie ersetzt das heutige **Admin-Interface** (PHP, Port 80) und die
heutige **Eltern-App** (Web-App, Port 8200) vollständig und ist wie heute das Admin-Interface direkt unter der
Adresse der Box erreichbar (Port 80). Ein Login, ein Design, hell und dunkel, Handy und PC.

In Klammern steht bei jedem Punkt, wo es ihn **heute** gibt:
`A:` = Admin-Interface (Seite › Abschnitt), `E:` = Eltern-App (Bildschirm). Die vollständigen Felder, Optionen
und Wertebereiche stehen in `bestand-admin.md` und `bestand-eltern-app.md`.

## Navigation

- **Handy:** Leiste unten mit 5 Bereichen: **Start · Hören · Spielzeit · Bibliothek · Einstellungen**
- **PC (ab ca. 960 px):** Seitenleiste links mit denselben 5 Bereichen; bei „Einstellungen“ klappen die Gruppen
  darunter auf
- **Kopfleiste:** Zurück (auf Unterseiten), Titel (auf Start der Boxname), Hell/Dunkel, Abmelden
- **Einstellungen** haben oben ein **Suchfeld** („WLAN“, „Lüfter“, „Passwort“ …), weil es sehr viele sind
- Höchstens drei Ebenen: Bereich › Gruppe › Detailseite

## 1. Start

- **Läuft gerade:** Cover, Titel, Interpret · Kategorie, Fortschritt mit Zeiten, Zurück / Play-Pause / Vor /
  Stopp, Lautstärke mit Markierung der Maximallautstärke (E: Startseite)
- **Nichts läuft:** MuPi und „Etwas abspielen“ → Hören
- **Status-Kacheln:** Akku (%, lädt), Heute gehört (x / y min), Ruhezeit (aktiv / ab …), WLAN (Netzname)
  (E: Startseite)
- **Schnell:** +15 min, Ruhe sofort, Schlaftimer (E: Spielzeit & Ruhe › Sofort-Aktionen / Schlaftimer)
- **Hinweis-Karte**, nur wenn nötig: Update verfügbar, Akku fast leer, Spotify-Anmeldung abgelaufen
  (A: Home › MuPiBox-News, Admin › Updates; E: Spotify Smart-Sync)

## 2. Hören

- **Wiedergabe starten:** Suche, Filter Alle / Hörspiel / Musik / Radio / NAS, Cover-Raster, Ordner-Navigation
  mit Brotkrümeln; Tippen spielt auf der Box ab (E: Wiedergabe starten)
- **Hör-Verlauf:** Heute (Minuten, Anzahl, meistgehört), letzte 7 Tage als Balken, Top-Künstler, Top-Titel
  (E: Hör-Verlauf)

## 3. Spielzeit

- **Heute:** Ring mit verbleibender Zeit, „x von y Minuten gehört“, Status (normal / Nachspielzeit / gesperrt),
  Ruhezeit-Status (E: Spielzeit & Ruhe › Heute)
- **Sofort-Aktionen:** Bonus-Zeit (Minuten, +15 als Schnellwahl), Sperren aufheben, Ruhe sofort
  (E: Spielzeit & Ruhe › Sofort-Aktionen)
- **Schlaftimer:** Minuten 15–360 in 15er-Schritten, Starten / Stoppen, laufender Countdown
  (A: Parental › Timer settings; E: Spielzeit & Ruhe › Schlaftimer)
- **Tageslimits:** an/aus, Minuten je Wochentag (0–1440, 0 = gesperrt), Tageswechsel um (Stunde 0–23),
  „Wenn das Limit erreicht ist“: sofort stoppen / Titel zu Ende / Album zu Ende
  (A: Parental › Daily playtime limit; E: Spielzeit & Ruhe › Tageslimits)
- **Ruhezeiten:** an/aus, Regeln je Wochentag (von, bis, Bezeichnung; über Mitternacht möglich), Bearbeiten in
  einem Blatt, „Wenn eine Ruhezeit beginnt“: sofort stoppen / Titel zu Ende / Album zu Ende
  (A: Parental › Quiet hours; E: Spielzeit & Ruhe › Ruhe-Zeiten)
- Link „Texte, die das Kind bei Limit und Ruhezeit sieht“ → Einstellungen › Aussehen › Texte auf dem Display

## 4. Bibliothek

- **Inhalte:** alle Inhalte der Box (Spotify, Radio, Podcasts, lokale Ordner) mit Suche, Filter Kategorie
  (Hörspiel / Musik / Sonstiges) und Quelle (manuell / Sync), Bearbeiten, Löschen
  (E: Bibliothek; A: Media, MuPiBox)
- **Verwaltete Inhalte:** Künstler-Abos und Alben aus der Suche, Folgen von–bis, Alben ein-/ausschließen,
  entfernen (E: Bibliothek › Verwaltete Inhalte)
- **Hinzufügen** (Blatt mit 3 Wegen): Auf Spotify suchen (Künstler / Alben / Titel, „hinzufügen als“ Kategorie) ·
  Link einfügen (Spotify-Link, Radio-Stream, Podcast/RSS; Künstlername, Titel, Kategorie) · Vom Gerät hochladen
  (Kategorie, Interpret, Album, Titel / Ordner / Cover, Ablagefläche, Fortschritt, freier Platz)
  (E: Bibliothek, Spotify-Suche, Hochladen)
- **Spotify Smart-Sync:** Verbindung, letzter / nächster Sync, Jetzt synchronisieren, gefundene Playlists,
  Konflikte; Einstellungen: Box-Name als Playlist-Präfix, Intervall (5–60 min), an/aus; Einrichtungs-Assistent
  in 5 Schritten (E: Spotify Smart-Sync, Sync-Einstellungen, Assistent)
- **NAS:** Profile (anlegen, laden, löschen, Zugangsdaten), Ordner-Index mit Filter, Auswahl anzeigen /
  alle / keine, Auswahl speichern, Ordner auf die SD-Karte herunterladen, Cover neu laden (A: NAS)
- **Cover:** eigenes Cover hochladen / löschen; Online-Cover für NAS- und lokale Alben (an/aus, als cover.jpg
  speichern, erneut suchen, falsches Cover verwerfen) (A: Cover)

## 5. Einstellungen

### Aussehen
- **Theme:** Auswahl aus 67 Themes mit Vorschau (A: MuPi-Conf › MuPiBox settings; E: Aussehen)
- **Eigenes Theme:** Hintergrundbild hochladen (A: MuPi-Conf › Custom theme)
- **Ansicht:** Cover Flow (Bühne), Ordner-/Albumnamen anzeigen, horizontale Scrollleiste ausblenden
  (A: MuPi-Conf › MuPiBox settings; E: Aussehen)
- **Vorlesen:** Namen beim Anhalten vorlesen, Vorlese-Sprache (21 Sprachen) (A: MuPi-Conf › MuPiBox settings)
- **Start- und Wartungsbilder:** Name der Box (max. 14 Zeichen), Startbild (15 Szenen + Zufall), Wartungsbild,
  Sprache der Texte, Vorschau (Update, Installation, neues WLAN, Tschüss, Akku leer)
  (A: MuPi-Conf › Boot & maintenance screens; E: Aussehen)
- **Texte auf dem Display:** Sprache (17), eigene Texte für „Limit erreicht“, „Ruhezeit“, „QR-Code für Eltern“
  mit Live-Vorschau 800 × 480 (A: MuPi-Conf › Display texts; E: Spielzeit & Ruhe › Texte auf dem Display)

### Display & Bedienung
- **Display:** Helligkeit, Display aus nach … Minuten, Drehung (HDMI, LCD, Display-LCD), Auflösung X / Y
  (A: MuPi-Conf › Display settings; E: Akku › Auto-Shutdown)
- **Bedienung am Display:** Kategorien ausblenden (Hörspiele / Musik / NAS / Sonstiges), Anzahl der
  Fortsetzen-Einträge (1–99), Haltezeit für die Titelliste (0,5–5 s), Haltezeit für den Einstellungszugang
  (1–10 s) (A: Admin › Control system; MuPi-Conf › MuPiBox settings)
- **Display live:** aktuelles Bild des Displays, Fernsteuerung (VNC) (A: Home › Current Screen, VNC, MuPiBox)

### Audio
- **Lautstärke:** jetzt, Maximum (Hörschutz), beim Start fester Wert an/aus + Wert
  (A: MuPi-Conf › Audio settings; E: System › Audio)
- **Soundkarte:** Auswahl (28 Geräte) (A: MuPi-Conf › Audio settings)
- **Drehregler und Taster:** Drehregler an/aus, Schritt pro Raste, Funktion des Tasters an GPIO 10
  (A: MuPi-Conf › Audio settings)
- **Bluetooth:** an/aus, automatisch verbinden, gekoppelte Geräte (verbinden, entfernen), neue Geräte suchen
  und koppeln (A: Bluetooth; E: Bluetooth)

### Akku & Strom
- **Akku:** Stand, Spannung, Strom, Temperatur, Ladegerät, Verlauf 24 h (A: MuPiHAT › Status; E: Akku)
- **MuPiHAT:** an/aus; Akku-Profil: Spannungen für 100 / 75 / 50 / 25 / 0 %, Warnung, Abschalten,
  Ladeschluss (VREG) (A: MuPiHAT › Configuration; E: Akku › Aktives Akku-Profil)
- **Automatisch ausschalten:** nach … Minuten ohne Wiedergabe (A: Parental › Timer settings; E: Akku)
- **Ein-/Ausschalter und LED:** Verzögerung des Ausschalt-Tasters, LED-Pin, LED-Helligkeit normal / gedimmt
  (A: MuPi-Conf › Power-on settings)
- **Lüfter:** an/aus, Pin, Temperaturen für 25 / 50 / 75 / 100 % (A: MuPi-Conf › Fan-Control)

### Netzwerk
- **WLAN:** Status, Netzname, Signal, IP / Gateway / DNS / MAC, Netze in Reichweite, hinzufügen,
  gespeicherte Netze entfernen (A: Network › WiFi Settings; E: WLAN)
- **WLAN-Optionen:** Onboard-WLAN an/aus, USB-WLAN-Treiber installieren, Stromsparen des USB-Adapters,
  DHCP-Timeout, WLAN neu starten, DHCP erneuern, WLAN-Wächter, beste Verbindung suchen (A: Network › Misc Options,
  Services)
- **Freigaben & Fernzugriff:** Samba, FTP, VNC an/aus (A: Network › Services)

### Dienste
- **Telegram:** Eltern-Bot an/aus, Wiedergabe melden, Token, erlaubte Chats (ID, Name), Chat-ID ermitteln
  (A: Smart › Telegram; E: Telegram)
- **MQTT / Home Assistant:** an/aus, Gerätename, Broker, Port, Topic, Client-ID, Benutzer, Passwort,
  Intervalle, Timeout, an Home Assistant melden, Discovery-Präfix (A: Smart › MQTT)
- **WLED:** an/aus, Schnittstelle, Baudrate, Presets für Start / Ausschalten, Helligkeit (A: Smart › WLED)
- **Spotify-Zugang des Players:** Client-ID und Secret, Access- und Refresh-Token, Playlist-Verarbeitung,
  Metadaten-Cache leeren, Verbindung zurücksetzen (A: Spotify)
- **Fernsteuerung per IP:** Backend-Steuerung an/aus (A: Admin › MuPiBox settings and services)

### Sicherheit
- **Ein Passwort** für die ganze App: setzen, ändern (mit altem Passwort), entfernen; Anmeldung an/aus
  (A: Admin › Login settings; E: System › Eltern-Passwort)
- Hinweis: Anmelden geht auch per QR-Code am Display oder Link über Telegram

### System
- **Über die Box:** Version, Neuigkeiten, Hostname, Laufzeit, Last, Temperatur, Speicher, SD-Karte,
  Support-Infos herunterladen (A: Home; E: System › Box-Status)
- **Updates:** MuPiBox-Versionen (stabil / Beta / Dev), Betriebssystem (A: Admin › Updates)
- **Backup:** Konfigurations-Backup, Voll-Backup herunterladen, Backup einspielen (A: Admin › Backup and restore)
- **Neu starten:** Box neu starten, ausschalten, Display (Chromium) neu starten, Dienste neu starten
  (Spotify, PM2), Einstellungen übernehmen (A: Admin, Kopfleiste; E: System › Box-Steuerung)
- **Protokolle:** Logs und Dienst-Status mit Suche, Pause, Download, PM2-Log (A: Logs, Admin › Logging / Debug)
- **Systemoptionen:** Hostname, SD-Karte übertakten, PM2-Logs im RAM, beim Start auf Netzwerk warten, Turbo,
  CPU-Governor, Unterspannungs-Warnungen, SWAP (A: MuPi-Conf › System settings)
- **Browser (Chromium):** GPU, sanftes Scrollen, Kiosk-Modus, Cache-Größe, Debugging an/aus
  (A: MuPi-Conf › Chromium browser parameters; Admin › Logging / Debug)
- **Experten:** Konfiguration direkt bearbeiten (JSON-Editor, mit Warnung), Zurücksetzen (Spotify-Verbindung,
  Medien-Datenbank, Server-Konfiguration), DietPi-Dashboard (externer Link) (A: JSON, Admin › Reset configuration)
- **Sprache der App:** Automatisch / Deutsch / English (E: Startseite › Sprache)

## Was wegfällt oder aufgeht

- Die doppelten Einstellungen (Spielzeit, Ruhezeiten, Schlaftimer, Theme, Startbilder, Display-Texte,
  Lautstärke, Display aus, Auto-Shutdown, Akku-Profil, WLAN, Bluetooth, Telegram, Passwort, Neustart) gibt es
  nur noch einmal
- „Reiter im Menü ausblenden“ (A: Admin › Control system) wird nicht mehr gebraucht
- Die Seite „MuPiBox“ (A: content.php, bettet das Display ein) geht in „Hören“ und „Display live“ auf
- Die Seite „Media“ (A: media.php, Übersicht der Medien-Datenbank) geht in „Bibliothek › Inhalte“ auf
- Zwei Logins (Admin-Passwort und Eltern-Passwort) werden zu einem
