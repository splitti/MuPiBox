#!/usr/bin/python3

""" Script for MuPiHAT Charger IC (BQ25792)
Parameters
----------
-l <logfile> : str
    Enable Logging and specify file
-h : print help
-j <json file> str
    enable generation of json file

Call to use for MuPiHAT Service:
-------
python3 -B /usr/local/bin/mupibox/mupihat.py -j /tmp/mupihat.json

Call to use for MuPiHAT Print Logging for Debug only (eg. for Battery test):
-------
python3 -B /usr/local/bin/mupibox/mupihat.py -l /tmp/mupihat.log

Returns
-------
none

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
__author__ = "Lars Stopfkuchen"
__license__ = "GPLv3"
__version__ = "0.0.1"
__email__ = "lars.stopfkuchen@mupibox.de"
__status__ = "under development"

import sys, getopt
import time
import json
from datetime import datetime  

from mupihat_bq25792 import bq25792

def timestamp():
    time_stamp = time.time()
    date_time = datetime.fromtimestamp(time_stamp)
    return date_time

'''
def SOC_Battery(CHG_STAT, VBAT):
     """
     Calculate State of Charge from VBat reading of charger IC
     --------------
     """
     # TODO, this is only a rudimentary example
     if (CHG_STAT == 0) or (CHG_STAT == 7):
          if VBAT > 7400: soc = '5'
          elif VBAT > 7000: soc = '4'
          elif VBAT > 6600: soc = '3'
          elif VBAT > 6200: soc = '2'
          elif VBAT > 6000: soc = '1'
          else: soc = '0'
     else:
          soc = 'charging' 
     return soc
'''


def main(argv):
    # parse command line
    sys.stdout = sys.stdout
    log_flag = 0
    json_flag = 0
    logfile = '/tmp/mupihat.log'
    json_file = '/tmp/mupihat.json'
    try:
        opts, args = getopt.getopt(argv,"h:l:j:",["logfile=", "json="])
    except getopt.GetoptError:
        print ('mupihat.py -l <logfile>')
        sys.exit(2)
    for opt, arg in opts:
        if opt == '-h':
            print ('mupihat.py -l <logfile> -j <json file>')
            sys.exit(0)
        elif opt in ['-j', '--json']:
             json_file = arg
             json_flag = 1
        elif opt in ['-l', '--logfile']:
             logfile = arg
             log_flag = 1
             f= open(logfile, 'w')
             sys.stdout = f
             print ("----- \n Logfile mupyhat.py \n ----------")
        else:
             assert False, "unhandled option"
    # here it starts
    try:
        hat = bq25792() #instance of bq25792
    except Exception as _error:
            sys.stderr.write('MuPiHat initialisation failed with error: %s\n' % str(_error))
            sys.exit(1)    
    finally:
        pass
    
    # BQ25792 write MuPiHAT Configuration
    try:
        hat.MuPiHAT_Default()
    except Exception as _error:
            sys.stderr.write('MuPiHat configuration failed with error: %s\n' % str(_error))
            sys.exit(2)    
    finally:
        pass
        

    # loop
    try:
        while True:          
            if log_flag:
                '''
                This is only for debug
                Log generation for varios tests, eg Battery test  is TBD 
                '''
                hat.read_all_register()
                # Timestamp    
                print ("*** Timestamp: ", timestamp(), flush=True)
                print ("hat:   get_thermal_reg_threshold            ",hat.REG16_Temperature_Control.get_thermal_reg_threshold())
                print ("hat:   get_thermal_shutdown_threshold       ",hat.REG16_Temperature_Control.get_thermal_shutdown_threshold())
                print ("hat:   Temperature Charger IC               ",hat.REG41_TDIE_ADC.get_IC_temperature())
                print ("hat:   Temperature Regulation Status        ",hat.REG1D_Charger_Status_2.get_thermal_regulation_status())
                # Charger Status
                print ("hat.REG1C_Charger_Status_1:                 ",hat.REG1C_Charger_Status_1.CHG_STAT_STRG)
                # ADC Reading
                print ("hat.REG31_IBUS_ADC.IBUS [mA]:               ",hat.get_ibus())
                print ("hat.REG33_IBAT_ADC.IBAT [mA]:               ",hat.get_ibat())
                print ("hat.REG35_VBUS_ADC.VBUS [mV]:               ",hat.get_vbus())
                print ("hat.REG37_VAC1_ADC.VAC1 [mV]:               ",hat.REG37_VAC1_ADC.VAC1_ADC)
                print ("hat.REG39_VAC2_ADC.VAC2 [mV]:               ",hat.REG39_VAC2_ADC.VAC2_ADC)
                print ("hat.REG3B_VBAT_ADC.VBAT [mV]:               ",hat.get_vbat())
                print ("hat.REG3D_VSYS_ADC.VSYS [mV]:               ",hat.REG3D_VSYS_ADC.VSYS_ADC)
                print ("hat.REG01_Charge_Voltage_Limit.VREG:    	",hat.REG01_Charge_Voltage_Limit.VREG)
                print ("hat.REG06_Input_Current_Limit.IINDPM[mA]:   ",hat.REG06_Input_Current_Limit.IINDPM)
                print ("hat.REG06_Input_Current_Limit:              ",hat.REG06_Input_Current_Limit.get())
                print ("hat.REG0F_Charger_Control_0:                ",hat.REG0F_Charger_Control_0.get())
                print ("hat.REG0F_Charger_Control_1:                ",hat.REG10_Charger_Control_1.get())
                print ("hat.REG0F_Charger_Control_2:                ",hat.REG11_Charger_Control_2.get())
                print ("hat.REG0F_Charger_Control_3:                ",hat.REG12_Charger_Control_3.get())
                print ("hat.REG0F_Charger_Control_4:                ",hat.REG13_Charger_Control_4.get())
                print ("hat.REG0F_Charger_Control_5:                ",hat.REG14_Charger_Control_5.get())
                print ("")
            if json_flag:
                # Writing to json
                #hat.MuPiHAT_Default()
                with open(json_file, "w") as outfile:
                    json.dump(hat.to_json(), outfile)
            time.sleep(5)

    except KeyboardInterrupt:
        print("mupyhat.py stopped by Key Interrupt")
        sys.exit(0)
    except Exception as _error:
            sys.stderr.write('MuPiHat error: %s\n' % str(_error))
    finally:
         pass  

    
if __name__ == "__main__":
    main(sys.argv[1:])