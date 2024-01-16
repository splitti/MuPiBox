"""
Licence
-------
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>
"""
__author__ = "ronbal / Olaf Splitt"
__license__ = "GPLv3"
__version__ = "1.0.0"
__status__ = "stable"

import sys
import json
import serial

# Überprüfen, ob genügend Argumente übergeben wurden
if len(sys.argv) < 4:
    print("Bitte geben Sie den Serial-Port, die Baudrate und den JSON-String als Kommandozeilenargumente an.")
    sys.exit(1)

# Argumente auslesen
serial_port = sys.argv[1]
baud_rate = int(sys.argv[2])
json_data = sys.argv[3]

# Serielle Schnittstelle initialisieren
ser = serial.Serial(serial_port, baud_rate, timeout=1)  # Timeout von 1 Sekunde

try:
    # JSON-String senden
    ser.write(json_data.encode())
    print(f"JSON-Daten gesendet: {json_data}")

    # Auf die Antwort warten und ausgeben
    response = ser.readline().decode('utf-8').strip()  # strip() entfernt führende und nachfolgende Leerzeichen
    print(f"Raw-Antwort von der seriellen Schnittstelle: {response}")

    # Zusätzlichen String extrahieren
    additional_string = response.split(":")[-1].strip()
    print(f"Zusätzlicher String: {additional_string}")

except serial.SerialException as se:
    print(f"Serieller Fehler: {se}")

except Exception as e:
    print(f"Allgemeiner Fehler: {e}")

finally:
    ser.close()