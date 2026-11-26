# Egna ljudböcker och egen musik

Filer som ligger på boxens minneskort spelas även utan internet. Det finns två vägar dit.

## Ladda upp från appen

**Bibliotek › Ladda upp från enheten**:

1. Välj **kategori**: Hörspel, Musik eller Radio & poddar.
2. Fyll i **artist** och **album**. Av dem bildar boxen mapparna.
3. Välj med **Välj spår**, **Välj mapp** eller **Välj omslag** filerna, eller dra filer och mappar till fönstret.
4. Tryck på **Ladda upp**. Ett fält visar förloppet, under det står hur mycket plats som är ledig på minneskortet.

Spåren kopieras till minneskortet och dyker sedan upp av sig självt på displayen.

## Kopiera via nätverket

Slå på **Samba** (**Inställningar › Tjänster › Delade resurser & fjärråtkomst**), så går minneskortet att öppna som en enhet i hemnätet. Du kopierar då mappar som till ett USB-minne. Alternativt finns en FTP-server som du slår på vid behov ([Delningar och fjärrstyrning](../netzwerk/freigaben.md)).

> [!NOTE]
> På den här vägen skapar du mapparna själv. Håller du dig till ”Artist/Album/Spår” sorterar boxen in dem snyggt. Appens uppladdningssida tar hand om att skapa mapparna åt dig.

## Hämta från boxen

Under **Bibliotek › SD-kort** hämtar du innehåll tillbaka från boxen, till exempel till mobilen eller för en säkerhetskopia:

- I ett **album** står varje spår med storlek och en nedladdningsknapp. **Ladda ner albumet som ZIP** hämtar hela albumet.
- I en **mapp** står antal spår och storlek för varje album. **Ladda ner mappen som ZIP** hämtar allt i den, med undermappar och omslag.

Boxen packar ZIP-filen under nedladdningen, utan att komprimera den. Så har Raspberry Pi nästan inget att göra, och boxen fortsätter spela under tiden. Från ungefär 1 GB frågar appen först, eftersom det tar en stund över Wi-Fi och behöver motsvarande utrymme på enheten. Innehåll från Spotify eller NAS går inte att ladda ner här.

## Omslag för egna filer

Ligger en bild i albummappen eller är den inbäddad i filerna använder boxen den som omslag. Annars kan den söka ett onlineomslag eller visar temats reservbild ([Omslag](cover.md)).

## Plats på kortet

Egna media upptar minneskortet. Hur mycket som är ledigt står under **Inställningar › System › Om boxen**. Börjar utrymmet ta slut, flytta media till en [NAS](nas.md) eller använd Spotify.
