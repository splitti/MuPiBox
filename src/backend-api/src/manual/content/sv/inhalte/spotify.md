# Spotify

Spotify spelas på boxen i displayens webbläsare, via Spotifys Web Playback SDK. Du behöver ett Spotify-konto och en egen **Spotify-app** på developer.spotify.com. Det låter krångligare än det är: en guide leder dig i fem steg.

> [!IMPORTANT]
> För att spela Spotify behöver boxen ett Spotify Premium-konto. Det är ett krav från Spotify, inte från boxen.

## Ställa in

**Bibliotek › Spotify › Installationsguide**:

| Steg | Vad du gör |
| --- | --- |
| 1 | Logga in på developer.spotify.com med ditt Spotify-konto och välj **Create app** |
| 2 | Fyll i de visade värdena i Spotify-appen (App name, App description, Redirect URI; Redirect URI går att kopiera med en knapp). Kryssa vid API:erna för ”Web API” och ”Web Playback SDK” |
| 3 | Fyll i **Client ID** och **Client Secret** från Spotify-appen. De står där under **Settings**; hemligheten visas med **View client secret**. Därefter **Spara och fortsätt** |
| 4 | **Anslut till Spotify**: logga in hos Spotify och godkänn, därefter kommer du tillbaka till appen. Sedan **Fortsätt** |
| 5 | valfritt: ange **spellisteprefix** och **slå på Smart-Sync**, eller avsluta **utan Smart-Sync** (se nedan) |

Spotify låter en inloggning gälla i 6 månader. Boxen påminner 14 och 3 dagar innan, i appen och via Telegram. **Logga in igen** finns på sidan **Spotify**.

Inloggningsuppgifterna ser och ändrar du senare under **Bibliotek › Spotify › Inloggningsuppgifter**. Helt radera dem kan du på sidan **Spotify** under **Koppla från & återställ › Återställ åtkomst**. Innehållet i biblioteket finns då kvar.

## Lägga till innehåll

### Söka på Spotify

**Bibliotek › Lägg till › Sök på Spotify**: skriv ett sökord och välj om det söks bland **Alla**, **Artister**, **Album**, **Spår** eller **Spellistor**. Det som redan finns i biblioteket har en bock och ”I biblioteket”. Ett träff trycker du på:

- ett **album** visar omslag och uppgifter; där väljer du under **Lägg till som** kategorin och trycker på **Lägg till**,
- ett **spår** kommer på samma sätt med hela sitt album till boxen,
- en **spellista** kommer som en post till boxen (boxen hämtar dess spår vid uppspelning); hur den visas på startsidan väljer du under **På startsidan** (se nedan),
- en **artist** visar sina album för att läggas till ett och ett; ett sökfält, **Alla**, **Album** och **EP och singlar** och **ordningen** (nyaste, äldsta först eller alfabetiskt) hjälper vid artister med många album. **Prenumerera på hela artisten** skapar en artistprenumeration: alla avsnitt kommer till boxen, nya senare av sig själva ([Hantera innehåll](verwalten.md)). **Tillbaka till sökningen** leder till träfflistan.

Den senast valda kategorin är förvald nästa gång du lägger till något.

Under sökningen står **Mina spellistor**: dina egna spellistor och de som du följer hos Spotify – även privata, som sökningen inte hittar. Egna står först; först ser du 8, **Visa alla …** visar resten. Tryck och lägg till som ovan. Två anmärkningar i listan:

- **kommer via Smart-Sync**: den här spellistan för Smart-Sync redan till boxen; läggs den dessutom till skulle den stå där två gånger.
- **från Spotify · spelas kanske inte**: en spellista från Spotify själv, till exempel en mix. Spotify lämnar ofta inte ut sådana spellistor till appar som boxen.

Boxen hämtar listan när sidan öppnas och behåller den i 5 minuter; en spellista som du precis har skapat i Spotify dyker alltså upp senast efter 5 minuter.

### Spellistor: egen ruta eller mapp

När du lägger till en spellista väljer du under **På startsidan**:

- **Egen ruta** (förvald): spellistan står ensam på startsidan, ett tryck spelar den direkt.
- **I en mapp**: den står tillsammans med andra poster under ett namn. Namnet skriver du in eller trycker på en befintlig mapp, även en artists mapp med album.

Du kan ändra det senare i **Bibliotek** vid posten. Där heter spellistans namn **Rutans namn**; tomt visar boxen namnet från Spotify. Spellistor som du lade till före version 5.0.13 står var och en i en egen mapp med sitt namn; med **Egen ruta** sparar du ett tryck på boxen. För spellistor från TIDAL gäller detsamma.

### Klistra in länk

**Bibliotek › Klistra in länk** tar direkt en Spotify-adress: album, spellista, artist, podd eller ljudbok. Som **typ** väljer du **Spotify-länk**. Fler fält:

| Fält | Betydelse |
| --- | --- |
| **Artist / namn** (valfritt) | eget namn för posten; för en spellista mappen där den står (tomt = egen ruta) |
| **Kategori** | Ljudbok/hörspel, Musik eller Radio & poddar |
| **Omslag** och **artistomslag** (valfritt) | bildadresser om Spotifys bild inte passar |
| **Sortering** | Standard (poddar: nyaste avsnitt först, annars alfabetiskt), A–Ö, Ö–A, äldsta eller nyaste först |
| **Spela i slumpvis ordning** | spåren i slumpmässig ordning |
| **Bara en del av avsnitten** | t.ex. bara avsnitt 1 till 20 i en serie, räknat i Spotifys ordning |

Som typ finns dessutom **Spotify-sökning**: i stället för ett enskilt album sparar du en sökning som post. Fältet heter då **Sökord**. Boxen visar alla hittade album (högst 100) samlade under en ruta. Du formulerar sökningen med Spotifys sökfilter, till exempel:

```
artist:"Seriens namn" album:"Avsnitt"
```

Flera filter gäller tillsammans, något `AND` däremellan behövs inte: med det hittar Spotify numera ingenting. Hittar sökningen inga album säger appen det redan när du lägger till.

Fältet **Rutans namn** är obligatoriskt: så heter rutan på displayen. Med en andra post, till exempel `artist:"Seriens namn" album:"Del"`, blir det två skilda rutor av en artist.

## Smart-Sync: spellistor automatiskt till boxen

Med **Smart-Sync** hamnar Spotify-spellistor vars namn börjar med **spellisteprefixet** automatiskt på boxen. Exempel: heter prefixet ”MuPiBox” dyker alla spellistor som börjar så upp, till exempel ”MuPiBox Hörspel”, utan vidare åtgärd.

Under **Bibliotek › Spotify › Synkinställningar** ställer du in:

- **spellisteprefixet** (förifyllt med boxens namn),
- **synkintervallet**: hur ofta boxen tittar efter ändringar hos Spotify, 5 till 60 minuter,
- om den **automatiska synken** är på. Är den av finns ingen synk alls, inte heller för hand. Innehållet på boxen blir kvar.

Med **Spara** tar du över värdena. Körs Smart-Sync startar **Synkronisera nu** på sidan **Spotify** en synk direkt.

Sidan **Spotify** visar dessutom de hittade spellistorna och **konflikter**: innehåll som redan ligger på boxen för hand och också står i en spellista. **Hantera via synk** lämnar över en sådan post till synken.

## När något inte fungerar

[Spotify spelar inte](../fehlerbehebung/spotify-probleme.md).
