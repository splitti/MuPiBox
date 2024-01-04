#!/usr/bin/python3
""" Script for MuPiHAT Charger IC (BQ25792)
Parameters
----------
-l <logfile> : str
    Enable Logging and specify file
-h : print help

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
from datetime import datetime  

from mupihat_bq25792 import bq25792

def timestamp():
    time_stamp = time.time()
    date_time = datetime.fromtimestamp(time_stamp)
    return date_time

def main(argv):
    # parse command line
    sys.stdout = sys.stdout
    logfile = ''
    try:
        opts, args = getopt.getopt(argv,"h:l",["logfile="])
    except getopt.GetoptError:
        print ('mupihat.py -l <logfile>')
        sys.exit(2)
    for opt, arg in opts:
        if opt == '-h':
            print ('mupihat.py -l <logfile>')
            sys.exit(0)
        elif opt in ("-l", "--logfile"):
             logfile = arg
             f= open(logfile, 'w')
             sys.stdout = f
             print ("----- \n Logfile mupyhat.py \n ----------")
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
        hat.read_all_register() # read all register once
        # watchdog
        reg = hat.REG10_Charger_Control_1
        reg.WATCHDOG = 0    #disable watchdog
        hat.write_register(reg)
        
        #disable STATUS PIN
        reg = hat.REG13_Charger_Control_4
        reg.DIS_STAT = 1
        hat.write_register(reg)
        
        # ADC Control
        reg = hat.REG2E_ADC_Control
        reg.ADC_EN = 1
        reg.ADC_SAMPLE = 0 # 15bit resolution
        reg.ADC_AVG = 0 # running avg
        reg.ADC_AVG_INIT = 0 
        hat.write_register(reg)
        
        # Enable the IBAT discharge current sensing for ADC
        # Disable the external ILIM_HIZ pin input current regulation
        reg = hat.REG14_Charger_Control_5
        reg.EN_IBAT = 1
        reg.EN_EXTILIM = 0
        hat.write_register(reg)
    except Exception as _error:
            sys.stderr.write('MuPiHat configuration failed with error: %s\n' % str(_error))
            sys.exit(2)    
    finally:
        pass
        

    # loop
    try:
        while True:
            hat.read_all_register()
            # Timestamp    
            print ("*** Timestamp: ", timestamp(), flush=True)
            # Charger Status
            print ("hat.REG1C_Charger_Status_1:                 ",hat.REG1C_Charger_Status_1.CHG_STAT_STRG)
            # ADC Reading
            print ("hat.REG31_IBUS_ADC.IBUS [mA]:               ",hat.REG31_IBUS_ADC.IBUS_ADC)
            print ("hat.REG33_IBAT_ADC.IBAT [mA]:               ",hat.REG33_IBAT_ADC.IBAT_ADC)
            print ("hat.REG35_VBUS_ADC.VBUS [mV]:               ",hat.REG35_VBUS_ADC.VBUS_ADC)
            print ("hat.REG37_VAC1_ADC.VAC1 [mV]:               ",hat.REG37_VAC1_ADC.VAC1_ADC)
            print ("hat.REG39_VAC2_ADC.VAC2 [mV]:               ",hat.REG39_VAC2_ADC.VAC2_ADC)
            print ("hat.REG3B_VBAT_ADC.VBAT [mV]:               ",hat.REG3B_VBAT_ADC.VBAT_ADC)
            print ("hat.REG3D_VSYS_ADC.VSYS [mV]:               ",hat.REG3D_VSYS_ADC.VSYS_ADC)
            print ("")
            time.sleep(2)
    except KeyboardInterrupt:
        print("mupyhat.py stopped by Key Interrupt")
        sys.exit(0)
    except Exception as _error:
            sys.stderr.write('MuPiHat error: %s\n' % str(_error))
    finally:
         pass  

    
if __name__ == "__main__":
    main(sys.argv[1:])