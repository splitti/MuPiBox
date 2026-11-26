# Snabbåtgärder och insomningstimer

Båda står högst upp på sidan **Speltid** och verkar direkt.

## Snabbåtgärder

Skriv först in **minuterna** (1 till 1440). Sedan:

| Åtgärd | Verkan |
| --- | --- |
| **+ Bonustid** | lägger för i dag de här minuterna till dagsgränsen |
| **Häv spärr** | hävar gräns och vilotid för de här minuterna, boxen spelar fritt |
| **Vila nu** | stoppar uppspelningen under de här minuterna |

Åtgärderna ändrar varken dagsgränserna eller vilotiderna själva. När minuterna gått ut gäller det som är inställt igen.

## Insomningstimer

**Insomningstimern** stänger av boxen **helt** när en tid gått ut, oavsett om något spelas just då. Den är tänkt för insomning: starta ett hörspel, ställ timern på 60 minuter, klart.

1. Välj **minuterna** (15 till 360, i steg om 15).
2. Tryck på **Starta**. **Stoppa** avbryter den.

Under de sista 20 sekunderna före slutet tonar boxen långsamt ut volymen, uppspelningen slutar då tyst i stället för abrupt. Därefter återställer den volymen för nästa start och stänger av sig helt normalt, med avskedsbild och ljud.

### En timer för alla vägar

Boxen har alltid **exakt en** insomningstimer. Appen, Telegram (`/sleep` och knapparna) och [Home Assistant](../netzwerk/home-assistant.md) ställer alla in samma timer och ser samma återstående tid:

- **En ny timer ersätter den pågående.** Ställer du 30 minuter och sedan 60 gäller bara de 60. Den gamla timern kan inte längre stänga av boxen.
- **Stoppa** avbryter den, oavsett var den ställdes in. Även två gånger i rad är inget fel. Strax före slutet, under uttonningen, kommer volymen tillbaka till värdet före.
- **Har tiden gått ut** börjar avstängningen. Från då går timern inte längre att stoppa, appen meddelar det.
- Timern körs **oberoende** av appen, av Telegram och av Home Assistant. En omstart av appen eller en bruten anslutning till Home Assistant ändrar ingenting för den. När boxen har slagits på finns ingen gammal timer kvar.

### Skillnad mot de andra tiderna

| Vad | Verkan |
| --- | --- |
| **Insomningstimer** | stänger av **hela boxen** när tiden är ute |
| **Vila nu**, vilotider, dagsgräns | stoppar bara **uppspelningen**, boxen förblir på |
| **Box av efter … utan uppspelning** | stänger av när **länge** inget har lyssnats på |

### Om det inte fungerar

För avancerade, via SSH på boxen:

- `sudo /usr/local/bin/mupibox/sleep_timer.sh status` visar om en timer körs och till när.
- `journalctl -u mupi-sleep-timer` visar vad timern har gjort (startad, ersatt, stoppad, utgången).
- `sudo /usr/local/bin/mupibox/sleep_timer.sh stop` stoppar den för hand.

> [!NOTE]
> Även efter avstängning med timern måste boxen slås på igen vid enheten ([Starta om och stänga av](../wartung/neustart.md)).

## Stänga av automatiskt och display

Oberoende av insomningstimern stänger boxen av sig när inget lyssnas på under lång tid. Det och **Display av efter** ställer du in direkt här på sidan **Speltid** i kortet **Stänga av**, så att alla tider finns på ett ställe. Samma inställningar finns även under **Inställningar › Batteri & ström › Stäng av automatiskt** och **Display & manövrering › Display**.

- **Box av efter … utan uppspelning**: upp till 300 minuter, 0 = aldrig (så är det inställt efter installationen) ([Batteri, MuPiHAT och strömbrytare](../hardware/strom.md)).
- **Display av efter**: så länge utan manövrering på displayen, sedan blir den mörk. 0 = aldrig.
