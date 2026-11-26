# Lösenord och HTTPS

**Inställningar › Säkerhet**

## Lösenord

Under **Lösenord & inloggning** anger du lösenordet för hela appen. Det gäller lika på mobilen som på datorn.

| Kort | Vad du gör där |
| --- | --- |
| **Lösenord** | **Ställ in lösenord** (första gången) eller **Ändra lösenord**: ange det nuvarande lösenordet och det nya två gånger, minst 6 tecken. Ett nytt lösenord loggar ut alla andra enheter |
| **Inloggning** | **Kräv inloggning**: Appen frågar efter lösenordet i hemnätverket. Det skyddar dessutom displaysidan och boxens gränssnitt mot åtkomst från nätverket. Verkar direkt och går först att slå på när ett eget lösenord är inställt |
| **Inloggade enheter** | de enheter som är inloggade just nu. Enstaka loggar du ut med **Logga ut**, alla utom den här med **Logga ut alla andra** |

Visar kortet **Standardlösenord** gäller fortfarande det lösenord som varje MuPiBox levereras med (`MuP1B0x`). Ställ då in ett eget: Du anger bara det nya, standardlösenordet frågar appen inte efter.

Att logga in går också utan lösenord: med **QR-kod på displayen** (håll statussymbolerna överst nedtryckta länge, se [Inställningar på displayen](../bedienung/eltern-zugang.md)) eller med en **länk via Telegram** (`/login`, se [Telegram](telegram.md)).

**Glömt lösenordet?** Kom in i appen via QR-koden eller Telegram. Därefter går det i 10 minuter att ställa in ett nytt lösenord utan det gamla.

> [!NOTE]
> Boxens egen display, dess skript och Telegram-boten körs på boxen och påverkas aldrig av inloggningen. Den hindrar bara åtkomst från andra enheter i nätverket.

## Kryptering (HTTPS)

Utan HTTPS går lösenord och inmatningar okrypterade genom ditt hemnätverk. Sidan **Inställningar › Säkerhet › Kryptering (HTTPS)** tar hand om den säkra anslutningen.

### Certifikat

Boxen har ett **eget certifikat**. Den kontrollerar det vid varje start och en gång om dagen och förnyar det i god tid själv, även om dess adress har ändrats. På enheterna behöver inget installeras om för det. Alternativt laddar du under **Eget certifikat (för avancerade)** upp ett eget certifikat med nyckel. Boxen påminner dig då före utgången. Gäller ett eget certifikat för ingen av de adresser som boxen går att nå på just nu varnar sidan: Webbläsaren visar där en varning. **Tillbaka till boxens certifikat** sätter åter in boxens eget certifikat.

### Lita på certifikatet

Eftersom certifikatet kommer från boxen själv och inte från en offentlig instans varnar webbläsaren vid första besöket. Sidan visar överst om **den här enheten litar på boxen** och om den är säkert ansluten. Litar den inte på den än följer du en gång stegen under **Gör boxen känd för den här enheten**: **Ladda ned certifikat**, **Installera på enheten** (med en anvisning för **Android**, **iPhone / iPad**, **Windows** och **Mac**) och **Öppna via https**. Därefter varnar webbläsaren inte längre.

### Bara säker anslutning

Med **Omdirigera http till https** öppnas appen alltid via https, även via QR-koden på displayen och via Telegram-länkar. Reglaget går först att slå på när din enhet litar på boxen. Annars skulle du låsa ute dig själv. Undantagna är boxens display och port 8200: Där går appen alltid att nå via http.

### Adress för länkar

Under **Adress för länkar** bestämmer du under vilket namn QR-koden och Telegram-länkar nämner boxen. Tomt betyder boxens IP-adress.

### Installera appen

Med en säker anslutning går appen att installera som en app: på Android i Chrome i menyn ”Installera app”, på iPhone i Safari via Dela › ”Lägg till på hemskärmen”. Därefter startar den utan adressfält.
