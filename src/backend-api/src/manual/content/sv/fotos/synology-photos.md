# Synology Photos

På en Synology-NAS med **Synology Photos** kan boxen visa album och mappar. Den loggar in med ett eget konto. Du väljer vad som visas på displayen: kontots **album** (även de som delas med det) och **mappar** från kontots **personliga område** och från det **delade området**.

## Förbereda i DSM

Bäst är att skapa ett konto bara för boxen. Då ser den bara det du uttryckligen delar med den.

1. I DSM under **Kontrollpanel › Användare och grupp** skapa ett konto, till exempel ”mupibox”, **utan** tvåfaktorsinloggning.
2. Vid kontot under **Redigera › Program** tillåt appen **Synology Photos**.
3. För **album**: öppna ett album i Synology Photos, välj **Dela** och bjud in kontot som **tittare**. En offentlig länk behövs inte.
4. För mappar i det **delade området**: området måste vara inställt i Synology Photos, och kontot behöver åtkomst till mapparna (det ställer en DSM-administratör in). Det **personliga området** tillhör boxens eget konto; mappar därifrån finns bara om du lägger foton i dess område.

## Ansluta

Under **Bibliotek › Foton › Anslut fototjänst › Synology Photos** leder en guide genom tre steg:

1. **Inloggning**: **DSM-adressen** (som i webbläsaren, oftast `https://192.168.1.10:5001`; utan uppgift tar boxen https och port 5001), **användarnamn** och **lösenord**.
2. **Test**: använder NAS:en sitt eget, självutfärdade certifikat visar boxen dess fingeravtryck. Jämför det med det i NAS:en respektive i webbläsaren via hänglåssymbolen och tryck bara vid överensstämmelse på **Lita på och testa**. Därefter visar testet konto, album, varav delade, och antalet foton och videor.
3. **Urval**: växla högst upp mellan **Album**, **Personligt område**, **Delat område** och **Intelligent** och kryssa för vad boxen ska visa, sedan **Klar**. I områdena fäller du ut mapparna med pilen. En vald mapp blir ett album och innehåller även fotona i mapparna i den; mapparna i den går då inte att välja en gång till var för sig.

Lösenordet sparas krypterat på boxen och visas aldrig mer. Det gäller bara för den adress och det konto det angavs för. **Ändra inloggning** på Synology Photos-sidan öppnar guiden igen. Förnyas certifikatet på NAS:en frågar boxen igen vid nästa test.

| Meddelande vid testet | Vad du gör |
| --- | --- |
| **Inloggningen nekades** | kontrollera användarnamn och lösenord, och om kontot är aktivt |
| **Synology Photos är inte tillåtet** | tillåt appen för kontot i DSM (se ovan) |
| **Andra bekräftelse krävs** | ta ett konto utan tvåfaktorsinloggning |
| **Boxen är spärrad av DSM** | i DSM under **Säkerhet › Skydd › Automatisk blockering** frigör boxens adress igen |
| **DSM går inte att nå** | kontrollera adress, port och brandvägg; boxen måste nå DSM (inte WebDAV-porten) |

> [!NOTE]
> Nekar DSM inloggningen försöker boxen inte igen med samma uppgifter på 10 minuter, så att DSM inte spärrar den. Bara **Testa anslutningen** frågar direkt.

Klipp levererar Synology Photos bara i original, ofta 4K från mobilen. Boxen konverterar dem därför själv, och **videor finns bara med ”Spara foton på boxen”**. Live visar den bara fotona ([Fototjänster: spara eller live](speichern-oder-live.md)).

## Intelligenta album

Under **Intelligent** erbjuder boxen det som Synology Photos själv sammanställer: **Nyligen tillagda** (de 300 nyaste) och **Videor**, dessutom ett album för varje **person**, varje **plats**, varje **dag** och varje **motiv** (till exempel ”Strand”) som Synology Photos känner till. Listorna går att fälla ihop (talet bredvid anger hur många poster det är) och är sorterade efter antalet foton, de flesta först. En lista med ikryssade poster är redan utfälld när du öppnar den. Albumen ändras av sig själva: boxen stämmer av dem som alla andra.

> [!NOTE]
> Personer, platser, taggar och motiv visar boxen från det personliga **och** det delade området; de från det delade området är märkta med ”Delat område”. Namngivna personer finns ofta bara där. De finns bara om igenkänningen i Synology Photos är påslagen för boxens konto; personer måste ha ett namn. Ett konto som bara får album delade har oftast inga. Ett motivalbum söker i Synology Photos efter motivets namn och kan därför avvika en, två bilder från talet i Synology Photos. **Favoriter** erbjuder boxen inte: Synology Photos lämnar inte ut dem via gränssnittet. **Videor** visar boxen bara med ”Visa videor” och ”Spara foton på boxen”.
