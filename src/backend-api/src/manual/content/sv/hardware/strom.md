# Batteri, MuPiHAT och strömbrytare

Under **Inställningar › Batteri & ström** hittar du allt om strömförsörjningen.

## Batterivisning

**Inställningar › Batteri & ström › Batteri** visar laddningsnivån, spänningen och förloppet de senaste 24 timmarna. Displayen visar nivån i statusfältet.

Vid laddning visar spänningen för mycket, eftersom laddaren lyfter batteriet över dess vilospänning. Boxen räknar därför vid laddning med den mängd som går in, med utgångspunkt i nivån före anslutningen, och visar dessutom **fullt om ungefär …**. Även strax efter laddningen, när spänningen ännu är förhöjd, räknar den vidare, först därefter igen efter spänningen. Tiden är en uppskattning: spelar boxen samtidigt får batteriet mindre ström, och med en svag 5 V-nätadapter laddar det märkbart långsammare.

Sitter en nätadapter med **USB-PD** (Power Delivery) i MuPiHAT visar sidan dessutom **Nätadapter (USB-PD)**, till exempel ”12 V · upp till 2,25 A (27 W)”: den nivå som MuPiHAT har kommit överens om med nätadaptern. Den tar högst 12 V. Utan nätadapter eller med en nätadapter utan USB-PD saknas raden. Pi 3 och 4 läser inte alltid chippet felfritt för det; boxen visar därför bara värden som den har läst två gånger lika.

## MuPiHAT och batteriprofil

**MuPiHAT** är ett kretskort med batterihantering som sätts på Raspberry Pi. Under **MuPiHAT & batteriprofil** ställer du in:

| Inställning | Betydelse |
| --- | --- |
| **MuPiHAT aktiv** | slår på stödet. Att växla ställer även om ljudkortet och startar om boxen |
| **Batteri** | profilen för ditt batteri: Ansmann 2S1P, ENERpower 2S2P 10.000mAh, ENERpower 2S3P 15.000mAh, **USB-C-drift (utan batteri)** eller **Egen profil** |

Under står spänningarna för den valda profilen i millivolt. Du kan ändra dem och ta över med **Spara profil**, MuPiHAT-tjänsten startar då om. Passar ingen av profilerna ditt batteri, välj **Egen profil**. Vid **USB-C-drift (utan batteri)** finns inga spänningar och ingen laddningskurva.

| Kort | Värde | Område |
| --- | --- | --- |
| **Laddningskurva** | **Tomt**, **25 %**, **50 %**, **75 %**, **Fullt** (v_0 till v_100): spänningen vid den laddningsnivån. Värdena stiger från ”Tomt” till ”Fullt” | 5000–9000 vardera |
| **Trösklar** | **Varning från**: från den här spänningen varnar boxen | 5500–8000 |
| **Trösklar** | **Stäng av vid**: från den här spänningen stänger boxen av sig. Måste ligga under varningen | 5000–7500 |
| **Laddning** | **Laddningsslut** (VREG, valfritt): spänningen då laddningen slutar. Tomt = laddchippets standard | 6000–8400 |
| **Laddning** | **Kapacitet** (mAh, valfritt): batteriets storlek, för tiden till fullt. Tomt = storleken ur profilens namn | 500–200000 |

> [!WARNING]
> **Laddningsslutet (VREG) är säkerhetskritiskt.** Vid två celler i serie är högst 8400 mV tillåtet (4,2 V per cell). Högre skadar batteriet, appen tar inte emot något högre värde. Ändra det bara om du vet vad du gör.

Vid tomt batteri stänger boxen av sig själv, och displayen visar före det bilden för ”Batteri tomt” ([Omslag och teman](../bedienung/cover-und-themes.md)). Med Telegram får du dessutom ett meddelande när batteriet nästan är tomt ([Telegram](../netzwerk/telegram.md)).

## Stäng av automatiskt

**Inställningar › Batteri & ström › Stäng av automatiskt**: boxen stänger av sig när ingen lyssnar. Kan ställas in från 0 till 300 minuter i femsteg. **0 betyder aldrig**, så är det inställt efter installationen. Boxen kontrollerar var 10:e sekund om något spelas.

## På/av-brytare och LED

Med en **OnOff SHIM** (på/av-knapp med drift-LED) slår du på och stänger av boxen på ett rent sätt. Under **På/av-brytare och LED**:

| Inställning | Verkan |
| --- | --- |
| **Fördröjning för avstängningsknappen** | så länge håller du knappen tills boxen stängs av, 0 till 5 sekunder (efter installationen 2). Gäller efter en omstart |
| **LED-stift (OnOffShim)** | LED:ens GPIO-stift (efter installationen 13; när MuPiHAT slås på sätts dess stift, LED:en på 13). Gäller efter en omstart |
| **LED-ljusstyrka normal** | ljusstyrka vid drift, 0 till 100 % |
| **LED-ljusstyrka dämpad** | ljusstyrka när den dämpas, 0 till 100 % |

Vid avstängning visar displayen avskedsbilden, en ton ljuder och LED:en tonar långsamt ut. Spelas musik pausas den före.

Hänger sig boxen vid avstängning och stängs inte av, läs [Boxen hänger sig vid avstängning](../fehlerbehebung/haengt-beim-ausschalten.md).
