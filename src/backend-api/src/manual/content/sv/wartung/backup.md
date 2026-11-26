# Säkerhetskopia

**Inställningar › System › Säkerhetskopia**

## Spara

| Typ | Innehåll |
| --- | --- |
| **Konfigurationssäkerhetskopia** | inställningarna (`mupiboxconfig.json`), biblioteket (`data.json`), de egna omslagen och inställningarna för de installerade [tilläggen](../erweiterungen/index.md) (till exempel knapparnas stift eller orten för vädret) |
| **Full säkerhetskopia** | dessutom **alla media på SD-kortet** och de uppladdade fotona och videorna ([Foton](../fotos/hochladen.md#saekerhetskopiering)). Kan bli flera GB stor och ta tid |

Tryck vid den typ du vill ha på **Ladda ner**. Filen hamnar på din dator eller mobil. Förvara den inte bara på boxen själv.

## Återställa

Tryck under **Återställ** på **Välj säkerhetskopia-fil**, välj filen och tryck på **Återställ säkerhetskopia**. Det går med säkerhetskopior från den här appen och från det tidigare admingränssnittet (till och med MuPiBox 5.0). Därefter startar boxen om.

Själva tilläggen finns inte i säkerhetskopian, bara deras inställningar. Saknas tillägg på boxen efter återställningen nämner appen dem: Installera dem på nytt under **Inställningar › System › Tillägg**, deras inställningar finns då redan. En säkerhetskopia från MuPiBox 5.1 går inte att återställa på en box med 5.0; uppdatera boxen först.

> [!WARNING]
> Återställningen **skriver över** de aktuella inställningarna och biblioteket. Den är tänkt som en väg tillbaka när något är trasigt, och inte som en ändring under drift.

## När ska man spara?

- **före varje uppdatering** ([Uppdateringar](updates.md)),
- före ändringar med JSON-redigeraren ([System- och expertinställningar](system.md)),
- efter större ändringar i biblioteket,
- före en flytt av boxen till ett nytt minneskort.

> [!NOTE]
> Konfigurationssäkerhetskopian innehåller inställningarna **inklusive** de lösenord och åtkomster som finns sparade i dem. Lämna inte ut filen, och bifoga den inte till ett felmeddelande. Behöver du hjälp, ta **supportinfo** under **Om boxen**: Den utelämnar lösenord, token och konton ([Loggar och status](protokolle.md)).
