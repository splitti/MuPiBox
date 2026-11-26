# Ljud och volym

## Ljudkort

**Inställningar › Ljud › Ljudkort**: välj den enhet som boxen skickar ljudet genom. Valet tas över efter en omstart. Sidan visar också vilket ljudkort systemet just nu känner igen. Med MuPiHAT hör ljudkortet till HAT:en (MAX98357A).

Bland annat kan du välja:

- Raspberry Pi:s **inbyggda 3,5 mm-utgång** och **inbyggda HDMI-utgång**,
- förstärkarkort med **MAX98357A**,
- DAC:ar och förstärkare från **HiFiBerry**, **Allo**, **IQaudIO**, **Pi-DAC**, **AudioPhonics** och fler,
- **Valfri USB-ljud-DAC** (känns igen automatiskt).

> [!NOTE]
> Vilka kort som finns visar valet i appen. Hittar du inte ditt kort där, prova posten som passar chippet på kortet (många kort delar drivrutiner). Uteblir ljudet hjälper [Inget ljud](../fehlerbehebung/kein-ton.md).

### Hörlursuttag dessutom

Har boxen ett eget ljudkort (till exempel MuPiHAT eller en HiFiBerry) stänger DietPi av Raspberry Pi:s 3,5 mm-utgång. Med **Inställningar › Ljud › Ljudkort › Hörlursuttag › 3,5 mm-utgång dessutom** blir den kvar vid sidan av ljudkortet, för hörlurar i uttaget. Det gäller efter en omstart, som appen genast erbjuder.

Därefter finns flera utgångar: i spelaren växlar ett tryck på symbolen bredvid volymen vid två utgångar genast till den andra, vid fler öppnar det **Lyssna med** med en ruta per utgång ([Spelaren](../bedienung/player.md)). I appen väljer du vid **Spelas nu** under **Utgång**. Boxen kommer ihåg den valda utgången även efter en omstart. Utan val spelar den över det ljudkort som är valt ovan.

- Byter du till uttaget blir det inte högre än boxen just var. **Maximum för hörlurar** gäller även för uttaget, likaså **Maximum (hörselskydd)**.
- Boxen ser till att dess ljudkort förblir det första kortet i systemet. Byter du ljudkort eller slår du MuPiHAT på eller av slår den efteråt på uttaget igen.
- Att slå av ställer tillbaka allt som DietPi har ställt in för ljudkortet (likaså efter en omstart).
- Är den inbyggda utgången själv ljudkortet finns inte reglaget: uttaget är då ändå på.
- Raspberry Pi 5 och Zero har inget 3,5 mm-uttag, där saknas reglaget. På en Raspberry Pi 1 till 3 delar uttaget och status-LED:en (GPIO 12/13) PWM-enheten: med påslaget uttag fortsätter LED:en via programvara. Från Pi 4 förblir den på hårdvaru-PWM.

### HDMI-ljud dessutom

För en bildskärm eller TV på HDMI-anslutningen slår du på **Inställningar › Ljud › Ljudkort › HDMI-ljud › HDMI-utgång dessutom**. HDMI-utgången är då en egen utgång vid sidan av boxens ljudkort och väljs som uttaget i spelaren eller i appen. Även det gäller efter en omstart.

- Uttaget förblir av så länge dess eget reglage är av. Båda kan slås på tillsammans.
- Boxen ställer HDMI-utgången på HDMI i stället för DVI (`hdmi_drive=2`), så att även en bildskärm utan egen inställning får ljudet – bara om det ännu inte står något om det i startkonfigurationen.
- Att slå av tar bort allt som skrevs in för det.
- Är den inbyggda utgången själv ljudkortet finns inte reglaget.

## Volym

**Inställningar › Ljud › Volym**:

| Inställning | Verkan |
| --- | --- |
| **Volym nu** | den aktuella volymen, 0 till 100 % |
| **Maximum (hörselskydd)** | den högsta volym som överhuvudtaget går att ställa in, 10 till 100 %. Gäller för display, app, vridratt och Telegram |
| **Egen gräns för hörlurar** och **Maximum för hörlurar** | ett eget maximum så länge det spelas över Bluetooth (hörlurar eller högtalare) eller hörlursuttaget (se nedan) |
| **Sätt på fast värde vid start** | på: boxen startar alltid med **värdet vid start**. Av: den behåller volymen från före avstängningen |
| **Värde vid start** | startvolymen, aldrig högre än maximum |

> [!TIP]
> **Maximum** är det viktigaste skyddet för öronen. Ställ in det så att högtalaren i din enhet förblir behaglig även vid full inställning.

## Med Bluetooth

För hörlurar och högtalare via Bluetooth och för hörlursuttaget finns ett eget maximum, så att hörlurar inte får bli lika höga som boxens högtalare. Slå på **Egen gräns för hörlurar** och ställ in **Maximum för hörlurar**. Är boxen högre vid anslutningen går den genast ned till det värdet ([Bluetooth](bluetooth.md)).

## Jämna ut volymen

**Jämna ut volymen** bringar hörspel, musik, poddar och radio till en gemensam ljudstyrka. Ett tyst hörspel är då inte tystare än albumet före. Är reglaget på väljer du **styrkan**: **Mild** eller **Kraftig**. Spotify förblir som det är. Efter installationen är reglaget av. På en Pi 3 kan det hacka en kort stund när ett spår startar.

## Tillbaka i spelaren

**Tillbaka i spelaren** bestämmer vad tillbakaknappen uppe till vänster i spelaren på displayen gör:

- **Minimera**: musiken fortsätter, högst upp visar ”Körs just nu” vad som spelas ([Fortsätt och ”Körs just nu”](../bedienung/fortsetzen.md)).
- **Avsluta**: musiken stannar, displayen går en nivå tillbaka.

## Talfunktion

Boxen kan läsa upp namn och tala meddelanden. Röst och språk ställer du in under **Inställningar › Ljud › Talfunktion**.

Under **Upplästa namn** på samma sida:

- **Läs upp namn när omslaget blir stående**: vid svepning, så fort ett omslag blir stående i mitten – bara med Cover Flow-vyn (**Utseende › Vy**),
- **Musik under tiden**: **Lägre** (standard) – musiken blir kort lägre så att man förstår namnet och kommer tillbaka efter det sista namnet; **Pausa** – musiken pausar för namnet och fortsätter strax efter det sista (vid snabb svepning hackar den då oftare); **Oförändrad** – namnet läses över musiken.

## Vid avstängning

Vid avstängning spelar boxen en avskedston. Spelas fortfarande musik vid den tidpunkten stoppas den först, så att den inte blir kort högre innan tonen kommer.
