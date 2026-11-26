# Startsidan

Startsidan visar boxens innehåll, sorterat efter kategorier. Kategorierna är flikar högst upp på displayen, var och en med en symbol:

![Startsidan med kategorin Hörspel](display-home.png)

| Kategori | Symbol | Innehåll |
| --- | --- | --- |
| **Hörspel** | bok | ljudspel och ljudböcker |
| **Musik** | noter | musik |
| **NAS** | server | mappar från nätverksdisken som inte hör till någon annan kategori ([NAS](../inhalte/nas.md)) |
| **Radio & poddar** | radiovågor | radiokanaler och poddar |

När du lägger till ett innehåll bestämmer du vilken kategori det hamnar i ([Lägga till innehåll](../inhalte/index.md)). Mappar från NAS kan också ligga under Hörspel, Musik eller Radio & poddar. Ligger alla visade NAS-mappar i någon av de kategorierna försvinner fliken NAS.

![Kategorin Musik](display-music.png)

## Hur omslagen ordnas

- Efter installationen är **Cover Flow-vyn** på: ett stort omslag ligger i mitten, grannarna är mindre. Svep i sidled för att flytta listan. Trycker du på ett omslag i kanten flyttas det till mitten; det mittersta öppnas med ett tryck.
- Stänger du av den står tre omslag bredvid varandra med namnet under. Svep i sidled för att bläddra vidare. Ett tryck på ett omslag öppnar det.
- Temat **coverflow** har en egen ordning: omslagen står snett, bara det mittersta pekar rakt fram. Även här flyttas ett omslag i kanten först till mitten.

Under **Inställningar › Utseende › Vy** ställer du in:

- **Cover Flow-vy (scen)**: på (standard) eller av, för alla teman utom coverflow,
- **Visa mapp- och albumnamn**: bara för temat coverflow,
- **Rullningslist under omslagen**: **Standard** (som temat är tänkt), **Hela bredden** (över hela bredden och tjockare, lätt att träffa med stora fingrar) eller **Dölj**. Du kan dra i listen, även i Cover Flow-vyn: omslagen följer med, och när du släpper hakar nästa i,
- **Sidhuvud med bakgrund** och **Spelare med bakgrundsyta**: bara för de äldre enkla temana (till exempel blue, green, red, dark). Avstängt ligger sidhuvudet utan färgat band på bakgrunden, och spelarens knappar står utan yta, i sidhuvudets färger,
- **Helskärm med svepgest**: bara för temat coverflow, se nedan.

Om boxen läser upp namnet när ett omslag blir stående i mitten, och vad musiken gör då, ställer du in under **Inställningar › Ljud › Talfunktion › Upplästa namn** ([Ljud](../hardware/sound.md#talfunktion)). Uppläsningen fungerar bara med Cover Flow-vyn.

## Helskärm i temat coverflow

Med **svep uppåt med två fingrar** döljs sidhuvudet och omslagen blir större. **Två fingrar nedåt** tar tillbaka det. Utan sidhuvud gäller:

- **ett finger från nedre kanten uppåt**: en nivå tillbaka (som tillbakaknappen),
- **två fingrar från höger eller vänster kant åt sidan**: nästa eller föregående kategori.

Boxen kommer ihåg om sidhuvudet är dolt. Stänger du av **Helskärm med svepgest** är sidhuvudet genast tillbaka. Zoom med två fingrar är alltid av på boxen.

## Mappar och album

Vissa poster är mappar, till exempel en artist eller en serie ljudböcker. Ett tryck öppnar mappen och visar dess album. Med tillbakapilen uppe till vänster går du en nivå upp.

## Dölja flikar

Den som till exempel inte har något NAS-innehåll döljer fliken: **Inställningar › Display & manövrering › Manövrering på displayen › Flikar på displayen**. Varje flik har ett reglage, på betyder synlig. De synliga flikarna delar på bredden. Minst en förblir synlig.

Under **Startar med** väljer du vilken flik som är öppen när displayen startar. Utan val är det Hörspel. Är den valda fliken dold startar displayen med den första synliga.

## Fortsätt

Klocksymbolen till vänster om flikarna öppnar **Fortsätt**-listan med de senast spelade spåren, så att barnet lyssnar vidare precis där det slutade. Hur många poster den har ställer du in under **Manövrering på displayen › Fortsätt lyssna › Poster under ”Fortsätt”**. Mer om detta: [Fortsätt och ”Körs just nu”](fortsetzen.md).
