# Akku, MuPiHAT und Ausschalter

Unter **Einstellungen › Akku & Strom** findest du alles zur Stromversorgung.

## Akku-Anzeige

**Einstellungen › Akku & Strom › Akku** zeigt den Ladestand, die Spannung und den Verlauf der letzten 24 Stunden. Das Display zeigt den Stand in der Statusanzeige.

## MuPiHAT und Akku-Profil

Der **MuPiHAT** ist eine Platine mit Akku-Verwaltung, die auf den Raspberry Pi gesteckt wird. Unter **MuPiHAT & Akku-Profil** stellst du ein:

| Einstellung | Bedeutung |
| --- | --- |
| **MuPiHAT aktiv** | schaltet die Unterstützung ein |
| **Akku** | das Profil deines Akkus: ENERpower 2S3P 15.000 mAh, Ansmann 2S1P, ENERpower 2S2P 10.000 mAh, **USB-C-Betrieb (ohne Akku)** oder **Eigenes Profil** |

Wählst du **Eigenes Profil**, trägst du die Spannungen deines Akkus in Millivolt ein:

| Wert | Bedeutung | Bereich |
| --- | --- | --- |
| **v_100**, **v_75**, **v_50**, **v_25**, **v_0** | Spannung bei 100 %, 75 %, 50 %, 25 % und 0 % | 5000–9000 für v_100 |
| **Warnung** | ab dieser Spannung warnt die Box | 5500–8000 |
| **Abschalten** | ab dieser Spannung schaltet sich die Box aus, sie muss unter der Warnung liegen | 5000–7500 |
| **Ladeschluss VREG** (optional) | die Spannung, bei der das Laden endet | 6000–8500 |

> [!WARNING]
> **Ladeschluss (VREG) ist sicherheitskritisch.** Ist er zu hoch eingestellt, schadet das den Zellen. Ändere ihn nur, wenn du weißt, was du tust.

Bei leerem Akku schaltet die Box sich selbst aus, und das Display zeigt vorher das Bild für „Akku leer“ ([Cover und Themes](../bedienung/cover-und-themes.md)). Mit Telegram bekommst du außerdem eine Nachricht, wenn der Akku fast leer ist ([Telegram](../netzwerk/telegram.md)).

## Automatisch ausschalten

**Einstellungen › Akku & Strom › Automatisch ausschalten**: Die Box schaltet sich aus, wenn niemand hört. Einstellbar von 0 bis 300 Minuten in Fünferschritten. **0 bedeutet nie**, so ist es nach der Installation eingestellt.

## Ein-/Ausschalter und LED

Mit einem **OnOff SHIM** (Ein-/Aus-Taster mit Betriebs-LED) schaltest du die Box sauber ein und aus. Unter **Ein-/Ausschalter und LED**:

| Einstellung | Wirkung |
| --- | --- |
| **Verzögerung des Ausschalt-Tasters** | so lange hältst du den Taster, bis die Box ausgeht, 0 bis 5 Sekunden (nach der Installation 2) |
| **LED-Pin (OnOffShim)** | der GPIO-Pin der LED (nach der Installation 13) |
| **LED-Helligkeit normal** | Helligkeit im Betrieb, 0 bis 100 % |
| **LED-Helligkeit gedimmt** | Helligkeit, wenn gedimmt wird, 0 bis 100 % |

Beim Ausschalten zeigt das Display das Abschiedsbild, ein Ton erklingt, und die LED blendet langsam aus. Läuft Musik, wird sie vorher angehalten.

Hängt die Box beim Ausschalten und geht nicht aus, lies [Die Box hängt beim Ausschalten](../fehlerbehebung/haengt-beim-ausschalten.md).
