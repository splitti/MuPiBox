#!/usr/bin/python3

""" Script for MuPiHAT Charger IC (BQ25792)
Parameters
----------
-l <logfile> : str
    Enable Logging and specify file
-h : print help
-j <json file> str
    Enable generation of JSON file

Call to use for MuPiHAT Service:
-------
python3 -B /usr/local/bin/mupibox/mupihat.py -j /tmp/mupihat.json

Call to use for MuPiHAT Print Logging for Debug only (e.g., for Battery test):
-------
python3 -B /usr/local/bin/mupibox/mupihat.py -l /tmp/mupihat.log

Returns
-------
none
"""

__author__ = "Lars Stopfkuchen"
__license__ = "GPLv3"
__version__ = "0.2.0"
__email__ = "larsstopfkuchen@mupihat.de"
__status__ = "released"

import sys
import time
import json
import logging
import argparse
from datetime import datetime
from flask import Flask, render_template, jsonify
from threading import Thread
from mupihat_bq25792 import bq25792

app = Flask(__name__)

# Global variables
hat = None
log_flag = False
json_flag = False
json_file = "/tmp/mupihat.json"
config_file = "/etc/mupibox/mupiboxconfig.json"


def timestamp():
    """Returns the current timestamp."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def setup_logging(logfile):
    """Sets up logging to a file."""
    logging.basicConfig(
        filename=logfile,
        level=logging.INFO,
        format="%(asctime)s - %(message)s",
    )
    logging.info("----- Logfile mupihat.py -----")


def log_register_values():
    """Logs register values for debugging."""
    logging.info("*** Timestamp: %s", timestamp())
    logging.info("Thermal Regulation Threshold: %s", hat.REG16_Temperature_Control.get_thermal_reg_threshold())
    logging.info("Thermal Shutdown Threshold: %s", hat.REG16_Temperature_Control.get_thermal_shutdown_threshold())
    logging.info("Temperature Charger IC: %s", hat.REG41_TDIE_ADC.get_IC_temperature())
    logging.info("Temperature Regulation Status: %s", hat.REG1D_Charger_Status_2.get_thermal_regulation_status())
    logging.info("Charger Status: %s", hat.REG1C_Charger_Status_1.CHG_STAT_STRG)
    logging.info("IBUS [mA]: %s", hat.get_ibus())
    logging.info("IBAT [mA]: %s", hat.get_ibat())
    logging.info("VBUS [mV]: %s", hat.get_vbus())
    logging.info("VBAT [mV]: %s", hat.get_vbat())
    logging.info("VSYS [mV]: %s", hat.REG3D_VSYS_ADC.VSYS_ADC)
    logging.info("Charge Voltage Limit: %s", hat.REG01_Charge_Voltage_Limit.VREG)
    logging.info("Input Current Limit: %s", hat.REG06_Input_Current_Limit.get())


@app.route("/")
def index():
    """Flask route to display register values."""
    try:
        hat.read_all_register()
        return render_template("index.html", registers=hat.to_json_registers())
    except Exception as e:
        return f"Error reading registers: {str(e)}", 500


@app.route("/api/registers")
def api_registers():
    """Flask API endpoint to return register values as JSON."""
    try:
        
        
        hat.read_all_register()
        return jsonify(hat.to_json_registers())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def periodic_json_dump():
    """Periodically writes the register values to a JSON file."""
    global json_flag, json_file
    while True:
        if json_flag:
            try:
                with open(json_file, "w") as outfile:
                    json.dump(hat.to_json(), outfile, indent=4)
            except Exception as e:
                logging.error("Failed to write JSON dump: %s", str(e))
        if log_flag:
            log_register_values()

        time.sleep(5)  # Run every 5 seconds


def parse_arguments():
    """Parses command-line arguments using argparse."""
    parser = argparse.ArgumentParser(
        description="MuPiHAT Charger IC (BQ25792) Service"
    )
    parser.add_argument(
        "-l", "--logfile",
        type=str,
        help="Enable logging and specify the log file path",
        default="/tmp/mupihat.log"
    )
    parser.add_argument(
        "-j", "--json",
        type=str,
        help="Enable JSON file generation and specify the JSON file path",
        default="/tmp/mupihat.json"
    )
    parser.add_argument(
        "-c", "--config",
        type=str,
        help="Config (Json) File for MuPiHAT",
        default="/etc/mupihat/mupihatconfig.json"
    )
    return parser.parse_args()


def main():
    global hat, log_flag, json_flag, json_file

    # Parse command-line arguments
    args = parse_arguments()
    logfile = args.logfile
    json_file = args.json
    config_file = args.config
    log_flag = bool(logfile)
    json_flag = bool(json_file)

    # Set up logging if enabled
    if log_flag:
        setup_logging(logfile)

    # Initialize BQ25792
    try:
        hat = bq25792(battery_conf_file=config_file)
        hat.MuPiHAT_Default()

    except Exception as e:
        logging.error("MuPiHAT initialization failed: %s", str(e))
        sys.exit(1)

    # Start the periodic JSON dump in a background thread
    if json_flag:
        json_thread = Thread(target=periodic_json_dump, daemon=True)
        json_thread.start()

    # Flask web server
    try:
        app.run(host="0.0.0.0", port=5000, debug=False)
    except KeyboardInterrupt:
        print("MuPiHAT stopped by Keyboard Interrupt")
        sys.exit(0)
    except Exception as e:
        logging.error("MuPiHAT error: %s", str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
