# När foton saknas

| Vad du ser | Vad det beror på | Vad du gör |
| --- | --- | --- |
| Ingen flik **Foton** på displayen | fotovisningen är av, eller inget album är synligt | slå på **Inställningar › Foton**; ställ under **Bibliotek › Foton** ett album på **Synligt på displayen** |
| iPhone-foton (HEIC) tas inte emot | konverteringsprogrammet saknas | under **Inställningar › Foton** **Försök igen** (kräver internet) |
| Klipp saknas | **Visa videor** är av, eller klippet är längre än 3 minuter | slå på videor; ta kortare klipp |
| Ett klipp visar länge **Förbereds** | boxen konverterar det fortfarande | vänta; 4K-klipp tar längre tid på Raspberry Pi |
| NAS-mappar: ”inga foton hittades” | boxens konto saknar läsrättigheter på NAS:en | ge läsrättigheter för mapparna **och** filerna i dem |
| Albumet visar **Inte här just nu** | ett album som visas live, och tjänsten går inte att nå | kontrollera Wi-Fi och tjänsten, tryck **Igen**, eller slå på **Spara foton på boxen** |
| Immich: **Rättigheter saknas** | API-nyckeln saknar rättigheter | skapa en ny nyckel med `album.read`, `asset.read`, `asset.view` |
| Synology: **Synology Photos är inte tillåtet** | kontot får inte använda appen | tillåt det i DSM under **Användare och grupp › Redigera › Program** |
| Synology: **Boxen är spärrad av DSM** | för många felaktiga försök | frigör i DSM under **Säkerhet › Skydd › Automatisk blockering** |
| Nextcloud: **Foton-appen saknas** | appen ”Foton” är av i Nextcloud | slå på i Nextcloud under **Appar** |
| Anmärkningen ”Mellanlagret är fullt” | gränsen för sparade foton är nådd | höj gränsen eller välj färre album/mappar |
| **Bilderna tar paus** | bildtiden för i dag är slut | under **Speltid › Bildtid** **+10 min** eller **Fri i dag** ([Bildtid](bildzeit.md)) |

Se även [Fler fall](../fehlerbehebung/weitere-faelle.md).
