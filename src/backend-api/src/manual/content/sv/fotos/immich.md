# Immich

[Immich](https://immich.app) är en fototjänst som du driver själv, till exempel på en NAS eller hemmaserver. Boxen visar dina Immich-album och alla album som är delade med ditt konto. Den behöver Immich från version 1.106.

## Skapa API-nyckel

1. Öppna Immich i webbläsaren och logga in.
2. Uppe till höger på profilbilden › **Kontoinställningar** › **API-nycklar** › **Ny API-nyckel**.
3. Ange namnet ”MuPiBox”. Frågar Immich efter rättigheter, kryssa bara för dessa: `album.read`, `asset.read` och `asset.view`. Med `user.read` visar testet dessutom ditt kontonamn. För album av personer dessutom `person.read`, för minnena `memory.read`.
4. Kopiera nyckeln genast: Immich visar den bara en gång.

## Ansluta

Under **Bibliotek › Foton › Anslut fototjänst › Immich** leder en guide genom fyra steg:

1. **Adress**: adressen till din Immich med port, till exempel `http://192.168.1.20:2283`.
2. **Nyckel**: klistra in API-nyckeln.
3. **Test**: boxen kontrollerar server, version, nyckel och rättigheter och visar konto, album och antal foton och videor.
4. **Album**: kryssa för de album som ska visas på displayen och **Klar**.

Nyckeln sparas krypterad på boxen och visas aldrig mer. Den gäller bara för den adress den angavs för.

| Meddelande vid testet | Vad du gör |
| --- | --- |
| **Servern går inte att nå** | kontrollera adress och port; boxen måste nå Immich i hemnätet |
| **Ogiltig nyckel** | kopiera hela nyckeln, skapa vid behov en ny |
| **Rättigheter saknas** | skapa en nyckel med `album.read`, `asset.read` och `asset.view` |
| **Immich-versionen är för gammal** | uppdatera Immich |

## Personer, favoriter och minnen

I sista steget (**Album och personer**) finns vid sidan av albumen:

- **Personer**: personer som Immich känner igen på ansiktet och som har ett namn där. Varje ikryssad person blir ett eget album; ett **gemensamt album** av två eller tre personer visar de foton där alla är med. På displayen står ansiktet längst fram. Kräver `person.read`.
- **Favoriter**: alla foton med hjärta i Immich.
- **Minnen**: de foton som Immich visar som minne i dag – ”för ett år sedan i dag” och mer, och under dagarna före en födelsedag personens foton. Albumet är nytt varje dag; boxen stämmer av det strax efter midnatt. Dagar utan minne finns det inte på displayen. Kräver `memory.read`.

Personer och favoriter kan ha mycket många foton: **Bilder per personalbum** begränsar dem; finns det fler väljer boxen jämnt ur alla år.

På Immich-sidan ändrar du sedan album, avstämning, mellanlager, adress och nyckel. Om boxen sparar fotona eller hämtar dem live står under [Fototjänster: spara eller live](speichern-oder-live.md).
