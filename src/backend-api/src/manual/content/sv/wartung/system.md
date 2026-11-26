# System- och expertinställningar

De här inställningarna under **Inställningar › System** behöver du sällan. De är för avancerade användare, och vissa kan sätta boxen ur funktion. Ta först en [säkerhetskopia](backup.md).

## Systemalternativ

**Inställningar › System › Systemalternativ**. Allt här gäller först efter en omstart av boxen, bara CPU-governor gäller direkt.

| Inställning | Verkan |
| --- | --- |
| **Överklocka SD-kortet** | snabbare åtkomst till SD-kortet. Vissa kort är inte stabila med det, appen frågar därför innan |
| **PM2-loggar i RAM** | serverns och spelarens loggar i arbetsminnet i stället för på SD-kortet. Det skonar det, men loggarna går förlorade vid omstart |
| **Vänta på nätverk vid start** | boxen väntar vid uppstarten på nätverket (långsammare start, men genast online) |
| **Turbo vid start** | högre klockfrekvens under de första 30 sekunderna, för en snabbare start. Installation och uppdatering slår på den om den aldrig har ställts in |
| **CPU-governor** | sättet som processorn reglerar sin klockfrekvens (till exempel ondemand = efter behov) |
| **Dölj underspänningsvarningar** | döljer blixtsymbolen vid för svag strömförsörjning |
| **SWAP** | växlingsfil på SD-kortet. På en Pi med 1 GB lägger installationen och uppdateringen swap komprimerad i arbetsminnet (zram) – det är mycket snabbare på långsamma kort och USB-minnen. En avstängd swap förblir av |

> [!WARNING]
> En underspänningsvarning betyder att nätadaptern eller kabeln är för svag. Det är den vanligaste orsaken till avbrott. Åtgärda den i stället för att dölja den.

## Webbläsare (Chromium)

Displayen är en webbläsare i kioskläge. **Inställningar › System › Webbläsare (Chromium)**:

| Inställning | Verkan |
| --- | --- |
| **GPU-stöd (experimentellt)** | grafik via GPU |
| **Mjuk rullning (experimentellt)** | jämnare rullning |
| **Kioskläge** | helskärm utan webbläsarens kontroller. Av = med fönsterram, bara för test |
| **Cachestorlek** | 0 till 512 MB |
| **Chrome-felsökning** | skriver en utförlig logg från webbläsaren. Efter felsökningen av igen |

Ändringarna gäller efter en omstart av displayen. Den startar du genast med **Tillämpa och starta om displayen**.

## Experter

**Inställningar › System › Experter**:

- **Värdnamn**: boxens namn i nätverket, till exempel `mupibox` (nåbar som `mupibox.local`). Bara bokstäver, siffror och bindestreck. Tas över efter en omstart.
- **Fler verktyg**: **DietPi-dashboard** (systemhantering från DietPi). Den öppnas i ett nytt fönster. DietPi-dashboard har en terminal med root-rättigheter och är därför av från fabrik: Med **Tillåt DietPi-instrumentpanelen** slår du på den. Den öppnas då bara via appen, utan egen inloggning. Den som anropar port 5252 direkt i webbläsaren hamnar vid en lösenordsfråga som ingen kommer förbi.
- **Det tidigare admingränssnittet** (PHP-gränssnittet till och med MuPiBox 5.0) finns inte längre sedan 5.1: Den här appen kan allt som det kunde. Uppdateringen till 5.1 tar bort det med PHP, på boxen svarar ingenting längre med PHP. En Spotify-inloggning via den gamla adressen `https://<box>/spotify.php` fungerar fortfarande, och säkerhetskopior från admingränssnittet går fortfarande att återställa ([Säkerhetskopia](backup.md)).
- **Redigera konfigurationen direkt**: en redigerare för boxens JSON-filer. Under **Fil** väljer du vilken, till exempel `mupiboxconfig.json` (box), `data.json` (bibliotek) eller `config.json` (server).
- **Återställ**: **Återställ boxkonfiguration** (alla inställningar till den installerade versionens läge, lösenordet blir kvar), **Töm biblioteket** (alla poster i biblioteket borta, filerna blir kvar) och **Återställ serverkonfiguration**.

> [!WARNING]
> Felaktiga värden i konfigurationen kan **sätta boxen ur funktion**, och återställning går inte att ångra. Ta först en [säkerhetskopia](backup.md).

## Språk

**Inställningar › System › Språk**:

- **Appens språk**: bara den här appen i den här webbläsaren. ”Automatiskt” följer webbläsarens språk, annars gäller engelska.
- **Boxens språk**: texterna på displayen (gräns, vilotid, QR-kod för föräldrar), i start- och underhållsbilderna och hos Telegram-boten ([Telegram](../netzwerk/telegram.md)). Finns det en röst för det språket talar boxen den också.

Båda språken ställer du in var för sig. Rösten för talfunktionen står under **Ljud › Talfunktion**.
