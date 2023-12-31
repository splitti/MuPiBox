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
ser = serial.Serial(serial_port, baud_rate)

try:
    # JSON-String senden
    ser.write(json_data.encode())
    print(f"JSON-Daten gesendet: {json_data}")

except Exception as e:
    print(f"Fehler beim Senden der Daten: {e}")

finally:
    ser.close()
