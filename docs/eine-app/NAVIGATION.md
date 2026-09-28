# Navigation & alle Seiten der neuen MuPiBox-App

Aus dem Prototyp erzeugt (Stand: Korrekturen Runde 2). Bereich › Gruppe › Detailseite (höchstens 3 Ebenen). In `[…]` die Seiten-Id, in `` `…` `` der Schlüssel im Prototyp. Maschinenlesbar: `app-schema.json`.

## Start [start]

## Hören [hoeren]

### Hör-Verlauf [verlauf]

**Heute**
- Großer Wert 42 min 14 Titel · meistgehört: Benjamin Blümchen

**Letzte 7 Tage**
- Balkendiagramm (min)
- Hinweis: Insgesamt 550 Minuten in 384 Titeln.

**Top-Künstler (7 Tage)**
- Liste: Fünf Freunde · Benjamin Blümchen · Anne auf Green Gables · Rolf Zuckowski · Kinderchor

**Top-Titel (7 Tage)**
- Liste: Als Briefträger · Die Vogelhochzeit · Das Geheimnis der alten Mühle · Auf dem Mond · Kapitel 1

## Spielzeit [spielzeit]
**Sofort-Aktionen** – Bonus = +N Minuten zum heutigen Limit. Sperren aufheben = N Minuten freie Wiedergabe. Ruhe sofort = N Minuten Stopp.
- Feld „Minuten (1–1440)“ `capMin` (number), Beispiel „30“
- Knöpfe: + Bonus-Zeit (accent) · Sperren aufheben (ghost) · Ruhe sofort (ghost)

**Schlaftimer** – Die Box schaltet sich nach Ablauf komplett aus – egal, ob gerade etwas läuft.
- Regler „Minuten“ `sleepMin`: 15–360 min, Schritt 15, Standard 60
- Knöpfe: Starten (primary) · Stoppen (ghost)

**Tageslimits** – Minuten pro Wochentag. 0 = an diesem Tag gesperrt.
- Schalter „Tageslimits aktiv“ `limitOn` (Standard an)
- Wochentage Mo–So (Minuten 0–1440, Schlüssel `lim0`–`lim6`)
- Feld „Tageswechsel um (Stunde 0–23)“ `resetHour` (number), Beispiel „0“ – Zu dieser Stunde beginnt der neue Tag. Z. B. 4, damit spätes Hören nicht mittendrin abbricht.
- Auswahl „Wenn das Limit erreicht ist“ `limitGrace`: Sofort stoppen / Titel zu Ende spielen / Album zu Ende spielen; Standard „Titel zu Ende spielen“ – Podcasts dürfen immer die Folge beenden, Radio stoppt sofort. Zu Ende spielen ist auf 30 min (Titel) bzw. 3 h (Album) begrenzt.

**Ruhezeiten** – Zeitfenster je Wochentag, auch über Mitternacht. Mehrere Fenster pro Tag möglich (z. B. Hausaufgaben + Schlafenszeit).
- Schalter „Ruhezeiten aktiv“ `quietOn` (Standard an)
- Baustein `rules`
- Knöpfe: + Zeitfenster (ghost)
- Auswahl „Wenn eine Ruhezeit beginnt“ `quietGrace`: Sofort stoppen / Titel zu Ende spielen / Album zu Ende spielen; Standard „Titel zu Ende spielen“

- → Texte, die das Kind sieht – Bei Limit, Ruhezeit und QR-Code für Eltern [displaytexte]
- → Hörschutz (Maximallautstärke) – 75 % · Einstellungen › Audio [lautstaerke]

## Bibliothek [bibliothek]

### Verwaltete Inhalte [verwaltet]
Über die Suche hinzugefügte Künstler-Abos und Alben. Beim Künstler den Bereich (Folge von–bis) eingrenzen, einzelne Alben aus- oder einschließen.

**Künstler-Abos**
- Liste: Benjamin Blümchen · Fünf Freunde · Die drei ??? Kids

**Benjamin Blümchen** – Bereich und einzelne Alben
- Feld „Folge von“ `epFrom` (number), Beispiel „1“
- Feld „Folge bis“ `epTo` (number), Beispiel „180“
- Schalter „Folge 12 – Als Briefträger“ `inc12` (Standard an)
- Schalter „Folge 99 – Das Weihnachtslied“ `inc99` (Standard aus) – ausgeschlossen
- Knöpfe: Übernehmen (primary) · Abo entfernen (danger)

**Einzelne Alben**
- Liste: Die Vogelhochzeit · Pettersson kriegt Weihnachtsbesuch

### Auf Spotify suchen [suche]

- Feld „Auf Spotify suchen“ `sq` (text), Beispiel „Benjamin Blümchen“, Platzhalter „Künstler, Album oder Titel …“
- Umschalter „Suchen in“ `sType`: Alle / Künstler / Alben / Titel
- Auswahl „Hinzufügen als“ `sCat`: Hörbuch/Hörspiel / Musik / Sonstiges; Standard „Hörbuch/Hörspiel“
- Knöpfe: Suchen (primary)

**Künstler**
- Liste: Benjamin Blümchen · Bibi Blocksberg · Die drei !!! · TKKG

**Alben**
- Liste: Folge 15: im Urlaub · Folge 172: als Kapitän · Folge 120: Der Zeltausflug

**Titel**
- Liste: Benjamin Blümchen Lied · Benjamin Blümchen Titellied

### Link einfügen [link]

- Auswahl „Typ“ `lType`: Spotify-Link / Radio-Stream / Podcast (RSS); Standard „Spotify-Link“
- Feld „URL“ `lUrl` (text), Platzhalter „https://…“
- Feld „Künstler/Show-Name (optional)“ `lLabel` (text), Platzhalter „z. B. Kinderradio“
- Feld „Titel (für Radio-Streams)“ `lTitle` (text), Platzhalter „z. B. Radio Teddy“
- Auswahl „Kategorie“ `lCat`: Hörbuch/Hörspiel / Musik / Sonstiges; Standard „Hörbuch/Hörspiel“
- Knöpfe: Abbrechen (ghost) · Hinzufügen (primary)

### Vom Gerät hochladen [upload]

**Wohin?** – Titel oder ganze Ordner werden auf die SD-Karte kopiert und erscheinen danach von selbst auf dem Display.
- Auswahl „Kategorie“ `uCat`: Hörbuch/Hörspiel / Musik / Sonstiges; Standard „Hörbuch/Hörspiel“
- Feld „Interpret“ `uArtist` (text), Platzhalter „z. B. Benjamin Blümchen“
- Feld „Album“ `uAlbum` (text), Platzhalter „z. B. Folge 1 (leer = direkt beim Interpreten)“

**Dateien**
- Knöpfe: Titel wählen (ghost) · Ordner wählen (ghost) · Cover wählen (ghost)
- Hinweis: Oder Dateien und Ordner hierher ziehen.
- Balken „Hochladen“ noch nichts ausgewählt
- Werte: Frei auf der SD-Karte: 12,4 GB
- Knöpfe: Auswahl leeren (ghost) · Hochladen (primary)

### Spotify [spotify]
Oben Smart-Sync (Playlists landen automatisch auf der Box), darunter der Zugang, mit dem der Player Spotify abspielt.

**Smart-Sync · Verbindung**
- Werte: Status: ✓ Verbunden
- Knöpfe: Trennen (ghost) · Smart-Sync deaktivieren (ghost)

**Smart-Sync** – Playlists, deren Name mit dem Playlist-Präfix beginnt, landen automatisch auf der Box.
- Werte: Letzter Sync: vor 13 min · Status: fertig · Nächster Sync: in 2 min · Playlist-Präfix: MuPiBox · Zuletzt: +3 neu · 0 geändert · 1 entfernt
- Knöpfe: Jetzt synchronisieren (primary)

**Gefundene Playlists**
- Liste: MuPiBox-Hörspiele · MuPiBox-Musik · MuPiBox-Einschlafen

**Konflikte** – Inhalte, die schon manuell auf der Box sind.
- Liste: Die Vogelhochzeit

- → Sync-Einstellungen – Playlist-Präfix, Intervall, an/aus [syncopt]
- → Einrichtungs-Assistent – Spotify neu verbinden in 5 Schritten [wizard]

**Zugang des Players** – Damit der Player auf der Box Spotify abspielen kann. Spotify-App auf developer.spotify.com anlegen.
- Feld „Client ID“ `spId` (text), Beispiel „4f8c…a21e“
- Feld „Client Secret“ `spSecret` (password), Beispiel „••••••••“
- Feld „Access Token“ `spAcc` (password), Beispiel „BQD…“
- Feld „Refresh Token“ `spRef` (password), Beispiel „AQC…“
- Knöpfe: Speichern (primary)

**Zugang · Playlists & Cache**
- Schalter „Playlists verarbeiten“ `spPl` (Standard an)
- Knöpfe: Metadaten-Cache leeren (ghost)

**Zugang zurücksetzen** – Löscht die Spotify-Zugangsdaten des Players.
- Knöpfe: Spotify-Zugang zurücksetzen (danger)

#### Sync-Einstellungen [syncopt]

**Playlist-Präfix** – Spotify-Playlists, deren Name so anfängt, werden synchronisiert (z. B. „MuPiBox-Hörspiele“). Vorbelegt mit dem Namen der Box.
- Feld „Playlist-Präfix“ `prefix` (text)

**Sync-Intervall** – Manuell (Knopf oder Telegram /resync) geht immer.
- Regler „Minuten zwischen automatischen Syncs“ `syncInt`: 5–60 min, Schritt 5, Standard 15

**Smart-Sync aktiv**
- Schalter „Automatischer Sync“ `syncOn` (Standard an) – Aus = kein automatischer Sync; manuell bleibt möglich.
- Knöpfe: Speichern (primary)

#### Spotify einrichten [wizard]

**Schritt 1 – Spotify-App anlegen** – Auf developer.spotify.com anmelden und „Create app“ wählen.
- Knöpfe: developer.spotify.com öffnen (ghost)

**Schritt 2 – Felder ausfüllen** – Diese Werte in die Spotify-App kopieren.
- Werte: App name: MuPiBox · Description: MuPiBox Smart-Sync · Redirect URI: http://mupibox.local/api/spotify/callback
- Knöpfe: Kopieren (ghost)

**Schritt 3 – Client ID kopieren**
- Feld „Client ID“ `wzClient` (text), Platzhalter „aus der Spotify-App“
- Knöpfe: Speichern + weiter (primary)

**Schritt 4 – Verbindung testen**
- Knöpfe: Mit Spotify verbinden (primary)

**Schritt 5 – Playlist-Präfix** – Vorbelegt mit dem Namen der Box.
- Feld „Playlist-Präfix“ `prefix` (text)
- Knöpfe: Fertig (primary)

### NAS [nas]

**Profile** – Ein Profil speichert Server, Freigabe und Zugangsdaten.
- Auswahl „Profil“ `nasProf`: Heim-NAS / Oma & Opa; Standard „Heim-NAS“
- Knöpfe: Profil anlegen (ghost) · Laden (ghost) · Löschen (danger)

**Zugangsdaten**
- Feld „Server“ `nasHost` (text), Beispiel „192.168.178.10“
- Feld „Freigabe“ `nasShare` (text), Beispiel „Hörspiele“
- Feld „Benutzer“ `nasUser` (text), Beispiel „mupibox“
- Feld „Passwort“ `nasPw` (password), Beispiel „••••••“
- Knöpfe: Anmelden (primary) · Abmelden (ghost)

**Ordner** – Anzeigen = erscheint auf der Box. Ausblenden = bleibt verborgen. Herunterladen = auf die SD-Karte kopieren.
- Feld „Ordner filtern“ `nasFilter` (text), Platzhalter „Ordnername …“
- Baustein `checks`
- Knöpfe: Index aktualisieren (ghost) · Nur Auswahl anzeigen (ghost) · Alle (ghost) · Keine (ghost)
- Knöpfe: Auswahl speichern (primary) · Alle Downloads (ghost) · Keine Downloads (ghost) · Ausgewählte herunterladen (ghost) · Cover neu laden (ghost)

### Cover [cover]

**Eigenes Cover** – Quadratische Bilder hochladen (JPG, WEBP, GIF, PNG). Die Adresse kannst du z. B. bei Radio-Streams eintragen.
- Datei-Auswahl „Bild“ (Datei wählen)
- Knöpfe: Hochladen (primary)
- Liste: radio-teddy.png

**Online-Cover für NAS- und lokale Alben** – Alben ohne eigenes Bild bekommen ihr Cover von iTunes oder Deezer – nur bei eindeutigem Treffer. Die Ordnernamen werden dafür an Apple und Deezer geschickt.
- Schalter „Cover online suchen“ `covOn` (Standard an)
- Schalter „Auch als cover.jpg im Albumordner speichern“ `covSave` (Standard an) – Nur in Ordner ohne Bild. Auf dem NAS braucht das Schreibrecht.
- Werte: Gefunden: 538 · Kein Treffer: 1152 · Verworfen: 3
- Schalter „Auch verworfene erneut suchen“ `covDiscarded` (Standard aus)
- Knöpfe: Ohne Treffer erneut suchen (ghost) · Alle Alben jetzt suchen (primary)

**Zuletzt gefunden** – Falsches Cover? Verwerfen – das Album fällt dann auf das Bild des Ordners darüber zurück.
- Liste: 190 – Der eiskalte Clown · 188 – Die blauen Schafe von Artelsbach · Wendy

## Einstellungen [einstellungen]

### Aussehen [g-aussehen]
_Theme, Ansicht, Vorlesen, Start- & Wartungsbilder, Display-Texte_

- → Theme – Aussehen des Box-Displays [theme]
- → Eigenes Theme – Hintergrundbild hochladen [eigenes]
- → Ansicht – Cover Flow, Namen, Scrollleiste [ansicht]
- → Vorlesen – Namen vorlesen, Sprache [vorlesen]
- → Start- und Wartungsbilder – Startbild, Wartungsbild, Vorschau [startbilder]
- → Texte auf dem Display – Limit, Ruhezeit, QR-Code für Eltern [displaytexte]

#### Theme [theme]
_Aussehen des Box-Displays_

_Nach dem Wechsel lädt das Display neu._
- Baustein `themegrid`
- Auswahl „Alle 67 Themes“ `theme`: 67 Einträge (axolotl, Ballettbühne, Bastelpapier, blue, Bücherregal, captainamerica …, vollständig in app-schema.json); Standard „Tag & Nacht“

#### Eigenes Theme [eigenes]
_Hintergrundbild hochladen_

**Hintergrundbild** – Wird beim Theme „custom“ verwendet. Am besten 800 × 480 Pixel, JPG.
- Datei-Auswahl „Bild“ (Datei wählen)
- Knöpfe: Bild hochladen (primary)

#### Ansicht [ansicht]
_Cover Flow, Namen, Scrollleiste_

- Schalter „Cover-Flow-Ansicht (Bühne)“ `stage` (Standard an) – Großes Cover in der Mitte, Nachbarn kleiner.
- Schalter „Ordner- und Albumnamen anzeigen“ `names` (Standard an)
- Schalter „Horizontale Scrollleiste ausblenden“ `hideScroll` (Standard an)

#### Vorlesen [vorlesen]
_Namen vorlesen, Sprache_

- Schalter „Namen beim Anhalten vorlesen“ `tts` (Standard aus) – In der Cover-Flow-Ansicht wird der Name des mittleren Covers vorgelesen.
- Auswahl „Vorlese-Sprache“ `ttsLang`: 21 Einträge (Arabisch, Chinesisch, Dänisch, Deutsch, Englisch, Finnisch …, vollständig in app-schema.json); Standard „Deutsch“

#### Start- und Wartungsbilder [startbilder]
_Startbild, Wartungsbild, Vorschau_

**Name der Box**
- → Name der Box [ueber]

**Startbild** – 15 Szenen, die Karte oder jeden Start zufällig.
- Baustein `bootgrid`

**Wartungsbild & Vorschau** – Bei Update, Installation, neuem WLAN, beim Ausschalten und bei leerem Akku.
- Auswahl „Wartungsbild“ `maint`: 17 Einträge (Wie das Startbild, Karte (Standard), Abendhügel, Knete, Papier-Collage, Plakativ …, vollständig in app-schema.json); Standard „Wie das Startbild“
- → Sprache der Box [sprache]
- Auswahl „Vorschau“ `bsKind`: Update läuft / Installation läuft / Neues WLAN wird eingerichtet / Tschüss (schaltet aus) / Akku leer (schaltet aus); Standard „Update läuft“
- Baustein `bootprev`
- Knöpfe: Speichern (primary)

#### Texte auf dem Display [displaytexte]
_Limit, Ruhezeit, QR-Code für Eltern_

_Was das Kind sieht, wenn die Spielzeit aufgebraucht ist oder eine Ruhezeit läuft, dazu der QR-Code für Eltern. Leer = Text der Sprache._
- → Sprache der Box [sprache]
- Auswahl „Bildschirm“ `dtScreen`: Limit erreicht / Ruhezeit / QR-Code für Eltern; Standard „Limit erreicht“
- Baustein `dtprev`
- Baustein `dtfields`
- Knöpfe: Texte speichern (primary)

### Display & Bedienung [g-display]
_Helligkeit, Drehung, Haltezeiten, Display live_

- → Display – Helligkeit, Display aus, Drehung, Auflösung [displaysettings]
- → Bedienung am Display – Kategorien, Fortsetzen, Haltezeiten [bedienung]
- → Display live – Aktuelles Bild, Fernsteuerung (VNC) [displaylive]

#### Display [displaysettings]
_Helligkeit, Display aus, Drehung, Auflösung_

- Regler „Helligkeit“ `bright`: 0–100 %, Schritt 5, Standard 100
- Regler „Display aus nach“ `dispOff`: 0–120 min, Schritt 1, Standard 10 – 0 = nie ausschalten.

**Drehung** – Wird nach einem Neustart übernommen.
- Auswahl „HDMI-Drehung“ `hdmiRot`: Aus (Standard) / 90° / 180° / 270° / Horizontal spiegeln / Vertikal spiegeln; Standard „Aus (Standard)“
- Auswahl „LCD-Drehung“ `lcdRot`: Aus (Standard) / 180°; Standard „Aus (Standard)“
- Auswahl „Display-LCD-Drehung“ `dlcdRot`: Aus (Standard) / 180°; Standard „Aus (Standard)“

**Auflösung**
- Feld „Breite X in Pixel“ `resX` (number), Beispiel „800“
- Feld „Höhe Y in Pixel“ `resY` (number), Beispiel „480“
- Knöpfe: Speichern (primary)

#### Bedienung am Display [bedienung]
_Kategorien, Fortsetzen, Haltezeiten_

**Kategorien ausblenden** – Die übrigen Reiter auf dem Display verteilen sich gleichmäßig. Mindestens einer bleibt sichtbar.
- Schalter „Hörspiele ausblenden“ `hideA` (Standard aus)
- Schalter „Musik ausblenden“ `hideM` (Standard aus)
- Schalter „NAS ausblenden“ `hideN` (Standard aus)
- Schalter „Sonstiges ausblenden“ `hideO` (Standard aus)

**Haltezeiten & Fortsetzen**
- Regler „Anzahl der Fortsetzen-Einträge“ `resume`: 1–99, Schritt 1, Standard 9
- Regler „Haltezeit für die Titelliste“ `listTimer`: 0.5–5 s, Schritt 0.5, Standard 2 – So lange das Cover im Player gedrückt halten, bis die Titelliste aufgeht.
- Regler „Haltezeit für den Einstellungszugang“ `setTimer`: 1–10 s, Schritt 1, Standard 5 – So lange die Statusanzeige drücken, bis der QR-Code für Eltern erscheint.

#### Display live [displaylive]
_Aktuelles Bild, Fernsteuerung (VNC)_

**Aktuelles Bild** – So sieht das Display gerade aus. Aktualisiert sich alle paar Sekunden.
- Baustein `livescreen`
- Knöpfe: Aktualisieren (ghost)

**Fernsteuerung (VNC)** – Das Display im Browser bedienen. VNC muss unter Netzwerk › Freigaben an sein.
- Knöpfe: Fernsteuerung öffnen (primary) · Strg+Alt+Entf senden (ghost)

### Audio [g-audio]
_Lautstärke, Soundkarte, Drehregler, Bluetooth_

- → Lautstärke – Jetzt, Maximum (Hörschutz), beim Start [lautstaerke]
- → Soundkarte – Audio-Ausgabe (28 Geräte) [soundkarte]
- → Drehregler und Taster – Lautstärke per Drehregler, Taster an GPIO 10 [drehregler]
- → Bluetooth – Kopfhörer & Lautsprecher [bluetooth]

#### Lautstärke [lautstaerke]
_Jetzt, Maximum (Hörschutz), beim Start_

- Regler „Lautstärke jetzt“ `vol`: 0–100 %, Schritt 5, Standard 30
- Regler „Maximum (Hörschutz)“ `volMax`: 10–100 %, Schritt 5, Standard 75 – Gilt für Display, App und Drehregler.
- Schalter „Beim Start auf festen Wert setzen“ `volFix` (Standard an) – Sonst behält die Box den Wert von vor dem Ausschalten.
- Regler „Wert beim Start“ `volStart`: 0–100 %, Schritt 5, Standard 30
- Knöpfe: Speichern (primary)

#### Soundkarte [soundkarte]
_Audio-Ausgabe (28 Geräte)_

_Wird nach einem Neustart übernommen._
- Auswahl „Soundkarte“ `sound`: 28 Einträge (MAX98357A bcm2835-i2s-HiFi HiFi-0, Onboard 3,5-mm-Ausgang, Onboard HDMI-Ausgang, Allo Boss DAC, Allo Boss2 DAC, Allo DigiOne …, vollständig in app-schema.json); Standard „MAX98357A bcm2835-i2s-HiFi HiFi-0“
- Knöpfe: Speichern (primary)

#### Drehregler und Taster [drehregler]
_Lautstärke per Drehregler, Taster an GPIO 10_

- Schalter „Drehregler für die Lautstärke“ `rotary` (Standard aus)
- Regler „Schritt pro Raste“ `rotStep`: 1–10 %, Schritt 1, Standard 5
- Auswahl „Funktion des Tasters an GPIO 10“ `btnFn`: Aus / Play/Pause / Nächster Titel / Vorspulen; Standard „Play/Pause“
- Knöpfe: Speichern (primary)

#### Bluetooth [bluetooth]
_Kopfhörer & Lautsprecher_

- Schalter „Bluetooth“ `btOn` (Standard an) – Aus = Bluetooth-Chip aus (spart Strom). Controller: MuPiBox [AA:BB:CC:DD:EE:FF]
- Schalter „Automatisch verbinden“ `btAuto` (Standard aus) – Hilft, wenn bekannte Geräte nach dem Einschalten nicht von selbst verbinden.

**Gekoppelte Geräte**
- Liste: Kinderkopfhörer · JBL Go 3

**Neue Geräte koppeln** – Gerät in den Kopplungsmodus versetzen, dann suchen (dauert ca. 10 s).
- Knöpfe: Suchen (primary)
- Liste: Sony WH-CH520 · Unbekanntes Gerät

### Akku & Strom [g-strom]
_Akku, MuPiHAT, Ausschalten, Taster, Lüfter_

- → Akku – Stand, Spannung, Verlauf [akku]
- → MuPiHAT & Akku-Profil – Spannungen, Warnung, Abschalten, Ladeschluss [mupihat]
- → Automatisch ausschalten – Nach … Minuten ohne Wiedergabe [autoaus]
- → Ein-/Ausschalter und LED – Taster-Verzögerung, LED [taster]
- → Lüfter – Pin, Temperaturen [luefter]

#### Akku [akku]
_Stand, Spannung, Verlauf_

**Akku-Stand**
- Großer Wert 80 % OK · entlädt
- Werte: Akku-Spannung: 7,84 V · USB-Spannung: – · Akku-Strom: −488 mA · Temperatur: 36,5 °C · Ladegerät: lädt nicht

**Verlauf (24 h)**
- Balkendiagramm (%)
- Hinweis: 118 Messpunkte, zuletzt 80 % um 13:05.

#### MuPiHAT & Akku-Profil [mupihat]
_Spannungen, Warnung, Abschalten, Ladeschluss_

- Schalter „MuPiHAT aktiv“ `hatOn` (Standard an)
- Auswahl „Akku“ `battery`: ENERpower 2S3P 15.000mAh / Ansmann 2S1P / ENERpower 2S2P 10.000mAh / USB-C-Betrieb (ohne Akku) / Eigenes Profil; Standard „ENERpower 2S3P 15.000mAh“

**Akku-Profil (mV)**
- Feld „v_100 (100 %)“ `v100` (number), Beispiel „8200“ – 5000–9000
- Feld „v_75 (75 %)“ `v75` (number), Beispiel „7800“
- Feld „v_50 (50 %)“ `v50` (number), Beispiel „7400“
- Feld „v_25 (25 %)“ `v25` (number), Beispiel „7000“
- Feld „v_0 (0 %)“ `v0` (number), Beispiel „6600“
- Feld „Warnung (th_warning)“ `thWarn` (number), Beispiel „6700“ – 5500–8000
- Feld „Abschalten (th_shutdown)“ `thShut` (number), Beispiel „6600“ – 5000–7500, muss unter der Warnung liegen
- Warnung: Ladeschluss (VREG) ist sicherheitskritisch – zu hoch schadet den Zellen. Nur ändern, wenn du weißt, was du tust.
- Feld „Ladeschluss VREG (optional)“ `vreg` (number), Beispiel „8300“ – 6000–8500
- Knöpfe: Profil speichern (primary)

#### Automatisch ausschalten [autoaus]
_Nach … Minuten ohne Wiedergabe_

_Die Box schaltet sich selbst aus, wenn niemand hört._
- Regler „Ausschalten nach“ `idleOff`: 0–300 min, Schritt 5, Standard 240 – 0 = nie ausschalten.
- Knöpfe: Speichern (primary)

#### Ein-/Ausschalter und LED [taster]
_Taster-Verzögerung, LED_

- Regler „Verzögerung des Ausschalt-Tasters“ `pressDelay`: 0–5 s, Schritt 0.5, Standard 2 – So lange den Taster halten, bis die Box ausgeht.
- Auswahl „LED-Pin (OnOffShim)“ `ledPin`: 4 / 12 / 13 / 17 / 18 / 21 / 22 / 23 / 24 / 25 / 27; Standard „25“
- Regler „LED-Helligkeit normal“ `ledMax`: 0–100 %, Schritt 5, Standard 90
- Regler „LED-Helligkeit gedimmt“ `ledMin`: 0–100 %, Schritt 5, Standard 60
- Knöpfe: Speichern (primary)

#### Lüfter [luefter]
_Pin, Temperaturen_

- Schalter „Lüfter aktiv“ `fanOn` (Standard aus)
- Auswahl „Lüfter-Pin“ `fanPin`: 4 / 12 / 13 / 17 / 18 / 21 / 22 / 23 / 24 / 25 / 27; Standard „17“
- Regler „Volle Drehzahl (100 %) ab“ `fan100`: 20–90 °C, Schritt 1, Standard 75
- Regler „75 % ab“ `fan75`: 20–90 °C, Schritt 1, Standard 65
- Regler „50 % ab“ `fan50`: 20–90 °C, Schritt 1, Standard 55
- Regler „25 % ab“ `fan25`: 20–90 °C, Schritt 1, Standard 45
- Knöpfe: Speichern (primary)

### Netzwerk [g-netz]
_WLAN, Optionen, Freigaben_

- → WLAN – Verbindung, Netze, hinzufügen [wlan]
- → Netzwerk-Optionen – Onboard-WLAN, USB-WLAN, DHCP, Wächter, Fernsteuerung per IP [wlanopt]
- → Freigaben & Fernzugriff – Samba, FTP, VNC [freigaben]

#### WLAN [wlan]
_Verbindung, Netze, hinzufügen_

**Verbindung**
- Werte: Status: ● Online · Netz: Heimnetz · Signal: −40 dBm · 100 % · IP-Adresse: 192.168.178.20 · Gateway: 192.168.178.1 · DNS: 192.168.178.1 · MAC: AA:BB:CC:DD:EE:FF
- Knöpfe: Aktualisieren (ghost)

**Netze in Reichweite**
- Liste: Heimnetz · Heimnetz-Gast · FRITZ!Box 7530 XY
- Knöpfe: Neu suchen (ghost)

**Neues WLAN hinzufügen** – Die Box bleibt im aktuellen Netz und wechselt erst, wenn das neue erreichbar ist.
- Feld „Netzname (SSID)“ `ssid` (text)
- Feld „Passwort (8–63 Zeichen, leer = offenes Netz)“ `wpw` (password)
- Knöpfe: Hinzufügen (primary)

**Gespeicherte Netze** – Die aktive Verbindung kann nicht entfernt werden – sonst wäre die Box offline.
- Liste: Heimnetz · Oma & Opa · Ferienhaus

#### Netzwerk-Optionen [wlanopt]
_Onboard-WLAN, USB-WLAN, DHCP, Wächter, Fernsteuerung per IP_

**WLAN-Hardware**
- Schalter „Onboard-WLAN an“ `wOnboard` (Standard an)
- Auswahl „USB-WLAN-Treiber“ `usbDrv`: RTL88X2BU / RTL8821AU; Standard „RTL88X2BU“
- Knöpfe: Treiber installieren (ghost)
- Schalter „Stromsparen des USB-Adapters“ `usbPm` (Standard aus) – Aus = stabilere Verbindung bei manchen Adaptern.

**Verbindung**
- Schalter „DHCP-Timeout“ `dhcpTo` (Standard an) – Beim Start nicht ewig auf eine IP-Adresse warten.
- Schalter „WLAN-Wächter (DietPi-WiFi-Monitor)“ `wMon` (Standard an) – Baut die Verbindung neu auf, wenn sie abreißt.
- Schalter „Beste Verbindung suchen“ `wBest` (Standard aus) – Wechselt bei mehreren Netzen automatisch zum stärksten.
- Knöpfe: WLAN neu starten (ghost) · DHCP erneuern (ghost)

**Fernsteuerung per IP** – Falls die Box sich über den Hostnamen nicht richtig erreicht, stattdessen die IP-Adresse verwenden.
- Schalter „Backend-Steuerung per IP“ `ipCtl` (Standard aus)

#### Freigaben & Fernzugriff [freigaben]
_Samba, FTP, VNC_

- Schalter „Samba (Windows-Freigabe)“ `samba` (Standard an) – SD-Karte im Heimnetz als Laufwerk öffnen.
- Schalter „FTP-Server“ `ftp` (Standard aus)
- Schalter „VNC (Display fernsteuern)“ `vnc` (Standard an) – Nötig für „Display live › Fernsteuerung“.

### Dienste [g-dienste]
_Telegram, MQTT, WLED · Link zu Spotify_

- → Telegram – Eltern-Bot, erlaubte Chats [telegram]
- → MQTT / Home Assistant – Broker, Topic, Intervalle, Discovery [mqtt]
- → WLED – LED-Streifen per serieller Schnittstelle [wled]
- → Spotify – Zugang des Players und Smart-Sync · Bibliothek › Spotify [spotify]

#### Telegram [telegram]
_Eltern-Bot, erlaubte Chats_

**Eltern-Bot**
- Schalter „Bot aktiv“ `tgOn` (Standard an)
- Schalter „Wiedergabe melden“ `tgReport` (Standard aus) – Aus: nur Wichtiges (Hörzeit aufgebraucht, Ruhezeit, Akku fast leer, Start und Ausschalten). An: zusätzlich jeder Titel mit Bildschirmfoto, Pause, Stopp, Weiter.
- Werte: Bot-Token: ✓ eingerichtet
- Feld „Neuen Token setzen (leer = unverändert)“ `tgToken` (password), Platzhalter „123456789:ABC…“

**Erlaubte Chats** – Nur diese Chats dürfen die Box steuern. Gruppen haben negative IDs (z. B. −100…).
- Liste: Familien-Chat · Papa
- Feld „Chat-ID“ `tgNewId` (text), Platzhalter „z. B. 123456789“
- Feld „Name“ `tgNewName` (text), Platzhalter „z. B. Mama“
- Knöpfe: + Chat hinzufügen (ghost) · Chat-ID ermitteln (ghost)

_Änderungen starten den Telegram-Dienst neu._
- Knöpfe: Speichern (primary)

#### MQTT / Home Assistant [mqtt]
_Broker, Topic, Intervalle, Discovery_

- Schalter „MQTT aktiv“ `mqttOn` (Standard aus)
- Feld „Gerätename“ `mqName` (text), Beispiel „MuPiBox Kinderzimmer“
- Feld „Broker“ `mqBroker` (text), Beispiel „192.168.178.5“
- Feld „Port“ `mqPort` (number), Beispiel „1883“
- Feld „Topic“ `mqTopic` (text), Beispiel „mupibox“
- Feld „Client-ID“ `mqClient` (text), Beispiel „mupibox-01“
- Feld „Benutzer“ `mqUser` (text)
- Feld „Passwort“ `mqPw` (password)

**Intervalle**
- Regler „Aktualisierung (Wiedergabe)“ `mqRef`: 1–90 s, Schritt 1, Standard 10
- Regler „Aktualisierung (Leerlauf)“ `mqIdle`: 1–90 s, Schritt 1, Standard 60
- Regler „Timeout“ `mqTo`: 10–180 s, Schritt 5, Standard 60

**Home Assistant**
- Schalter „An Home Assistant melden“ `haOn` (Standard aus)
- Feld „Discovery-Präfix“ `haTopic` (text), Beispiel „homeassistant“
- Knöpfe: Speichern (primary)

#### WLED [wled]
_LED-Streifen per serieller Schnittstelle_

- Schalter „WLED aktiv“ `wledOn` (Standard aus)
- Feld „Serielle Schnittstelle“ `wledPort` (text), Beispiel „/dev/ttyUSB0“, Platzhalter „/dev/ttyUSB0“
- Auswahl „Baudrate“ `baud`: 300 bps / 1200 bps / 2400 bps / 4800 bps / 9600 bps / 19200 bps / 38400 bps / 57600 bps / 115200 bps / 230400 bps / 460800 bps / 921600 bps; Standard „115200 bps“

**Presets** – Nummern der Presets im WLED-Controller.
- Feld „Haupt-Preset (normaler Betrieb)“ `wledMain` (number), Beispiel „1“
- Schalter „Preset beim Start“ `wledBootOn` (Standard an)
- Feld „Preset-Nummer beim Start“ `wledBoot` (number), Beispiel „2“
- Schalter „Preset beim Ausschalten“ `wledOffOn` (Standard an)
- Feld „Preset-Nummer beim Ausschalten“ `wledOff` (number), Beispiel „3“

**Helligkeit**
- Regler „Helligkeit normal“ `wledBright`: 0–255, Schritt 5, Standard 200
- Regler „Helligkeit gedimmt“ `wledDim`: 0–255, Schritt 5, Standard 60
- Knöpfe: Speichern (primary)

### Sicherheit [g-sicherheit]
_Passwort und Anmeldung_

- → Passwort & Anmeldung – Ein Passwort für die ganze App [passwort]

#### Passwort & Anmeldung [passwort]
_Ein Passwort für die ganze App_

**Passwort** – Gilt für die ganze App – am Handy wie am PC.
- Werte: Status: Passwort ist gesetzt
- Feld „Aktuelles Passwort“ `pwCur` (password)
- Feld „Neues Passwort (mind. 6 Zeichen)“ `pwNew` (password)
- Knöpfe: Passwort ändern (primary) · Passwort entfernen (danger)

**Anmeldung**
- Schalter „Anmeldung verlangen“ `loginOn` (Standard an) – Wird sofort wirksam.
- Hinweis: Anmelden geht auch ohne Passwort: per QR-Code am Display (Statusanzeige lange drücken) oder mit einem Link über Telegram.

### System [g-system]
_Über, Updates, Backup, Neustart, Protokolle, Experten, Sprache_

- → Über die Box – Name der Box, Version, Neuigkeiten, Hardware [ueber]
- → Updates – MuPiBox-Versionen, Betriebssystem [updates]
- → Backup – Sichern und einspielen [backup]
- → Neu starten & Ausschalten – Box, Display, Dienste [neustart]
- → Protokolle – Logs und Dienst-Status [protokolle]
- → Systemoptionen – Übertakten, Turbo, Governor, SWAP … [systemopt]
- → Browser (Chromium) – GPU, Scrollen, Kiosk, Cache, Debugging [browser]
- → Experten – Hostname, JSON-Editor, Zurücksetzen, DietPi [experten]
- → Sprache – Sprache der App, Sprache der Box [sprache]

#### Über die Box [ueber]
_Name der Box, Version, Neuigkeiten, Hardware_

**Name der Box** – Erscheint im Startbild, auf dem Start der App und als Vorschlag für den Playlist-Präfix von Smart-Sync.
- Feld „Name der Box (max. 14 Zeichen)“ `boxName` (text), Platzhalter „z. B. Mias Box“ – Leer = „MuPiBox“. Der Name im Netzwerk (Hostname) steht unter Experten.

**MuPiBox**
- Werte: Version: 4.2.4 stable · Hostname: mupibox · Laufzeit: 2 h 24 min · CPU-Last (1 min): 0,39 · 4 Kerne · CPU-Temperatur: 52,1 °C · Arbeitsspeicher: 740 MB / 3,7 GB · SD-Karte: 45,5 / 58,4 GB belegt
- Balken „SD-Karte“ 12,9 GB frei

**Neuigkeiten**
- Hinweis: MuPiBox 5.0 (Beta): eine App für alles, neue Kinder-Themes, Startbilder und Akku-Anzeige. Unterstützt DietPi auf Raspberry Pi 3, 4, 5 und Zero 2.

**Support** – Sammelt Version, Konfiguration (ohne Passwörter) und Logs in einer Datei.
- Knöpfe: Support-Infos herunterladen (ghost)

#### Updates [updates]
_MuPiBox-Versionen, Betriebssystem_

**MuPiBox** – Installiert: 4.2.4 stable. Vorher ein Backup machen – die Entwicklerversion kann die Installation beschädigen.
- Baustein `versions`

**Betriebssystem** – Dauert auf älteren Raspberry Pis bis zu 30 Minuten. Browser nicht schließen und auf den Neustart warten.
- Warnung: Vorher immer ein Backup machen.
- Knöpfe: Betriebssystem aktualisieren (ghost)

#### Backup [backup]
_Sichern und einspielen_

**Sichern**
- Knöpfe: Konfigurations-Backup (primary)
- Hinweis: Cover, mupiboxconfig.json und data.json.
- Knöpfe: Voll-Backup (ghost)
- Hinweis: Zusätzlich alle Mediendateien – kann sehr groß werden.

**Einspielen**
- Datei-Auswahl „Backup-Datei“ (Datei wählen)
- Knöpfe: Backup einspielen (danger)

#### Neu starten & Ausschalten [neustart]
_Box, Display, Dienste_

**Box** – Neustart dauert etwa eine Minute. Nach dem Ausschalten muss die Box am Gerät wieder eingeschaltet werden.
- Knöpfe: Neu starten (ghost) · Ausschalten (danger)

**Display & Dienste**
- Liste: Display (Chromium) neu starten · Spotify-Dienste neu starten · PM2 neu starten · Einstellungen übernehmen

#### Protokolle [protokolle]
_Logs und Dienst-Status_

- Auswahl „Log oder Dienst (25)“ `log`: 25 Einträge (Log: idle_shutdown.log, Log: shutdown_control.log, PM2-Log: server-error.log, PM2-Log: server-out.log, PM2-Log: spotify-control-error.log, PM2-Log: spotify-control-out.log …, vollständig in app-schema.json); Standard „Log: idle_shutdown.log“
- Feld „Suche (grep)“ `grep` (text), Platzhalter „Stichwort …“
- Knöpfe: Aktualisieren (ghost) · Pause (ghost) · Herunterladen (ghost)
- Baustein `log`

**Fehlersuche**
- Schalter „Controller-Debugging“ `ctlDebug` (Standard aus) – Ausführlichere Logs des Players.
- Knöpfe: PM2-Log herunterladen (ghost)

#### Systemoptionen [systemopt]
_Übertakten, Turbo, Governor, SWAP …_

**Leistung & Start**
- Schalter „SD-Karte übertakten“ `ocSd` (Standard an)
- Schalter „PM2-Logs im RAM“ `pm2Ram` (Standard an) – Schont die SD-Karte, Logs gehen beim Neustart verloren.
- Schalter „Beim Start auf Netzwerk warten“ `waitNet` (Standard an)
- Schalter „Turbo beim Start“ `turbo` (Standard an)
- Auswahl „CPU-Governor“ `gov`: conservative / ondemand / userspace / powersave / performance / schedutil; Standard „ondemand“
- Schalter „Unterspannungs-Warnungen ausblenden“ `noWarn` (Standard aus)
- Schalter „SWAP“ `swap` (Standard an)

#### Browser (Chromium) [browser]
_GPU, Scrollen, Kiosk, Cache, Debugging_

- Schalter „GPU-Unterstützung (experimentell)“ `gpu` (Standard aus)
- Schalter „Sanftes Scrollen (experimentell)“ `smooth` (Standard aus)
- Schalter „Kiosk-Modus“ `kiosk` (Standard an)
- Auswahl „Cache-Größe“ `cache`: 0 MB / 8 MB / 16 MB / 32 MB / 64 MB / 128 MB / 256 MB / 512 MB / 1024 MB / 2048 MB; Standard „128 MB“
- Schalter „Chrome-Debugging“ `chromeDebug` (Standard aus) – Remote-Debugging des Display-Browsers.

#### Experten [experten]
_Hostname, JSON-Editor, Zurücksetzen, DietPi_

**Hostname** – Name der Box im Netzwerk (z. B. mupibox.local). Nur Buchstaben, Ziffern und Bindestrich. Wird nach einem Neustart übernommen.
- Feld „Hostname“ `host` (text), Beispiel „mupibox“
- Knöpfe: Speichern (primary)

**Konfiguration direkt bearbeiten**
- Warnung: Falsche Werte können die Box lahmlegen. Vorher ein Backup machen.
- Baustein `json`
- Knöpfe: Speichern (danger)

**Zurücksetzen**
- Liste: Box-Konfiguration zurücksetzen · Medien-Datenbank zurücksetzen · Server-Konfiguration zurücksetzen

- → DietPi-Dashboard – öffnet sich in einem neuen Fenster [ext:dietpi]

#### Sprache [sprache]
_Sprache der App, Sprache der Box_

**Sprache der App** – Nur diese App im Browser. Automatisch = Sprache des Browsers.
- Auswahl „Sprache der App“ `appLang`: 18 Einträge (Automatisch (Browser), Deutsch, English, Français, Español, Italiano …, vollständig in app-schema.json); Standard „Automatisch (Browser)“

**Sprache der Box** – Texte auf dem Display (Limit, Ruhezeit, QR-Code für Eltern) und in den Start- und Wartungsbildern.
- Auswahl „Sprache der Box“ `boxLang`: 17 Einträge (Deutsch, English, Français, Español, Italiano, Nederlands …, vollständig in app-schema.json); Standard „Deutsch“

- → Vorlese-Sprache – Eigene Einstellung mit 21 Sprachen · Aussehen › Vorlesen [vorlesen]
