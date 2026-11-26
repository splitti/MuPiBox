# Utan DSI-display

Med reglaget **Kör utan DSI-display** körs boxen utan skärm. Det är tänkt för en box som till exempel bara styrs med **NFC-taggar** och **knappar**, med eller utan [OLED-display](oled.md). Den ställs då in via **webbappen**.

Sedan MuPiBox 5.1 är det ett reglage i själva boxen. Tidigare fanns det bara i tillägget OLED-display. Ett reglage som redan var på där förblir på.

## Vad som ändras

Efter **nästa omstart**:

- Det startar **ingen kiosk**: ingen X-server och, utan Håll Spotify redo, ingen Chromium. Det sparar arbetsminne och ström.
- Boxen **väntar inte vid starten** på displayen; de övriga tjänsterna startar genast.
- En **NFC-tagg startar sitt media direkt**, utan att en display hämtar det: Servern skickar starten till spelaren. Det går med egna filer, ljudboksmappar, NAS, radio, poddar, TIDAL, Jellyfin och Audible.
- **Spotify** går bara med **Håll Spotify redo** (se nedan): Boxens Spotify-spelare körs i displayens webbläsare. Utan det reglaget spelar en tagg med ett Spotify-album ingenting.
- Boxen styrs via **webbappen**, **NFC**, **knappar** och, om det finns, **OLED-displayen**.

## Slå på

1. Öppna i webbappen **Inställningar › Display**.
2. Slå på reglaget **Kör utan DSI-display** i kortet **Utan DSI-display**.
3. **Starta om** boxen.

Fram till omstarten visar kortet **gäller efter omstarten**. Så länge ett **DSI-display är anslutet** går reglaget inte att slå på: Boxen skulle annars starta med mörk display.

En display räknas som ansluten när dess **touchchip** meddelar sig på I2C-bussen (till exempel vid den officiella 7"-displayen, vid Waveshare och EDATEC) eller anslutningen levererar en **EDID**. DSI-anslutningen själv säger inget om det: Kärnan rapporterar den som ansluten så snart en DSI-overlay står i `config.txt` (**displaymodellen**), även utan display. Hittar boxen ingen display står en anmärkning under reglaget, och appen **frågar vid påslagning**. En display utan touchchip och utan EDID känner boxen inte igen: Sitter en sådan på och du bekräftar förblir den mörk efter omstarten; slå då av reglaget i webbappen igen.

För det ställer boxen om starten av DietPi från kioskinloggning till manuell inloggning (`dietpi-autostart 0`) och skriver in `mupibox.headless` i sin konfiguration. Det som var inställt förut noterar den.

## Håll Spotify redo

Är **Kör utan DSI-display** på visas under det reglaget **Håll Spotify redo**. Med det startar boxen webbläsaren **osynligt i bakgrunden**, utan skärm. Där körs boxens Spotify-spelare som annars på displayen: Spotify-rutor, NFC-taggar med Spotify-album och Spotify Connect spelar då även utan display.

- Webbläsaren behöver ungefär **lika mycket arbetsminne som drift med display** (utan X-server snarare lite mindre). Det som går med display går alltså också så.
- Körs boxen redan utan display är Spotify genast där efter påslagningen. Annars efter nästa omstart.
- Att stänga av avslutar webbläsaren direkt.

## Tillbaka till DSI-displayen

Slå av reglaget och starta om boxen: Boxen ställer åter starten på kiosken (`dietpi-autostart 11`) eller på det som var inställt förut.

Sitter det ett **DSI-display** vid starten fastän reglaget är på (till exempel efter en återställning ur en annan boxs säkerhetskopia eller om displayen anslöts senare) slår boxen av sig själv på kiosken igen. Efter nästa omstart är displayen tillbaka.

> [!NOTE]
> Utan kiosk finns ingen visning på DSI-displayen, inte heller för felmeddelanden eller installationen. Kontrollera innan du slår på att boxens **webbapp** går att nå.
