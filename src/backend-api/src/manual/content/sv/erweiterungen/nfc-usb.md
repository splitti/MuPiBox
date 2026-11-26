# NFC: ansluta USB-läsare

Billiga USB-läsare (Neuftech, Sycreader och liknande, ofta ”RFID Reader 125 kHz / 13,56 MHz”) anmäler sig som **tangentbord** och **skriver kortnumret**, oftast tio siffror och Enter. De behöver **ingen koppling**, bara kontakten: sätt i den i **valfri USB-port** på boxen.

![En USB-läsare på boxen](wiring-usb.svg)

Tillägget läser enhetens tangenttryckningar och **tar enheten för sig**: Siffrorna hamnar varken i konsolen eller i displayens webbläsare.

## USB Reader 1 och USB Reader 2

Boxen tilldelar USB-enheterna själv: Du skriver inte in något namn. Vid **Typ** finns **USB Reader 1** och **USB Reader 2**:

- **USB Reader 1** är den första USB-enhet som boxen hittar, **USB Reader 2** den andra, efter den port som enheten sitter i.
- I menyn **Typ** står efter namnet den enhet som avses (till exempel ”USB Reader 1 · Tera 5100 dongle”).
- **USB Reader 2** är **grå** så länge ingen andra USB-enhet är igenkänd.
- Sätter du i en enhet i en annan port kan tilldelningen växla; kontrollera då i menyn **Typ** vilken enhet som står bakom **USB Reader 1** och **USB Reader 2**.

Två USB-läsare bredvid varandra: Den ena läsaren på **USB Reader 1**, den andra på **USB Reader 2** (se [Lägga till läsare](nfc-leser.md)). Två läsare med samma typ vill ha samma enhet.

## Status

Kortet **Status** visar vid **Enhet** **läsarens namn**, som enheten kallar sig själv, annars som boxens USB-databas kallar dess identitet (till exempel ”Tera 5100 dongle” i stället för ”HID 0581:011c”); bredvid **Senaste tagg** står samma namn.

## Vad en USB-läsare gör annorlunda

- Taggens **nummer** är kortnumret, som läsaren skriver det. Det står så i listan över taggar (utan kolon). En tagg som en annan läsare (PN5180, RC522, PN532) läser har ett annat nummer: Taggar är **inte** utbytbara mellan läsartyperna.
- En USB-läsare rapporterar **bara påläggningen**, aldrig borttagningen. **När den tas bort** verkar därför inte med den; uppspelningen går bara vidare. ”Tagg i fältet” visar sidan inte.
- Även en **USB-streckkodsläsare** är en sådan läsare: Den skriver streckkodens nummer (siffror, även bokstäver från A till F) och Enter. Dess nummer är taggens nummer; en etikett med streckkod kan så starta ett media.
- Vid första installationen (eller efter att en annan läsare satts i) ska du **sätta i enheten igen**, så att behörigheten (tilläggets udev-regel) tar.
