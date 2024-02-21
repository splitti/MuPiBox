import argparse
import re
import matplotlib.pyplot as plt
from datetime import datetime

def parse_arguments():
    parser = argparse.ArgumentParser(description='Plot battery current and voltage from a log file.')
    parser.add_argument('-l', '--logfile', type=str, help='Path to the log file', required=True)
    parser.add_argument('-o', '--output', type=str, help='Output file path (including file extension)', required=True)
    return parser.parse_args()

def main():
    args = parse_arguments()

    with open(args.logfile, 'r') as file:
        log_content = file.read()

    # Muster für Zeitstempel und Batteriestrom und -spannung
    timestamp_pattern = r'\*\*\* Timestamp:  (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)'
    ibat_pattern = r'hat.REG33_IBAT_ADC.IBAT \[mA\]:\s+(-?\d+)'
    vbat_pattern = r'hat.REG3B_VBAT_ADC.VBAT \[mV\]:\s+(\d+)'

    # Zeitstempel und Batteriestrom und -spannung extrahieren
    timestamps = re.findall(timestamp_pattern, log_content)
    ibat_values = re.findall(ibat_pattern, log_content)
    vbat_values = re.findall(vbat_pattern, log_content)

    # Entferne den letzten Zeitstempel, wenn er keine entsprechenden Daten hat
    if len(timestamps) > len(ibat_values) or len(timestamps) > len(vbat_values):
        timestamps = timestamps[:-1]

    # Konvertierung der Zeitstempel in datetime-Objekte
    timestamps = [datetime.strptime(ts, '%Y-%m-%d %H:%M:%S.%f') for ts in timestamps]

    # Konvertierung der Batteriestrom- und -spannungswerte in integers
    ibat_values = [int(i) for i in ibat_values]
    vbat_values = [int(v) for v in vbat_values]

    # Plot erstellen
    plt.figure(figsize=(12, 6))
    plt.plot(timestamps, ibat_values, label='Battery Current (mA)', color='blue')
    plt.plot(timestamps, vbat_values, label='Battery Voltage (mV)', color='red')

    plt.title('Battery Current and Voltage')
    plt.xlabel('Timestamp')
    plt.ylabel('Value')

    plt.legend()
    plt.grid(True)

    plt.savefig(args.output)
    print(f'Plot saved as {args.output}')

if __name__ == "__main__":
    main()
