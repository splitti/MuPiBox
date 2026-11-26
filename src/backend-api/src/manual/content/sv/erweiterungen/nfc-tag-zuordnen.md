# NFC: koppla en tagg till ett album

En tagg får sitt media där du hittar mediet: i **biblioteket**. Förutsättningen är en läsare vars **status** visar **Redo** (se [Lägga till läsare](nfc-leser.md)).

## Steg för steg

### 1. Öppna mediet

Öppna i biblioteket ett **album, en ljudboksmapp, en radiokanal eller en podd**: för mappar på SD-kortet och NAS albumets fönster, för poster från Spotify, radio, poddar, TIDAL, Jellyfin och Audible postens fönster.

### 2. Tryck på NFC-tagg

Tryck på **NFC-tagg**. Fönstret visar vilka taggar mediet redan har (med bild, typ och nummer) och låter dig där ändra en bild eller **ta bort** en tagg.

![Fönstret NFC-tagg för ett album med dess tagg](nfc-sheet-tags.png)

### 3. Lägg till och lägg på taggen

Tryck på **Lägg till NFC-tagg** (vid första taggen) eller **Lägg till en till NFC-tagg**. Fönstret visar omslaget och ”Lägg nu NFC-taggen på läsaren.” Lägg sedan taggen på en läsare.

![Fönstret väntar på taggen](nfc-sheet-wait.png)

### 4. Klart

Fönstret meddelar ”Klart – taggen (ID 04:A1:B2:C3) hör nu till det här mediet” med taggens nummer, och mediet startar på displayen.

![Klart: taggen hör nu till albumet](nfc-sheet-done.png)

Från och med nu startar taggen sitt media varje gång den ligger på en läsare, utan att du ställer in något.

## Bra att veta

- Ett media kan ha **flera taggar**, till exempel en för varje barn: I fönstret **NFC-tagg** står alla, och **Lägg till en till NFC-tagg** lägger till en.
- Hade taggen redan ett media ersätter det nya det; fönstret nämner det gamla (”Tidigare: …”).
- En tilldelning väntar högst **tio minuter** och bara så länge fönstret är öppet: Stänger du det, låser du mobilen eller laddar om appen avbryts den efter några sekunder.
- **En** läsare räcker: Taggen kan läggas på vilken av de läsare du har ställt in.

## Flex-tagg

Med bocken **Flex-tagg** i fönstret blir taggen en **flex-tagg** (så heter den också hos TeddyCloud): en tagg vars media du när som helst kan byta. Tilldelar du senare med bocken ett annat media har flex-taggen det **genast**, utan att den behöver ligga på. Det finns bara en flex-tagg; en ny ersätter den gamla.

## Poddar

En tagg med en podd spelar ett **avsnitt** av den, och bara ett som även rutan visar (ditt urval av avsnitt och postens sortering gäller): det påbörjade, som inte är färdiglyssnat, annars det första ännu olyssnade (utan egen sortering det nyaste), annars det första. För det behöver boxen flödet (internet eller boxens cache); går det inte att nå startar ingenting.

## Vad som inte går att tilldela

Inte varje post går att lägga på en tagg: en mapp som bara innehåller fler mappar, en hel artist (Spotify, TIDAL, Jellyfin) och en hel Audible-serie har inget enskilt media; en enskild ljudbok i serien går att lägga till som egen post och tilldela. Där finns knappen inte, eller så säger boxen ”Det här mediet kan inte kopplas till en tagg”.

Vidare: [Ändra taggens bild](nfc-bild.md), [Tilldelade taggar](nfc-zugeordnete-tags.md).
