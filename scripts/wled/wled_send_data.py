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


def infohelp():
    print ('Usage:')
    print (' python 3 wled_send_data.py -s <serial> -b <baud> -j <json>')
    print ('    -h                                 : Shows this help')
    print ('    -s <serial> | --serial <serial>    : Defines the serial port')
    print ('    -b <baud>   | --baud <baud>        : Defines the baud speed')
    print ('    -j <json>   | --json <json>        : Defines the data to send')
    print ('')
    print ('Example:')
    print (' python3 wled_send_data.py -s /dev/ttyUSB0 -b 115200 -j {"v":true}')
    sys.exit(2)
def main(argv):
    if len(sys.argv) < 4:
        infohelp()
    try:
        opts, args = getopt.getopt(argv,"hs:b:j:",["serial=","baud=","json="])
    except getopt.GetoptError:
        infohelp()
    for opt, arg in opts:
        if opt == '-h':
            infohelp()
        elif opt in ("-b", "--baud"):
            baud_rate = arg
        elif opt in ("-s", "--serial"):
            serial_port = arg
        elif opt in ("-j", "--json"):
            json_data = arg
    ser = serial.Serial(serial_port, baud_rate, timeout=1)  # Timeout von 1 Sekunde
    try:
        # JSON-String senden
        ser.write(json_data.encode())
        print(f"JSON-data send: {json_data}")

        #time.sleep(0.8)
        #response = ser.readline().decode('utf-8').strip()  # strip() entfernt führende und nachfolgende Leerzeichen
    except serial.SerialException as se:
        print(f"Serial error: {se}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        ser.close()   

if __name__ == "__main__":
   main(sys.argv[1:])
