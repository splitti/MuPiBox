# Telegram

**Föräldraboten** förbinder boxen med Telegram. Den skickar dig meddelanden och låter dig också styra boxen på resa. Allt står under **Inställningar › Tjänster › Telegram**.

## Ställa in

1. Skapa i Telegram en egen bot med **BotFather** (`/newbot`). Du får en **token**.
2. Ange token i appen under **Bot-token** och tryck på **Spara**. Är redan en token inställd öppnar **Ändra** fältet **Ny token**.
3. Ange under **Tillåtna chattar** ditt **chatt-id** och ett **namn** och tryck på **Lägg till**. Chatt-id hittar du med **Ta reda på chatt-id**: Skriv sedan ett meddelande till boten i Telegram, boxen väntar på det i upp till 40 sekunder.
4. Slå på **Bot aktiv** och tryck på **Spara**.
5. Med **Skicka testmeddelande** kontrollerar du att allt kommer fram.

**Bara de tillåtna chattarna får styra boxen.** Grupper har negativa id (till exempel −100…). Ändringar gäller först med **Spara**, då startar Telegram-tjänsten om. Kortet **Kommandon** visar botens viktigaste kommandon.

> [!WARNING]
> Ge inte token till någon och ange bara chattar som du anförtror boxen. Den som har en tillåten chatt kan styra boxen.

## Vad boten rapporterar

| Inställning | Verkan |
| --- | --- |
| **Rapportera uppspelning** | **av**: bara det viktiga (lyssningstiden slut, vilotid, batteriet nästan tomt, start och avstängning). **På**: dessutom varje spår med skärmbild, paus, stopp och framåt. Det är oftast för mycket |
| **Veckosammanfattning** | söndagskvällar: hur länge och vad som lyssnades på under veckan |

Vid avstängning säger meddelandet också varför: tomt batteri, för länge ingen uppspelning (vila) eller en vanlig avstängning.

## Bildtid

Är [fotovisningen](../fotos/index.md) på nämner `/status` också dagens **bildtid**: hur länge foton redan har tittats på, och med egen gräns, hur mycket som är kvar. Har bildtiden en egen gräns ([Bildtid](../fotos/bildzeit.md)) finns två kommandon för det, som också står som knappar under `/help`:

| Kommando | Verkan |
| --- | --- |
| `/photoextend 10` | 10 minuter bildtid till i dag (utan tal 10) |
| `/photofree` | bildtid utan gräns i dag |

Båda gäller bara i dag, som **+10 min** och **Fritt i dag** i appen.

## Rutor med daglig gräns

Har enskilda rutor en egen gräns per dag ([Rutor med daglig gräns](../spielzeit/kachel-limit.md)) nämner `/status` dem med dagens minuter. `/tiles` (också som knappen **Rutor med gräns** under `/help`) visar dem med två knappar var: **+10** ger rutan 10 minuter mer i dag, **ledigt** upphäver dess gräns för i dag.

## Flera användare

Är [flera användare](../bedienung/mehrere-benutzer.md) på avser ett **namn på slutet** av ett kommando det barnet, utan namn gäller kommandot det aktiva. Det går vid `/status`, `/extend`, `/photoextend`, `/photofree`, `/tiles` och `/limit set`, till exempel `/status Leni` eller `/extend 30 Leni`. För ett barn som inte lyssnar just nu nämner `/status` dess läge i dag. Bonusminuter räknas så snart det är dess tur. `/release` och `/quietnow` gäller för hela boxen. Veckosammanfattningen kommer för varje barn för sig.

## Logga in med en länk

Boten skickar dig med `/login` en **länk** som loggar in dig i appen, även utan lösenord ([Öppna appen och logga in](../erste-schritte/app-oeffnen.md)).

## Språk

Boten talar **tyska** om **boxens språk** (**Inställningar › System › Språk**) är tyska. Vid varje annat språk talar den **engelska**.
