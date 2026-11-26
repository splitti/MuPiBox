# Spotify spelar inte

## Grunderna

- Boxen behöver för Spotify **internet** och ett **Spotify Premium-konto**.
- Anslutningen till Spotify står under **Bibliotek › Spotify**. Där måste överst statusen **Inloggad** stå. Står där **Inloggningen går snart ut**, logga in igen med **Logga in igen**: Spotify kräver en ny inloggning var 6:e månad.

## Ställa in anslutningen på nytt

Visar sidan ingenting eller ett fel, gå igenom **installationsguiden** en gång till ([Spotify](../inhalte/spotify.md)):

1. Kontrollera **Spotify-appen** på developer.spotify.com: **Client ID** och **Client Secret** måste stämma med dem i appen (**Bibliotek › Spotify › Inloggningsuppgifter**).
2. **Redirect URI** som appen visar där (med **Kopiera**) måste stå exakt så i din Spotify-app under ”Redirect URIs”. Annars avvisar Spotify inloggningen. Under **Vilken adress står i din Spotify-app?** väljer du `/app/spotify-callback` eller, för boxar som installerades före appen, `/spotify.php`. **Varför två adresser?** förklarar det.
3. **Logga in på Spotify**.

Hjälper inte det raderar **Återställ åtkomst** (under **Koppla från & återställ** på **Bibliotek › Spotify**) Client ID, secret och inloggning. Ställ därefter in åtkomsten på nytt. Innehållet i biblioteket blir kvar.

## Spellistor dyker inte upp

Smart-Sync tar bara spellistor vars namn börjar med **spellisteprefixet**. Kontrollera under **Bibliotek › Spotify › Synkinställningar** om **Automatisk synk** är på, och starta med **Synkronisera nu**. Är synken där av körs den inte alls, inte heller för hand. Innehåll som redan ligger på boxen för hand och också står i en spellista visar sidan som **Konflikter**.

## Spotify blockerar förfrågningar

Spotify begränsar hur ofta en app får ställa frågor. Överskrids det svarar Spotify en tid inte, tills spärren har gått ut. Sidan visar då **Spotify-spärr** med klockslaget till när den gäller. Det kan hända vid mycket många spellistor och ändringar tätt efter varandra. Vänta i så fall och starta först därefter en ny synk.

## Bara en box, en enhet

Spelar Spotify samtidigt på en annan enhet med samma konto kan uppspelningen stoppa där. Avsluta uppspelningen på den andra enheten och starta om den på boxen.
