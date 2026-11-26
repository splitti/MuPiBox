# Nextcloud

Boxen visar album i Nextcloud-appen **Foton**: ett kontos egna album och alla album som delas med det.

## Förbereda i Nextcloud

Bäst är att skapa ett konto bara för boxen. Då ser den bara det du uttryckligen delar med den.

1. Skapa ett konto i Nextcloud, till exempel ”mupibox”. Appen **Foton** måste vara påslagen (det är den normalt).
2. Logga in med det kontot och skapa under **Personliga inställningar › Säkerhet** med **Skapa nytt applösenord** ett applösenord för boxen. Så hålls det riktiga lösenordet utanför, och applösenordet går att återkalla när som helst för sig.
3. Dela i appen **Foton** ett album med det kontot, eller skapa album med själva kontot.

## Ansluta

Under **Bibliotek › Foton › Anslut fototjänst › Nextcloud** leder en guide genom tre steg:

1. **Inloggning**: **Nextcloud-adressen** som i webbläsaren, utan `/apps/…` efter (till exempel `https://cloud.example.de`), **användarnamnet** och **applösenordet**.
2. **Test**: använder Nextcloud ett eget, självutfärdat certifikat visar boxen dess fingeravtryck. Jämför det med det i webbläsaren via hänglåssymbolen och tryck bara vid överensstämmelse på **Lita på och testa**. Därefter visar testet konto, album, varav delade, och antalet foton och videor.
3. **Album**: kryssa för albumen och **Klar**.

Applösenordet sparas krypterat på boxen och visas aldrig mer. Det gäller bara för den adress och det konto det angavs för. **Ändra inloggning** på Nextcloud-sidan öppnar guiden igen.

| Meddelande vid testet | Vad du gör |
| --- | --- |
| **Inloggningen nekades** | kontrollera användarnamn och applösenord, skapa vid behov ett nytt applösenord |
| **Foton-appen saknas** | slå på appen **Foton** i Nextcloud under **Appar** |
| **Nextcloud går inte att nå** | kontrollera adress och nät; boxen måste nå Nextcloud |

## Vad boxen visar

Bilderna kommer som förhandsvisningar från Nextcloud i visningsstorlek. Kan Nextcloud inte göra en förhandsvisning av ett foto (till exempel iPhone-foton när ingen HEIC-förhandsvisning är inställd där) hämtar boxen med **Spara foton på boxen** originalet och konverterar det själv. Live saknas ett sådant foto.

Klipp levererar Nextcloud så som de laddades upp. Boxen konverterar dem därför själv, och **videor finns bara med ”Spara foton på boxen”** ([Fototjänster: spara eller live](speichern-oder-live.md)).
