# Boxen hänger sig vid avstängning

Boxen visar vid avstängning avskedsbilden, men stängs inte ned ordentligt, och den går inte längre att starta med på/av-knappen. Hjälper bara att koppla från strömmen?

## Vanlig orsak: stiftet tilldelas dubbelt

Boxar med en **OnOff SHIM** eller liknande knapp använder overlayn `gpio-poweroff`, så att Raspberry Pi skickar en signal till kortet vid nedstängning. Står den här overlayn i filen `/boot/config.txt` **två gånger** hänger sig boxen vid nedstängning.

Det händer om du för din display var tvungen att skriva in en egen drivrutin och raden redan innehåller overlayn, till exempel:

```
dtoverlay=vc4-fkms-v3d,gpio-poweroff,gpiopin=4,active_low=1
```

Tidigare versioner av uppdateringen kände inte igen den raden och lade till en **andra** definition:

```
dtoverlay=gpio-poweroff,gpiopin=4,active_low=1
```

> [!NOTE]
> Nyare versioner av MuPiBox känner igen `gpio-poweroff` i varje `dtoverlay`-rad och lägger bara till den om den saknas. Den dubbla raden som en tidigare uppdatering redan har skrivit in tar inte heller den nya uppdateringen bort själv.

## Så kontrollerar och åtgärdar du det

Logga in via SSH på boxen (eller öppna en terminal i DietPi-dashboard, om det är tillåtet under Inställningar › System › Experter) och sök efter overlayn:

```
grep -n gpio-poweroff /boot/config.txt
```

På nyare system (DietPi med Debian 13 ”Trixie”) ligger filen under `/boot/firmware/config.txt`. Använd då den sökvägen i alla kommandon på den här sidan.

- **En** rad (oavsett om den står för sig eller som parameter till en annan overlay): i ordning, orsaken ligger någon annanstans.
- **Två eller fler** rader med `gpio-poweroff`: Behåll raden som hör till din display och ta bort den extra, fristående raden `dtoverlay=gpio-poweroff,gpiopin=4,active_low=1`. Filen kan du redigera med `sudo nano /boot/config.txt`.

Starta sedan om boxen. Stiftet står också i boxens konfiguration (`shim.poweroffPin`) och måste passa det som står i raden ([GPIO-belägging](../anhang/gpio.md)).

> [!WARNING]
> Gör en kopia innan du ändrar `/boot/config.txt` (`sudo cp /boot/config.txt /boot/config.txt.bak`). En felaktig rad kan hindra boxen från att starta.

## Om det inte är det

- Spelas fortfarande musik vid avstängningen stoppas den innan avskedstonen kommer. Hänger sig boxen ändå, titta i loggarna ([Loggar och status](../wartung/protokolle.md)): Loggen `shutdown_control.log` hör till avstängning med knappen. Den ligger i arbetsminnet och är borta när strömmen har stängts av – titta alltså på den så länge boxen fortfarande körs.
- Kontrollera nätadaptern: Spänningsfall vid nedstängningen kan få den att hänga sig.
- Hjälper inte det, fråga i communityn eller rapportera felet på GitHub ([splitti/MuPiBox](https://github.com/splitti/MuPiBox/issues)). Ladda för det ner **supportinfo** och loggen `shutdown_control.log` ([Loggar och status](../wartung/protokolle.md)).
