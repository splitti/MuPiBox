# Akku, MuPiHAT und Ausschalter

Unter **Einstellungen › Akku & Strom** findest du alles zur Stromversorgung.

## Akku-Anzeige

**Einstellungen › Akku & Strom › Akku** zeigt den Ladestand, die Spannung und den Verlauf der letzten 24 Stunden. Das Display zeigt den Stand in der Statusanzeige.

Beim Laden zeigt die Spannung zu viel an, weil das Ladegerät den Akku über seine Ruhespannung hebt. Die Box rechnet deshalb beim Laden mit der Menge, die hineingeht, ausgehend vom Stand vor dem Einstecken, und zeigt dazu **voll in etwa …**. Auch kurz nach dem Laden, wenn die Spannung noch erhöht ist, zählt sie weiter, erst danach wieder nach der Spannung. Die Zeit ist eine Schätzung: Spielt die Box gleichzeitig, bekommt der Akku weniger Strom ab, und mit einem schwachen 5-V-Netzteil lädt er deutlich langsamer.

## MuPiHAT und Akku-Profil

Der **MuPiHAT** ist eine Platine mit Akku-Verwaltung, die auf den Raspberry Pi gesteckt wird. Unter **MuPiHAT & Akku-Profil** stellst du ein:

| Einstellung | Bedeutung |
| --- | --- |
| **MuPiHAT aktiv** | schaltet die Unterstützung ein. Umschalten stellt auch die Soundkarte um und startet die Box neu |
| **Akku** | das Profil deines Akkus: Ansmann 2S1P, ENERpower 2S2P 10.000mAh, ENERpower 2S3P 15.000mAh, **USB-C-Betrieb (ohne Akku)** oder **Eigenes Profil** |

Darunter stehen die Spannungen des gewählten Profils in Millivolt. Du kannst sie ändern und mit **Profil speichern** übernehmen, der MuPiHAT-Dienst startet dafür neu. Passt keines der Profile zu deinem Akku, wähle **Eigenes Profil**. Beim **USB-C-Betrieb (ohne Akku)** gibt es keine Spannungen und keine Ladekurve.

| Karte | Wert | Bereich |
| --- | --- | --- |
| **Ladekurve** | **Leer**, **25 %**, **50 %**, **75 %**, **Voll** (v_0 bis v_100): die Spannung bei diesem Ladestand. Die Werte steigen von „Leer“ nach „Voll“ | je 5000–9000 |
| **Schwellen** | **Warnung ab**: ab dieser Spannung warnt die Box | 5500–8000 |
| **Schwellen** | **Abschalten bei**: ab dieser Spannung schaltet sich die Box aus. Muss unter der Warnung liegen | 5000–7500 |
| **Laden** | **Ladeschluss** (VREG, optional): die Spannung, bei der das Laden endet. Leer = Standard des Lade-Chips | 6000–8400 |
| **Laden** | **Kapazität** (mAh, optional): die Größe des Akkus, für die Zeit bis voll. Leer = die Größe aus dem Namen des Profils | 500–200000 |

> [!WARNING]
> **Der Ladeschluss (VREG) ist sicherheitskritisch.** Bei zwei Zellen in Reihe sind höchstens 8400 mV erlaubt (4,2 V je Zelle). Höher schadet dem Akku, die App nimmt keinen höheren Wert an. Ändere ihn nur, wenn du weißt, was du tust.

Bei leerem Akku schaltet die Box sich selbst aus, und das Display zeigt vorher das Bild für „Akku leer“ ([Cover und Themes](../bedienung/cover-und-themes.md)). Mit Telegram bekommst du außerdem eine Nachricht, wenn der Akku fast leer ist ([Telegram](../netzwerk/telegram.md)).

## Automatisch ausschalten

**Einstellungen › Akku & Strom › Automatisch ausschalten**: Die Box schaltet sich aus, wenn niemand hört. Einstellbar von 0 bis 300 Minuten in Fünferschritten. **0 bedeutet nie**, so ist es nach der Installation eingestellt. Die Box prüft alle 10 Sekunden, ob etwas läuft.

## Ein-/Ausschalter und LED

Mit einem **OnOff SHIM** (Ein-/Aus-Taster mit Betriebs-LED) schaltest du die Box sauber ein und aus. Unter **Ein-/Ausschalter und LED**:

| Einstellung | Wirkung |
| --- | --- |
| **Verzögerung des Ausschalt-Tasters** | so lange hältst du den Taster, bis die Box ausgeht, 0 bis 5 Sekunden (nach der Installation 2). Gilt nach einem Neustart |
| **LED-Pin (OnOffShim)** | der GPIO-Pin der LED (nach der Installation 13). Gilt nach einem Neustart |
| **LED-Helligkeit normal** | Helligkeit im Betrieb, 0 bis 100 % |
| **LED-Helligkeit gedimmt** | Helligkeit, wenn gedimmt wird, 0 bis 100 % |

Beim Ausschalten zeigt das Display das Abschiedsbild, ein Ton erklingt, und die LED blendet langsam aus. Läuft Musik, wird sie vorher angehalten.

Hängt die Box beim Ausschalten und geht nicht aus, lies [Die Box hängt beim Ausschalten](../fehlerbehebung/haengt-beim-ausschalten.md).
