# Home Assistant

Med **Home Assistant** kan du visa och styra boxen: vad som spelas just nu (med omslag), volym, paus, framåt och bakåt, hopp i spåret och var boxen spelar (högtalare, hörlursuttag, Bluetooth-hörlurar). Dessutom visar Home Assistant batterinivå, Wi-Fi-signal, processorbelastning, temperatur, arbetsminne och lagringsutrymme. Anslutningen är krypterad (HTTPS) och går bara i hemnätverket. I Home Assistant behöver du för det integrationen **MuPiBox** från HACS.

> [!NOTE]
> Det här är den nya anslutningen via boxens Home Assistant-gränssnitt. Den äldre anslutningen via en MQTT-broker med MQTT-Discovery finns kvar ([MQTT](mqtt.md#mqtt-discovery)). Du behöver bara en av dem.

## Slå på

Under **Inställningar › Tjänster › Home Assistant** slår du på **Tillåt Home Assistant**. Boxen tar då emot anslutningar på port 8443 och anmäler sig i hemnätverket (mDNS), så att Home Assistant hittar den av sig själv. Är reglaget av körs ingenting för det på boxen.

## Parkoppla

1. Lägg i Home Assistant till integrationen **MuPiBox**. Boxen dyker upp av sig själv; annars skriver du in adressen som appen visar.
2. Home Assistant frågar efter boxens **nyckel**. I appen trycker du under **Parkoppla** på **Kopiera nyckel** och klistrar in den i Home Assistant. Där går det också att välja de extra rättigheterna (**Meddelanden och utrop**, **Omstart och avstängning**).
3. Tryck i appen på **Tillåt parkoppling (60 s)**, sedan i Home Assistant på **Fortsätt**.
4. Har Home Assistant valt mer än att visa och styra frågar displayen först: **Tillåt allt** eller **Bara visa och styra**.
5. Displayen visar en **sexsiffrig kod** och de rättigheter som Home Assistant får. Ange koden i Home Assistant.

Nyckeln bevisar att Home Assistant verkligen pratar med din box och inte med en annan enhet i nätet. Ta den därför bara ur appen (eller från boxens display, som också visar den vid parkopplingen), aldrig från en annan källa. Går kopieringen inte i webbläsaren markerar appen nyckeln, och du kopierar den själv.

Koden står bara på boxens display. Den som anger den har alltså boxen framför sig. Den gäller i 5 minuter och bara en gång. Efter fem felaktiga försök är parkopplingen avslutad, och det går på nytt efter en minut. Även de extra rättigheterna går bara att tillåta på displayen. Ska de senare tillkomma eller utgå går du i Home Assistant vid MuPiBox till **Konfigurera**: Home Assistant parkopplar då på nytt (åter med **Tillåt parkoppling** i appen, godkännande och kod på displayen) och tar därefter själv bort den gamla parkopplingen.

## Vad Home Assistant mer kan

- **Skärmbild**: Home Assistant kan visa vad som just nu står på boxens display. Medan en parkoppling är öppen finns ingen skärmbild: Koden är bara till för den som står framför boxen. Är displayen av finns heller ingen (den skulle vara svart).
- **Uppdatering**: Home Assistant visar om det finns en nyare version av boxen. Uppdateringen installeras fortfarande i appen.
- **Meddelanden** (rättigheten ”Meddelanden och utrop”): En kort text visas på displayen tills dess tid är ute eller någon trycker på den.
- **Utrop** (rättigheten ”Meddelanden och utrop”): Boxen säger en text med talfunktionen. För det måste en röst vara inställd under **Inställningar › Ljud › Talfunktion**.
- **Omstart och avstängning** (rättigheten ”Omstart och avstängning”): Boxen startar om eller stängs ned, som med knappen i appen.
- **Avstängningstimer** (rättigheten ”Omstart och avstängning”): Home Assistant ställer boxens [insomningstimer](../spielzeit/schlaftimer.md), ersätter den eller stoppar den (0 minuter), upp till 720 minuter. Det är samma timer som i appen och hos Telegram: Den som ställer den var som helst, alla ser samma återstående tid. Den återstående tiden och slutet ser Home Assistant också bara med rättigheten att visa. Från version 5.0.12 av boxen, med integrationen från den version som känner till timern.

- **Flera användare**: Är [flera användare](../bedienung/mehrere-benutzer.md) på meddelar boxen vilket barn som lyssnar just nu, och Home Assistant kan växla, utan PIN som appen. Integrationen kan visa det så snart den känner till den delen av gränssnittet.

Under en vilotid visar boxen inga meddelanden och säger inga utrop.

## Parkopplade Home Assistants

Appen listar under **Parkopplade** varje Home Assistant med dess rättigheter. **Ta bort** avslutar parkopplingen direkt. Därefter måste Home Assistant parkopplas på nytt.

## Bra att veta

- Volymen från Home Assistant håller sig till boxens maximum, vid hörlurar till gränsen för hörlurar.
- Speltiden och vilotiderna gäller även för Home Assistant. Är uppspelningen spärrad startar heller inte Home Assistant något.
- Ändras boxens IP-adress eller namn blir parkopplingen kvar: Boxens nyckel ändras inte då.
- En parkoppling från förr utan rättigheten ”Omstart och avstängning” får den inte i efterhand. Ska Home Assistant ställa timern, ta bort parkopplingen och parkoppla på nytt med den rättigheten.
- För utvecklare: Gränssnittet beskrivs i det [gemensamma API-avtalet](https://github.com/splitti/MuPiBox-homeassistant/blob/main/docs/classic-api-contract.md).
