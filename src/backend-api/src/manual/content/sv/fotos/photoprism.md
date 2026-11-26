# PhotoPrism

Boxen visar album från **PhotoPrism** som du väljer. Privata och arkiverade foton hålls utanför.

## Förbereda i PhotoPrism

Boxen loggar in med ett **applösenord**, inte med det riktiga lösenordet. Ett applösenord går att återkalla när som helst för sig.

1. I PhotoPrism under **Inställningar › Konto › Appar och enheter** tryck på **Lägg till**.
2. Skriv ett namn, till exempel ”MuPiBox”. Låt **Behörighet** stå på **Full åtkomst**, **Utgångsdatum** helst **Aldrig**.
3. Kopiera det visade applösenordet. PhotoPrism visar det bara den här enda gången.

Foton som boxen ska visa ligger i PhotoPrism i **album**. Mappar, ögonblick och kalenderalbum visar boxen inte.

## Ansluta

Under **Bibliotek › Foton › Anslut fototjänst › PhotoPrism** leder en guide genom tre steg:

1. **Inloggning**: **PhotoPrism-adressen** som i webbläsaren, utan `/library/…` efter (till exempel `http://192.168.1.20:2342`), och **applösenordet**.
2. **Test**: använder PhotoPrism ett eget, självutfärdat certifikat visar boxen dess fingeravtryck. Jämför det med det i webbläsaren via hänglåssymbolen och tryck bara vid överensstämmelse på **Lita på och testa**. Därefter visar testet konto, album och antalet foton och videor.
3. **Album**: kryssa för albumen och **Klar**.

Applösenordet sparas krypterat på boxen och visas aldrig mer. Det gäller bara för den adress det angavs för. **Ändra inloggning** på PhotoPrism-sidan öppnar guiden igen.

| Meddelande vid testet | Vad du gör |
| --- | --- |
| **Applösenordet nekades** | kontrollera applösenordet, skapa vid behov ett nytt; inloggningslösenordet fungerar inte här |
| **Ingen PhotoPrism hittades** | kontrollera adressen, den slutar oftast på `:2342` |
| **PhotoPrism går inte att nå** | kontrollera adress och nät; boxen måste nå PhotoPrism |

## Vad boxen visar

Bilderna kommer som förhandsvisningar från PhotoPrism i visningsstorlek. Klipp levererar PhotoPrism så som den även spelar dem i webbläsaren (MP4). Videor finns därför **även live** ([Fototjänster: spara eller live](speichern-oder-live.md)). Live-foton visar boxen som stillbild.

Har applösenordet gått ut eller återkallats visar PhotoPrism-sidan **Inloggningen nekades**. Sparade foton blir kvar på displayen så länge.
