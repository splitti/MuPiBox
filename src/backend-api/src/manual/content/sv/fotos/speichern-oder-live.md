# Fototjänster: spara eller live

För album från [Immich](immich.md), [Synology Photos](synology-photos.md), [Nextcloud](nextcloud.md), [PhotoPrism](photoprism.md) och [iCloud](icloud.md) avgör du på tjänstens sida med **Spara foton på boxen** hur boxen hanterar fotona.

| | På (standard) | Av (live) |
| --- | --- | --- |
| Var fotona ligger | i visningsstorlek på minneskortet | hos tjänsten; boxen hämtar varje foto vid visning |
| Utan nät | allt finns | albumet visar **Inte här just nu** |
| Plats på kortet | upp till gränsen under **Mellanlager** | bara de senast visade fotona, högst 200 MB |
| Videor | ja | Immich, PhotoPrism och iCloud: ja, direkt från tjänsten; Synology Photos och Nextcloud: nej |

Live lönar sig vid snabbt Wi-Fi och stora album som inte ska rymmas på kortet.

## Avstämning

Boxen tittar regelbundet efter nya, ändrade och raderade foton och tar över ändrade albumnamn. Hur ofta bestämmer **Avstämning › Intervall** (var 15:e minut till dagligen, eller bara för hand). **Stäm av nu** tittar efter direkt, **Avbryt avstämningen** stoppar en pågående avstämning. De redan hämtade fotona blir kvar.

Raden högst upp på sidan visar läget:

| Rad | Betydelse |
| --- | --- |
| **Avstämd** … | allt överfört |
| **Avstämning pågår** | håller på just nu, med förlopp |
| **Inte nåbar sedan** … | tjänsten svarar inte; boxen visar vidare det som är sparat och försöker igen senast efter 15 minuter (utom vid **Bara för hand**) |
| **Avstämningen avbröts · nytt försök inom kort** | tjänsten hade ett avbrott mitt i avstämningen; resten kommer vid nästa försök |
| **Nyckeln nekades** / **Inloggningen nekades** | skriv in nyckeln respektive inloggningen på nytt |

Är **mellanlagret** fullt laddar boxen inga fler foton och visar en anmärkning. Höj då gränsen eller välj färre album.

## Album från tjänsten

Att lägga till eller radera foton eller byta namn på ett album går i själva tjänsten. Boxen tar över ändringar vid nästa avstämning. Finns ett valt album inte längre (eller delas det inte längre) säger sidan det.

**Koppla från** tar bort tjänstens album och deras foton från boxen. I tjänsten blir allt kvar.
