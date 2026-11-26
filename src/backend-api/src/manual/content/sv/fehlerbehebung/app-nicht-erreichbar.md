# Appen går inte att nå

Går boxens adress inte att öppna i webbläsaren? Kontrollera i tur och ordning:

## 1. Körs boxen?

Efter påslagningen behöver boxen en till två minuter tills allt är redo. Visar displayen startsidan körs den.

## 2. Samma nätverk

Mobil eller dator måste vara **i samma nätverk** som boxen (samma Wi-Fi eller samma hemnätverk). Ett gäst-Wi-Fi på routern eller mobildata räcker inte.

## 3. Rätt adress

- Har boxen efter ett Wi-Fi-byte fått en **ny IP-adress**? Den aktuella visar nätverkssidan på displayen ([Inställningar på displayen](../bedienung/eltern-zugang.md)) eller enhetslistan i din router.
- Fungerar `mupibox.local` inte, ta IP-adressen. Vissa nätverk och enheter löser inte upp `.local`-namn.
- Appen går med `http://` och med `https://`. Boxen ser vid varje start själv till sitt certifikat ([Lösenord och HTTPS](../netzwerk/sicherheit.md)).

## 4. Webbläsarvarning vid HTTPS

Varnar webbläsaren för ett **osäkert certifikat** är det normalt för boxen: Certifikatet kommer från boxen själv. Du kan bekräfta varningen och gå vidare ändå. För att den ska försvinna installerar du certifikatet en gång på enheten ([Lösenord och HTTPS](../netzwerk/sicherheit.md)). Eller så öppnar du appen via `http://`.

> [!WARNING]
> Har du slagit på **Omdirigera http till https** och certifikatet inte är installerat på din enhet varnar webbläsaren vid varje besök. Växla till en enhet som litar på boxen, eller öppna appen via port 8200 (`http://<IP-adress>:8200/app/`). Där går den alltid att nå via http. Därefter kan du slå av omdirigeringen igen.

## 5. Komma in via displayen

Kommer du inte in i appen alls skannar du **QR-koden på displayen**: håll statusvisningen nedtryckt ([Inställningar på displayen](../bedienung/eltern-zugang.md)). Den leder direkt in i appen och loggar in dig.

## 6. Starta om tjänsten

Körs displayen men appen svarar inte startar en omstart av boxen om servern ([Starta om och stäng av](../wartung/neustart.md)).
