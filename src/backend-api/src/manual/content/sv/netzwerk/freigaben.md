# Delade resurser och fjärrstyrning

**Inställningar › Tjänster › Delade resurser & fjärråtkomst**

| Tjänst | Till vad |
| --- | --- |
| **Samba (Windows-delning)** | öppna boxens mediemapp i hemnätverket som en enhet, för att kopiera media |
| **FTP-server** | åtkomst via FTP (port 21) |
| **VNC (fjärrstyr display)** | se och styra displayen i webbläsaren |

Att slå på installerar det som ännu saknas. Det kan ta några minuter. Att stänga av stoppar bara tjänsten.

## Samba

Med Samba dyker boxen upp i nätverket på din Windows-dator, Mac eller Linux-dator. Resursen heter `mupibox` (i Windows `\\<Boxens namn eller IP>\mupibox`). Logga in med användaren `dietpi` och lösenordet `mupibox`. Resursen visar mappen `/home/dietpi/MuPiBox/media` på boxen. Du kopierar in mappar som på ett USB-minne ([Egna ljudböcker och egen musik](../inhalte/lokale-medien.md)).

## FTP

FTP är ett äldre alternativ, likaså för att kopiera filer. Slå bara på det om du behöver det, för en tjänst som inte körs är heller ingen angreppspunkt.

## VNC och ”Display live”

VNC behövs för **fjärrstyrningen (VNC)** under **Inställningar › Display & manövrering › Display live**: Där styr du displayen i webbläsaren, till exempel när boxen står på ett ställe där du inte når pekskärmen. **Öppna fjärrstyrning** visar displayen på sidan, även i helskärm eller i en ny flik. Fjärrstyrningen använder appens inloggning och behöver inget eget lösenord.

> [!WARNING]
> Med fjärrstyrningen kan man göra allt som går på displayen. Skydda därför appen med ett lösenord ([Lösenord och HTTPS](sicherheit.md)).
