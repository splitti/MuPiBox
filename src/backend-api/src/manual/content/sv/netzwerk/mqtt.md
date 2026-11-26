# MQTT

Via **MQTT** rapporterar boxen sin status till en broker i hemnätverket och går att styra därigenom. Med **MQTT-Discovery** lägger smarta hem-system själva till boxen som en enhet. Inställningarna står under **Inställningar › Tjänster › MQTT**.

> [!TIP]
> För Home Assistant går det också utan broker och med fler funktioner (utrop, meddelanden på displayen): den direkta parkopplingen under [Home Assistant](home-assistant.md). Använd bara en av dem, annars visas boxen två gånger.

## Anslutning

| Inställning | Betydelse |
| --- | --- |
| **MQTT aktiv** | slår på anslutningen (efter installationen av) |
| **Enhetsnamn** | namnet som boxen visas med |
| **Broker** | MQTT-brokerns adress |
| **Port** | brokerns port, vanligtvis 1883 |
| **Topic** | gemensam början på alla boxens topics |
| **Client-ID** | boxens identitet hos brokern |
| **Användare** och **Lösenord** | om brokern kräver dem |

## Intervall

| Inställning | Verkan |
| --- | --- |
| **Uppdatering (uppspelning)** | hur ofta boxen rapporterar under uppspelning, 1 till 90 sekunder |
| **Uppdatering (viloläge)** | hur ofta den rapporterar när inget spelas, 1 till 90 sekunder |
| **Timeout** | väntetid på brokern, 10 till 180 sekunder |

## Topics

Alla topics börjar med Topic och Client-ID, där Client-ID står två gånger. Med Topic `MuPiBox/Boxname` och Client-ID `MuPiBox` rapporterar boxen till exempel under `MuPiBox/Boxname/MuPiBox/MuPiBox/state`.

| Topic (efter början) | Innehåll |
| --- | --- |
| `state` | `online`, eller `offline` så snart boxen inte längre är ansluten |
| `volume` | volym i procent |
| `play_text` | vad som spelas just nu |
| `bat_soc`, `vbat`, `charger_status` | batterinivå, batterispänning, laddstatus (med MuPiHAT) |
| `temperature`, `ssid`, `signal_quality` | CPU-temperatur, Wi-Fi, mottagning |

Boxen går att styra via samma topics med `/set` på slutet:

| Topic | Värde | Verkan |
| --- | --- | --- |
| `volume/set` | tal, t.ex. `20` | volym, högst upp till den inställda maxvolymen |
| `play/set` | `play` | fortsätt uppspelningen |
| `pause/set` | `pause` | paus |
| `take_screenshot/set` | `take_screenshot` | bild av displayen under `screenshot` |
| `reboot/set` | `reboot` | omstart |
| `power/set` | `shutdown` | stänga ned |
| `user/set` | namnet på en användare | det barnet blir aktivt, utan PIN som i appen |

Är [flera användare](../bedienung/mehrere-benutzer.md) på rapporterar boxen under `user` namnet på det aktiva barnet. Med MQTT-Discovery visas dessutom ett val **User** med alla namn.

## MQTT-Discovery

Med **Anmäl som enhet** anmäler boxen sina värden och knappar så att smarta hem-system med MQTT-Discovery själva lägger till den som en enhet, till exempel Home Assistant, openHAB eller Domoticz. **Discovery-prefixet** måste passa det som är inställt där; vanligtvis `homeassistant`.

> [!TIP]
> Förstår ditt system inte MQTT-Discovery förblir reglaget av. Värdena och kommandona ur [Topics](#topics) lägger du då till själv.
