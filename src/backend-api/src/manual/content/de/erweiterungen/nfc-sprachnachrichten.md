# NFC: Sprachnachrichten

Die Unterseite **Sprachausgabe** (**Einstellungen › NFC-Extension › Sprachausgabe**) legt fest, was die Box **mit ihrer Stimme sagt**, wenn etwas im Weg ist oder fehlt. Ein Kind, das einen Tag auflegt und nichts hört, weiß sonst nicht, woran es liegt.

Jede Ansage hat einen **Schalter** und einen **Text**. Den Text kannst du ändern; er wird so gesprochen, wie du ihn schreibst (bis 300 Zeichen). Lässt du ihn leer oder unverändert, spricht die Box den Standardtext **in der Sprache, in der sie spricht** (**Einstellungen › Audio › Sprachausgabe**, **Die Box spricht**). Für Sprachen ohne eigenen Standardtext (zum Beispiel Arabisch) ist es Englisch.

Die Ansagen kommen aus der **Stimme der Box**, die du unter **Einstellungen › Audio › Sprachausgabe** einstellst. Ist dort **Stumm** gewählt, bleibt auch NFC stumm. Läuft gerade Musik, wird sie währenddessen leiser.

## Die Ansagen

| Karte | Ansage | Wann |
| --- | --- | --- |
| **WLAN** | **Keine Verbindung zum WLAN-Router** | Ein Tag startet ein Medium, das Internet braucht, und die Box ist in keinem WLAN angemeldet. |
| **WLAN** | **WLAN-Verbindungsproblem oder Synchronisationsfehler** | Die Box hängt am Router, kommt aber nicht ins Internet. |
| **WLAN** | **WLAN-Signal ist da, aber zu schwach** | Das Signal ist schwächer als -75 dBm. Das Medium startet trotzdem. |
| **Inhalte** | **Verzögerung oder Abbruch beim Laden der Inhalte** | Das Medium eines Tags startet nicht: nach 10 Sekunden, bei Spotify nach 35. |
| **Inhalte** | **NAS vorübergehend nicht erreichbar** | Ein Tag mit einem Medium vom NAS startet nicht, und das NAS antwortet nicht. |
| **Inhalte** | **Spotify vorübergehend nicht erreichbar** | Ein Tag mit einem Spotify-Medium startet nicht, und Spotify antwortet nicht. |
| **Tags und Akku** | **NFC-Tag noch nicht zugeordnet** | Ein Tag wird aufgelegt, der noch kein Medium hat. |
| **Tags und Akku** | **Bitte zum Laden anstecken** | Von selbst, wenn der Akku **10 %** erreicht und die Box nicht lädt. |

Die Standardtexte (Deutsch):

| Ansage | Text |
| --- | --- |
| Keine Verbindung zum WLAN-Router | Ich habe keine Verbindung zum WLAN-Router. |
| WLAN-Verbindungsproblem oder Synchronisationsfehler | Es gibt ein Problem mit der WLAN-Verbindung oder bei der Synchronisation. |
| WLAN-Signal ist da, aber zu schwach | Das WLAN-Signal ist da, aber zu schwach. Bitte stell mich näher an den Router. |
| Verzögerung oder Abbruch beim Laden der Inhalte | Das Laden der Inhalte dauert zu lange oder wurde abgebrochen. Versuch es gleich noch einmal. |
| NAS vorübergehend nicht erreichbar | Das NAS ist vorübergehend nicht erreichbar. |
| Spotify vorübergehend nicht erreichbar | Spotify ist vorübergehend nicht erreichbar. |
| NFC-Tag noch nicht zugeordnet | Dieser NFC-Tag wurde noch nicht zugeordnet. |
| Bitte zum Laden anstecken | Bitte stecke mich zum Laden an. |

## Wie oft, und wann nicht

- Dieselbe Ansage kommt **höchstens alle zwei Minuten**, damit eine Störung, die bleibt, die Box nicht ununterbrochen reden lässt. Zwei verschiedene Ansagen reden nicht durcheinander.
- **Ausnahme: NFC-Tag noch nicht zugeordnet.** Diese Ansage kommt **bei jedem Auflegen**, auch wenn du den Tag gleich noch einmal auflegst. Nur während der Satz noch gesprochen wird, wird ein erneutes Auflegen übergangen.
- Ein Album von der **SD-Karte** braucht kein Netz: Für sein Medium kommt keine WLAN-Ansage.
- **Verzögerung oder Abbruch** kommt nicht, wenn die Box das Medium selbst sperrt (die Spielzeit für heute ist um, es ist Ruhezeit), und nicht, wenn der Tag schon wieder abgenommen ist und **Beim Abnehmen** pausiert oder stoppt.
- Die Ansage **Bitte zum Laden anstecken** kommt **einmal**. Erst wenn der Akku wieder über 15 % war oder die Box geladen wurde, kommt sie bei den nächsten 10 % wieder. Sie braucht eine MuPiBox-HAT mit Akku; ohne Akku (Netzbetrieb) gibt es sie nicht.
- Das WLAN prüft die Box an der Datei, die sie selbst alle paar Sekunden schreibt (Name des Netzes, Adresse, Internet ja oder nein, Signalstärke). Eine Box am LAN-Kabel zählt als verbunden.

## Zurück zu den Standardtexten

Den Text einer Ansage löschen und speichern: Die Box nimmt wieder den Standardtext. Der Schalter einer Ansage schaltet sie ganz aus.

Weiter: [NFC-Extension](nfc.md), [Zugeordnete Tags](nfc-zugeordnete-tags.md).
