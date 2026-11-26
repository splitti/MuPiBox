# Uppdateringar

**Inställningar › System › Uppdateringar**

## MuPiBox

Sidan visar den **installerade versionen** och de tillgängliga versionerna från det officiella MuPiBox-repositoriet (splitti/MuPiBox) i tre kanaler:

| Kanal | För vem |
| --- | --- |
| **Stabil** | den testade versionen för vardagen |
| **Beta** | nyare funktioner, fortfarande under provning |
| **Utveckling** | utvecklingsversionen. På egen risk |

Tryck vid den kanal du vill ha på **Installera** (eller **Installera om**, om den här versionen redan är installerad). Medan uppdateringen pågår visar sidan förloppet och displayen underhållsbilden ([Omslag och teman](../bedienung/cover-und-themes.md)), längst ned med ett fält: vad som sker just nu (förbereda, ladda, paket, program, inställningar) och hur långt det har kommit. Avbryts uppdateringen förblir boxen på den tidigare versionen och dess gränssnitt kommer tillbaka av sig självt. Bara om boxen därefter måste startas om står det i listen. Boxen går under tiden inte att använda i 10 till 30 minuter och startar därefter om av sig själv. Inställningar och bibliotek blir kvar.

> [!WARNING]
> **Ta en säkerhetskopia först** ([Säkerhetskopia](backup.md)). **Utvecklingsversionen kan skada installationen.** Se vid en uppdatering till att boxen inte avbryts: Ström och Wi-Fi måste hålla till slutet. Bäst är att boxen sitter på nätadaptern.

### Från en box med 4.x

En box med MuPiBox 4.x har ännu inte den här appen. Där startar du uppdateringen i det tidigare **admingränssnittet** med dess uppdateringsknapp. Sidan svarar direkt, uppdateringen fortsätter i bakgrunden: Displayen visar underhållsbilden, och boxen startar om av sig själv i slutet (på äldre Raspberry Pi efter upp till 30 minuter). Stäng inte av under tiden. Den gamla sidan meddelar eventuellt redan tidigare ”Update complete”; ett andra tryck på knappen startar ingen andra uppdatering. Därefter går det vidare i den här appen ([Öppna appen](../erste-schritte/app-oeffnen.md)); admingränssnittet är då av och går att slå på igen under [System](system.md).

> [!WARNING]
> På den här vägen gör boxen **ingen automatisk säkerhetskopia**, och visningen under **Utskrift** finns inte. Ta först en säkerhetskopia i admingränssnittet; den går att återställa senare i den här appen ([Säkerhetskopia](backup.md)). Vad uppdateringen har gjort står i `/boot/mupibox_update.log`; efter en lyckad uppdatering heter filen `/boot/<datum>_update_<version>.log`. Tidiga fel i bakgrunden, före den här loggen (till exempel vid nedladdning av hjälpprogram), står i `/var/lib/mupibox-update-admin/output.txt`. Misslyckas redan överlämnandet till bakgrunden (till exempel för att uppdateringsskriptet inte går att ladda ner) ändras ingenting och ingen ny logg uppstår; boxen startar då om med den tidigare versionen som efter varje uppdateringsknapp i admingränssnittet. Är under `/boot` startpartitionen monterad (som vid DietPi) går filerna under `/boot` också att läsa på datorn från minneskortet.

### Om en uppdatering går snett

Före varje uppdatering från den här appen sparar boxen inställningar, bibliotek och omslag på minneskortet: i `/home/dietpi/mupibox-backups/before-update-….zip` (de tre nyaste blir kvar). Misslyckas redan nedladdningen eller uppackningen av den nya versionen blir den tidigare installationen kvar. En fullständig återställning till det gamla läget finns annars inte. Avbryts en uppdatering från den här appen visar sidan under **Utskrift** vad som hände.

## Nyheter

Vad som är nytt i respektive version står under **Inställningar › System › Om boxen › Nyheter**.

## Operativsystem

Under **Operativsystem** uppdaterar du med **Uppdatera operativsystem** systemets paket (DietPi, systemet under MuPiBox). Det tar på äldre Raspberry Pi **upp till 30 minuter**. Boxen fortsätter köra under tiden och startar **inte** om av sig själv. När uppdateringen är klar trycker du på **Starta om boxen**.

> [!WARNING]
> Även här gäller: **Ta alltid en säkerhetskopia innan.**
