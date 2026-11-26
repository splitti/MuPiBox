# Öppna appen och logga in

Appen är gränssnittet för föräldrar. Den fungerar i vilken webbläsare som helst, på mobilen lika väl som på datorn, och går bara att nå i det egna nätverket.

## Adressen

Skriv boxens adress i webbläsarens adressfält, till exempel:

```
http://mupibox.local/
```

eller med boxens IP-adress:

```
http://192.168.1.50/
```

Boxens startsida leder direkt in i appen. Appen ligger under `/app/`, den här handboken under `/manual/`.

> [!TIP]
> Skapa ett bokmärke eller lägg appen på mobilens startskärm. Med HTTPS inställt går den att installera som en app ([Lösenord och HTTPS](../netzwerk/sicherheit.md)).

## Logga in

Appen har flera vägar in:

- **Med lösenord**, som du anger under **Inställningar › Säkerhet › Lösenord & inloggning**. Det gäller för hela appen, på mobilen som på datorn.
- **Med QR-kod på displayen**: håll statusfältet uppe till höger på displayen nedtryckt några sekunder (hålltiden går att ställa in under **Inställningar › Display & manövrering › Manövrering på displayen**). Inställningarna på displayen öppnas. Tryck där på **Föräldraapp** (på en box utan valt språk **Parent web app**): en QR-kod visas som du skannar med mobilen. Det går även utan lösenord ([Inställningar på displayen](../bedienung/eltern-zugang.md)).
- **Med en länk via Telegram**, om du har ställt in boten ([Telegram](../netzwerk/telegram.md)).

Är **Kräv inloggning** påslaget skyddar boxen även sin displaysida och sitt gränssnitt mot åtkomst från nätverket. Själva boxen, dess display och dess egna tjänster påverkas inte av det.

> [!WARNING]
> Så länge inget lösenord är satt och inloggning inte krävs kan vem som helst i ditt nätverk ställa in boxen. Ange ett lösenord i ett delat nätverk.

## Appens uppbyggnad

| Område | Innehåll |
| --- | --- |
| **Start** | översikt och genvägar |
| **Lyssna** | vad som spelas just nu, [lyssningshistorik](../spielzeit/hoer-verlauf.md) |
| **Speltid** | [dagsgränser, vilotider och insomningstimer](../spielzeit/index.md) |
| **Bibliotek** | [lägga till och hantera innehåll](../inhalte/index.md) |
| **Inställningar** | allt annat, ordnat efter Utseende, Display & manövrering, Ljud, Batteri & ström, Nätverk, Tjänster, Säkerhet och System |

## Språk

Appen talar 17 språk. **Inställningar › System › Språk** anger appens språk (”Automatiskt” följer webbläsaren) och, separat från det, boxens språk för texterna på displayen.
