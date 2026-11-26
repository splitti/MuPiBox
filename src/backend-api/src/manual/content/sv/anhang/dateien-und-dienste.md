# Filer, portar och tjänster

Den här sidan är för alla som vill titta ”under huven” på boxen, till exempel via SSH. I normal drift behöver du den inte.

## Viktiga filer och mappar

| Sökväg | Innehåll |
| --- | --- |
| `/etc/mupibox/mupiboxconfig.json` | boxens konfiguration. Appen skriver hit, likaså redigeraren under **Experter** |
| `/home/dietpi/.mupibox/server/` | den installerade programvaran: server, app (`mupi-app/`), display (`www/`) och den här handboken (`manual/`). En uppdatering ersätter mappen |
| `/home/dietpi/.mupibox/player/` | spelaren (Spotify och lokal uppspelning) |
| `/home/dietpi/.mupibox/data/` | det boxen behåller: biblioteket med fortsätt-lyssna och avsnittslägen (`library/`), omslagen för de lokala albumen (`covers/`), lyssnings- och batterilogg (`logs/`). En uppdatering rör inte mappen |
| `/home/dietpi/.mupibox/cache/` | det boxen kan ladda om eller göra om (Spotify-svar, förhandsbilder, poddbilder). Får tömmas när som helst |
| `/home/dietpi/MuPiBox/media/` | media på minneskortet (det är också Samba-resursen `mupibox`) |
| `/home/dietpi/MuPiBox/sysmedia/` | systemfiler: startbilder, ljud |
| `/home/dietpi/mupibox-backups/` | säkerhetskopiorna före en uppdatering (`before-update-….zip`, de tre nyaste) |
| `/usr/local/bin/mupibox/` | boxens skript (avstängning, vridratt, nätverk med mera) |
| `/tmp/playerstate` | spelarens tillstånd: `play` eller `pause` |
| `/tmp/shutdown_control.log` | logg för avstängningsknappen |
| `/tmp/idle_shutdown.log` | logg för den automatiska avstängningen |

> [!WARNING]
> Konfigurationsfilen innehåller inloggningsuppgifter (Telegram-token, Spotify, NAS). Ge inte bort den. Behöver du hjälp, ta **supportinfo** under **Inställningar › System › Om boxen**: Den utelämnar lösenord, token och konton ([Loggar och status](../wartung/protokolle.md)).

## Portar

| Port | Vem | Till vad |
| --- | --- | --- |
| 80 och 443 | webbserver | appen (`/app/`), den här handboken (`/manual/`) och radiokanalernas omslag (`/cover/`). Förfrågningar för app och gränssnitt vidarebefordrar den till servern |
| 8200 | server | displayen och boxens eget gränssnitt. Displayen körs via `http://localhost:8200`. Appen går här alltid att nå via http (`/app/`) |
| 5005 | spelare | spelarens gränssnitt. Det tar bara emot kommandon från boxen själv, inte från nätverket |

## Program (PM2)

Två program körs under **PM2**:

- `server`: server med app, gränssnitt och handbok,
- `spotify-control`: spelaren.

Deras meddelanden står under **Inställningar › System › Loggar** i loggarna `server-out.log`, `server-error.log`, `spotify-control-out.log` och `spotify-control-error.log`.

## Tjänster (systemd)

Fler uppgifter sköts av tjänster vars namn börjar med `mupi_`. De viktigaste:

| Tjänst | Uppgift |
| --- | --- |
| `mupi_startstop` | startar och avslutar boxens förlopp vid upp- och nedstängning |
| `mupi_idle_shutdown` | stänger av boxen efter lång tystnad |
| `mupi_check_internet` | kontrollerar anslutningen (statusvisning) |
| `mupi_rotary` | vridratt |
| `mupi_fan` | fläkt |
| `mupi_hat`, `mupi_hat_control` | MuPiHAT och batteri |
| `mupi_powerled` | driftlysdiod |
| `mupi_telegram` | Telegram-bot |
| `mupi_mqtt` | MQTT (med MQTT-Discovery) |
| `mupi_tls` | certifikat för HTTPS (kontrolleras vid varje start och dagligen via `mupi_tls.timer`) |
| `mupi_vnc`, `mupi_novnc` | fjärrstyrning av displayen |
| `mupi_wifi`, `mupi_autoconnect-wifi`, `mupi_ethernet` | Wi-Fi och LAN |
| `mupi_autoconnect_bt` | ansluta Bluetooth automatiskt |
| `mupi_goodbye` | avskedsbilden tills strömmen går |
