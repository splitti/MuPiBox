import argparse
import re
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from datetime import datetime

def parse_arguments():
    parser = argparse.ArgumentParser(description='Plot battery voltage vs. state of charge from a log file')
    parser.add_argument('-l', '--logfile', required=True, help='Path to the log file to be analyzed')
    parser.add_argument('-o', '--output', choices=['png', 'svg', 'jpg', 'pdf', 'eps'], default='png', help='Output format for the plot (default: png)')
    return parser.parse_args()

def main():
    args = parse_arguments()

    # Logdatei einlesen
    with open(args.logfile, 'r') as file:
        log_content = file.read()

    # Muster für Zeitstempel, Batteriestrom und Batteriespannung
    timestamp_pattern = r'\*\*\* Timestamp:  (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)'
    ibat_pattern = r'hat.REG33_IBAT_ADC.IBAT \[mA\]:\s+(-?\d+)'
    vbat_pattern = r'hat.REG3B_VBAT_ADC.VBAT \[mV\]:\s+(\d+)'
    charger_status_pattern = r'hat.REG1C_Charger_Status_1:\s+Not Charging'

    # Zeitstempel, Batteriestrom und Batteriespannung extrahieren
    timestamps = re.findall(timestamp_pattern, log_content)
    ibat_values = re.findall(ibat_pattern, log_content)
    vbat_values = re.findall(vbat_pattern, log_content)
    charger_statuses = re.findall(charger_status_pattern, log_content)

    # Entferne den letzten Timestamp, wenn er keine entsprechenden Daten hat
    if len(timestamps) > len(ibat_values) or len(timestamps) > len(vbat_values) or len(timestamps) > len(charger_statuses):
        timestamps = timestamps[:-1]

    # Konvertierung der Zeitstempel in datetime-Objekte
    timestamps = [datetime.strptime(ts, '%Y-%m-%d %H:%M:%S.%f') for ts, status in zip(timestamps, charger_statuses)]

    # Konvertierung der Batteriestrom- und -spannungswerte in integers
    ibat_values = [int(i) for i, status in zip(ibat_values, charger_statuses)]
    vbat_values = [int(v) for v, status in zip(vbat_values, charger_statuses)]

    # Berechnung der Kapazität
    Qmax = 0
    Qrem = 0
    for i in range(1, len(timestamps)):
        dt = timestamps[i] - timestamps[i - 1]
        Qmax += (ibat_values[i - 1] / 1000) * (vbat_values[i - 1] / 1000) * pd.to_numeric(dt.seconds / 3600)
    print("Capacity [Wh] =", Qmax)

    # Berechnung des State of Charge (SoC)
    soc = [None] * len(timestamps)
    soc[0] = 100
    for i in range(1, len(timestamps)):
        dt = timestamps[i] - timestamps[i - 1]
        Qrem += (ibat_values[i - 1] / 1000) * (vbat_values[i - 1] / 1000) * pd.to_numeric(dt.seconds / 3600)
        soc[i] = ((Qmax - Qrem) / Qmax) * 100

    # Erstellung einer Polynomialfunktion
    polyfunc = np.polyfit(soc, vbat_values, 2)
    poly4 = np.poly1d(polyfunc)

    # Diagramm erstellen
    plt.figure(figsize=(12, 6))

    sorted_soc = sorted(soc, reverse=True)
    sorted_vbat = [vbat_values[soc.index(s)] for s in sorted_soc]

    plt.plot(sorted_soc, sorted_vbat, label='Battery Voltage', color='red')
    plt.plot(sorted_soc, poly4(sorted_soc), color='blue', linestyle='--', label='Polynomial Fit')

    # Anzeige der Kapazität in der Legende
    legend_title = f'Capacity: {abs(Qmax):.0f} Wh'

    # Laufzeit berechnen
    runtime_seconds = (timestamps[-1] - timestamps[0]).total_seconds()
    hours, remainder = divmod(runtime_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    runtime_formatted = f'{int(hours):02d}:{int(minutes):02d}:{int(seconds):02d}'
    legend_title += f'\nRuntime: {runtime_formatted}'

    # Erstellen der zusätzlichen Linien für die Werte
    x_labels = [0, 5, 25, 50, 75, 100]
    for pos in x_labels:
        plt.axvline(x=pos, color='yellow', linestyle='--')
        if pos in sorted_soc:  # Überprüfen, ob der Wert in sorted_soc vorhanden ist
            plt.text(pos, plt.ylim()[1], f'{pos}%', color='black', ha='center')

        # Prozentwerte an den gelben Linien anzeigen
        plt.text(pos, plt.ylim()[0], f'{pos}%', color='black', ha='center')

    # Batteriespannungswerte für die Prozentwerte 0, 5, 25, 50, 75 und 100% anzeigen
    vbat_at_x = [poly4(pos) for pos in x_labels]
    for i, vbat in zip(x_labels, vbat_at_x):
        plt.text(i, vbat, f'{int(vbat)} mV', color='black', ha='center', bbox=dict(facecolor='lightgrey', alpha=0.8, boxstyle='round,pad=0.3'), fontsize=8, fontweight='bold')

    # Legende anzeigen
    plt.legend(title=legend_title)

    plt.title('Battery Voltage vs. State of Charge')
    plt.xlabel('State of Charge (%)')
    plt.ylabel('Battery Voltage (mV)')

    plt.tight_layout()
    plt.gca().invert_xaxis()  # X-Achse umdrehen

    # Ausgabedatei speichern
    output_file = args.logfile.rsplit('.', 1)[0] + '.' + args.output
    plt.savefig(output_file)
    print(f"Plot saved as {output_file}")

    # Diagramm anzeigen
    #plt.show()

if __name__ == "__main__":
    main()
