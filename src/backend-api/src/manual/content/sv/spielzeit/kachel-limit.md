# Rutor med dagsgräns

Enskilda rutor på startsidan får en egen gräns per dag, till exempel en serie hörspel högst 30 minuter. Allt annat fortsätter inom ramen för de vanliga [dagsgränserna](tageslimits.md). Minuterna för en ruta räknas också till lyssningstiden.

Varje ruta på startsidan kan begränsas: en artist (även från Spotify eller TIDAL), en podd, en mapp på SD-kortet eller NAS:en, en enskild spellista eller en radiokanal.

## Ställa in

1. Öppna **Bibliotek** i appen och tryck på rutan, till exempel artisten eller mappen.
2. Välj vid **Högst per dag** minuterna: 15, 30, 45, 60, 90 eller 120. **Ingen gräns** tar bort gränsen igen.

Valet gäller direkt och för alla dagar. Under det står hur många minuter som redan har lyssnats på i dag.

> [!NOTE]
> Vid en NAS-mapp vars undermappar står var för sig på displayen gäller gränsen för alla undermappar tillsammans.

## Vad händer i slutet?

- Går tiden för en ruta ut slutar uppspelningen som vid dagsgränsen: direkt, efter spåret eller efter albumet, beroende på **När gränsen är nådd** ([Dagsgränser](tageslimits.md)). Radio stannar alltid direkt.
- På displayen blir rutan stående, något blekare och med ett **lås**. Ett tryck på den öppnar ingenting. Högst upp visas en stund ”… är slut för i dag”.
- Strax före slutet visas högst upp ”5 minuter kvar …”.
- Andra rutor spelar vidare så länge lyssningstiden räcker. Nästa dag (vid timmen under **Dagsbyte kl.** i dagsgränserna) är rutan fri igen.

## Chippet på displayen

Uppe till höger visar chippet den återstående tiden:

- På **startsidan** står alltid lyssningstiden.
- Är en ruta med egen gräns **öppen**, alltså dess album eller dess spelare, visar chippet dess lilla runda bild och dess minuter. Tar lyssningstiden slut tidigare blir lyssningstiden stående.

## Undantag för i dag

Under **Speltid › Rutor med gräns** står alla rutor med gräns, med minuterna för i dag:

| Knapp | Verkan |
| --- | --- |
| **+10 min** | i dag 10 minuter mer för den här rutan |
| **Fri i dag** | i dag ingen gräns för den här rutan |

Båda gäller bara i dag. På appens startsida står en anmärkning så snart en ruta är slut för i dag. Via [Telegram](../netzwerk/telegram.md) går samma sak med `/tiles`.

**Häv spärr** bland [snabbåtgärderna](schlaftimer.md) frigör även slutade rutor för den tiden.

> [!NOTE]
> Det som räknas är det som startats via displayen, appen eller Home Assistant. Något som utifrån skickas till boxen via Spotify Connect räknas bara till lyssningstiden.
