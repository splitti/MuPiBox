# NAS

En **NAS** är en nätverksdisk i hemnätet, till exempel en Fritz!Box med lagring eller en Synology-enhet. Ljudböcker och musik som ligger där kan boxen spela utan att de behöver ta plats på minneskortet.

Inställningen hittar du under **Bibliotek › NAS**.

## Inloggning

Först väljer du hur boxen når din NAS:

- **Windows-delning (SMB)**: så som en Windows-dator når NAS:en. Synology, QNAP, en FRITZ!Box med USB-lagring och en Windows-dator med delad mapp kan det utan ytterligare inställning. För de flesta är det den enklaste vägen.
- **WebDAV**: på NAS:en måste en WebDAV-server köra (hos Synology till exempel port 5005, för HTTPS 5006).

| Fält | Betydelse |
| --- | --- |
| **Delning** (SMB) | delningen som i Windows Utforskaren, till exempel `\\192.168.1.10\Musik`; även `smb://192.168.1.10/Musik` går. Står en undermapp efter öppnar sidan mappträdet där |
| **Domän** (SMB) | oftast tomt; bara om NAS:en tillhör en Windows-domän |
| **Server (adress:port)** (WebDAV) | NAS:ens adress med WebDAV-porten, till exempel `192.168.1.10:5005` |
| **HTTPS** (WebDAV) | anslut krypterat |
| **Användare** och **lösenord** | inloggningsuppgifterna till NAS:en |
| **Kom ihåg inloggningen** | utan det här reglaget glömmer boxen lösenordet vid nästa omstart, fliken NAS är då tom; det sparas krypterat |

**Logga in** ansluter boxen till NAS:en. Därefter visar sidan delning eller server, användare och status. **Annan inloggning** byter till en annan NAS eller ett annat konto, **Logga ut** kopplar från.

> [!TIP]
> Ta vid SMB NAS:ens **IP-adress**. Ett enhets Windows-namn (till exempel `\\NAS`) känner boxen ofta inte till; ett namn med `.local` eller `.fritz.box` fungerar oftast.

Bra att veta vid SMB:

- Vid första inloggningen ställer boxen in SMB (paketet `cifs-utils`). Det tar en, två minuter och kräver internet.
- Boxen använder SMB2 och SMB3. En NAS som bara kan det gamla SMB1 rapporteras av appen; slå då på SMB2 eller SMB3 på NAS:en.
- I mappträdet är delningen den översta mappen. Mappar som du tidigare valt via WebDAV från samma NAS förblir valda om de ligger i den här delningen.
- Svarar NAS:en inte längre spelar boxen de laddade mapparna från minneskortet och försöker igen efter en halv minut.
- Ett omslag som du i appen väljer för en NAS-mapp lägger boxen även via SMB i mappen, om användaren får skriva där.

## Välja mappar

Efter inloggningen visar boxen NAS:ens mappar som ett träd. För varje mapp bestämmer du:

- **Visa**: visas på boxen. Du väljer då var: i fliken NAS eller i Hörspel, Musik eller Radio & poddar, bredvid innehållet från minneskort och Spotify.
- **Dölj**: förblir gömd, även allt under den.
- **Ladda**: kopieras till minneskortet så att den spelas även utan NAS.

Praktiskt för det:

- Sökfältet **Sök i de visade mapparna** hittar mappar även djupt under de visade mapparna, till exempel i ”Hörspel” en serie att ladda. För det håller boxen ett sökindex bara för de mapparna; visar du andra bygger den om det. **Uppdatera index** läser in mapparna på nytt om något har ändrats på NAS:en.
- Så länge ingen mapp visas finns inget index och sökningen hittar ingenting – den första mappen väljer du i trädet.
- **Visa bara urvalet** listar bara de mappar som du har visat, dolt eller markerat för laddning.
- **Visa alla**, **Visa inga**, **Ladda alla** och **Ladda inga** markerar snabbt.

Med **Spara urval** tar du över valet. **Ladda ner valda** kopierar de mappar som är markerade för laddning till minneskortet; ett fält visar förloppet, **Avbryt nedladdning** stoppar. **Läs in omslag på nytt** hämtar omslagen igen.

> [!NOTE]
> Före nedladdningen kontrollerar boxen om allt ryms på minneskortet. Avbryts en nedladdning, starta **Ladda ner valda** igen: filer som redan finns helt på boxen hoppas över. En mapp spelas först utan NAS när den är helt laddad.

## Profiler

En **profil** kommer ihåg mappurvalet (Visa, Dölj, Ladda) för en NAS och ett konto, inte lösenordet. **Spara urvalet som profil** skapar en ny, till exempel en för varje barn. Med **Ladda** bredvid en profil byter du till dess urval, **Ta bort** tar bort den. Profilen ”Standard” finns alltid kvar.

På displayen dyker de visade mapparna upp i fliken **NAS** eller i den kategori du valde. Fliken NAS kan du dölja vid behov ([Startsidan](../bedienung/startseite.md)).

Foton från NAS väljer du separat under **Bibliotek › Foton** ([NAS-mappar](../fotos/nas-ordner.md)).
