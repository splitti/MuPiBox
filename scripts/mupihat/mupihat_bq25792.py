#!/usr/bin/python3 
""" Module Mupihat_BQ25792.py, class: bq25792
Parameters
----------
none

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
__version__ = "0.1.1"
__email__ = "larsstopfkuchen@mupihat.de"
__status__ = "released"

import smbus2
import sys
import time
import json

import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,  # Set the logging level (INFO, DEBUG, WARNING, etc.)
    format="%(asctime)s - %(levelname)s - %(message)s",  # Log format
    handlers=[
        logging.StreamHandler(sys.stdout),  # Output logs to the console
    ]
)


class I2CError(Exception):
    """Custom exception for I2C communication errors."""
    pass

class bq25792:
    """
    A class for interfacing with the BQ25792 charger IC.

    The BQ25792 is a highly integrated battery charge management IC that supports USB-C PD and other power sources. 
    This class provides methods to configure, monitor, and control the charger IC via I2C communication.

    Attributes
    ----------
    i2c_device : int
        The I2C bus number (default: 1).
    i2c_addr : int
        The I2C address of the BQ25792 IC (default: 0x6b).
    busWS_ms : int
        Sleep time after I2C access in milliseconds (default: 10).
    registers : list
        A list of register values read from the BQ25792 IC.
    battery_conf : dict
        Configuration for the battery, including thresholds for state-of-charge (SOC) and warnings.
    battery_conf_file : str
        Path to the JSON configuration file for the battery.

    Methods
    -------
    __init__(i2c_device=1, i2c_addr=0x6b, busWS_ms=10, exit_on_error=False, battery_conf_file="/etc/mupibox/mupiboxconfig.json")
        Initializes the BQ25792 class and sets up default configurations.
    read_register(reg_addr, length=1)
        Reads data from a specific register.
    write_register(reg)
        Writes a single-byte value to a register.
    write_register_word(reg)
        Writes a two-byte value to a register.
    read_all_register()
        Reads all registers from the BQ25792 IC and updates the class attributes.
    read_Vbat()
        Reads the battery voltage (VBAT) in millivolts.
    read_Ibat()
        Reads the battery current (IBAT) in milliamps.
    read_Vbus()
        Reads the bus voltage (VBUS) in millivolts.
    read_Ibus()
        Reads the bus current (IBUS) in milliamps.
    read_TDIE_Temp()
        Reads the IC temperature in degrees Celsius.
    set_input_current_limit(input_current_limit)
        Sets the input current limit in milliamps.
    disable_extilim()
        Disables the external ILIM_HIZ input current limit pin.
    enable_extilim()
        Enables the external ILIM_HIZ input current limit pin.
    read_ChargerStatus()
        Reads the charger status and returns a descriptive string.
    read_VBAT_PRESENT()
        Checks if the battery is present and returns the status.
    write_defaults()
        Writes default settings to the charger IC.
    MuPiHAT_Default()
        Writes default settings specific to the MuPiHAT project.
    to_json()
        Returns a JSON object with key metrics such as voltage, current, temperature, and charger status.
    to_json_registers()
        Returns a JSON object containing all register variables with their names and values.
    battery_soc()
        Calculates the battery state-of-charge (SOC) based on the VBAT value and configuration thresholds.
    soft_reset()
        Performs a soft reset of the charger IC.
    safe_execute(func, *args, **kwargs)
        Executes a function safely, catching exceptions and handling errors.

    Usage
    -----
    # Example usage:
    hat = bq25792()
    hat.read_all_register()
    print(hat.to_json())
    """
     # constructor method
    def __init__(self, i2c_device=1, i2c_addr=0x6b, busWS_ms=10, exit_on_error = False, battery_conf_file="/etc/mupibox/mupiboxconfig.json"):
        try:
            self.battery_conf_file = battery_conf_file
            self.battery_conf = {'battery_type' : "Default",
                                 'v_100': 8100,
                                 'v_75': 7800,
                                 'v_50': 7400,
                                 'v_25': 7000,
                                 'v_0': 6700,
                                 'th_warning': 7000,
                                 'th_shutdown': 6800 }
            self._exit_on_error = exit_on_error
            self.i2c_device = i2c_device
            self.i2c_addr = i2c_addr
            self.busWS_ms = busWS_ms
            self.registers = [0xFF]*73
            #BQ25792 Register
            self.REG00_Minimal_System_Voltage = self.REG00_Minimal_System_Voltage()
            self.REG01_Charge_Voltage_Limit = self.REG01_Charge_Voltage_Limit()
            self.REG03_Charge_Current_Limit = self.REG03_Charge_Current_Limit()
            self.REG05_Input_Voltage_Limit = self.REG05_Input_Voltage_Limit()
            self.REG06_Input_Current_Limit = self.REG06_Input_Current_Limit()
            self.REG08_Precharge_Control = self.REG08_Precharge_Control()
            self.REG09_Termination_Control = self.REG09_Termination_Control()
            self.REG0A_Recharge_Control = self.REG0A_Recharge_Control() 
            self.REG0B_VOTG_regulation = self.REG0B_VOTG_regulation()
            self.REG0D_IOTG_regulation = self.REG0D_IOTG_regulation()
            self.REG0E_Timer_Control = self.REG0E_Timer_Control()
            self.REG0F_Charger_Control_0 = self.REG0F_Charger_Control_0()
            self.REG10_Charger_Control_1 = self.REG10_Charger_Control_1()
            self.REG11_Charger_Control_2 = self.REG11_Charger_Control_2()
            self.REG12_Charger_Control_3 = self.REG12_Charger_Control_3()
            self.REG13_Charger_Control_4 = self.REG13_Charger_Control_4()
            self.REG14_Charger_Control_5 = self.REG14_Charger_Control_5()
            self.REG15_Reserved = self.REG15_Reserved()
            self.REG16_Temperature_Control = self.REG16_Temperature_Control()
            self.REG17_NTC_Control_0 = self.REG17_NTC_Control_0()
            self.REG18_NTC_Control_1 = self.REG18_NTC_Control_1()
            self.REG19_ICO_Current_Limit = self.REG19_ICO_Current_Limit()
            self.REG1B_Charger_Status_0 = self.REG1B_Charger_Status_0()
            self.REG1C_Charger_Status_1 = self.REG1C_Charger_Status_1()
            self.REG1D_Charger_Status_2 = self.REG1D_Charger_Status_2()
            self.REG1E_Charger_Status_3 = self.REG1E_Charger_Status_3()
            self.REG1F_Charger_Status_4 = self.REG1F_Charger_Status_4()
            self.REG20_FAULT_Status_0  = self.REG20_FAULT_Status_0()
            self.REG21_FAULT_Status_1  = self.REG21_FAULT_Status_1()
            self.REG22_Charger_Flag_0  = self.REG22_Charger_Flag_0()
            self.REG23_Charger_Flag_1  = self.REG23_Charger_Flag_1()
            self.REG24_Charger_Flag_2  = self.REG24_Charger_Flag_2()
            self.REG25_Charger_Flag_3  = self.REG25_Charger_Flag_3()
            self.REG26_FAULT_Flag_0  = self.REG26_FAULT_Flag_0()
            self.REG27_FAULT_Flag_1  = self.REG27_FAULT_Flag_1()
            self.REG28_Charger_Mask_0  = self.REG28_Charger_Mask_0()
            self.REG29_Charger_Mask_1  = self.REG29_Charger_Mask_1()
            self.REG2A_Charger_Mask_2  = self.REG2A_Charger_Mask_2()
            self.REG2B_Charger_Mask_3  = self.REG2B_Charger_Mask_3()
            self.REG2C_FAULT_Mask_0   = self.REG2C_FAULT_Mask_0()
            self.REG2D_FAULT_Mask_1  = self.REG2D_FAULT_Mask_1()
            self.REG2E_ADC_Control = self.REG2E_ADC_Control()
            self.REG2F_ADC_Function_Disable_0 = self.REG2F_ADC_Function_Disable_0() 
            self.REG30_ADC_Function_Disable_1 = self.REG30_ADC_Function_Disable_1()
            self.REG31_IBUS_ADC = self.REG31_IBUS_ADC()
            self.REG33_IBAT_ADC = self.REG33_IBAT_ADC()
            self.REG35_VBUS_ADC = self.REG35_VBUS_ADC()
            self.REG37_VAC1_ADC = self.REG37_VAC1_ADC()
            self.REG39_VAC2_ADC = self.REG39_VAC2_ADC()
            self.REG3B_VBAT_ADC = self.REG3B_VBAT_ADC()
            self.REG3D_VSYS_ADC = self.REG3D_VSYS_ADC()
            self.REG3F_TS_ADC = self.REG3F_TS_ADC()
            self.REG41_TDIE_ADC  = self.REG41_TDIE_ADC()
            self.REG43_DP_ADC = self.REG43_DP_ADC()
            self.REG45_DM_ADC = self.REG45_DM_ADC()
            self.REG47_DPDM_Driver = self.REG47_DPDM_Driver()
            self.REG48_Part_Information = self.REG48_Part_Information()
            # handle to bus
            self.bq = smbus2.SMBus(i2c_device)
            self.battery_conf_load()
        except Exception as _error:
            #sys.stderr.write('%s\n' % str(_error))
            logging.error("BQ25792 init failed, %s", str(_error))
            if self._exit_on_error: sys.exit(1)
        finally:
            pass

    def battery_conf_load(self):
        '''
        load the battery configuration from json file
        '''
        try:
            with open(self.battery_conf_file) as file:
                config = json.load(file)
            
            selected_battery_name = config["mupihat"]["selected_battery"]
            for bt in config["mupihat"]["battery_types"]:
                if bt["name"] == selected_battery_name:
                    self.battery_conf["battery_type"] = selected_battery_name
                    self.battery_conf["v_100"] = int(bt["config"]["v_100"])
                    self.battery_conf["v_75"] = int(bt["config"]["v_75"])
                    self.battery_conf["v_50"] = int(bt["config"]["v_50"])
                    self.battery_conf["v_25"] = int(bt["config"]["v_25"])
                    self.battery_conf["v_0"] = int(bt["config"]["v_0"])
                    self.battery_conf["th_warning"] = int(bt["config"]["th_warning"])
                    self.battery_conf["th_shutdown"] = int(bt["config"]["th_shutdown"])
                    logging.info("Battery configuration loaded from JSON: %s", self.battery_conf_file)
                    break            
            return 0
        except Exception as _error:
            logging.error("battery_conf_load from JSON failed, use standard configuration, %s", str(_error))
            if self._exit_on_error: sys.exit(1)
            return -1
        finally:
            pass

    def battery_soc(self):
        '''
        Description
        -------
        Calc the Battery State-of-Charge
        Compares the voltage of battery (from VBat register value) with thresholds from battery_conf

        Outputs
        ------
            Bat_SOC -> str {100%, 75%, 50%, 25%, 0%} \n
            Bat_Stat -> {OK, LOW, SHUTDOWN}
        '''
        Bat_SOC = ''
        Bat_Stat = ''
        v_100, v_75, v_50, v_25, v_0 = self.battery_conf['v_100'], self.battery_conf['v_75'],self.battery_conf['v_50'],self.battery_conf['v_25'],self.battery_conf['v_0']
        th_warning, th_shutdown = self.battery_conf['th_warning'], self.battery_conf['th_shutdown']

        VBat = self.read_Vbat()

        if VBat > v_100     : Bat_SOC = "100%"
        elif VBat > v_75    : Bat_SOC = "75%"
        elif VBat > v_50    : Bat_SOC = "50%"
        elif VBat > v_25    : Bat_SOC = "25%"
        elif VBat > v_0     : Bat_SOC = "0%"

        if VBat > th_warning : Bat_Stat = 'OK'
        elif (VBat < th_warning) & (VBat > th_shutdown) : Bat_Stat = 'LOW'
        elif (VBat < th_shutdown) : Bat_Stat = 'SHUTDOWN'

        return Bat_SOC, Bat_Stat

    # BQ25795 Register
    class BQ25795_REGISTER:
        def __init__(self, addr, value=0):
            self._addr = addr
            self._value = value
        def set (self, value):
            self._value = value
        def get(self):
            return self._value
        def twos_complement(self):
            if (self._value >> 15) == 1:
                ret = (-1)*(65535 + 1 - self._value) #two's complement
            else:
                ret = self._value
            return ret

    class REG00_Minimal_System_Voltage(BQ25795_REGISTER):
        """
        BQ25795 - REG00_Minimal_System_Voltage
        ----------
        VSYSMIN, Minimal System Voltage: 
            During POR, the device reads the resistance tie to PROG pin, 
            to identify the default battery cell count and determine the default power on VSYSMIN list below: 
                1s: 3.5V 
                2s: 7V 
                3s: 9V 
                4s: 12V 
            RW Range : 2500mV-16000mV 
            Fixed Offset : 2500mV Bit Step Size : 250mV Clamped High
        """
        def __init__(self, addr=0x0, value=0):
            super().__init__(addr, value)
            self.VSYSMIN = self._value * 250 + 2500
        def set (self, value):
            super().set(value)
            self.VSYSMIN = self._value * 250 + 2500

    class REG01_Charge_Voltage_Limit(BQ25795_REGISTER):
        """
        BQ25795 - REG01_Charge_Voltage_Limit
        ---------
        VREG, Battery Voltage Limit: 
            During POR, the device reads the resistance tie to PROG pin, 
            to identify the default battery cell count and determine the default power-on battery voltage regulation limit: 
            1s: 4.2V 
            2s: 8.4V 
            3s: 12.6V 
            4s: 16.8V 
            Type : RW 
            Range : 3000mV-18800mV 
            Fixed Offset : 0mV 
            Bit Step Size : 10mV
        """
        def __init__(self, addr=0x1, value=0):
            super().__init__(addr, value)
            self._value = value
            self.VREG = self._value * 10
        def set (self, value):
            super().set(value)
            self.VRE0G = self._value * 10

    class REG03_Charge_Current_Limit(BQ25795_REGISTER):
        #Charge Current Limit During POR, the device reads the resistance tie to PROG pin, to identify the default battery cell count and determine the default power-on battery charging current: 1s and 2s: 3s and 4s: 1A Type : RW Range : 50mA-5000mA Fixed Offset : 0mA Bit Step Size : 10mA
        def __init__(self, value = 0):
            self._addr = 0x3
            self._value = value
            self.ICHG = self._value * 10
        def set (self, value):
            self._value = value
            self.ICHG = self._value * 10

    class REG05_Input_Voltage_Limit(BQ25795_REGISTER):
        #Absolute VINDPM Threshold VINDPM register is reset to 3600mV upon adapter unplugged and it is set to the value based on the VBUS measurement when the adapter plugs in. It is not reset by the REG_RST and the WATCHDOG Type : RW POR: 3600mV (24h) Range : 3600mV-22000mV Fixed Offset : 0mV Bit Step Size : 100mV
        def __init__(self, value = 0):
            self._addr = 0x5
            self._value = value
            self.VINDPM = self._value * 100
        def set (self, value):
            self._value = value
            self.VINDPM = self._value * 100

    class REG06_Input_Current_Limit(BQ25795_REGISTER):
        '''
        IINDPM
            Based on D+/D- detection results: 
            USB SDP = 500mA USB CDP = 1.5A 
            USB DCP = 3.25A Adjustable High Voltage 
            DCP = 1.5A 
            Unknown Adapter = 3A 
            Non-Standard Adapter = 1A/2A/2.1A/2.4A 
            Type : RW POR: 3000mA (12Ch) 
            Range : 100mA-3300mA 
            Fixed Offset : 0mA 
            Bit Step Size : 10mA
        '''
        def __init__(self, addr=0x6, value=0x12c):
            super().__init__(addr, value)
            self.IINDPM = (self._value & 0b111111111) * 10
        def set (self, value):
            super().set(value)
            self.IINDPM = (self._value & 0b111111111) * 10
        def get (self):
            self._value = int(self.IINDPM / 10)
            return self._value, self.IINDPM
        def get_IINDPM(self):
            '''return input current limit in mA'''
            return self.IINDPM
        def set_IINDPM(self, IINDPM):
            '''
            Set input current limit in mA steps (10mA steps, Range : 100mA-3300mA)
            '''
            self.IINDPM = IINDPM
            self.get()

        def set_input_current_limit(self, input_current_limit):
            '''
            Set input current limit in mA steps (10mA steps, Range : 100mA-3300mA)
            '''
            self.IINDPM = input_current_limit
            self.get()
        
    

    class REG08_Precharge_Control(BQ25795_REGISTER):
        # VBAT_LOWV: Battery voltage thresholds for the transition from precharge to fast charge, which is defined as a ratio of battery regulation limit (VREG) Type : RW POR: 11b 0h = 15%*VREG 1h = 62.2%*VREG 2h = 66.7%*VREG 3h = 71.4%*VREG
        # IPRECHG: Precharge current limit Type : RW POR: 120mA (3h) Range : 40mA-2000mA Fixed Offset : 0mA Bit Step Size : 40mA
        def __init__(self, value = 0):
            self._addr = 0x8
            self._value = value
            self.VBAT_LOWV = ((self._value & 0b11000000) >> 6)
            self.IPRECHG   = (self._value & 0b00111111) * 40
        def set (self, value):
            self._value = value
            self.VBAT_LOWV = ((self._value & 0b11000000) >> 6)
            self.IPRECHG   = (self._value & 0b00111111) * 40
    
    class REG09_Termination_Control(BQ25795_REGISTER):
        """
        BQ25795 - EG09_Termination_Control
        ----------
        REG_RST: 
            Reset registers to default values and reset timer 
            Type : RW POR: 0b 0h = Not reset 1h = Reset
        ITERM: 
            Termination current 
            Type : RW POR: 200mA (5h) 
            Range : 40mA-1000mA 
            Fixed Offset : 0mA 
            Bit Step Size : 40mA
        """

        def __init__(self, addr=0x9, value=0):
            super().__init__(addr, value)
            self.REG_RST = ((self._value & 0b01000000) >> 6)
            self.ITERM   = (self._value & 0b00011111) * 40
        def set (self, value):
            super().set(value)
            self.REG_RST = ((self._value & 0b01000000) >> 6)
            self.ITERM   = (self._value & 0b00011111) * 40
        def get (self):
            self._value = (self.REG_RST << 6) | (self.ITERM >> 0)
            return self._value, self.REG_RST, self.ITERM
        def get_ITERM(self):
            '''return termination current in mA'''
            return self.ITERM
        def set_ITERM(self, ITERM):
            '''
            Set termination current in mA steps (40mA steps, Range : 40mA-1000mA)
            '''
            self.ITERM = ITERM
            self.get()
        def get_REG_RST(self):
            '''return REG_RST'''
            return self.REG_RST
        def set_REG_RST(self, REG_RST):
            '''
            Set REG_RST (0h = Not reset, 1h = Reset)
            '''
            self.REG_RST = REG_RST
            self.get()

    class REG0A_Recharge_Control(BQ25795_REGISTER):
        """
        BQ25795 - REG0A_Recharge_Control
        ----------
        CELL:
            At POR, the charger reads the PROG pin resistance to determine the battery cell count and update this CELL bits accordingly. 
            Type : RW 
            0h = 1s 
            1h = 2s 
            2h = 3s 
            3h = 4s
        TRECHG:
            Battery recharge deglich time 
            Type : RW 
            POR: 10b
            0h = 64ms 
            1h = 256ms 
            2h = 1024ms (default) 
            3h = 2048ms
        VRECHG:
            Battery Recharge Threshold Offset (Below VREG) 
            Type : RW 
            POR: 200mV (3h) 
            Range : 50mV-800mV 
            Fixed Offset : 50mV 
            Bit Step Size : 50mV
        """
        def __init__(self, value = 0):
            self._addr = 0xa
            self._value = value
            self.CELL       = ((self._value & 0b11000000) >> 6)
            self.TRECHG     = ((self._value & 0b00110000) >> 4)
            self.VRECHG     = ((self._value & 0b00001111) >> 0) * 50 + 50
        def set (self, value):
            self._value = value
            self.CELL       = ((self._value & 0b11000000) >> 6)
            self.TRECHG     = ((self._value & 0b00110000) >> 4)
            self.VRECHG     = ((self._value & 0b00001111) >> 0)

    class REG0B_VOTG_regulation(BQ25795_REGISTER):
        """
        BQ25795 - REG0B_VOTG_regulation
        ----------
        VOTG: 
            OTG mode regulation voltage
            Type : RW 
            POR: 5000mV (DCh) 
            Range : 2800mV-22000mV 
            Fixed Offset : 2800mV 
            Bit Step Size : 10mV 
            Clamped High
        """
        def __init__(self, addr=0xb, value=0):
            super().__init__(addr, value)
            self.VOTG = ((self._value & 0b11111111111))
        def set (self, value):
            super().set(value)
            self.VOTG = ((self._value & 0b11111111111))
        def get (self):
            self._value = self.VOTG
            return self._value, self.VOTG

    class REG0E_Timer_Control(BQ25795_REGISTER):
        """
        BQ25795 - REG0E_Timer_Control
        ----------
        TOPOFF_TMR: 
            Top-off timer control 
            Type : RW 
            POR: 00b 0h = Disabled (default) 
            1h = 15 mins 
            2h = 30 mins 
            3h = 45 mins
        EN_TRICHG_TMR:
            Enable the Trickle Charge Timer 
            Type : RW 
            POR: 0b 0h = Disabled (default) 
            1h = Enabled
        EN_PRECHG_TMR:
            Enable the Precharge Timer 
            Type : RW 
            POR: 0b 0h = Disabled (default) 
            1h = Enabled  
        EN_CHG_TMR:
            Enable the Charge Timer 
            Type : RW 
            POR: 0b 
            0h = Disabled (default) 
            1h = Enabled
        CHG_TMR:
            Charge Timer Setting 
            Type : RW 
            POR: 10b 
            0h = 5 hrs 
            1h = 10 hrs 
            2h = 12 hrs (default)  
            3h = 24 hrs 
        TMR2X_EN:
            Enable the 2X Timer 
            Type : RW 
            POR: 1b 
            0h =  Trickle charge, pre-charge and fast charge timer NOT slowed by 2X during input DPM or thermal regulation.
            1h = Trickle charge, pre-charge and fast charge timer slowed by 2X during input DPM or thermal regulation (default)  
        """
        def __init__(self, addr=0xe, value=0x3d):
            super().__init__(addr, value)   
            self.TOPOFF_TMR = ((self._value & 0b11000000) >> 6)
            self.EN_TRICHG_TMR = ((self._value & 0b00100000) >> 5) 
            self.EN_PRECHG_TMR = ((self._value & 0b00010000) >> 4)
            self.EN_CHG_TMR = ((self._value & 0b00001000) >> 3) 
            self.CHG_TMR = ((self._value & 0b00000110) >> 1)
            self.TMR2X_EN = ((self._value & 0b00000001) >> 0)         
        def set (self, value):
            super().set(value)
            self.TOPOFF_TMR = ((self._value & 0b11000000) >> 6)
            self.EN_TRICHG_TMR = ((self._value & 0b00100000) >> 5) 
            self.EN_PRECHG_TMR = ((self._value & 0b00010000) >> 4)
            self.EN_CHG_TMR = ((self._value & 0b00001000) >> 3) 
            self.CHG_TMR = ((self._value & 0b00000110) >> 1)
            self.TMR2X_EN = ((self._value & 0b00000001) >> 0)
        def get (self):
            self._value = (self.TOPOFF_TMR << 6) | (self.EN_TRICHG_TMR << 5) | (self.EN_PRECHG_TMR << 4) | (self.EN_CHG_TMR << 3) | (self.CHG_TMR << 1) | (self.TMR2X_EN << 0)
            return self._value, self.TOPOFF_TMR, self.EN_TRICHG_TMR, self.EN_PRECHG_TMR, self.EN_CHG_TMR, self.CHG_TMR, self.TMR2X_EN
        def get_TMR2X_EN(self):
            '''return TMR2X_EN'''
            return self.TMR2X_EN
        def set_TMR2X_EN(self, TMR2X_EN):
            '''
            Set TMR2X_EN
            '''
            self.TMR2X_EN = TMR2X_EN
            self.get()
        
        
    class REG0D_IOTG_regulation(BQ25795_REGISTER):
        """
        BQ25795 - REG0D_IOTG_regulation
        ----------
        PRECHG_TMR: 
            Pre-charge safety timer setting 
            Type : RW 
            POR: 0b 
            0h = 2 hrs (default) 
            1h = 0.5 hrs
        IOTG:
            OTG current limit 
            Type : RW 
            POR: 3000mA (4Bh) 
            Range : 120mA-3320mA 
            Fixed Offset : 0mA 
            Bit Step Size : 40mA 
            Clamped Low
        """
        def __init__(self, addr=0xd, value=0):
            super().__init__(addr, value)
            self.PRECHG_TMR =   (self._value & 0b10000000)
            self.IOTG =         (self._value & 0b01111111)
        def set (self, value):
            super().set(value)
            self.PRECHG_TMR =   (self._value & 0b10000000)
            self.IOTG =         (self._value & 0b01111111)
        def get (self):
            self._value = (self.PRECHG_TMR << 7) | (self.IOTG & 0b01111111)
            return self._value, self.PRECHG_TMR, self.IOTG

    class REG0F_Charger_Control_0(BQ25795_REGISTER):
        """
        BQ25795 - REG0F_Charger_Control_0
        ----------
        EN_AUTO_IBATDIS
            Enable the auto battery discharging during the battery OVP fault 
            Type : RW POR: 1b 
            0h = The charger will NOT apply a discharging current on BAT during battery OVP 
            1h = The charger will apply a discharging current on BAT during battery OVP
        FORCE_IBATDIS
            Force a battery discharging current 
            Type : RW POR: 0b 
            0h = IDLE (default) 
            1h = Force the charger to apply a discharging current on BAT regardless the battery OVP status
        EN_CHG
            Charger Enable Configuration 
            Type : RW POR: 1b 
            0h = Charge Disable 
            1h = Charge Enable (default)
        EN_ICO
            Input Current Optimizer (ICO) Enable 
            Type : RW POR: 0b 
            0h = Disable ICO (default) 
            1h = Enable ICO
        FORCE_ICO
            Force start input current optimizer (ICO) Note: This bit can only be set and returns 0 after ICO starts. This bit only valid when EN_ICO = 1 
            Type : RW POR: 0b 
            0h = Do NOT force ICO (Default) 
            1h = Force ICO start
        EN_HIZ
            Enable HIZ mode. This bit will be also reset to 0, when the adapter is plugged in at VBUS. 
            Type : RW POR: 0b 
            0h = Disable (default) 
            1h = Enable
        EN_TERM
            Enable termination 
            Type : RW POR: 1b 
            0h = Disable 
            1h = Enable (default)
        """
        def __init__(self, addr=0xf, value = 0xA2):
            super().__init__(addr, value)
            self.EN_AUTO_IBATDIS = ((self._value & 0b10000000) == 128)
            self.FORCE_IBATDIS   = ((self._value & 0b01000000) == 64)
            self.EN_CHG          = ((self._value & 0b00100000) == 32)
            self.EN_ICO          = ((self._value & 0b00010000) == 16)
            self.FORCE_ICO       = ((self._value & 0b00001000) == 8)
            self.EN_HIZ          = ((self._value & 0b00000100) == 4)
            self.EN_TERM         = ((self._value & 0b00000010) == 2)
        def set (self, value):
            super().set(value)
            self.EN_AUTO_IBATDIS = ((self._value & 0b10000000) == 128)
            self.FORCE_IBATDIS   = ((self._value & 0b01000000) == 64)
            self.EN_CHG          = ((self._value & 0b00100000) == 32)
            self.EN_ICO          = ((self._value & 0b00010000) == 16)
            self.FORCE_ICO       = ((self._value & 0b00001000) == 8)
            self.EN_HIZ          = ((self._value & 0b00000100) == 4)
            self.EN_TERM         = ((self._value & 0b00000010) == 2)
        def get (self):
            self._value = (self.EN_AUTO_IBATDIS << 7) | (self.FORCE_IBATDIS << 6) | (self.EN_CHG << 5) | (self.EN_ICO << 4)| (self.FORCE_ICO << 3)| (self.EN_HIZ << 2) | (self.EN_TERM << 1) | 0
            return self._value, self.EN_AUTO_IBATDIS, self.FORCE_IBATDIS, self.EN_CHG, self.EN_ICO, self.FORCE_ICO, self.EN_HIZ, self.EN_TERM 
        def get_EN_AUTO_IBATDIS(self):
            '''return EN_AUTO_IBATDIS'''
            return self.EN_AUTO_IBATDIS
        def set_EN_AUTO_IBATDIS(self, EN_AUTO_IBATDIS):
            '''
            Set EN_AUTO_IBATDIS (0h = The charger will NOT apply a discharging current on BAT during battery OVP, 1h = The charger will apply a discharging current on BAT during battery OVP)
            '''
            self.EN_AUTO_IBATDIS = EN_AUTO_IBATDIS
            self.get()
        def get_FORCE_IBATDIS(self):
            '''return FORCE_IBATDIS'''
            return self.FORCE_IBATDIS
        def set_FORCE_IBATDIS(self, FORCE_IBATDIS):
            '''     
            Set FORCE_IBATDIS (0h = IDLE (default), 1h = Force the charger to apply a discharging current on BAT regardless the battery OVP status)
            '''
            self.FORCE_IBATDIS = FORCE_IBATDIS
            self.get()  
        def get_EN_CHG(self):
            '''return EN_CHG'''
            return self.EN_CHG  
        def set_EN_CHG(self, EN_CHG):
            '''
            Set EN_CHG (0h = Charge Disable, 1h = Charge Enable (default))  
            '''
            self.EN_CHG = EN_CHG
            self.get()
        def get_EN_ICO(self):
            '''return EN_ICO'''
            return self.EN_ICO
        def set_EN_ICO(self, EN_ICO):
            '''
            Set EN_ICO (0h = Disable ICO (default), 1h = Enable ICO) 
            '''
            self.EN_ICO = EN_ICO
            self.get()
        def get_FORCE_ICO(self):
            '''return FORCE_ICO'''
            return self.FORCE_ICO
        def set_FORCE_ICO(self, FORCE_ICO):
            '''
            Set FORCE_ICO (0h = Do NOT force ICO (Default), 1h = Force ICO start) 
            '''
            self.FORCE_ICO = FORCE_ICO
            self.get()
        def get_EN_HIZ(self):
            '''return EN_HIZ'''
            return self.EN_HIZ
        def set_EN_HIZ(self, EN_HIZ):
            '''
            Set EN_HIZ (0h = Disable (default), 1h = Enable) 
            '''
            self.EN_HIZ = EN_HIZ
            self.get()
        def get_EN_TERM(self):
            '''return EN_TERM'''
            return self.EN_TERM
        def set_EN_TERM(self, EN_TERM):
            '''
            Set EN_TERM (0h = Disable, 1h = Enable (default)) 
            '''
            self.EN_TERM = EN_TERM
            self.get()

    class REG10_Charger_Control_1(BQ25795_REGISTER):
        """
        BQ25795 - REG10_Charger_Control_1
        ----------
        VAC_OVP
            VAC_OVP thresholds 
            Type : RW POR: 00b 
            0h = 26V (default) 
            1h = 18V 
            2h = 12V 
            3h = 7V
        WD_RST
            I2C watch dog timer reset 
            Type : RW POR: 0b 
            0h = Normal (default) 
            1h = Reset (this bit goes back to 0 after timer resets)
        WATCHDOG
            Watchdog timer settings 
            Type : RW POR: 101b 
            0h = Disable 
            1h = 0.5s 
            2h = 1s 
            3h = 2s 
            4h = 20s 
            5h = 40s (default) 
            6h = 80s 
            7h = 160s
        """
        def __init__(self, addr=0x10, value = 0):
            super().__init__(addr, value)
            self.VAC_OVP       = ((self._value & 0b00110000) >> 4)
            self.WD_RST        = ((self._value & 0b00001000) >> 3)
            self.WATCHDOG      = ((self._value & 0b00000111) >> 0)
        def set (self, value):
            super().set(value)
            self.VAC_OVP       = ((self._value & 0b00110000) >> 4)
            self.WD_RST        = ((self._value & 0b00001000) >> 3)
            self.WATCHDOG      = ((self._value & 0b00000111) >> 0)
        def get (self):
            self._value = (self.VAC_OVP << 4) | (self.WD_RST << 3) | (self.WATCHDOG)
            return self._value, self.VAC_OVP, self.WD_RST, self.WATCHDOG
        def get_VAC_OVP(self):
            '''return VAC_OVP'''
            return self.VAC_OVP 
        def set_VAC_OVP(self, VAC_OVP):
            '''
            Set VAC_OVP (0h = 26V (default), 1h = 18V, 2h = 12V, 3h = 7V)   
            '''
            self.VAC_OVP = VAC_OVP  
            self.get()
        def get_WD_RST(self):
            '''return WD_RST'''
            return self.WD_RST  
        def set_WD_RST(self, WD_RST):
            '''
            Set WD_RST (0h = Normal (default), 1h = Reset (this bit goes back to 0 after timer resets)) 
            '''
            self.WD_RST = WD_RST    
            self.get()
        def get_WATCHDOG(self): 
            '''return WATCHDOG'''
            return self.WATCHDOG
        def set_WATCHDOG(self, WATCHDOG):   
            '''
            Set WATCHDOG (0h = Disable, 1h = 0.5s, 2h = 1s, 3h = 2s, 4h = 20s, 5h = 40s (default), 6h = 80s, 7h = 160s) 
            '''
            self.WATCHDOG = WATCHDOG  
            self.get()


    class REG11_Charger_Control_2(BQ25795_REGISTER):
        """
        BQ25795 - REG11_Charger_Control_2
        ----------
        FORCE_INDET
            Force D+/D- detection 
            Type : RW POR: 0b 
            0h = Do NOT force D+/D- detection (default) 
            1h = Force D+/D- algorithm, when D+/D- detection is done, this bit will be reset to 0
        AUTO_INDET_EN
            Automatic D+/D- Detection Enable 
            Type : RW POR: 1b 
            0h = Disable D+/D- detection when VBUS is pluggedin 
            1h = Enable D+/D- detection when VBUS is plugged-in (default)
        EN_12V
            EN_12V HVDC 
            Type : RW POR: 0b 
            0h = Disable 12V mode in HVDCP (default) 
            1h = Enable 12V mode in HVDCP
        EN_9V
            EN_9V HVDC 
            Type : RW POR: 0b 
            0h = Disable 9V mode in HVDCP (default) 
            1h = Enable 9V mode in HVDCP
        HVDCP_EN
            High voltage DCP enable. 
            Type : RW POR: 0b 
            0h = Disable HVDCP handshake (default) 
            1h = Enable HVDCP handshake
        SDRV_CTRL
            SFET control The external ship FET control logic to force the device enter different modes. 
            Type : RW POR: 00b 
            0h = IDLE (default) 
            1h = Shutdown Mode 
            2h = Ship Mode 
            3h = System Power Reset
        SDRV_DLY
            Delay time added to the taking action in bit [2:1] of the SFET control 
            Type : RW POR: 0b 
            0h = Add 10s delay time (default) 
            1h = Do NOT add 10s delay time
        """
        def __init__(self, addr=0x11, value = 0x40):
            super().__init__(addr, value)
            self.FORCE_INDET   = ((self._value & 0b10000000) >> 7)
            self.AUTO_INDET_EN = ((self._value & 0b01000000) >> 6)
            self.EN_12V        = ((self._value & 0b00100000) >> 5)
            self.EN_9V         = ((self._value & 0b00010000) >> 4)
            self.HVDCP_EN      = ((self._value & 0b00001000) >> 3)
            self.SDRV_CTRL     = ((self._value & 0b00000110) >> 1)
            self.SDRV_DLY      = ((self._value & 0b00000001) >> 0)
        def set (self, value):
            super().set(value)
            self.FORCE_INDET   = ((self._value & 0b10000000) >> 7)
            self.AUTO_INDET_EN = ((self._value & 0b01000000) >> 6)
            self.EN_12V        = ((self._value & 0b00100000) >> 5)
            self.EN_9V         = ((self._value & 0b00010000) >> 4)
            self.HVDCP_EN      = ((self._value & 0b00001000) >> 3)
            self.SDRV_CTRL     = ((self._value & 0b00000110) >> 1)
            self.SDRV_DLY      = ((self._value & 0b00000001) >> 0)
        def get (self):
            self._value = (self.FORCE_INDET << 7) | (self.AUTO_INDET_EN << 6) | (self.EN_12V << 5) | (self.EN_9V << 4) | (self.HVDCP_EN << 3) | (self.SDRV_CTRL << 1) | (self.SDRV_DLY)
            return self._value, self.SDRV_DLY, self.SDRV_CTRL, self.HVDCP_EN, self.EN_9V, self.EN_12V, self.AUTO_INDET_EN, self.FORCE_INDET

    class REG12_Charger_Control_3(BQ25795_REGISTER):
        """
        BQ25795 - REG12_Charger_Control_3
        ----------
        DIS_ACDRV
            When this bit is set, the charger will force both EN_ACDRV1=0 and EN_ACDRV2=0 
            Type : RW 
            POR: 0b
        EN_OTG
            OTG mode control 
            Type : RW 
            POR: 0b 
            0h = OTG Disable (default) 
            1h = OTG Enable
        PFM_OTG_DIS
            Disable PFM in OTG mode 
            Type : RW 
            POR: 0b 
            0h = Enable (Default) 
            1h = Disable
        PFM_FWD_DIS
            Disable PFM in forward mode 
            Type : RW 
            POR: 0b 
            0h = Enable (Default) 
            1h = Disable
        WKUP_DLY
            When wake up the device from ship mode, how much time (tSM_EXIT) is required to pull low the QON pin. 
            Type : RW 
            POR: 0b 
            0h = 1s (Default) 
            1h = 15ms
        DIS_LDO
            Disable BATFET LDO mode in pre-charge stage. 
            Type : RW POR: 0b 
            0h = Enable (Default) 
            1h = Disable
        DIS_OTG_OOA
            Disable OOA in OTG mode 
            Type : RW POR: 0b 
            0h = Enable (Default) 
            1h = Disable
        DIS_FWD_OOA
            Disable OOA in forward mode 
            Type : RW POR: 0b 
            0h = Enable (Default) 
            1h = Disable
        """
        def __init__(self, addr=0x12, value = 0):
            super().__init__(addr, value)
            self.DIS_ACDRV     = ((self._value & 0b10000000) >> 7)
            self.EN_OTG        = ((self._value & 0b01000000) >> 6)         
            self.PFM_OTG_DIS   = ((self._value & 0b00100000) >> 5)
            self.PFM_FWD_DIS   = ((self._value & 0b00010000) >> 4)
            self.WKUP_DLY      = ((self._value & 0b00001000) >> 3)
            self.DIS_LDO       = ((self._value & 0b00000100) >> 2)
            self.DIS_OTG_OOA   = ((self._value & 0b00000010) >> 1)
            self.DIS_FWD_OOA   = ((self._value & 0b00000001) >> 0)
        def set (self, value):  
            super().set(value)
            self.DIS_ACDRV     = ((self._value & 0b10000000) >> 7)
            self.EN_OTG        = ((self._value & 0b01000000) >> 6)         
            self.PFM_OTG_DIS   = ((self._value & 0b00100000) >> 5)
            self.PFM_FWD_DIS   = ((self._value & 0b00010000) >> 4)
            self.WKUP_DLY      = ((self._value & 0b00001000) >> 3)
            self.DIS_LDO       = ((self._value & 0b00000100) >> 2)
            self.DIS_OTG_OOA   = ((self._value & 0b00000010) >> 1)
            self.DIS_FWD_OOA   = ((self._value & 0b00000001) >> 0)
        def get (self):
            self._value = (self.DIS_ACDRV << 7) | (self.EN_OTG << 6) | (self.PFM_OTG_DIS << 5) | (self.PFM_FWD_DIS << 4) | (self.WKUP_DLY << 3) | (self.DIS_LDO << 2) | (self.DIS_OTG_OOA << 1) | (self.DIS_FWD_OOA)
            return self._value, self.DIS_ACDRV, self.EN_OTG, self.PFM_OTG_DIS, self.PFM_FWD_DIS, self.WKUP_DLY, self.DIS_LDO, self.DIS_OTG_OOA, self.DIS_FWD_OOA
        def get_DIS_ACDRV(self):
            '''return DIS_ACDRV'''
            return self.DIS_ACDRV
        def set_DIS_ACDRV(self, DIS_ACDRV):
            '''
            Set DIS_ACDRV (0h = Enable (Default), 1h = Disable)
            '''
            self.DIS_ACDRV = DIS_ACDRV
            self.get()
        def get_EN_OTG(self):
            '''return EN_OTG'''
            return self.EN_OTG
        def set_EN_OTG(self, EN_OTG):
            '''     
            Set EN_OTG (0h = OTG Disable (default), 1h = OTG Enable)
            '''
            self.EN_OTG = EN_OTG
            self.get()  
        def get_PFM_OTG_DIS(self):
            '''return PFM_OTG_DIS'''
            return self.PFM_OTG_DIS
        def set_PFM_OTG_DIS(self, PFM_OTG_DIS):
            '''
            Set PFM_OTG_DIS (0h = Enable (Default), 1h = Disable)
            '''
            self.PFM_OTG_DIS = PFM_OTG_DIS  
            self.get()
        def get_PFM_FWD_DIS(self):
            '''return PFM_FWD_DIS'''
            return self.PFM_FWD_DIS
        def set_PFM_FWD_DIS(self, PFM_FWD_DIS):
            '''
            Set PFM_FWD_DIS (0h = Enable (Default), 1h = Disable)
            '''
            self.PFM_FWD_DIS = PFM_FWD_DIS  
            self.get()
        def get_WKUP_DLY(self):
            '''return WKUP_DLY'''
            return self.WKUP_DLY
        def set_WKUP_DLY(self, WKUP_DLY):
            '''
            Set WKUP_DLY (0h = 1s (Default), 1h = 15ms)
            '''
            self.WKUP_DLY = WKUP_DLY  
            self.get()
        def get_DIS_LDO(self):
            '''return DIS_LDO'''
            return self.DIS_LDO
        def set_DIS_LDO(self, DIS_LDO):
            '''
            Set DIS_LDO (0h = Enable (Default), 1h = Disable)
            '''
            self.DIS_LDO = DIS_LDO  
            self.get()  
        def get_DIS_OTG_OOA(self):
            '''return DIS_OTG_OOA'''
            return self.DIS_OTG_OOA 
        def set_DIS_OTG_OOA(self, DIS_OTG_OOA):
            '''
            Set DIS_OTG_OOA (0h = Enable (Default), 1h = Disable)
            '''
            self.DIS_OTG_OOA = DIS_OTG_OOA  
            self.get()
        def get_DIS_FWD_OOA(self):
            '''return DIS_FWD_OOA'''
            return self.DIS_FWD_OOA 
        def set_DIS_FWD_OOA(self, DIS_FWD_OOA):
            '''
            Set DIS_FWD_OOA (0h = Enable (Default), 1h = Disable)
            '''
            self.DIS_FWD_OOA = DIS_FWD_OOA  
            self.get()

    class REG13_Charger_Control_4(BQ25795_REGISTER):
        """
        BQ25795 - REG13_Charger_Control_4
        ----------
        EN_ACDRV2
            External ACFET2-RBFET2 gate driver control At POR, if the charger detects that there is no ACFET2-RBFET2 populated, this bit will be locked at 0 
            Type : RW POR: 0b 
            0h = turn off (default) 
            1h = turn on
        EN_ACDRV1
            External ACFET1-RBFET1 gate driver control At POR, if the charger detects that there is no ACFET1-RBFET1 populated, this bit will be locked at 0 
            Type : RW POR: 0b 
            0h = turn off (default) 
            1h = turn on
        PWM_FREQ
            Switching frequency selection, this bit POR default value is based on the PROG pin strapping. 
            Type : RW 
            0h = 1.5 MHz 
            1h = 750 kHz
        DIS_STAT
            Disable the STAT pin output 
            Type : RW POR: 0b 
            0h = Enable (Default) 
            1h = Disable
        DIS_VSYS_SHORT
            Disable forward mode VSYS short hiccup protection. 
            Type : RW POR: 0b 
            0h = Enable (Default) 
            1h = Disable
        DIS_VOTG_UVP
            Disable OTG mode VOTG UVP hiccup protection. 
            Type : RW POR: 0b 
            0h = Enable (Default) 
            1h = Disable
        FORCE_VINDPM_DET
            Force VINDPM detection Note: only when VBAT>VSYSMIN, this bit can be set to 1. Once the VINDPM auto detection is done, this bits returns to 0. 
            Type : RW POR: 0b 
            0h = Do NOT force VINDPM detection (default) 
            1h = Force the converter stop switching, and ADC measures the VBUS voltage without input current, then the charger updates the VINDPM register accordingly.
        EN_IBUS_OCP
            Enable IBUS_OCP in forward mode 
            Type : RW POR: 1b 
            0h = Disable 
            1h = Enable (default)
        """
        def __init__(self, addr=0x13, value = 0):
            super().__init__(addr, value)
            self.EN_ACDRV2          = ((self._value & 0b10000000) >> 7)
            self.EN_ACDRV1          = ((self._value & 0b01000000) >> 6)
            self.PWM_FREQ           = ((self._value & 0b00100000) >> 5)
            self.DIS_STAT           = ((self._value & 0b00010000) >> 4)
            self.DIS_VSYS_SHORT     = ((self._value & 0b00001000) >> 3)
            self.DIS_VOTG_UVP       = ((self._value & 0b00000100) >> 2)
            self.FORCE_VINDPM_DET   = ((self._value & 0b00000010) >> 1)
            self.EN_IBUS_OCP        = ((self._value & 0b00000001) >> 0)
        def set (self, value):
            super().set(value)
            self.EN_ACDRV2          = ((self._value & 0b10000000) >> 7)
            self.EN_ACDRV1          = ((self._value & 0b01000000) >> 6)
            self.PWM_FREQ           = ((self._value & 0b00100000) >> 5)
            self.DIS_STAT           = ((self._value & 0b00010000) >> 4)
            self.DIS_VSYS_SHORT     = ((self._value & 0b00001000) >> 3)
            self.DIS_VOTG_UVP       = ((self._value & 0b00000100) >> 2)
            self.FORCE_VINDPM_DET   = ((self._value & 0b00000010) >> 1)
            self.EN_IBUS_OCP        = ((self._value & 0b00000001) >> 0)
        def get (self):
            self._value =  (self.EN_ACDRV2 << 7) | (self.EN_ACDRV1 << 6) | (self.PWM_FREQ << 5) | (self.DIS_STAT << 4) | (self.DIS_VSYS_SHORT << 3) | (self.DIS_VOTG_UVP << 2) | (self.FORCE_VINDPM_DET << 1) | (self.EN_IBUS_OCP)
            return self._value, self.EN_ACDRV2, self.EN_ACDRV1, self.PWM_FREQ, self.DIS_STAT, self.DIS_VSYS_SHORT, self.DIS_VOTG_UVP, self.FORCE_VINDPM_DET, self.EN_IBUS_OCP 
    class REG14_Charger_Control_5(BQ25795_REGISTER):
        """
        BQ25795 - REG14_Charger_Control_5
        ----------
        SFET_PRESENT
            The user has to set this bit based on whether a ship FET is populated or not. 
            The POR default value is 0, which means the charger does not support all the features associated with the ship FET. 
            The register bits list below all are locked at 0. 
            EN_BATOC=0 FORCE_SFET_OFF=0 SDRV_CTRL=00 
            When this bit is set to 1, the register bits list above become programmable, and the charger can support the features associated with the ship FET 
            Type : RW POR: 0b 
            0h = No ship FET populated 
            1h = Ship FET populated
        EN_IBAT
            IBAT discharge current sensing enable for ADC 
            Type : RW POR: 0b 
            0h = Disable IBAT discharge current sensing for ADC (default) 
            1h = Enable the IBAT discharge current sensing for ADC
        IBAT_REG
            Battery discharging current regulation in OTG mode 
            Type : RW POR: 10b 
            0h = 3A 
            1h = 4A 
            2h = 5A (default) 
            3h = Disable
        EN_IINDPM
            Enable the internal IINDPM register input current regulation 
            Type : RW POR: 1b 
            0h = Disable 
            1h = Enable (default)
        EN_EXTILIM
            Enable the external ILIM_HIZ pin input current regulation 
            Type : RW POR: 1b 
            0h = Disable 
            1h = Enable (default)
        EN_BATOC
            Enable the battery discharging current OCP 
            Type : RW POR: 0b 
            0h = Disable (default) 
            1h = Enable
        """
        def __init__(self, addr=0x14, value = 0x16):
            super().__init__(addr, value)
            self.SFET_PRESENT           = ((self._value & 0b10000000) >> 7)
            self.EN_IBAT                = ((self._value & 0b00100000) >> 5)
            self.IBAT_REG               = ((self._value & 0b00011000) >> 3)
            self.EN_IINDPM              = ((self._value & 0b00000100) >> 2)
            self.EN_EXTILIM             = ((self._value & 0b00000010) >> 1)
            self.EN_BATOC               = ((self._value & 0b00000001) >> 0)
        def set (self, value):
            super().set(value)
            self.SFET_PRESENT           = ((self._value & 0b10000000) >> 7)
            self.EN_IBAT                = ((self._value & 0b00100000) >> 5)
            self.IBAT_REG               = ((self._value & 0b00011000) >> 3)
            self.EN_IINDPM              = ((self._value & 0b00000100) >> 2)
            self.EN_EXTILIM             = ((self._value & 0b00000010) >> 1)
            self.EN_BATOC               = ((self._value & 0b00000001) >> 0)
        def get (self):
            self._value =  (self.SFET_PRESENT << 7) | 0 | (self.EN_IBAT << 5) | (self.IBAT_REG << 3) | (self.EN_IINDPM << 2) | (self.EN_EXTILIM << 1) | self.EN_BATOC
            return self._value, self.SFET_PRESENT, self.EN_IBAT, self.IBAT_REG, self.EN_IINDPM, self.EN_EXTILIM, self.EN_BATOC
        def get_SFET_PRESENT(self):
            '''return SFET_PRESENT'''
            return self.SFET_PRESENT
        def set_SFET_PRESENT(self, SFET_PRESENT):   
            '''
            Set SFET_PRESENT (0h = No ship FET populated, 1h = Ship FET populated) 
            '''
            self.SFET_PRESENT = SFET_PRESENT  
            self.get()
        def get_EN_IBAT(self):
            '''return EN_IBAT'''
            return self.EN_IBAT
        def set_EN_IBAT(self, EN_IBAT):
            '''
            Set EN_IBAT (0h = Disable IBAT discharge current sensing for ADC (default), 1h = Enable the IBAT discharge current sensing for ADC) 
            '''
            self.EN_IBAT = EN_IBAT  
            self.get()
        def get_IBAT_REG(self):
            '''return IBAT_REG'''
            return self.IBAT_REG
        def set_IBAT_REG(self, IBAT_REG):
            '''
            Set IBAT_REG (0h = 3A, 1h = 4A, 2h = 5A (default), 3h = Disable) 
            '''
            self.IBAT_REG = IBAT_REG  
            self.get()
        def get_EN_IINDPM(self):
            '''return EN_IINDPM'''
            return self.EN_IINDPM       
        def set_EN_IINDPM(self, EN_IINDPM):
            '''
            Set EN_IINDPM (0h = Disable, 1h = Enable (default)) 
            '''
            self.EN_IINDPM = EN_IINDPM  
            self.get()
        def get_EN_EXTILIM(self):
            '''return EN_EXTILIM'''
            return self.EN_EXTILIM
        def set_EN_EXTILIM(self, EN_EXTILIM):   
            '''
            Set EN_EXTILIM (0h = Disable, 1h = Enable (default)) 
            '''
            self.EN_EXTILIM = EN_EXTILIM  
            self.get()
        def get_EN_BATOC(self):
            '''return EN_BATOC'''
            return self.EN_BATOC
        def set_EN_BATOC(self, EN_BATOC):
            '''
            Set EN_BATOC (0h = Disable (default), 1h = Enable) 
            '''
            self.EN_BATOC = EN_BATOC  
            self.get()
    class REG15_Reserved(BQ25795_REGISTER):
        """
        BQ25795 - REG15_Reserved
        ----------
        Reserved register, do not use.
        """
        def __init__(self, addr=0x15, value = 0):
            super().__init__(addr, value)
            self._value = value
        def set (self, value):
            super().set(value)
            self._value = value
        def get (self):
            return self._value
    
    class REG16_Temperature_Control(BQ25795_REGISTER):
        """
        BQ25795 - REG16_Temperature_Control
        ----------
        TREG
            Thermal regulation thresholds. 
            Type : RW POR: 11b 
            0h = 60°C 
            1h = 80°C 
            2h = 100°C 
            3h = 120°C (default)
        TSHUT
            Thermal shutdown thresholds. 
            Type : RW POR: 00b 
            0h = 150°C (default) 
            1h = 130°C 
            2h = 120°C 
            3h = 85°C
        VBUS_PD_EN
            Enable VBUS pull down resistor (6k Ohm) 
            Type : RW POR: 0b 
            0h = Disable (default) 
            1h = Enable
        VAC1_PD_EN 
            Enable VAC1 pull down resistor 
            Type : RW POR: 0b 
            0h = Disable (default) 
            1h = Enable
        VAC2_PD_EN
             Enable VAC2 pull down resistor 
             Type : RW POR: 0b 
             0h = Disable (default) 
             1h = Enable
        """
        def __init__(self, addr=0x16, value = 0xc0):
            super().__init__(addr, value)
            self.TREG                   = ((self._value & 0b11000000) >> 6)
            self.TSHUT                  = ((self._value & 0b00110000) >> 4)
            self.VBUS_PD_EN             = ((self._value & 0b00001000) >> 3)
            self.VAC1_PD_EN             = ((self._value & 0b00000100) >> 2)
            self.VAC2_PD_EN             = ((self._value & 0b00000010) >> 1)
            self.TREG_str               = self.get_thermal_reg_threshold()
            self.TSHUT_str              = self.get_thermal_shutdown_threshold()
        def set (self, value):
            super().set(value)
            self.TREG                   = ((self._value & 0b11000000) >> 6)
            self.TSHUT                  = ((self._value & 0b00110000) >> 4)
            self.VBUS_PD_EN             = ((self._value & 0b00001000) >> 3)
            self.VAC1_PD_EN             = ((self._value & 0b00000100) >> 2)
            self.VAC2_PD_EN             = ((self._value & 0b00000010) >> 1)
            self.TREG_str               = self.get_thermal_reg_threshold()
            self.TSHUT_str              = self.get_thermal_shutdown_threshold()
        def get (self):
            self._value =  (self.TREG << 6) | (self.TSHUT << 4) | (self.VBUS_PD_EN << 3) | (self.VAC1_PD_EN << 2) | (self.VAC2_PD_EN << 1) | 0
            return self._value,   self.TREG,  self.TSHUT, self.VBUS_PD_EN, self.VAC1_PD_EN, self.VAC2_PD_EN
        
        def get_thermal_reg_threshold(self):
            if self.TREG == 0x0: return "60°C"
            elif self.TREG == 0x1: return"80°C"
            elif self.TREG == 0x2: return "100°C"
            elif self.TREG == 0x3: return "120°C"
            else: return "unknown" 
        def get_thermal_shutdown_threshold(self):
            if self.TSHUT == 0x0: return "150°C"
            elif self.TSHUT == 0x1: return"130°C"
            elif self.TSHUT == 0x2: return "120°C"
            elif self.TSHUT == 0x3: return "85°C"
            else: return "unknown" 
        def get_VBUS_PD_EN(self):
            '''return VBUS_PD_EN'''
            return self.VBUS_PD_EN
        def set_VBUS_PD_EN(self, VBUS_PD_EN):
            '''
            Set VBUS_PD_EN (0h = Disable (default), 1h = Enable) 
            '''
            self.VBUS_PD_EN = VBUS_PD_EN  
            self.get()
        def get_VAC1_PD_EN(self):
            '''return VAC1_PD_EN'''
            return self.VAC1_PD_EN
        def set_VAC1_PD_EN(self, VAC1_PD_EN):
            '''
            Set VAC1_PD_EN (0h = Disable (default), 1h = Enable) 
            '''
            self.VAC1_PD_EN = VAC1_PD_EN  
            self.get()
        def get_VAC2_PD_EN(self):
            '''return VAC2_PD_EN'''
            return self.VAC2_PD_EN
        def set_VAC2_PD_EN(self, VAC2_PD_EN):   
            '''
            Set VAC2_PD_EN (0h = Disable (default), 1h = Enable) 
            '''
            self.VAC2_PD_EN = VAC2_PD_EN  
            self.get()
        def get_TREG(self):
            '''return TREG'''
            return self.TREG
        def set_TREG(self, TREG):
            '''     
            Set TREG (0h = 60°C, 1h = 80°C, 2h = 100°C, 3h = 120°C (default))
            ''' 
            self.TREG = TREG
            self.get()
        def get_TSHUT(self):
            '''return TSHUT'''
            return self.TSHUT   
        def set_TSHUT(self, TSHUT):
            '''
            Set TSHUT (0h = 150°C (default), 1h = 130°C, 2h = 120°C, 3h = 85°C) 
            '''
            self.TSHUT = TSHUT
            self.get()

    class REG17_NTC_Control_0(BQ25795_REGISTER):
        """
        BQ25795 - REG17_NTC_Control_0
        ----------
        JEITA_VSET
            JEITA high temperature range (TWARN – THOT) charge voltage setting 
            Type : RW 
            POR: 011b 
            0h = Charge Suspend 
            1h = Set VREG to VREG-800mV 
            2h = Set VREG to VREG-600mV 
            3h = Set VREG to VREG-400mV (default) 
            4h = Set VREG to VREG-300mV 
            5h = Set VREG to VREG-200mV 
            6h = Set VREG to VREG-100mV 
            7h = VREG unchanged
        JEITA_ISETH
            JEITA high temperature range (TWARN – THOT) charge current setting 
            Type : RW 
            POR: 11b 
            0h = Charge Suspend 
            1h = Set ICHG to 20%* ICHG 
            2h = Set ICHG to 40%* ICHG 
            3h = ICHG unchanged (default)
        JEITA_ISETC
            JEITA low temperature range (TCOLD – TCOOL) charge current setting 
            Type : RW 
            POR: 01b 
            0h = Charge Suspend 
            1h = Set ICHG to 20%* ICHG (default) 
            2h = Set ICHG to 40%* ICHG 
            3h = ICHG unchanged
        """
        def __init__(self, addr=0x17, value = 0x7a):
            super().__init__(addr, value)
            self.JEITA_VSET           = ((self._value & 0b11100000) >> 5)
            self.JEITA_VSET_str       = self.get_JEITA_VSET_str()
            self.JEITA_ISETH          = ((self._value & 0b00011000) >> 3) 
            self.JEITA_ISETH_str      = self.get_JEITA_ISETH_str() 
            self.JEITA_ISETC          = ((self._value & 0b00000110) >> 1)
            self.JEITA_ISETC_str      = self.get_JEITA_ISETC_str()
            
        def set (self, value):
            super().set(value)
            self.JEITA_VSET           = ((self._value & 0b11100000) >> 5)
            self.JEITA_VSET_str       = self.get_JEITA_VSET_str()
            self.JEITA_ISETH          = ((self._value & 0b00011000) >> 3) 
            self.JEITA_ISETH_str      = self.get_JEITA_ISETH_str() 
            self.JEITA_ISETC          = ((self._value & 0b00000110) >> 1)
            self.JEITA_ISETC_str      = self.get_JEITA_ISETC_str()
        def get (self):
            self._value = (self.JEITA_VSET << 5) | (self.JEITA_ISETH << 3) | (self.JEITA_ISETC << 1) | 0
            return self._value, self.JEITA_VSET, self.JEITA_ISETH, self.JEITA_ISETC
        def get_JEITA_VSET(self):
            '''return JEITA_VSET'''
            return self.JEITA_VSET    
        def get_JEITA_VSET_str(self):
            if self.JEITA_VSET == 0x0: return "Charge Suspend"
            elif self.JEITA_VSET == 0x1: return "Set VREG to VREG-800mV"
            elif self.JEITA_VSET == 0x2: return "Set VREG to VREG-600mV"
            elif self.JEITA_VSET == 0x3: return "Set VREG to VREG-400mV (default)"
            elif self.JEITA_VSET == 0x4: return "Set VREG to VREG-300mV"
            elif self.JEITA_VSET == 0x5: return "Set VREG to VREG-200mV"
            elif self.JEITA_VSET == 0x6: return "Set VREG to VREG-100mV"
            elif self.JEITA_VSET == 0x7: return "VREG unchanged"
            else: return "unknown"  
        def set_JEITA_VSET(self, JEITA_VSET):
            '''
            Set JEITA_VSET (0h = Charge Suspend, 1h = Set VREG to VREG-800mV, 2h = Set VREG to VREG-600mV, 3h = Set VREG to VREG-400mV (default), 4h = Set VREG to VREG-300mV, 5h = Set VREG to VREG-200mV, 6h = Set VREG to VREG-100mV, 7h = VREG unchanged)   
            '''
            self.JEITA_VSET = JEITA_VSET
            self.get()
        def get_JEITA_ISETH(self):
            '''return JEITA_ISETH'''
            return self.JEITA_ISETH

        def get_JEITA_ISETH_str(self):
            if self.JEITA_ISETH == 0x0: return "Charge Suspend"
            elif self.JEITA_ISETH == 0x1: return "Set ICHG to 20%* ICHG"
            elif self.JEITA_ISETH == 0x2: return "Set ICHG to 40%* ICHG"
            elif self.JEITA_ISETH == 0x3: return "ICHG unchanged (default)"
            else: return "unknown"

        def set_JEITA_ISETH(self, JEITA_ISETH):
            '''
            Set JEITA_ISETH (0h = Charge Suspend, 1h = Set ICHG to 20%* ICHG, 2h = Set ICHG to 40%* ICHG, 3h = ICHG unchanged (default)) 
            '''
            self.JEITA_ISETH = JEITA_ISETH
            self.get()
        def get_JEITA_ISETC(self):
            '''return JEITA_ISETC'''
            return self.JEITA_ISETC 
        def get_JEITA_ISETC_str(self):
            if self.JEITA_ISETC == 0x0: return "Charge Suspend"
            elif self.JEITA_ISETC == 0x1: return "Set ICHG to 20%* ICHG (default)"
            elif self.JEITA_ISETC == 0x2: return "Set ICHG to 40%* ICHG"
            elif self.JEITA_ISETC == 0x3: return "ICHG unchanged"
            else: return "unknown"

        def set_JEITA_ISETC(self, JEITA_ISETC):
            '''
            Set JEITA_ISETC (0h = Charge Suspend, 1h = Set ICHG to 20%* ICHG (default), 2h = Set ICHG to 40%* ICHG, 3h = ICHG unchanged)
            '''
            self.JEITA_ISETC = JEITA_ISETC
            self.get()

    class REG18_NTC_Control_1(BQ25795_REGISTER):
        """
        BQ25795 - REG18_NTC_Control_1
        ----------
        TS_COOL
            JEITA VT2 comparator voltage rising thresholds as a percentage of REGN. 
            The corresponding temperature in the brackets is achieved when a 103AT NTC thermistor is used, RT1=5.24kΩ and RT2=30.31kΩ. 
            Type : RW 
            POR: 01b 
            0h = 71.1% (5°C) 
            1h = 68.4% (default) (10°C) 
            2h = 65.5% (15°C) 
            3h = 62.4% (20°C)
        TS_WARM
            JEITA VT3 comparator voltage falling thresholds as a percentage of REGN. 
            The corresponding temperature in the brackets is achieved when a 103AT NTC thermistor is used, RT1=5.24kΩ and RT2=30.31kΩ. 
            Type : RW 
            POR: 01b 
            0h = 48.4% (40°C) 
            1h = 44.8% (default) (45°C) 
            2h = 41.2% (50°C) 
            3h = 37.7% (55°C)
        BHOT
            OTG mode TS HOT temperature threshold 
            Type : RW 
            POR: 01b 
            0h = 55°C 
            1h = 60°C (default) 
            2h = 65°C 
            3h = Disable
        BCOLD
            OTG mode TS COLD temperature threshold 
            Type : RW 
            POR: 0b 
            0h = -10°C (default) 
            1h = -20°C    
        TS_IGNORE
            Ignore the TS feedback, the charger considers the TS is always good to allow the charging and OTG modes, all the four TS status bits always stay at 0000 to report the normal condition. 
            Type : RW 
            POR: 0b 
            0h = NOT ignore (Default) 
            1h = Ignore
        """
        def __init__(self, addr=0x18, value = 0):
            super().__init__(addr, value)
            self.TS_COOL           = ((self._value & 0b11000000) >> 6)
            self.TS_WARM           = ((self._value & 0b00110000) >> 4)  
            self.BHOT              = ((self._value & 0b00001100) >> 2)
            self.BCOLD             = ((self._value & 0b00000010) >> 1)  
            self.TS_IGNORE         = ((self._value & 0b00000001) >> 0)
        def set (self, value):
            super().set(value)
            self.TS_COOL           = ((self._value & 0b11000000) >> 6)
            self.TS_WARM           = ((self._value & 0b00110000) >> 4)  
            self.BHOT              = ((self._value & 0b00001100) >> 2)
            self.BCOLD             = ((self._value & 0b00000010) >> 1)
            self.TS_IGNORE         = ((self._value & 0b00000001) >> 0)
        def get (self):
            self._value = (self.TS_COOL << 6) | (self.TS_WARM << 4) | (self.BHOT << 2) | (self.BCOLD << 1) | self.TS_IGNORE
            return self._value, self.TS_COOL, self.TS_WARM, self.BHOT, self.BCOLD, self.TS_IGNORE
        def get_TS_COOL(self):
            '''return TS_COOL'''
            return self.TS_COOL
        def set_TS_COOL(self, TS_COOL):
            '''
            Set TS_COOL (0h = 71.1% (5°C), 1h = 68.4% (default) (10°C), 2h = 65.5% (15°C), 3h = 62.4% (20°C))   
            '''
            self.TS_COOL = TS_COOL
            self.get()
        def get_TS_WARM(self):
            '''return TS_WARM'''
            return self.TS_WARM
        def set_TS_WARM(self, TS_WARM):     
            '''
            Set TS_WARM (0h = 48.4% (40°C), 1h = 44.8% (default) (45°C), 2h = 41.2% (50°C), 3h = 37.7% (55°C)) 
            '''
            self.TS_WARM = TS_WARM
            self.get()
        def get_BHOT(self):
            '''return BHOT'''
            return self.BHOT
        def set_BHOT(self, BHOT):
            '''
            Set BHOT (0h = 55°C, 1h = 60°C (default), 2h = 65°C, 3h = Disable) 
            '''
            self.BHOT = BHOT
            self.get()
        def get_BCOLD(self):
            '''return BCOLD'''
            return self.BCOLD
        def set_BCOLD(self, BCOLD): 
            '''
            Set BCOLD (0h = -10°C (default), 1h = -20°C) 
            '''
            self.BCOLD = BCOLD
            self.get()
        def get_TS_IGNORE(self):
            '''return TS_IGNORE'''
            return self.TS_IGNORE
        def set_TS_IGNORE(self, TS_IGNORE):
            '''
            Set TS_IGNORE (0h = NOT ignore (Default), 1h = Ignore)  
            '''
            self.TS_IGNORE = TS_IGNORE  
            self.get()
        def get_TS_COOL_threshold(self):
            if self.TS_COOL == 0x0: return "5°C"
            elif self.TS_COOL == 0x1: return"10°C"
            elif self.TS_COOL == 0x2: return "15°C"
            elif self.TS_COOL == 0x3: return "20°C"
            else: return "unknown"
        def get_TS_WARM_threshold(self):    
            if self.TS_WARM == 0x0: return "40°C"
            elif self.TS_WARM == 0x1: return"45°C"
            elif self.TS_WARM == 0x2: return "50°C"
            elif self.TS_WARM == 0x3: return "55°C"
            else: return "unknown"
        def get_BHOT_threshold(self):
            if self.BHOT == 0x0: return "55°C"
            elif self.BHOT == 0x1: return"60°C"
            elif self.BHOT == 0x2: return "65°C"
            elif self.BHOT == 0x3: return "Disable"
            else: return "unknown"
        def get_BCOLD_threshold(self):
            if self.BCOLD == 0x0: return "-10°C"
            elif self.BCOLD == 0x1: return"-20°C"
            else: return "unknown"
        def get_TS_IGNORE_status(self):
            if self.TS_IGNORE == 0x0: return "NOT ignore (Default)"
            elif self.TS_IGNORE == 0x1: return"Ignore"
            else: return "unknown"


    class REG19_ICO_Current_Limit(BQ25795_REGISTER):
        """
        BQ25795 - REG19_ICO_Current_Limit
        -----------
        ICO_ILIM - Input Current Limit obtained from ICO or ILIM_HIZ pin setting 
        Type : R POR: 0mA (0h) 
        Range : 100mA-3300mA 
        Fixed Offset : 0mA 
        Bit Step Size : 10mA 
        Clamped Low
        """
        def __init__(self, addr=0x19, value = 0):
            super().__init__(addr, value)
            self.ICO_ILIM           = ((self._value & 0b0000000111111111))
        def set (self, value):
            super().set(value)
            self.ICO_ILIM           = ((self._value & 0b0000000111111111))
        def get (self):
            self._value =  (self.ICO_ILIM)
            return self._value, self.ICO_ILIM
        def get_ICO_ILIM (self):
            '''return Input Current Limit obtained from ICO or ILIM_HIZ pin setting in [mA]'''
            return self.ICO_ILIM*10
        
    class REG1B_Charger_Status_0(BQ25795_REGISTER):
        """
        BQ25795 - REG1B_Charger_Status_0
        ----------
        IINDPM_STAT
            IINDPM status (forward mode) or IOTG status (OTG mode) 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = In IINDPM regulation or IOTG regulation
        VINDPM_STAT
            VINDPM status (forward mode) or VOTG status (OTG mode) 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = In VINDPM regulation or VOTG regulation
        WD_STAT
            Watchdog status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Watchdog timeout
        POORSRC_STAT
            Poor source status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Poor source detected
        PG_STAT
            Power good status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Power good detected
        AC2_PRESENT_STAT
            VAC2 insert status 
            Type : R 
            POR: 0b 
            0h = VAC2 NOT present 
            1h = VAC2 present (above present threshold)  
        AC1_PRESENT_STAT
            VAC1 insert status 
            Type : R 
            POR: 0b 
            0h = VAC1 NOT present 
            1h = VAC1 present (above present threshold)
        VBUS_PRESENT_STAT
            VBUS present status 
            Type : R 
            POR: 0b 
            0h = VBUS NOT present 
            1h = VBUS present (above present threshold)              
        """
        def __init__(self, addr=0x1B, value = 0):
            super().__init__(addr, value)
            self.IINDPM_STAT         = ((self._value & 0b100000000) >> 7)
            self.VINDPM_STAT         = ((self._value & 0b010000000) >> 6)   
            self.WD_STAT             = ((self._value & 0b001000000) >> 5)
            self.POORSRC_STAT        = ((self._value & 0b000100000) >> 4)
            self.PG_STAT             = ((self._value & 0b000010000) >> 3)
            self.AC2_PRESENT_STAT    = ((self._value & 0b000001000) >> 2)
            self.AC1_PRESENT_STAT    = ((self._value & 0b000000100) >> 1)
            self.VBUS_PRESENT_STAT   = ((self._value & 0b000000010) >> 0)
        def set (self, value):
            super().set(value)
            self.IINDPM_STAT         = ((self._value & 0b100000000) >> 7)
            self.VINDPM_STAT         = ((self._value & 0b010000000) >> 6)   
            self.WD_STAT             = ((self._value & 0b001000000) >> 5)
            self.POORSRC_STAT        = ((self._value & 0b000100000) >> 4)
            self.PG_STAT             = ((self._value & 0b000010000) >> 3)
            self.AC2_PRESENT_STAT    = ((self._value & 0b000001000) >> 2)
            self.AC1_PRESENT_STAT    = ((self._value & 0b000000100) >> 1)
            self.VBUS_PRESENT_STAT   = ((self._value & 0b000000010) >> 0)
        def get (self):
            self._value =  (self.IINDPM_STAT << 7) | (self.VINDPM_STAT << 6) | (self.WD_STAT << 5) | (self.POORSRC_STAT << 4) | (self.PG_STAT << 3) | (self.AC2_PRESENT_STAT << 2) | (self.AC1_PRESENT_STAT << 1) | self.VBUS_PRESENT_STAT
            return self._value, self.IINDPM_STAT, self.VINDPM_STAT, self.WD_STAT, self.POORSRC_STAT, self.PG_STAT, self.AC2_PRESENT_STAT, self.AC1_PRESENT_STAT, self.VBUS_PRESENT_STAT
        def get_IINDPM_STAT(self):
            '''return IINDPM_STAT'''
            return self.IINDPM_STAT
        def get_VINDPM_STAT(self):
            '''return VINDPM_STAT'''
            return self.VINDPM_STAT
        def get_WD_STAT(self):
            '''return WD_STAT'''
            return self.WD_STAT
        def get_POORSRC_STAT(self):
            '''return POORSRC_STAT'''
            return self.POORSRC_STAT
        def get_PG_STAT(self):
            '''return PG_STAT'''
            return self.PG_STAT
        def get_AC2_PRESENT_STAT(self):
            '''return AC2_PRESENT_STAT'''
            return self.AC2_PRESENT_STAT
        def get_AC1_PRESENT_STAT(self):
            '''return AC1_PRESENT_STAT'''
            return self.AC1_PRESENT_STAT
        def get_VBUS_PRESENT_STAT(self):
            '''return VBUS_PRESENT_STAT'''
            return self.VBUS_PRESENT_STAT

    class REG1C_Charger_Status_1(BQ25795_REGISTER):
        """
        BQ25795 - REG1C_Charger_Status_1
        ----------
        CHG_STAT
            Charge Status bits 
            Type : R POR: 000b 
            0h = Not Charging 
            1h = Trickle Charge 
            2h = Pre-charge 
            3h = Fast charge (CC mode) 
            4h = Taper Charge (CV mode) 
            5h = Reserved 
            6h = Top-off Timer Active Charging 
            7h = Charge Termination Done
        VBUS_STAT
            VBUS status bits 
            0h: No Input or BHOT or BCOLD in OTG mode 
            1h: USB SDP (500mA) 
            2h: USB CDP (1.5A) 
            3h: USB DCP (3.25A) 
            4h: Adjustable High Voltage DCP (HVDCP) (1.5A) 
            5h: Unknown adaptor (3A) 
            6h: Non-Standard Adapter (1A/2A/2.1A/2.4A) 
            7h: In OTG mode 
            8h: Not qualified adaptor 
            9h: Reserved 
            Ah: Reserved 
            Bh: Device directly powered from VBUS 
            Ch: Reserved Dh: Reserved Eh: Reserved Fh: Reserved 
            Type : R 
            POR: 0h
        """
        def __init__(self, addr=0x1C, value = 0):
            super().__init__(addr, value)
            self.CHG_STAT           = ((self._value & 0b11100000) >> 5)
            self.VBUS_STAT          = ((self._value & 0b00011110) >> 1)
            self.CHG_STAT_STRG      = self.chg_stat_get_string(self.CHG_STAT)
            self.VBUS_STAT_STRG     = self.get_VBUS_STAT_string()
        def set (self, value):
            super().set(value)
            self.CHG_STAT           = ((self._value & 0b11100000) >> 5)
            self.VBUS_STAT          = ((self._value & 0b00011110) >> 1)
            self.CHG_STAT_STRG      = self.chg_stat_get_string(self.CHG_STAT)
            self.VBUS_STAT_STRG     = self.get_VBUS_STAT_string()
        def get (self):
            return self._value, self.CHG_STAT, self.VBUS_STAT, self.CHG_STAT_STRG
        def chg_stat_get_string (self, CHG_STAT):
            '''
            CHG_STAT
            Charge Status bits 
            Type : R POR: 000b 
            0h = Not Charging 
            1h = Trickle Charge 
            2h = Pre-charge 
            3h = Fast charge (CC mode) 
            4h = Taper Charge (CV mode) 
            5h = Reserved 
            6h = Top-off Timer Active Charging 
            7h = Charge Termination Done
            '''
            if CHG_STAT == 0x0: return "Not Charging"
            elif CHG_STAT == 0x1: return"Trickle Charge"
            elif CHG_STAT == 0x2: return "Pre-charge"
            elif CHG_STAT == 0x3: return "Fast charge (CC mode)"
            elif CHG_STAT == 0x4: return "Taper Charge (CV mode)"
            elif CHG_STAT == 0x5: return "Reserved"
            elif CHG_STAT == 0x6: return "Top-off Timer Active Charging"
            elif CHG_STAT == 0x7: return "Charge Termination Done"
            else: return "Reserved"
        def get_CHG_STAT(self):
            '''return CHG_STAT'''
            return self.CHG_STAT
        def get_VBUS_STAT(self):
            '''return VBUS_STAT'''
            return self.VBUS_STAT
        def get_CHG_STAT_STRG(self):
            '''return CHG_STAT_STRG'''
            return self.CHG_STAT_STRG
        def get_CHG_STAT_string(self):
            '''
            Returns CHG_STAT string 
            0h = Not Charging 
            1h = Trickle Charge 
            2h = Pre-charge 
            3h = Fast charge (CC mode) 
            4h = Taper Charge (CV mode) 
            5h = Reserved 
            6h = Top-off Timer Active Charging 
            7h = Charge Termination Done
            '''
            return self.CHG_STAT_STRG   
        def get_VBUS_STAT_string(self):
            '''
            VBUS_STAT
            VBUS status bits 
            0h: No Input or BHOT or BCOLD in OTG mode 
            1h: USB SDP (500mA) 
            2h: USB CDP (1.5A) 
            3h: USB DCP (3.25A) 
            4h: Adjustable High Voltage DCP (HVDCP) (1.5A) 
            5h: Unknown adaptor (3A) 
            6h: Non-Standard Adapter (1A/2A/2.1A/2.4A) 
            7h: In OTG mode 
            8h: Not qualified adaptor 
            9h: Reserved 
            Ah: Reserved 
            Bh: Device directly powered from VBUS 
            Ch: Reserved Dh: Reserved Eh: Reserved Fh: Reserved
            '''
            if self.VBUS_STAT == 0x0: return "No Input or BHOT or BCOLD in OTG mode"
            elif self.VBUS_STAT == 0x1: return"USB SDP (500mA)"
            elif self.VBUS_STAT == 0x2: return "USB CDP (1.5A)"
            elif self.VBUS_STAT == 0x3: return "USB DCP (3.25A)"
            elif self.VBUS_STAT == 0x4: return "Adjustable High Voltage DCP (HVDCP) (1.5A)"
            elif self.VBUS_STAT == 0x5: return "Unknown adaptor (3A)"
            elif self.VBUS_STAT == 0x6: return "Non-Standard Adapter (1A/2A/2.1A/2.4A)"
            elif self.VBUS_STAT == 0x7: return "In OTG mode"
            elif self.VBUS_STAT == 0x8: return "Not qualified adaptor"
            elif self.VBUS_STAT == 0x9: return "Reserved"
            elif self.VBUS_STAT == 0xa: return "Reserved"
            elif self.VBUS_STAT == 0xb: return "Device directly powered from VBUS"
            elif self.VBUS_STAT == 0xc: return "Reserved"
            elif self.VBUS_STAT == 0xd: return "Reserved"
            elif self.VBUS_STAT == 0xe: return "Reserved"   
            elif self.VBUS_STAT == 0xf: return "Reserved"
            else: return "Reserved" 
   

    class REG1D_Charger_Status_2(BQ25795_REGISTER):
        """
        BQ25795 - REG1D_Charger_Status_2
        ----------
        ICO_STAT
            Input Current Optimizer (ICO) status 
            Type : R POR: 00b 
            0h = ICO disabled 
            1h = ICO optimization in progress 
            2h = Maximum input current detected 
            3h = Reserved
        TREG_STAT
            IC thermal regulation status 
            Type : R POR: 0b 
            0h = Normal 
            1h = Device in thermal regulation
        DPDM_STAT
            D+/D- detection status bits 
            Type : R POR: 0b 
            0h = The D+/D- detection is NOT started yet, or the detection is done 
            1h = The D+/D- detection is ongoing
        VBAT_PRESENT_STAT
            Battery present status (VBAT > VBAT_UVLOZ) 
            Type : R POR: 0b 
            0h = VBAT NOT present 
            1h = VBAT present
        """
        def __init__(self, addr=0x1D, value = 0):
            super().__init__(addr, value)
            self.ICO_STAT           = ((self._value & 0b11000000) >> 6)
            self.TREG_STAT          = ((self._value & 0b00000100) >> 2)
            self.DPDM_STAT          = ((self._value & 0b00000010) >> 1)
            self.VBAT_PRESENT_STAT  = ((self._value & 0b00000001) >> 0)
            self.TREG_STAT_STRG      = self.get_thermal_regulation_status()
        def set (self, value):
            super().set(value)
            self.ICO_STAT           = ((self._value & 0b11000000) >> 6)
            self.TREG_STAT          = ((self._value & 0b00000100) >> 2)
            self.DPDM_STAT          = ((self._value & 0b00000010) >> 1)
            self.VBAT_PRESENT_STAT  = ((self._value & 0b00000001) >> 0)
            self.TREG_STAT_STRG      = self.get_thermal_regulation_status()
        def get (self):
            return self._value, self.ICO_STAT, self.TREG_STAT, self.DPDM_STAT, self.VBAT_PRESENT_STAT
        def get_thermal_regulation_status(self):
            ''' 
            Returns IC thermal regulation status 
            0h = Normal 
            1h = Device in thermal regulation
            '''
            if self.TREG_STAT == 0: return "Normal"
            elif self.TREG_STAT == 1: return "Device in thermal regulation"
            else: return "unknown"
        def get_ICO_STAT(self):
            '''return ICO_STAT'''
            return self.ICO_STAT
        def get_TREG_STAT(self):
            '''return TREG_STAT'''
            return self.TREG_STAT
        def get_DPDM_STAT(self):
            '''return DPDM_STAT'''
            return self.DPDM_STAT
        def get_VBAT_PRESENT_STAT(self):
            '''return VBAT_PRESENT_STAT'''
            return self.VBAT_PRESENT_STAT


    class REG1E_Charger_Status_3(BQ25795_REGISTER):
        """
        BQ25795 - REG1E_Charger_Status_3
        ----------
        ACRB2_STAT
            The ACFET2-RBFET2 status 
            Type : R 
            POR: 0b 
            0h = ACFET2-RBFET2 is NOT placed 
            1h = ACFET2-RBFET2 is placed
        ACRB1_STAT
            The ACFET1-RBFET1 status 
            Type : R 
            POR: 0b 
            0h = ACFET1-RBFET1 is NOT placed 
            1h = ACFET1-RBFET1 is placed
        ADC_DONE_STAT
            The ADC conversion done status (in one-shot mode only) 
            Type : R 
            POR: 0b 
            0h = ADC conversion NOT done 
            1h = ADC conversion done
        VSYS_STAT
            VSYS Regulation Status (forward mode) 
            Type : R 
            POR: 0b 
            0h = Not in VSYSMIN regulation (VBAT > VSYSMIN) 
            1h = In VSYSMIN regulation (VBAT < VSYSMIN)
        CHG_TMR_STAT
            Fast charge timer status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Safety timer expired
        TRICHG_TMR_STAT
            Trickle charge timer status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Safety timer expired 
        PRECHG_TMR_STAT
            Pre-charge timer status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Safety timer expired  
        """
        def __init__(self, addr=0x1E, value = 0):
            super().__init__(addr, value)
            self.ACRB2_STAT         = ((self._value & 0b10000000) >> 7)
            self.ACRB1_STAT         = ((self._value & 0b01000000) >> 6)
            self.ADC_DONE_STAT      = ((self._value & 0b00100000) >> 5)
            self.VSYS_STAT          = ((self._value & 0b00010000) >> 4)
            self.CHG_TMR_STAT       = ((self._value & 0b00001000) >> 3)
            self.TRICHG_TMR_STAT    = ((self._value & 0b00000100) >> 2)
            self.PRECHG_TMR_STAT    = ((self._value & 0b00000010) >> 1)
        def set (self, value):
            super().set(value)
            self.ACRB2_STAT         = ((self._value & 0b10000000) >> 7)
            self.ACRB1_STAT         = ((self._value & 0b01000000) >> 6)
            self.ADC_DONE_STAT      = ((self._value & 0b00100000) >> 5)
            self.VSYS_STAT          = ((self._value & 0b00010000) >> 4)
            self.CHG_TMR_STAT       = ((self._value & 0b00001000) >> 3)
            self.TRICHG_TMR_STAT    = ((self._value & 0b00000100) >> 2)
            self.PRECHG_TMR_STAT    = ((self._value & 0b00000010) >> 1)
        def get (self):
            return self._value, self.ACRB2_STAT, self.ACRB1_STAT, self.ADC_DONE_STAT, self.VSYS_STAT, self.CHG_TMR_STAT, self.TRICHG_TMR_STAT, self.PRECHG_TMR_STAT
        def get_ACRB2_STAT(self):
            '''return ACRB2_STAT'''
            return self.ACRB2_STAT      
        def get_ACRB1_STAT(self):
            '''return ACRB1_STAT'''
            return self.ACRB1_STAT
        def get_ADC_DONE_STAT(self):
            '''return ADC_DONE_STAT'''
            return self.ADC_DONE_STAT
        def get_VSYS_STAT(self):
            '''return VSYS_STAT'''
            return self.VSYS_STAT
        def get_CHG_TMR_STAT(self):
            '''return CHG_TMR_STAT'''
            return self.CHG_TMR_STAT
        def get_TRICHG_TMR_STAT(self):
            '''return TRICHG_TMR_STAT'''
            return self.TRICHG_TMR_STAT
        def get_PRECHG_TMR_STAT(self):
            '''return PRECHG_TMR_STAT'''
            return self.PRECHG_TMR_STAT
        
    class REG1F_Charger_Status_4(BQ25795_REGISTER):
        """
        BQ25795 - REG1F_Charger_Status_4
        ----------
        VBATOTG_LOW_STAT
            The battery voltage is too low to enable OTG mode. 
            Type : R 
            POR: 0b 
            0h = The battery voltage is high enough to enable the OTG operation 
            1h = The battery volage is too low to enable the OTG operation
        TS_COLD_STAT
           The TS temperature is in the cold range, lower than T1. 
           Type : R 
           POR: 0b 
           0h = TS status is NOT in cold range 
           1h = TS status is in cold range
        TS_COOL_STAT
            The TS temperature is in the cool range, between T1 and T2. 
            Type : R 
            POR: 0b 
            0h = TS status is NOT in cool range 
            1h = TS status is in cool range
        TS_WARM_STAT
            The TS temperature is in the warm range, between T3 and T5. 
            Type : R 
            POR: 0b 
            0h = TS status is NOT in warm range 
            1h = TS status is in warm range
        TS_HOT_STAT
            The TS temperature is in the hot range, higher than T5. 
            Type : R 
            POR: 0b 
            0h = TS status is NOT in hot range 
            1h = TS status is in hot range
        """
        def __init__(self, addr=0x1F, value = 0):
            super().__init__(addr, value)
            self.VBATOTG_LOW_STAT   = ((self._value & 0b00010000) >> 4)
            self.TS_COLD_STAT       = ((self._value & 0b00001000) >> 3)
            self.TS_COOL_STAT       = ((self._value & 0b00000100) >> 2) 
            self.TS_WARM_STAT       = ((self._value & 0b00000010) >> 1)
            self.TS_HOT_STAT        = ((self._value & 0b00000001) >> 0)
            self.VBATOTG_LOW_STAT_STRG = self.get_VBATOTG_LOW_STAT_string()
            self.TS_COLD_STAT_STRG   = self.get_TS_COLD_STAT_string()   
            self.TS_COOL_STAT_STRG   = self.get_TS_COOL_STAT_string()
            self.TS_WARM_STAT_STRG   = self.get_TS_WARM_STAT_string()
            self.TS_HOT_STAT_STRG    = self.get_TS_HOT_STAT_string()
        def set (self, value):
            super().set(value)
            self.VBATOTG_LOW_STAT   = ((self._value & 0b00010000) >> 4)
            self.TS_COLD_STAT       = ((self._value & 0b00001000) >> 3)
            self.TS_COOL_STAT       = ((self._value & 0b00000100) >> 2) 
            self.TS_WARM_STAT       = ((self._value & 0b00000010) >> 1)
            self.TS_HOT_STAT        = ((self._value & 0b00000001) >> 0)
        def get (self):
            return self._value, self.VBATOTG_LOW_STAT, self.TS_COLD_STAT, self.TS_COOL_STAT, self.TS_WARM_STAT, self.TS_HOT_STAT    
        def get_VBATOTG_LOW_STAT(self):
            '''return VBATOTG_LOW_STAT'''
            return self.VBATOTG_LOW_STAT
        def get_TS_COLD_STAT(self):
            '''return TS_COLD_STAT'''
            return self.TS_COLD_STAT
        def get_TS_COOL_STAT(self):
            '''return TS_COOL_STAT'''
            return self.TS_COOL_STAT
        def get_TS_WARM_STAT(self):
            '''return TS_WARM_STAT'''
            return self.TS_WARM_STAT
        def get_TS_HOT_STAT(self):
            '''return TS_HOT_STAT'''
            return self.TS_HOT_STAT
        def get_VBATOTG_LOW_STAT_string(self):
            '''
            Returns VBATOTG_LOW_STAT string 
            0h = The battery voltage is high enough to enable the OTG operation 
            1h = The battery volage is too low to enable the OTG operation
            '''
            if self.VBATOTG_LOW_STAT == 0: return "The battery voltage is high enough to enable the OTG operation"
            elif self.VBATOTG_LOW_STAT == 1: return "The battery volage is too low to enable the OTG operation"
            else: return "unknown"
        def get_TS_COLD_STAT_string(self):  
            '''
            Returns TS_COLD_STAT string 
            0h = TS status is NOT in cold range 
            1h = TS status is in cold range
            '''
            if self.TS_COLD_STAT == 0: return "TS status is NOT in cold range"
            elif self.TS_COLD_STAT == 1: return "TS status is in cold range"
            else: return "unknown"
        def get_TS_COOL_STAT_string(self):
            '''
            Returns TS_COOL_STAT string 
            0h = TS status is NOT in cool range 
            1h = TS status is in cool range
            '''
            if self.TS_COOL_STAT == 0: return "TS status is NOT in cool range"
            elif self.TS_COOL_STAT == 1: return "TS status is in cool range"
            else: return "unknown"
        def get_TS_WARM_STAT_string(self):

            '''
            Returns TS_WARM_STAT string 
            0h = TS status is NOT in warm range 
            1h = TS status is in warm range
            '''
            if self.TS_WARM_STAT == 0: return "TS status is NOT in warm range"
            elif self.TS_WARM_STAT == 1: return "TS status is in warm range"
            else: return "unknown"
        def get_TS_HOT_STAT_string(self):
            '''
            Returns TS_HOT_STAT string 
            0h = TS status is NOT in hot range 
            1h = TS status is in hot range
            '''
            if self.TS_HOT_STAT == 0: return "TS status is NOT in hot range"
            elif self.TS_HOT_STAT == 1: return "TS status is in hot range"
            else: return "unknown"

    class REG20_FAULT_Status_0(BQ25795_REGISTER):
        """
        BQ25795 - REG20_FAULT_Status_0
        ----------
        IBAT_REG_STAT
            IBAT regulation status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in battery discharging current regulation
        VBUS_OVP_STAT
            VBUS over-voltage status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in over voltage protection
        VBAT_OVP_STAT
            VBAT over-voltage status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in over voltage protection 
        IBUS_OCP_STAT
            IBUS over-current status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in over current protection
        IBAT_OCP_STAT
            IBAT over-current status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in over current protection   
        CONV_OCP_STAT
            Converter over-current status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Converter in over current protection 
        VAC2_OVP_STAT
            VAC2 over-voltage status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in over voltage protection  
        VAC1_OVP_STAT
            VAC1 over-voltage status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in over voltage protection    
        """
        def __init__(self, addr=0x20, value = 0):
            super().__init__(addr, value)
            self.IBAT_REG_STAT       = ((self._value & 0b10000000) >> 7)
            self.VBUS_OVP_STAT       = ((self._value & 0b01000000) >> 6)    
            self.VBAT_OVP_STAT       = ((self._value & 0b00100000) >> 5)
            self.IBUS_OCP_STAT       = ((self._value & 0b00010000) >> 4)
            self.IBAT_OCP_STAT       = ((self._value & 0b00001000) >> 3)
            self.CONV_OCP_STAT       = ((self._value & 0b00000100) >> 2)
            self.VAC2_OVP_STAT       = ((self._value & 0b00000010) >> 1)
            self.VAC1_OVP_STAT       = ((self._value & 0b00000001) >> 0)
            self.VBUS_OVP_STAT_STRG   = self.get_VBUS_OVP_STAT_string()
            self.VBAT_OVP_STAT_STRG   = self.get_VBAT_OVP_STAT_string() 
            self.IBAT_REG_STAT_STRG   = self.get_IBAT_REG_STAT_string()
            self.IBUS_OCP_STAT_STRG   = self.get_IBUS_OCP_STAT_string()
            self.IBAT_OCP_STAT_STRG   = self.get_IBAT_OCP_STAT_string()
            self.CONV_OCP_STAT_STRG   = self.get_CONV_OCP_STAT_string() 
            self.VAC2_OVP_STAT_STRG   = self.get_VAC2_OVP_STAT_string()
            self.VAC1_OVP_STAT_STRG   = self.get_VAC1_OVP_STAT_string()
        def set (self, value):
            super().set(value)
            self.IBAT_REG_STAT       = ((self._value & 0b10000000) >> 7)
            self.VBUS_OVP_STAT       = ((self._value & 0b01000000) >> 6)    
            self.VBAT_OVP_STAT       = ((self._value & 0b00100000) >> 5)
            self.IBUS_OCP_STAT       = ((self._value & 0b00010000) >> 4)
            self.IBAT_OCP_STAT       = ((self._value & 0b00001000) >> 3)
            self.CONV_OCP_STAT       = ((self._value & 0b00000100) >> 2)
            self.VAC2_OVP_STAT       = ((self._value & 0b00000010) >> 1)
            self.VAC1_OVP_STAT       = ((self._value & 0b00000001) >> 0)
            self.VBUS_OVP_STAT_STRG   = self.get_VBUS_OVP_STAT_string()
            self.VBAT_OVP_STAT_STRG   = self.get_VBAT_OVP_STAT_string() 
            self.IBAT_REG_STAT_STRG   = self.get_IBAT_REG_STAT_string()
            self.IBUS_OCP_STAT_STRG   = self.get_IBUS_OCP_STAT_string()
            self.IBAT_OCP_STAT_STRG   = self.get_IBAT_OCP_STAT_string()
            self.CONV_OCP_STAT_STRG   = self.get_CONV_OCP_STAT_string() 
            self.VAC2_OVP_STAT_STRG   = self.get_VAC2_OVP_STAT_string()
            self.VAC1_OVP_STAT_STRG   = self.get_VAC1_OVP_STAT_string()
        def get (self):
            return self._value, self.IBAT_REG_STAT, self.VBUS_OVP_STAT, self.VBAT_OVP_STAT, self.IBUS_OCP_STAT, self.IBAT_OCP_STAT, self.CONV_OCP_STAT, self.VAC2_OVP_STAT, self.VAC1_OVP_STAT
        def get_IBAT_REG_STAT(self):
            '''return IBAT_REG_STAT'''
            return self.IBAT_REG_STAT
        def get_VBUS_OVP_STAT(self):
            '''return VBUS_OVP_STAT'''
            return self.VBUS_OVP_STAT
        def get_VBAT_OVP_STAT(self):
            '''return VBAT_OVP_STAT'''
            return self.VBAT_OVP_STAT
        def get_IBUS_OCP_STAT(self):
            '''return IBUS_OCP_STAT'''
            return self.IBUS_OCP_STAT
        def get_IBAT_OCP_STAT(self):
            '''return IBAT_OCP_STAT'''
            return self.IBAT_OCP_STAT
        def get_CONV_OCP_STAT(self):
            '''return CONV_OCP_STAT'''
            return self.CONV_OCP_STAT
        def get_VAC2_OVP_STAT(self):
            '''return VAC2_OVP_STAT'''
            return self.VAC2_OVP_STAT
        def get_VAC1_OVP_STAT(self):
            '''return VAC1_OVP_STAT'''
            return self.VAC1_OVP_STAT
        def get_VBUS_OVP_STAT_string(self):
            '''
            Returns VBUS_OVP_STAT string
            0h = Normal
            1h = Device in over voltage protection
            '''
            if self.VBUS_OVP_STAT == 0: return "Normal"
            elif self.VBUS_OVP_STAT == 1: return "Device in over voltage protection"
            else: return "unknown"
        def get_VBAT_OVP_STAT_string(self):
            '''
            Returns VBAT_OVP_STAT string
            0h = Normal
            1h = Device in over voltage protection
            '''
            if self.VBAT_OVP_STAT == 0: return "Normal"
            elif self.VBAT_OVP_STAT == 1: return "Device in over voltage protection"
            else: return "unknown"
        def get_IBAT_REG_STAT_string(self):
            '''
            Returns IBAT_REG_STAT string
            0h = Normal
            1h = Device in battery discharging current regulation
            '''
            if self.IBAT_REG_STAT == 0: return "Normal"
            elif self.IBAT_REG_STAT == 1: return "Device in battery discharging current regulation"
            else: return "unknown"
        def get_IBUS_OCP_STAT_string(self): 
            '''
            Returns IBUS_OCP_STAT string
            0h = Normal
            1h = Device in over current protection
            '''
            if self.IBUS_OCP_STAT == 0: return "Normal"
            elif self.IBUS_OCP_STAT == 1: return "Device in over current protection"
            else: return "unknown"
        def get_IBAT_OCP_STAT_string(self):
            '''
            Returns IBAT_OCP_STAT string
            0h = Normal
            1h = Device in over current protection
            '''
            if self.IBAT_OCP_STAT == 0: return "Normal"
            elif self.IBAT_OCP_STAT == 1: return "Device in over current protection"
            else: return "unknown"
        def get_CONV_OCP_STAT_string(self):
            '''
            Returns CONV_OCP_STAT string
            0h = Normal
            1h = Converter in over current protection
            '''
            if self.CONV_OCP_STAT == 0: return "Normal"
            elif self.CONV_OCP_STAT == 1: return "Converter in over current protection"
            else: return "unknown"
        def get_VAC2_OVP_STAT_string(self): 
            '''
            Returns VAC2_OVP_STAT string
            0h = Normal
            1h = Device in over voltage protection
            '''
            if self.VAC2_OVP_STAT == 0: return "Normal"
            elif self.VAC2_OVP_STAT == 1: return "Device in over voltage protection"
            else: return "unknown"
        def get_VAC1_OVP_STAT_string(self):
            '''
            Returns VAC1_OVP_STAT string
            0h = Normal
            1h = Device in over voltage protection
            '''
            if self.VAC1_OVP_STAT == 0: return "Normal"
            elif self.VAC1_OVP_STAT == 1: return "Device in over voltage protection"
            else: return "unknown"


    
    class REG21_FAULT_Status_1(BQ25795_REGISTER):
        """
        BQ25795 - REG21_FAULT_Status_1
        ----------
        VSYS_SHORT_STAT
            VSYS short circuit status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in SYS short circuit protection
        VSYS_OVP_STAT
            VSYS over-voltage status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in over voltage protection
        OTG_OVP_STAT
            OTG over-voltage status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in OTG over voltage 
        OTG_UVP_STAT
            OTG under-voltage status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in OTG under voltage protection
        TSHUT_STAT
            Thermal shutdown status 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Device in thermal shutdown protection
        """
        def __init__(self, addr=0x21, value = 0):
            super().__init__(addr, value)
            self.VSYS_SHORT_STAT     = ((self._value & 0b10000000) >> 7)
            self.VSYS_OVP_STAT       = ((self._value & 0b01000000) >> 6)
            self.OTG_OVP_STAT        = ((self._value & 0b00100000) >> 5)
            self.OTG_UVP_STAT        = ((self._value & 0b00010000) >> 4)
            self.TSHUT_STAT          = ((self._value & 0b00000100) >> 2)
            self.VSYS_SHORT_STAT_STRG = self.get_VSYS_SHORT_STAT_string()
            self.VSYS_OVP_STAT_STRG   = self.get_VSYS_OVP_STAT_string()
            self.OTG_OVP_STAT_STRG    = self.get_OTG_OVP_STAT_string()
            self.OTG_UVP_STAT_STRG    = self.get_OTG_UVP_STAT_string()  
            self.TSHUT_STAT_STRG      = self.get_TSHUT_STAT_string()

        def set (self, value):
            super().set(value)
            self.VSYS_SHORT_STAT     = ((self._value & 0b10000000) >> 7)
            self.VSYS_OVP_STAT       = ((self._value & 0b01000000) >> 6)
            self.OTG_OVP_STAT        = ((self._value & 0b00100000) >> 5)
            self.OTG_UVP_STAT        = ((self._value & 0b00010000) >> 4)
            self.TSHUT_STAT          = ((self._value & 0b00000100) >> 2)
            self.VSYS_SHORT_STAT_STRG = self.get_VSYS_SHORT_STAT_string()
            self.VSYS_OVP_STAT_STRG   = self.get_VSYS_OVP_STAT_string()
            self.OTG_OVP_STAT_STRG    = self.get_OTG_OVP_STAT_string()
            self.OTG_UVP_STAT_STRG    = self.get_OTG_UVP_STAT_string()  
            self.TSHUT_STAT_STRG      = self.get_TSHUT_STAT_string()

        def get (self):
            return self._value, self.VSYS_SHORT_STAT, self.VSYS_OVP_STAT, self.OTG_OVP_STAT, self.OTG_UVP_STAT, self.TSHUT_STAT 
        def get_VSYS_SHORT_STAT(self):
            '''return VSYS_SHORT_STAT'''
            return self.VSYS_SHORT_STAT
        def get_VSYS_OVP_STAT(self):
            '''return VSYS_OVP_STAT'''
            return self.VSYS_OVP_STAT
        def get_OTG_OVP_STAT(self):
            '''return OTG_OVP_STAT'''
            return self.OTG_OVP_STAT
        def get_OTG_UVP_STAT(self):
            '''return OTG_UVP_STAT'''
            return self.OTG_UVP_STAT
        def get_TSHUT_STAT(self):
            '''return TSHUT_STAT'''
            return self.TSHUT_STAT
        def get_VSYS_SHORT_STAT_string(self):
            '''
            Returns VSYS_SHORT_STAT string
            0h = Normal
            1h = Device in SYS short circuit protection
            '''
            if self.VSYS_SHORT_STAT == 0: return "Normal"
            elif self.VSYS_SHORT_STAT == 1: return "Device in SYS short circuit protection"
            else: return "unknown"
        def get_VSYS_OVP_STAT_string(self):
            '''
            Returns VSYS_OVP_STAT string
            0h = Normal
            1h = Device in over voltage protection
            '''
            if self.VSYS_OVP_STAT == 0: return "Normal"
            elif self.VSYS_OVP_STAT == 1: return "Device in over voltage protection"
            else: return "unknown"
        def get_OTG_OVP_STAT_string(self):  
            '''
            Returns OTG_OVP_STAT string
            0h = Normal
            1h = Device in OTG over voltage 
            '''
            if self.OTG_OVP_STAT == 0: return "Normal"
            elif self.OTG_OVP_STAT == 1: return "Device in OTG over voltage"
            else: return "unknown"
        def get_OTG_UVP_STAT_string(self):  
            '''
            Returns OTG_UVP_STAT string
            0h = Normal
            1h = Device in OTG under voltage protection
            '''
            if self.OTG_UVP_STAT == 0: return "Normal"
            elif self.OTG_UVP_STAT == 1: return "Device in OTG under voltage protection"
            else: return "unknown"
        def get_TSHUT_STAT_string(self):    
            '''
            Returns TSHUT_STAT string
            0h = Normal
            1h = Device in thermal shutdown protection
            '''
            if self.TSHUT_STAT == 0: return "Normal"
            elif self.TSHUT_STAT == 1: return "Device in thermal shutdown protection"
            else: return "unknown"



    class REG22_Charger_Flag_0(BQ25795_REGISTER):
        """
        BQ25795 - REG22_Charger_Flag_0
        ----------
        IINDPM_FLAG
            IINDPM / IOTG flag
            Type : R
            POR: 0b
            0h = Normal
            1h = IINDPM / IOTG signal rising edge detected
        VINDPM_FLAG
            VINDPM flag
            Type : R
            POR: 0b
            0h = Normal
            1h = VINDPM signal rising edge detected
        WD_FLAG
            I2C watchdog timer flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = WD timer signal rising edge detected
        POORSRC_FLAG
            Poor source detection flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Poor source status rising edge detected
        PG_FLAG
            Power good flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Any change in PG_STAT even (adapter good qualification or adapter good going away)
        VAC2_PRESENT_FLAG
            VAC2 present flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = VAC2 present status changed
        VAC1_PRESENT_FLAG   
            VAC1 present flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = VAC1 present status changed
        VBUS_PRESENT_FLAG
            VBUS present flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = VBUS present status changed
        """
        def __init__(self, addr=0x22, value = 0):
            super().__init__(addr, value)
            self.IINDPM_FLAG         = ((self._value & 0b10000000) >> 7)
            self.VINDPM_FLAG         = ((self._value & 0b01000000) >> 6)
            self.WD_FLAG             = ((self._value & 0b00100000) >> 5)
            self.POORSRC_FLAG        = ((self._value & 0b00010000) >> 4)
            self.PG_FLAG             = ((self._value & 0b00001000) >> 3)
            self.VAC2_PRESENT_FLAG   = ((self._value & 0b00000100) >> 2)
            self.VAC1_PRESENT_FLAG   = ((self._value & 0b00000010) >> 1)
            self.VBUS_PRESENT_FLAG    = ((self._value & 0b00000001) >> 0)
            self.IINDPM_FLAG_STRG     = self.get_IINDPM_FLAG_string()
            self.VINDPM_FLAG_STRG     = self.get_VINDPM_FLAG_string()
            self.WD_FLAG_STRG         = self.get_WD_FLAG_string()
            self.POORSRC_FLAG_STRG    = self.get_POORSRC_FLAG_string()
            self.PG_FLAG_STRG         = self.get_PG_FLAG_string()
            self.VAC2_PRESENT_FLAG_STRG = self.get_VAC2_PRESENT_FLAG_string()
            self.VAC1_PRESENT_FLAG_STRG = self.get_VAC1_PRESENT_FLAG_string()
            self.VBUS_PRESENT_FLAG_STRG = self.get_VBUS_PRESENT_FLAG_string()
        def set (self, value):
            super().set(value)
            self.IINDPM_FLAG         = ((self._value & 0b10000000) >> 7)
            self.VINDPM_FLAG         = ((self._value & 0b01000000) >> 6)
            self.WD_FLAG             = ((self._value & 0b00100000) >> 5)
            self.POORSRC_FLAG        = ((self._value & 0b00010000) >> 4)
            self.PG_FLAG             = ((self._value & 0b00001000) >> 3)
            self.VAC2_PRESENT_FLAG   = ((self._value & 0b00000100) >> 2)
            self.VAC1_PRESENT_FLAG   = ((self._value & 0b00000010) >> 1)
            self.VBUS_PRESENT_FLAG    = ((self._value & 0b00000001) >> 0)
            self.IINDPM_FLAG_STRG     = self.get_IINDPM_FLAG_string()
            self.VINDPM_FLAG_STRG     = self.get_VINDPM_FLAG_string()
            self.WD_FLAG_STRG         = self.get_WD_FLAG_string()
            self.POORSRC_FLAG_STRG    = self.get_POORSRC_FLAG_string()
            self.PG_FLAG_STRG         = self.get_PG_FLAG_string()
            self.VAC2_PRESENT_FLAG_STRG = self.get_VAC2_PRESENT_FLAG_string()
            self.VAC1_PRESENT_FLAG_STRG = self.get_VAC1_PRESENT_FLAG_string()
            self.VBUS_PRESENT_FLAG_STRG = self.get_VBUS_PRESENT_FLAG_string()
        def get (self):
            return self._value, self.IINDPM_FLAG, self.VINDPM_FLAG, self.WD_FLAG, self.POORSRC_FLAG, self.PG_FLAG, self.VAC2_PRESENT_FLAG, self.VAC1_PRESENT_FLAG, self.VBUS_PRESENT_FLAG
        def get_IINDPM_FLAG(self):
            '''return IINDPM_FLAG'''
            return self.IINDPM_FLAG
        def get_VINDPM_FLAG(self):
            '''return VINDPM_FLAG'''
            return self.VINDPM_FLAG
        def get_WD_FLAG(self):
            '''return WD_FLAG'''
            return self.WD_FLAG
        def get_POORSRC_FLAG(self):
            '''return POORSRC_FLAG'''
            return self.POORSRC_FLAG
        def get_PG_FLAG(self):
            '''return PG_FLAG'''
            return self.PG_FLAG
        def get_VAC2_PRESENT_FLAG(self):
            '''return VAC2_PRESENT_FLAG'''
            return self.VAC2_PRESENT_FLAG
        def get_VAC1_PRESENT_FLAG(self):
            '''return VAC1_PRESENT_FLAG'''
            return self.VAC1_PRESENT_FLAG
        def get_VBUS_PRESENT_FLAG(self):
            '''return VBUS_PRESENT_FLAG'''
            return self.VBUS_PRESENT_FLAG
        def get_IINDPM_FLAG_string(self):
            '''
            Returns IINDPM_FLAG string
            0h = Normal
            1h = IINDPM / IOTG signal rising edge detected
            '''
            if self.IINDPM_FLAG == 0: return "Normal"
            elif self.IINDPM_FLAG == 1: return "IINDPM / IOTG signal rising edge detected"
            else: return "unknown"
        def get_VINDPM_FLAG_string(self):
            '''
            Returns VINDPM_FLAG string
            0h = Normal
            1h = VINDPM signal rising edge detected
            '''
            if self.VINDPM_FLAG == 0: return "Normal"
            elif self.VINDPM_FLAG == 1: return "VINDPM signal rising edge detected"
            else: return "unknown"
        def get_WD_FLAG_string(self):   
            '''
            Returns WD_FLAG string
            0h = Normal
            1h = WD timer signal rising edge detected
            '''
            if self.WD_FLAG == 0: return "Normal"
            elif self.WD_FLAG == 1: return "WD timer signal rising edge detected"
            else: return "unknown"
        def get_POORSRC_FLAG_string(self):
            '''
            Returns POORSRC_FLAG string
            0h = Normal
            1h = Poor source status rising edge detected
            '''
            if self.POORSRC_FLAG == 0: return "Normal"
            elif self.POORSRC_FLAG == 1: return "Poor source status rising edge detected"
            else: return "unknown"
        def get_PG_FLAG_string(self):
            '''
            Returns PG_FLAG string
            0h = Normal
            1h = Any change in PG_STAT even (adapter good qualification or adapter good going away)
            '''
            if self.PG_FLAG == 0: return "Normal"
            elif self.PG_FLAG == 1: return "Any change in PG_STAT even (adapter good qualification or adapter good going away)"
            else: return "unknown"
        def get_VAC2_PRESENT_FLAG_string(self):
            '''
            Returns VAC2_PRESENT_FLAG string
            0h = Normal
            1h = VAC2 present status changed
            '''
            if self.VAC2_PRESENT_FLAG == 0: return "Normal"
            elif self.VAC2_PRESENT_FLAG == 1: return "VAC2 present status changed"
            else: return "unknown"
        def get_VAC1_PRESENT_FLAG_string(self):
            '''
            Returns VAC1_PRESENT_FLAG string
            0h = Normal
            1h = VAC1 present status changed
            '''
            if self.VAC1_PRESENT_FLAG == 0: return "Normal"
            elif self.VAC1_PRESENT_FLAG == 1: return "VAC1 present status changed"
            else: return "unknown"
        def get_VBUS_PRESENT_FLAG_string(self): 
            '''
            Returns VBUS_PRESENT_FLAG string
            0h = Normal
            1h = VBUS present status changed
            '''
            if self.VBUS_PRESENT_FLAG == 0: return "Normal"
            elif self.VBUS_PRESENT_FLAG == 1: return "VBUS present status changed"
            else: return "unknown"
        

    class REG23_Charger_Flag_1(BQ25795_REGISTER):
        """
        BQ25795 - REG23_Charger_Flag_1
        ----------
        CHG_FLAG 
            Charger flag
            Type : R    
            POR: 0b
            0h = Normal
            1h = Charger status changed
        ICO_FLAG
            ICO flag
            Type : R    
            POR: 0b
            0h = Normal
            1h = ICO status changed
        VBUS_FLAG
            VBUS flag
            Type : R    
            POR: 0b
            0h = Normal
            1h = VBUS status changed
        TREG_FLAG
            TREG flag
            Type : R
            POR: 0b
            0h = Normal
            1h = TREG signal rising threshold detected
        VBAT_PRESENT_FLAG
            VBAT present flag
            Type : R    
            POR: 0b
            0h = Normal
            1h = VBAT present status changed
        BC1.2_DONE_FLAG
            BC1.2 status flag
            Type : R    
            POR: 0b
            0h = Normal
            1h = BC1.2 detection status changed
        """
        def __init__(self, addr=0x23, value = 0):
            super().__init__(addr, value)
            self.CHG_FLAG             = ((self._value & 0b10000000) >> 7)
            self.ICO_FLAG             = ((self._value & 0b01000000) >> 6)   
            self.VBUS_FLAG            = ((self._value & 0b00010000) >> 4)
            self.TREG_FLAG            = ((self._value & 0b00000100) >> 2)
            self.VBAT_PRESENT_FLAG    = ((self._value & 0b00000010) >> 1)
            self.BC1_2_DONE_FLAG      = ((self._value & 0b00000001) >> 0)
            self.CHG_FLAG_STRG         = self.get_CHG_FLAG_string()
            self.ICO_FLAG_STRG         = self.get_ICO_FLAG_string()
            self.VBUS_FLAG_STRG        = self.get_VBUS_FLAG_string()
            self.TREG_FLAG_STRG        = self.get_TREG_FLAG_string()
            self.VBAT_PRESENT_FLAG_STRG = self.get_VBAT_PRESENT_FLAG_string()
            self.BC1_2_DONE_FLAG_STRG   = self.get_BC1_2_DONE_FLAG_string()
        def set (self, value):
            super().set(value)
            self.CHG_FLAG             = ((self._value & 0b10000000) >> 7)
            self.ICO_FLAG             = ((self._value & 0b01000000) >> 6)   
            self.VBUS_FLAG            = ((self._value & 0b00010000) >> 4)
            self.TREG_FLAG            = ((self._value & 0b00000100) >> 2)
            self.VBAT_PRESENT_FLAG    = ((self._value & 0b00000010) >> 1)
            self.BC1_2_DONE_FLAG      = ((self._value & 0b00000001) >> 0)
            self.CHG_FLAG_STRG         = self.get_CHG_FLAG_string()
            self.ICO_FLAG_STRG         = self.get_ICO_FLAG_string()
            self.VBUS_FLAG_STRG        = self.get_VBUS_FLAG_string()
            self.TREG_FLAG_STRG        = self.get_TREG_FLAG_string()
            self.VBAT_PRESENT_FLAG_STRG = self.get_VBAT_PRESENT_FLAG_string()
            self.BC1_2_DONE_FLAG_STRG   = self.get_BC1_2_DONE_FLAG_string()
        def get (self):
            return self._value, self.CHG_FLAG, self.ICO_FLAG, self.VBUS_FLAG, self.TREG_FLAG, self.VBAT_PRESENT_FLAG, self.BC1_2_DONE_FLAG
        def get_CHG_FLAG(self):
            '''return CHG_FLAG'''
            return self.CHG_FLAG
        def get_ICO_FLAG(self):
            '''return ICO_FLAG'''
            return self.ICO_FLAG
        def get_VBUS_FLAG(self):
            '''return VBUS_FLAG'''
            return self.VBUS_FLAG
        def get_TREG_FLAG(self):
            '''return TREG_FLAG'''
            return self.TREG_FLAG
        def get_VBAT_PRESENT_FLAG(self):
            '''return VBAT_PRESENT_FLAG'''
            return self.VBAT_PRESENT_FLAG
        def get_BC1_2_DONE_FLAG(self):
            '''return BC1_2_DONE_FLAG'''
            return self.BC1_2_DONE_FLAG
        def get_CHG_FLAG_string(self):
            '''
            Returns CHG_FLAG string
            0h = Normal
            1h = Charger status changed
            '''
            if self.CHG_FLAG == 0: return "Normal"
            elif self.CHG_FLAG == 1: return "Charger status changed"
            else: return "unknown"
        def get_ICO_FLAG_string(self):
            '''
            Returns ICO_FLAG string
            0h = Normal
            1h = ICO status changed
            '''
            if self.ICO_FLAG == 0: return "Normal"
            elif self.ICO_FLAG == 1: return "ICO status changed"
            else: return "unknown"
        def get_VBUS_FLAG_string(self):
            '''
            Returns VBUS_FLAG string
            0h = Normal
            1h = VBUS status changed
            '''
            if self.VBUS_FLAG == 0: return "Normal"
            elif self.VBUS_FLAG == 1: return "VBUS status changed"
            else: return "unknown"
        def get_TREG_FLAG_string(self): 
            '''
            Returns TREG_FLAG string
            0h = Normal
            1h = TREG signal rising threshold detected
            '''
            if self.TREG_FLAG == 0: return "Normal"
            elif self.TREG_FLAG == 1: return "TREG signal rising threshold detected"
            else: return "unknown"
        def get_VBAT_PRESENT_FLAG_string(self):
            '''
            Returns VBAT_PRESENT_FLAG string
            0h = Normal
            1h = VBAT present status changed
            '''
            if self.VBAT_PRESENT_FLAG == 0: return "Normal"
            elif self.VBAT_PRESENT_FLAG == 1: return "VBAT present status changed"
            else: return "unknown"
        def get_BC1_2_DONE_FLAG_string(self):
            '''
            Returns BC1_2_DONE_FLAG string
            0h = Normal
            1h = BC1.2 detection status changed
            '''
            if self.BC1_2_DONE_FLAG == 0: return "Normal"
            elif self.BC1_2_DONE_FLAG == 1: return "BC1.2 detection status changed"
            else: return "unknown"
    
    class REG24_Charger_Flag_2(BQ25795_REGISTER):
        """
        BQ25795 - REG24_Charger_Flag_2
        ----------
        DPDM_DONE_FLAG
            DPDM detection is done flag 
            Type : R 
            POR: 0b 
            0h = D+/D- detection is NOT started or still ongoing 
            1h =  D+/D- detection is completed
        ADC_DONE_FLAG
            ADC conversion flag (only in one-shot mode) 
            Type : R 
            POR: 0b 
            0h = Conversion NOT completed 
            1h = Conversion completed
        VSYS_FLAG
            VSYSMIN regulation flag 
            ype : R 
            POR: 0b 
            0h = Normal 
            1h = Entered or existed VSYSMIN regulation
        CHG_TMR_FLAG
            Fast charge timer flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Fast charge timer expired rising edge detected
        TRICHG_TMR_FLAG
            Trickle charge timer flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Trickle charger timer expired rising edge detected
        PRECHG_TMR_FLAG
            Pre-charge timer flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Pre-charge timer expired rising edge detected
        TOPOFF_TMR_FLAG
            Top off timer flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Top off timer expired rising edge detected
        """
        def __init__(self, addr=0x24, value = 0):
            super().__init__(addr, value)
            self.DPDM_DONE_FLAG       = ((self._value & 0b01000000) >> 6)
            self.ADC_DONE_FLAG        = ((self._value & 0b00100000) >> 5)
            self.VSYS_FLAG            = ((self._value & 0b00010000) >> 4)   
            self.CHG_TMR_FLAG         = ((self._value & 0b00001000) >> 3)
            self.TRICHG_TMR_FLAG      = ((self._value & 0b00000100) >> 2)
            self.PRECHG_TMR_FLAG      = ((self._value & 0b00000010) >> 1)
            self.TOPOFF_TMR_FLAG      = ((self._value & 0b00000001) >> 0)
            self.DPDM_DONE_FLAG_STRG   = self.get_DPDM_DONE_FLAG_string()
            self.ADC_DONE_FLAG_STRG    = self.get_ADC_DONE_FLAG_string()
            self.VSYS_FLAG_STRG        = self.get_VSYS_FLAG_string()
            self.CHG_TMR_FLAG_STRG     = self.get_CHG_TMR_FLAG_string()
            self.TRICHG_TMR_FLAG_STRG  = self.get_TRICHG_TMR_FLAG_string()
            self.PRECHG_TMR_FLAG_STRG  = self.get_PRECHG_TMR_FLAG_string()
            self.TOPOFF_TMR_FLAG_STRG  = self.get_TOPOFF_TMR_FLAG_string()
        def set (self, value):  
            super().set(value)
            self.DPDM_DONE_FLAG       = ((self._value & 0b01000000) >> 6)
            self.ADC_DONE_FLAG        = ((self._value & 0b00100000) >> 5)
            self.VSYS_FLAG            = ((self._value & 0b00010000) >> 4)   
            self.CHG_TMR_FLAG         = ((self._value & 0b00001000) >> 3)
            self.TRICHG_TMR_FLAG      = ((self._value & 0b00000100) >> 2)
            self.PRECHG_TMR_FLAG      = ((self._value & 0b00000010) >> 1)
            self.TOPOFF_TMR_FLAG      = ((self._value & 0b00000001) >> 0)
            self.DPDM_DONE_FLAG_STRG   = self.get_DPDM_DONE_FLAG_string()
            self.ADC_DONE_FLAG_STRG    = self.get_ADC_DONE_FLAG_string()
            self.VSYS_FLAG_STRG        = self.get_VSYS_FLAG_string()
            self.CHG_TMR_FLAG_STRG     = self.get_CHG_TMR_FLAG_string()
            self.TRICHG_TMR_FLAG_STRG  = self.get_TRICHG_TMR_FLAG_string()
            self.PRECHG_TMR_FLAG_STRG  = self.get_PRECHG_TMR_FLAG_string()
            self.TOPOFF_TMR_FLAG_STRG  = self.get_TOPOFF_TMR_FLAG_string()
        def get (self):
            return self._value, self.DPDM_DONE_FLAG, self.ADC_DONE_FLAG, self.VSYS_FLAG, self.CHG_TMR_FLAG, self.TRICHG_TMR_FLAG, self.PRECHG_TMR_FLAG, self.TOPOFF_TMR_FLAG
        def get_DPDM_DONE_FLAG(self):
            '''return DPDM_DONE_FLAG'''
            return self.DPDM_DONE_FLAG
        def get_ADC_DONE_FLAG(self):
            '''return ADC_DONE_FLAG'''
            return self.ADC_DONE_FLAG
        def get_VSYS_FLAG(self):
            '''return VSYS_FLAG'''
            return self.VSYS_FLAG
        def get_CHG_TMR_FLAG(self):
            '''return CHG_TMR_FLAG'''
            return self.CHG_TMR_FLAG
        def get_TRICHG_TMR_FLAG(self):
            '''return TRICHG_TMR_FLAG'''
            return self.TRICHG_TMR_FLAG
        def get_PRECHG_TMR_FLAG(self):
            '''return PRECHG_TMR_FLAG'''
            return self.PRECHG_TMR_FLAG
        def get_TOPOFF_TMR_FLAG(self):
            '''return TOPOFF_TMR_FLAG'''
            return self.TOPOFF_TMR_FLAG
        def get_DPDM_DONE_FLAG_string(self):
            '''
            Returns DPDM_DONE_FLAG string
            0h = D+/D- detection is NOT started or still ongoing
            1h =  D+/D- detection is completed
            '''
            if self.DPDM_DONE_FLAG == 0: return "D+/D- detection is NOT started or still ongoing"
            elif self.DPDM_DONE_FLAG == 1: return "D+/D- detection is completed"
            else: return "unknown"  

        def get_ADC_DONE_FLAG_string(self):
            '''
            Returns ADC_DONE_FLAG string
            0h = Conversion NOT completed
            1h = Conversion completed
            '''
            if self.ADC_DONE_FLAG == 0: return "Conversion NOT completed"
            elif self.ADC_DONE_FLAG == 1: return "Conversion completed"
            else: return "unknown"

        def get_VSYS_FLAG_string(self):
            '''
            Returns VSYS_FLAG string
            0h = Normal
            1h = Entered or existed VSYSMIN regulation
            '''
            if self.VSYS_FLAG == 0: return "Normal"
            elif self.VSYS_FLAG == 1: return "Entered or existed VSYSMIN regulation"
            else: return "unknown"
        def get_CHG_TMR_FLAG_string(self):  
            '''
            Returns CHG_TMR_FLAG string
            0h = Normal
            1h = Fast charge timer expired rising edge detected
            '''
            if self.CHG_TMR_FLAG == 0: return "Normal"
            elif self.CHG_TMR_FLAG == 1: return "Fast charge timer expired rising edge detected"
            else: return "unknown"
        def get_TRICHG_TMR_FLAG_string(self):
            '''
            Returns TRICHG_TMR_FLAG string
            0h = Normal
            1h = Trickle charger timer expired rising edge detected
            '''
            if self.TRICHG_TMR_FLAG == 0: return "Normal"
            elif self.TRICHG_TMR_FLAG == 1: return "Trickle charger timer expired rising edge detected"
            else: return "unknown"
        def get_PRECHG_TMR_FLAG_string(self):
            '''
            Returns PRECHG_TMR_FLAG string
            0h = Normal
            1h = Pre-charge timer expired rising edge detected
            '''
            if self.PRECHG_TMR_FLAG == 0: return "Normal"
            elif self.PRECHG_TMR_FLAG == 1: return "Pre-charge timer expired rising edge detected"
            else: return "unknown"
        def get_TOPOFF_TMR_FLAG_string(self):
            '''
            Returns TOPOFF_TMR_FLAG string
            0h = Normal
            1h = Top off timer expired rising edge detected
            '''
            if self.TOPOFF_TMR_FLAG == 0: return "Normal"
            elif self.TOPOFF_TMR_FLAG == 1: return "Top off timer expired rising edge detected"
            else: return "unknown"



    class REG25_Charger_Flag_3(BQ25795_REGISTER):
        """
        BQ25795 - REG25_Charger_Flag_3
        ----------
        VBATOTG_LOW_FLAG
            VBAT too low to enable OTG flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = VBAT falls below the threshold to enable the OTG mode
        TS_COLD_FLAG
            TS cold temperature flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = TS across cold temperature (T1) is detected
        TS_COOL_FLAG
            TS cool temperature flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = TS across cool temperature (T2) is detected
        TS_WARM_FLAG
            TS warm temperature flag 
            Type : R 
            POR: 0b 
            0h = Normal 1h = TS across warm temperature (T3) is detected
        TS_HOT_FLAG
            TS hot temperature flag 
            Type : R
            POR: 0b
            0h = Normal
            1h = TS across hot temperature (T5) is detected
        """
        def __init__(self, addr=0x25, value = 0):
            super().__init__(addr, value)
            self.VBATOTG_LOW_FLAG     = ((self._value & 0b00010000) >> 4)
            self.TS_COLD_FLAG         = ((self._value & 0b00001000) >> 3)
            self.TS_COOL_FLAG         = ((self._value & 0b00000100) >> 2)
            self.TS_WARM_FLAG         = ((self._value & 0b00000010) >> 1)   
            self.TS_HOT_FLAG          = ((self._value & 0b00000001) >> 0)
            self.VBATOTG_LOW_FLAG_STRG = self.get_VBATOTG_LOW_FLAG_string()
            self.TS_COLD_FLAG_STRG     = self.get_TS_COLD_FLAG_string()
            self.TS_COOL_FLAG_STRG     = self.get_TS_COOL_FLAG_string()
            self.TS_WARM_FLAG_STRG     = self.get_TS_WARM_FLAG_string()
            self.TS_HOT_FLAG_STRG      = self.get_TS_HOT_FLAG_string()
        def set (self, value):
            super().set(value)
            self.VBATOTG_LOW_FLAG     = ((self._value & 0b00010000) >> 4)
            self.TS_COLD_FLAG         = ((self._value & 0b00001000) >> 3)
            self.TS_COOL_FLAG         = ((self._value & 0b00000100) >> 2)
            self.TS_WARM_FLAG         = ((self._value & 0b00000010) >> 1)   
            self.TS_HOT_FLAG          = ((self._value & 0b00000001) >> 0)
            self.VBATOTG_LOW_FLAG_STRG = self.get_VBATOTG_LOW_FLAG_string()
            self.TS_COLD_FLAG_STRG     = self.get_TS_COLD_FLAG_string()
            self.TS_COOL_FLAG_STRG     = self.get_TS_COOL_FLAG_string()
            self.TS_WARM_FLAG_STRG     = self.get_TS_WARM_FLAG_string()
            self.TS_HOT_FLAG_STRG      = self.get_TS_HOT_FLAG_string()
        def get (self):
            return self._value, self.VBATOTG_LOW_FLAG, self.TS_COLD_FLAG, self.TS_COOL_FLAG, self.TS_WARM_FLAG, self.TS_HOT_FLAG
        def get_VBATOTG_LOW_FLAG(self):
            '''return VBATOTG_LOW_FLAG'''
            return self.VBATOTG_LOW_FLAG
        def get_TS_COLD_FLAG(self):
            '''return TS_COLD_FLAG'''
            return self.TS_COLD_FLAG
        def get_TS_COOL_FLAG(self):
            '''return TS_COOL_FLAG'''
            return self.TS_COOL_FLAG
        def get_TS_WARM_FLAG(self):
            '''return TS_WARM_FLAG'''
            return self.TS_WARM_FLAG
        def get_TS_HOT_FLAG(self):
            '''return TS_HOT_FLAG'''
            return self.TS_HOT_FLAG
        def get_VBATOTG_LOW_FLAG_string(self):
            '''
            Returns VBATOTG_LOW_FLAG string
            0h = Normal
            1h = VBAT falls below the threshold to enable the OTG mode  
            '''
            if self.VBATOTG_LOW_FLAG == 0: return "Normal"
            elif self.VBATOTG_LOW_FLAG == 1: return "VBAT falls below the threshold to enable the OTG mode"
            else: return "unknown"  
        def get_TS_COLD_FLAG_string(self):
            '''
            Returns TS_COLD_FLAG string
            0h = Normal
            1h = TS across cold temperature (T1) is detected
            '''
            if self.TS_COLD_FLAG == 0: return "Normal"
            elif self.TS_COLD_FLAG == 1: return "TS across cold temperature (T1) is detected"
            else: return "unknown"  
        def get_TS_COOL_FLAG_string(self):
            '''
            Returns TS_COOL_FLAG string
            0h = Normal
            1h = TS across cool temperature (T2) is detected
            '''
            if self.TS_COOL_FLAG == 0: return "Normal"
            elif self.TS_COOL_FLAG == 1: return "TS across cool temperature (T2) is detected"
            else: return "unknown"
        def get_TS_WARM_FLAG_string(self):
            '''
            Returns TS_WARM_FLAG string
            0h = Normal
            1h = TS across warm temperature (T3) is detected
            '''
            if self.TS_WARM_FLAG == 0: return "Normal"
            elif self.TS_WARM_FLAG == 1: return "TS across warm temperature (T3) is detected"
            else: return "unknown"
        def get_TS_HOT_FLAG_string(self):   
            '''
            Returns TS_HOT_FLAG string
            0h = Normal
            1h = TS across hot temperature (T5) is detected
            '''
            if self.TS_HOT_FLAG == 0: return "Normal"
            elif self.TS_HOT_FLAG == 1: return "TS across hot temperature (T5) is detected"
            else: return "unknown"
        

    class REG26_FAULT_Flag_0(BQ25795_REGISTER):
        """
        BQ25795 - REG26_FAULT_Flag_0
        ----------
        IBAT_REG_FLAG
            IBAT regulation flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Enter or exit IBAT regulation

        VBUS_OVP_FLAG
            VBUS over voltage protection flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = VBUS over voltage protection triggered
        VBAT_OVP_FLAG
            VBAT over voltage protection flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = VBAT over voltage protection triggered
        IBUS_OCP_FLAG
            IBUS over current protection flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = IBUS over current protection triggered
        IBAT_OCP_FLAG
            IBAT over current protection flag
            Type : R
            POR: 0b
            0h = Normal
            1h = IBAT over current protection triggered
        CONV_OCP_FLAG
            Converter over current protection flag
            Type : R
            POR: 0b
            0h = Normal
            1h = Converter over current protection triggered
        VAC2_OVP_FLAG
            VAC2 over voltage protection flag
            Type : R
            POR: 0b
            0h = Normal
            1h = VAC2 over voltage protection triggered
        VAC1_OVP_FLAG
            VAC1 over voltage protection flag
            Type : R
            POR: 0b
            0h = Normal
            1h = VAC1 over voltage protection triggered
        """
        def __init__(self, addr=0x26, value = 0):
            super().__init__(addr, value)
            self.IBAT_REG_FLAG         = ((self._value & 0b10000000) >> 7)
            self.VBUS_OVP_FLAG         = ((self._value & 0b01000000) >> 6)
            self.VBAT_OVP_FLAG         = ((self._value & 0b00100000) >> 5)
            self.IBUS_OCP_FLAG         = ((self._value & 0b00010000) >> 4)
            self.IBAT_OCP_FLAG         = ((self._value & 0b00001000) >> 3)
            self.CONV_OCP_FLAG         = ((self._value & 0b00000100) >> 2)
            self.VAC2_OVP_FLAG         = ((self._value & 0b00000010) >> 1)
            self.VAC1_OVP_FLAG         = ((self._value & 0b00000001) >> 0)
            self.IBAT_REG_FLAG_STRG     = self.get_IBAT_REG_FLAG_string()
            self.VBUS_OVP_FLAG_STRG     = self.get_VBUS_OVP_FLAG_string()
            self.VBAT_OVP_FLAG_STRG     = self.get_VBAT_OVP_FLAG_string()
            self.IBUS_OCP_FLAG_STRG     = self.get_IBUS_OCP_FLAG_string()
            self.IBAT_OCP_FLAG_STRG     = self.get_IBAT_OCP_FLAG_string()
            self.CONV_OCP_FLAG_STRG     = self.get_CONV_OCP_FLAG_string()
            self.VAC2_OVP_FLAG_STRG     = self.get_VAC2_OVP_FLAG_string()
            self.VAC1_OVP_FLAG_STRG     = self.get_VAC1_OVP_FLAG_string()
        def set (self, value):  
            super().set(value)
            self.IBAT_REG_FLAG         = ((self._value & 0b10000000) >> 7)
            self.VBUS_OVP_FLAG         = ((self._value & 0b01000000) >> 6)
            self.VBAT_OVP_FLAG         = ((self._value & 0b00100000) >> 5)
            self.IBUS_OCP_FLAG         = ((self._value & 0b00010000) >> 4)
            self.IBAT_OCP_FLAG         = ((self._value & 0b00001000) >> 3)
            self.CONV_OCP_FLAG         = ((self._value & 0b00000100) >> 2)
            self.VAC2_OVP_FLAG         = ((self._value & 0b00000010) >> 1)
            self.VAC1_OVP_FLAG         = ((self._value & 0b00000001) >> 0)
            self.IBAT_REG_FLAG_STRG     = self.get_IBAT_REG_FLAG_string()
            self.VBUS_OVP_FLAG_STRG     = self.get_VBUS_OVP_FLAG_string()
            self.VBAT_OVP_FLAG_STRG     = self.get_VBAT_OVP_FLAG_string()
            self.IBUS_OCP_FLAG_STRG     = self.get_IBUS_OCP_FLAG_string()
            self.IBAT_OCP_FLAG_STRG     = self.get_IBAT_OCP_FLAG_string()
            self.CONV_OCP_FLAG_STRG     = self.get_CONV_OCP_FLAG_string()
            self.VAC2_OVP_FLAG_STRG     = self.get_VAC2_OVP_FLAG_string()
            self.VAC1_OVP_FLAG_STRG     = self.get_VAC1_OVP_FLAG_string()
        def get (self):
            return self._value, self.IBAT_REG_FLAG, self.VBUS_OVP_FLAG, self.VBAT_OVP_FLAG, self.IBUS_OCP_FLAG, self.IBAT_OCP_FLAG, self.CONV_OCP_FLAG, self.VAC2_OVP_FLAG, self.VAC1_OVP_FLAG  
        def get_IBAT_REG_FLAG(self):
            '''return IBAT_REG_FLAG'''
            return self.IBAT_REG_FLAG
        def get_VBUS_OVP_FLAG(self):
            '''return VBUS_OVP_FLAG'''
            return self.VBUS_OVP_FLAG
        def get_VBAT_OVP_FLAG(self):
            '''return VBAT_OVP_FLAG'''
            return self.VBAT_OVP_FLAG
        def get_IBUS_OCP_FLAG(self):
            '''return IBUS_OCP_FLAG'''
            return self.IBUS_OCP_FLAG
        def get_IBAT_OCP_FLAG(self):
            '''return IBAT_OCP_FLAG'''
            return self.IBAT_OCP_FLAG
        def get_CONV_OCP_FLAG(self):
            '''return CONV_OCP_FLAG'''
            return self.CONV_OCP_FLAG
        def get_VAC2_OVP_FLAG(self):
            '''return VAC2_OVP_FLAG'''
            return self.VAC2_OVP_FLAG
        def get_VAC1_OVP_FLAG(self):
            '''return VAC1_OVP_FLAG'''
            return self.VAC1_OVP_FLAG
        def get_IBAT_REG_FLAG_string(self):
            '''
            Returns IBAT_REG_FLAG string
            0h = Normal
            1h = Enter or exit IBAT regulation
            '''
            if self.IBAT_REG_FLAG == 0: return "Normal"
            elif self.IBAT_REG_FLAG == 1: return "Enter or exit IBAT regulation"
            else: return "unknown"  
        def get_VBUS_OVP_FLAG_string(self): 
            '''
            Returns VBUS_OVP_FLAG string
            0h = Normal
            1h = VBUS over voltage protection triggered
            '''
            if self.VBUS_OVP_FLAG == 0: return "Normal"
            elif self.VBUS_OVP_FLAG == 1: return "VBUS over voltage protection triggered"
            else: return "unknown"
        def get_VBAT_OVP_FLAG_string(self):
            '''
            Returns VBAT_OVP_FLAG string
            0h = Normal
            1h = VBAT over voltage protection triggered
            '''
            if self.VBAT_OVP_FLAG == 0: return "Normal"
            elif self.VBAT_OVP_FLAG == 1: return "VBAT over voltage protection triggered"
            else: return "unknown"
        def get_IBUS_OCP_FLAG_string(self):
            '''
            Returns IBUS_OCP_FLAG string
            0h = Normal
            1h = IBUS over current protection triggered
            '''
            if self.IBUS_OCP_FLAG == 0: return "Normal"
            elif self.IBUS_OCP_FLAG == 1: return "IBUS over current protection triggered"
            else: return "unknown"
        def get_IBAT_OCP_FLAG_string(self): 
            '''
            Returns IBAT_OCP_FLAG string
            0h = Normal
            1h = IBAT over current protection triggered
            '''
            if self.IBAT_OCP_FLAG == 0: return "Normal"
            elif self.IBAT_OCP_FLAG == 1: return "IBAT over current protection triggered"
            else: return "unknown"
        def get_CONV_OCP_FLAG_string(self):
            '''
            Returns CONV_OCP_FLAG string
            0h = Normal
            1h = Converter over current protection triggered
            '''
            if self.CONV_OCP_FLAG == 0: return "Normal"
            elif self.CONV_OCP_FLAG == 1: return "Converter over current protection triggered"
            else: return "unknown"
        def get_VAC2_OVP_FLAG_string(self): 
            '''
            Returns VAC2_OVP_FLAG string
            0h = Normal
            1h = VAC2 over voltage protection triggered
            '''
            if self.VAC2_OVP_FLAG == 0: return "Normal"
            elif self.VAC2_OVP_FLAG == 1: return "VAC2 over voltage protection triggered"
            else: return "unknown"
        def get_VAC1_OVP_FLAG_string(self): 
            '''
            Returns VAC1_OVP_FLAG string
            0h = Normal
            1h = VAC1 over voltage protection triggered
            '''
            if self.VAC1_OVP_FLAG == 0: return "Normal"
            elif self.VAC1_OVP_FLAG == 1: return "VAC1 over voltage protection triggered"
            else: return "unknown"

    class REG27_FAULT_Flag_1(BQ25795_REGISTER):
        """
        BQ25795 - REG27_FAULT_Flag_1
        ----------
        VSYS_SHORT_FLAG
            VSYS short circuit flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Stop switching due to system short
        VSYS_OVP_FLAG
            VSYS over voltage protection flag
            Type : R
            POR: 0b
            0h = Normal
            1h = Stop switching due to system over-voltage
        OTG_OVP_FLAG
            OTG over-voltage flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Stop OTG due to VBUS over voltage
        OTG_UVP_FLAG
            OTG under-voltage flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = Stop OTG due to VBUS under-voltage
        TSHUT_FLAG
            IC thermal shutdown flag 
            Type : R 
            POR: 0b 
            0h = Normal 
            1h = TS shutdown signal rising threshold detected
        """
        def __init__(self, addr=0x27, value = 0):
            super().__init__(addr, value)
            self.VSYS_SHORT_FLAG       = ((self._value & 0b10000000) >> 7)
            self.VSYS_OVP_FLAG         = ((self._value & 0b01000000) >> 6)
            self.OTG_OVP_FLAG          = ((self._value & 0b00100000) >> 5)
            self.OTG_UVP_FLAG          = ((self._value & 0b00010000) >> 4)
            self.TSHUT_FLAG            = ((self._value & 0b00000100) >> 2)
            self.VSYS_SHORT_FLAG_STRG   = self.get_VSYS_SHORT_FLAG_string()
            self.VSYS_OVP_FLAG_STRG     = self.get_VSYS_OVP_FLAG_string()
            self.OTG_OVP_FLAG_STRG      = self.get_OTG_OVP_FLAG_string()
            self.OTG_UVP_FLAG_STRG      = self.get_OTG_UVP_FLAG_string()
            self.TSHUT_FLAG_STRG        = self.get_TSHUT_FLAG_string()

            
        def set (self, value):
            super().set(value)
            self.VSYS_SHORT_FLAG       = ((self._value & 0b10000000) >> 7)
            self.VSYS_OVP_FLAG         = ((self._value & 0b01000000) >> 6)
            self.OTG_OVP_FLAG          = ((self._value & 0b00100000) >> 5)
            self.OTG_UVP_FLAG          = ((self._value & 0b00010000) >> 4)
            self.TSHUT_FLAG            = ((self._value & 0b00000100) >> 2)
            self.VSYS_SHORT_FLAG_STRG   = self.get_VSYS_SHORT_FLAG_string()
            self.VSYS_OVP_FLAG_STRG     = self.get_VSYS_OVP_FLAG_string()
            self.OTG_OVP_FLAG_STRG      = self.get_OTG_OVP_FLAG_string()
            self.OTG_UVP_FLAG_STRG      = self.get_OTG_UVP_FLAG_string()
            self.TSHUT_FLAG_STRG        = self.get_TSHUT_FLAG_string()
        def get (self):
            return self._value, self.VSYS_SHORT_FLAG, self.VSYS_OVP_FLAG, self.OTG_OVP_FLAG, self.OTG_UVP_FLAG, self.TSHUT_FLAG
        
        def get_VSYS_SHORT_FLAG(self):
            '''return VSYS_SHORT_FLAG'''
            return self.VSYS_SHORT_FLAG 
        def get_VSYS_OVP_FLAG(self):
            '''return VSYS_OVP_FLAG'''
            return self.VSYS_OVP_FLAG
        def get_OTG_OVP_FLAG(self):
            '''return OTG_OVP_FLAG'''
            return self.OTG_OVP_FLAG
        def get_OTG_UVP_FLAG(self):
            '''return OTG_UVP_FLAG'''
            return self.OTG_UVP_FLAG
        def get_TSHUT_FLAG(self):
            '''return TSHUT_FLAG'''
            return self.TSHUT_FLAG
        def get_VSYS_SHORT_FLAG_string(self):   
            '''
            Returns VSYS_SHORT_FLAG string
            0h = Normal
            1h = Stop switching due to system short
            '''
            if self.VSYS_SHORT_FLAG == 0: return "Normal"
            elif self.VSYS_SHORT_FLAG == 1: return "Stop switching due to system short"
            else: return "unknown"
        def get_VSYS_OVP_FLAG_string(self):
            '''
            Returns VSYS_OVP_FLAG string
            0h = Normal
            1h = Stop switching due to system over-voltage
            '''
            if self.VSYS_OVP_FLAG == 0: return "Normal"
            elif self.VSYS_OVP_FLAG == 1: return "Stop switching due to system over-voltage"
            else: return "unknown"
        def get_OTG_OVP_FLAG_string(self):
            '''
            Returns OTG_OVP_FLAG string
            0h = Normal
            1h = Stop OTG due to VBUS over voltage
            '''
            if self.OTG_OVP_FLAG == 0: return "Normal"
            elif self.OTG_OVP_FLAG == 1: return "Stop OTG due to VBUS over voltage"
            else: return "unknown"
        def get_OTG_UVP_FLAG_string(self):
            '''
            Returns OTG_UVP_FLAG string
            0h = Normal
            1h = Stop OTG due to VBUS under voltage
            '''
            if self.OTG_UVP_FLAG == 0: return "Normal"
            elif self.OTG_UVP_FLAG == 1: return "Stop OTG due to VBUS under voltage"
            else: return "unknown"
        def get_TSHUT_FLAG_string(self):    
            '''
            Returns TSHUT_FLAG string
            0h = Normal
            1h = TS shutdown signal rising threshold detected
            '''
            if self.TSHUT_FLAG == 0: return "Normal"
            elif self.TSHUT_FLAG == 1: return "TS shutdown signal rising threshold detected"
            else: return "unknown"

                   
        
    class REG28_Charger_Mask_0(BQ25795_REGISTER):
        """
        BQ25795 - REG28_Charger_Mask_0
        ----------
        IINDPM_MASK
            IINDPM / IOTG mask flag 
            Type : RW 
            POR: 0b 
            0h = Enter IINDPM / IOTG does produce INT pulse 
            1h = Enter IINDPM / IOTG does NOT produce INT pulse

        VINDPM_MASK
            VINDPM / VOTG mask flag 
            Type : RW 
            POR: 0b 
            0h = Enter VINDPM / VOTG does produce INT pulse 
            1h = Enter VINDPM / VOTG does NOT produce INT pulse
        WD_MASK
            I2C watch dog timer mask flag 
            Type : RW 
            POR: 0b 
            0h = I2C watch dog timer expired does produce INT pulse 
            1h = I2C watch dog timer expired does NOT produce INT pulse
        POORSRC_MASK
            Poor source detection mask flag 
            Type : RW 
            POR: 0b 0h = Poor source detected does produce INT 
            1h = Poor source detected does NOT produce INT
        PG_MASK
            Power Good mask flag 
            Type : RW 
            POR: 0b 
            0h = PG toggle does produce INT 
            1h = PG toggle does NOT produce INT
        VAC2_PRESENT_MASK
            VAC2 present mask flag 
            Type : RW 
            POR: 0b 
            0h = VAC2 present status change does produce INT 
            1h = VAC2 present status change does NOT produce INT
        VAC1_PRESENT_MASK
            VAC1 present mask flag 
            Type : RW 
            POR: 0b 
            0h = VAC1 present status change does produce INT 
            1h = VAC1 present status change does NOT produce INT
        VBUS_PRESENT_MASK
            VBUS present mask flag 
            Type : RW 
            POR: 0b 
            0h = VBUS present status change does produce INT 
            1h = VBUS present status change does NOT produce INT
        """
        def __init__(self, addr=0x28, value = 0):
            super().__init__(addr, value)
            self.IINDPM_MASK          = ((self._value & 0b10000000) >> 7)
            self.VINDPM_MASK          = ((self._value & 0b01000000) >> 6)
            self.WD_MASK              = ((self._value & 0b00100000) >> 5)
            self.POORSRC_MASK         = ((self._value & 0b00010000) >> 4)
            self.PG_MASK              = ((self._value & 0b00001000) >> 3)
            self.VAC2_PRESENT_MASK     = ((self._value & 0b00000100) >> 2)
            self.VAC1_PRESENT_MASK     = ((self._value & 0b00000010) >> 1)
            self.VBUS_PRESENT_MASK     = ((self._value & 0b00000001) >> 0)
            self.IINDPM_MASK_STRG      = self.get_IINDPM_MASK_string()
            self.VINDPM_MASK_STRG      = self.get_VINDPM_MASK_string()
            self.WD_MASK_STRG          = self.get_WD_MASK_string()
            self.POORSRC_MASK_STRG     = self.get_POORSRC_MASK_string()
            self.PG_MASK_STRG          = self.get_PG_MASK_string()

            self.VAC2_PRESENT_MASK_STRG = self.get_VAC2_PRESENT_MASK_string()
            self.VAC1_PRESENT_MASK_STRG = self.get_VAC1_PRESENT_MASK_string()
            self.VBUS_PRESENT_MASK_STRG = self.get_VBUS_PRESENT_MASK_string()
        def set (self, value):  
            super().set(value)
            self.IINDPM_MASK          = ((self._value & 0b10000000) >> 7)
            self.VINDPM_MASK          = ((self._value & 0b01000000) >> 6)
            self.WD_MASK              = ((self._value & 0b00100000) >> 5)
            self.POORSRC_MASK         = ((self._value & 0b00010000) >> 4)
            self.PG_MASK              = ((self._value & 0b00001000) >> 3)
            self.VAC2_PRESENT_MASK     = ((self._value & 0b00000100) >> 2)
            self.VAC1_PRESENT_MASK     = ((self._value & 0b00000010) >> 1)
            self.VBUS_PRESENT_MASK     = ((self._value & 0b00000001) >> 0)
            self.IINDPM_MASK_STRG      = self.get_IINDPM_MASK_string()
            self.VINDPM_MASK_STRG      = self.get_VINDPM_MASK_string()
            self.WD_MASK_STRG          = self.get_WD_MASK_string()
            self.POORSRC_MASK_STRG     = self.get_POORSRC_MASK_string()
            self.PG_MASK_STRG          = self.get_PG_MASK_string()

            self.VAC2_PRESENT_MASK_STRG = self.get_VAC2_PRESENT_MASK_string()
            self.VAC1_PRESENT_MASK_STRG = self.get_VAC1_PRESENT_MASK_string()
            self.VBUS_PRESENT_MASK_STRG = self.get_VBUS_PRESENT_MASK_string()
        def get (self):
            '''
            return IINDPM_MASK, VINDPM_MASK, WD_MASK, POORSRC_MASK, PG_MASK, VAC2_PRESENT_MASK, VAC1_PRESENT_MASK, VBUS_PRESENT_MASK
            '''
            self._value = (self.IINDPM_MASK << 7) | (self.VINDPM_MASK << 6) | (self.WD_MASK << 5) | (self.POORSRC_MASK << 4) | (self.PG_MASK << 3) | (self.VAC2_PRESENT_MASK << 2) | (self.VAC1_PRESENT_MASK << 1) | (self.VBUS_PRESENT_MASK << 0)
            return self._value, self.IINDPM_MASK, self.VINDPM_MASK, self.WD_MASK, self.POORSRC_MASK, self.PG_MASK, self.VAC2_PRESENT_MASK, self.VAC1_PRESENT_MASK, self.VBUS_PRESENT_MASK
        
        def get_IINDPM_MASK(self):
            '''return IINDPM_MASK'''
            return self.IINDPM_MASK
        def get_VINDPM_MASK(self):
            '''return VINDPM_MASK'''
            return self.VINDPM_MASK
        def get_WD_MASK(self):
            '''return WD_MASK'''
            return self.WD_MASK
        def get_POORSRC_MASK(self):
            '''return POORSRC_MASK'''
            return self.POORSRC_MASK
        def get_PG_MASK(self):
            '''return PG_MASK'''
            return self.PG_MASK
        def get_VAC2_PRESENT_MASK(self):
            '''return VAC2_PRESENT_MASK'''
            return self.VAC2_PRESENT_MASK
        def get_VAC1_PRESENT_MASK(self):
            '''return VAC1_PRESENT_MASK'''
            return self.VAC1_PRESENT_MASK
        def get_VBUS_PRESENT_MASK(self):
            '''return VBUS_PRESENT_MASK'''
            return self.VBUS_PRESENT_MASK
        def get_IINDPM_MASK_string(self):   
            '''
            Returns IINDPM_MASK string
            0h = Enter IINDPM / IOTG does produce INT pulse
            1h = Enter IINDPM / IOTG does NOT produce INT pulse
            '''
            if self.IINDPM_MASK == 0: return "Enter IINDPM / IOTG does produce INT pulse"
            elif self.IINDPM_MASK == 1: return "Enter IINDPM / IOTG does NOT produce INT pulse"
            else: return "unknown"
        def get_VINDPM_MASK_string(self):   
            '''
            Returns VINDPM_MASK string
            0h = Enter VINDPM / VOTG does produce INT pulse
            1h = Enter VINDPM / VOTG does NOT produce INT pulse
            '''
            if self.VINDPM_MASK == 0: return "Enter VINDPM / VOTG does produce INT pulse"
            elif self.VINDPM_MASK == 1: return "Enter VINDPM / VOTG does NOT produce INT pulse"
            else: return "unknown"
        def get_WD_MASK_string(self):
            '''
            Returns WD_MASK string
            0h = I2C watch dog timer expired does produce INT pulse
            1h = I2C watch dog timer expired does NOT produce INT pulse
            '''
            if self.WD_MASK == 0: return "I2C watch dog timer expired does produce INT pulse"
            elif self.WD_MASK == 1: return "I2C watch dog timer expired does NOT produce INT pulse"
            else: return "unknown"
        def get_POORSRC_MASK_string(self):
            '''
            Returns POORSRC_MASK string
            0h = Poor source detected does produce INT
            1h = Poor source detected does NOT produce INT
            '''
            if self.POORSRC_MASK == 0: return "Poor source detected does produce INT"
            elif self.POORSRC_MASK == 1: return "Poor source detected does NOT produce INT"
            else: return "unknown"
        def get_PG_MASK_string(self):
            '''
            Returns PG_MASK string
            0h = PG toggle does produce INT
            1h = PG toggle does NOT produce INT
            '''
            if self.PG_MASK == 0: return "PG toggle does produce INT"
            elif self.PG_MASK == 1: return "PG toggle does NOT produce INT"
            else: return "unknown"
        def get_VAC2_PRESENT_MASK_string(self):
            '''
            Returns VAC2_PRESENT_MASK string
            0h = VAC2 present status change does produce INT
            1h = VAC2 present status change does NOT produce INT
            '''
            if self.VAC2_PRESENT_MASK == 0: return "VAC2 present status change does produce INT"
            elif self.VAC2_PRESENT_MASK == 1: return "VAC2 present status change does NOT produce INT"
            else: return "unknown"
        def get_VAC1_PRESENT_MASK_string(self): 
            '''
            Returns VAC1_PRESENT_MASK string
            0h = VAC1 present status change does produce INT
            1h = VAC1 present status change does NOT produce INT
            '''
            if self.VAC1_PRESENT_MASK == 0: return "VAC1 present status change does produce INT"
            elif self.VAC1_PRESENT_MASK == 1: return "VAC1 present status change does NOT produce INT"
            else: return "unknown"
        def get_VBUS_PRESENT_MASK_string(self):
            '''
            Returns VBUS_PRESENT_MASK string
            0h = VBUS present status change does produce INT
            1h = VBUS present status change does NOT produce INT
            '''
            if self.VBUS_PRESENT_MASK == 0: return "VBUS present status change does produce INT"
            elif self.VBUS_PRESENT_MASK == 1: return "VBUS present status change does NOT produce INT"
            else: return "unknown"
        def set_VBUS_PRESENT_MASK(self, VBUS_PRESENT_MASK):
            '''
            Set VBUS_PRESENT_MASK (0h = VBUS present status change does produce INT, 1h = VBUS present status change does NOT produce INT) 
            '''
            self.VBUS_PRESENT_MASK = VBUS_PRESENT_MASK  
            self.get()
        def set_VAC1_PRESENT_MASK(self, VAC1_PRESENT_MASK):
            ''' 
            Set VAC1_PRESENT_MASK (0h = VAC1 present status change does produce INT, 1h = VAC1 present status change does NOT produce INT)
            '''
            self.VAC1_PRESENT_MASK = VAC1_PRESENT_MASK
            self.get()  
        def set_VAC2_PRESENT_MASK(self, VAC2_PRESENT_MASK):
            '''
            Set VAC2_PRESENT_MASK (0h = VAC2 present status change does produce INT, 1h = VAC2 present status change does NOT produce INT)
            '''
            self.VAC2_PRESENT_MASK = VAC2_PRESENT_MASK
            self.get()
        def set_PG_MASK(self, PG_MASK):
            '''
            Set PG_MASK (0h = PG toggle does produce INT, 1h = PG toggle does NOT produce INT) 
            '''
            self.PG_MASK = PG_MASK  
            self.get()
        def set_POORSRC_MASK(self, POORSRC_MASK):
            '''
            Set POORSRC_MASK (0h = Poor source detected does produce INT, 1h = Poor source detected does NOT produce INT) 
            '''
            self.POORSRC_MASK = POORSRC_MASK  
            self.get()
        def set_WD_MASK(self, WD_MASK):
            '''
            Set WD_MASK (0h = I2C watch dog timer expired does produce INT pulse, 1h = I2C watch dog timer expired does NOT produce INT pulse) 
            '''
            self.WD_MASK = WD_MASK  
            self.get()      
        def set_VINDPM_MASK(self, VINDPM_MASK):
            ''' 
            Set VINDPM_MASK (0h = Enter VINDPM / VOTG does produce INT pulse, 1h = Enter VINDPM / VOTG does NOT produce INT pulse)
            '''
            self.VINDPM_MASK = VINDPM_MASK
            self.get()
        def set_IINDPM_MASK(self, IINDPM_MASK):
            '''
            Set IINDPM_MASK (0h = Enter IINDPM / IOTG does produce INT pulse, 1h = Enter IINDPM / IOTG does NOT produce INT pulse) 
            '''
            self.IINDPM_MASK = IINDPM_MASK  
            self.get()
            
    class REG29_Charger_Mask_1(BQ25795_REGISTER):
        """
        BQ25795 - REG29_Charger_Mask_1
        ----------
        CHG_MASK
            Charge status mask flag 
            Type : RW 
            POR: 0b 
            0h = Charging status change does produce INT 
            1h = Charging status change does NOT produce INT
        ICO_MASK
            ICO status mask flag 
            Type : RW 
            POR: 0b 
            0h = ICO status change does produce INT 
            1h = ICO status change does NOT produce INT
        VBUS_MASK
            VBUS status mask flag 
            Type : RW 
            POR: 0b 
            0h = VBUS status change does produce INT 
            1h = VBUS status change does NOT produce INT
        TREG_MASK
            TREG status mask flag 
            Type : RW 
            POR: 0b 
            0h = TREG status change does produce INT 
            1h = TREG status change does NOT produce INT
        VBAT_PRESENT_MASK
            VBAT present mask flag 
            Type : RW 
            POR: 0b 
            0h = VBAT present status change does produce INT 
            1h = VBAT present status change does NOT produce INT    
        BC1.2_DONE_MASK
            BC1.2 done mask flag 
            Type : RW 
            POR: 0b 
            0h = BC1.2 done status change does produce INT 
            1h = BC1.2 done status change does NOT produce INT
                
        """
        def __init__(self, addr=0x29, value = 0):
            super().__init__(addr, value)
            self.CHG_MASK              = ((self._value & 0b10000000) >> 7)
            self.ICO_MASK              = ((self._value & 0b01000000) >> 6)
            self.VBUS_MASK             = ((self._value & 0b00010000) >> 4)
            self.TREG_MASK             = ((self._value & 0b00000100) >> 2)
            self.VBAT_PRESENT_MASK      = ((self._value & 0b00000010) >> 1)
            self.BC1_2_DONE_MASK        = ((self._value & 0b00000001) >> 0)
            self.CHG_MASK_STRG          = self.get_CHG_MASK_string()
            self.ICO_MASK_STRG          = self.get_ICO_MASK_string()
            self.VBUS_MASK_STRG         = self.get_VBUS_MASK_string()
            self.TREG_MASK_STRG         = self.get_TREG_MASK_string()
            self.VBAT_PRESENT_MASK_STRG  = self.get_VBAT_PRESENT_MASK_string()
            self.BC1_2_DONE_MASK_STRG    = self.get_BC1_2_DONE_MASK_string()
        def set (self, value):  
            super().set(value)
            self.CHG_MASK              = ((self._value & 0b10000000) >> 7)
            self.ICO_MASK              = ((self._value & 0b01000000) >> 6)
            self.VBUS_MASK             = ((self._value & 0b00010000) >> 4)
            self.TREG_MASK             = ((self._value & 0b00000100) >> 2)
            self.VBAT_PRESENT_MASK      = ((self._value & 0b00000010) >> 1)
            self.BC1_2_DONE_MASK        = ((self._value & 0b00000001) >> 0)
            self.CHG_MASK_STRG          = self.get_CHG_MASK_string()
            self.ICO_MASK_STRG          = self.get_ICO_MASK_string()
            self.VBUS_MASK_STRG         = self.get_VBUS_MASK_string()
            self.TREG_MASK_STRG         = self.get_TREG_MASK_string()
            self.VBAT_PRESENT_MASK_STRG  = self.get_VBAT_PRESENT_MASK_string()
            self.BC1_2_DONE_MASK_STRG    = self.get_BC1_2_DONE_MASK_string()
        def get (self): 
            self._value = (self.CHG_MASK << 7) | (self.ICO_MASK << 6) | 0 | (self.VBUS_MASK << 4) | 0 | (self.TREG_MASK << 2) | (self.VBAT_PRESENT_MASK << 1) | (self.BC1_2_DONE_MASK << 0)
            return self._value, self.CHG_MASK, self.ICO_MASK, self.VBUS_MASK, self.TREG_MASK, self.VBAT_PRESENT_MASK, self.BC1_2_DONE_MASK
        def get_CHG_MASK(self):
            '''return CHG_MASK'''
            return self.CHG_MASK
        def get_ICO_MASK(self):
            '''return ICO_MASK'''
            return self.ICO_MASK
        def get_VBUS_MASK(self):
            '''return VBUS_MASK'''
            return self.VBUS_MASK
        def get_TREG_MASK(self):
            '''return TREG_MASK'''
            return self.TREG_MASK
        def get_VBAT_PRESENT_MASK(self):
            '''return VBAT_PRESENT_MASK'''
            return self.VBAT_PRESENT_MASK
        def get_BC1_2_DONE_MASK(self):
            '''return BC1_2_DONE_MASK'''
            return self.BC1_2_DONE_MASK
        def get_CHG_MASK_string(self):
            '''
            Returns CHG_MASK string
            0h = Charging status change does produce INT
            1h = Charging status change does NOT produce INT
            '''
            if self.CHG_MASK == 0: return "Charging status change does produce INT"
            elif self.CHG_MASK == 1: return "Charging status change does NOT produce INT"
            else: return "unknown"
        def get_ICO_MASK_string(self):
            '''
            Returns ICO_MASK string
            0h = ICO status change does produce INT
            1h = ICO status change does NOT produce INT
            '''
            if self.ICO_MASK == 0: return "ICO status change does produce INT"
            elif self.ICO_MASK == 1: return "ICO status change does NOT produce INT"
            else: return "unknown"
        def get_VBUS_MASK_string(self):
            '''
            Returns VBUS_MASK string
            0h = VBUS status change does produce INT
            1h = VBUS status change does NOT produce INT
            '''
            if self.VBUS_MASK == 0: return "VBUS status change does produce INT"
            elif self.VBUS_MASK == 1: return "VBUS status change does NOT produce INT"
            else: return "unknown"
        def get_TREG_MASK_string(self):
            '''
            Returns TREG_MASK string
            0h = TREG status change does produce INT
            1h = TREG status change does NOT produce INT
            '''
            if self.TREG_MASK == 0: return "TREG status change does produce INT"
            elif self.TREG_MASK == 1: return "TREG status change does NOT produce INT"
            else: return "unknown"
        def get_VBAT_PRESENT_MASK_string(self):
            '''
            Returns VBAT_PRESENT_MASK string
            0h = VBAT present status change does produce INT
            1h = VBAT present status change does NOT produce INT
            '''
            if self.VBAT_PRESENT_MASK == 0: return "VBAT present status change does produce INT"
            elif self.VBAT_PRESENT_MASK == 1: return "VBAT present status change does NOT produce INT"
            else: return "unknown"
        def get_BC1_2_DONE_MASK_string(self):
            '''
            Returns BC1_2_DONE_MASK string
            0h = BC1.2 done status change does produce INT
            1h = BC1.2 done status change does NOT produce INT
            '''
            if self.BC1_2_DONE_MASK == 0: return "BC1.2 done status change does produce INT"
            elif self.BC1_2_DONE_MASK == 1: return "BC1.2 done status change does NOT produce INT"
            else: return "unknown"
        def set_CHG_MASK(self, CHG_MASK):
            '''
            Set CHG_MASK (0h = Charging status change does produce INT, 1h = Charging status change does NOT produce INT) 
            '''
            self.CHG_MASK = CHG_MASK  
            self.get()
        def set_ICO_MASK(self, ICO_MASK):
            '''
            Set ICO_MASK (0h = ICO status change does produce INT, 1h = ICO status change does NOT produce INT) 
            '''
            self.ICO_MASK = ICO_MASK  
            self.get()
        def set_VBUS_MASK(self, VBUS_MASK):
            '''
            Set VBUS_MASK (0h = VBUS status change does produce INT, 1h = VBUS status change does NOT produce INT) 
            '''
            self.VBUS_MASK = VBUS_MASK  
            self.get()
        def set_TREG_MASK(self, TREG_MASK):
            '''
            Set TREG_MASK (0h = TREG status change does produce INT, 1h = TREG status change does NOT produce INT) 
            '''
            self.TREG_MASK = TREG_MASK  
            self.get()
        def set_VBAT_PRESENT_MASK(self, VBAT_PRESENT_MASK):
            '''
            Set VBAT_PRESENT_MASK (0h = VBAT present status change does produce INT, 1h = VBAT present status change does NOT produce INT) 
            '''
            self.VBAT_PRESENT_MASK = VBAT_PRESENT_MASK  
            self.get()
        def set_BC1_2_DONE_MASK(self, BC1_2_DONE_MASK):
            '''
            Set BC1_2_DONE_MASK (0h = BC1.2 done status change does produce INT, 1h = BC1.2 done status change does NOT produce INT) 
            '''
            self.BC1_2_DONE_MASK = BC1_2_DONE_MASK  
            self.get()
            
    
    class REG2A_Charger_Mask_2(BQ25795_REGISTER):
        """
        BQ25795 - REG2A_Charger_Mask_2
        ----------
        DPDM_DONE_MASK
            D+/D- detection is done mask flag 
            Type : RW 
            POR: 0b 
            0h = D+/D- detection done does produce INT pulse 
            1h = D+/D- detection done does NOT produce INT pulse
        ADC_DONE_MASK
            ADC conversion mask flag (only in one-shot mode) 
            Type : RW POR: 0b 
            0h = ADC conversion done does produce INT pulse 
            1h = ADC conversion done does NOT produce INT pulse 
        VSYS_MASK
            VSYS min regulation mask flag 
            Type : RW 
            POR: 0b 
            0h = enter or exit VSYSMIN regulation does produce INT pulse 
            1h = enter or exit VSYSMIN regulation does NOT produce INT pulse  
        CHG_TMR_MASK
            Fast charge timer mask flag Type : RW 
            POR: 0b 
            0h = Fast charge timer expire does produce INT 
            1h = Fast charge timer expire does NOT produce INT
        TRICHG_TMR_MASK
            Trickle charge timer mask flag
            Type : RW
            POR: 0b
            0h = Trickle charge timer expire does produce INT
            1h = Trickle charge timer expire does NOT produce INT
        PRECHG_TMR_MASK
            Precharge timer mask flag 
            Type : RW 
            POR: 0b 
            0h = Precharge timer expire does produce INT 
            1h = Precharge timer expire does NOT produce INT
        TOPOFF_TMR_MASK   
            Top off timer mask flag 
            Type : RW 
            POR: 0b 
            0h = Top off timer expire does produce INT 
            1h = Top off timer expire does NOT produce INT
        """
        def __init__(self, addr=0x2a, value = 0):
            super().__init__(addr, value)
            self.DPDM_DONE_MASK        = ((self._value & 0b01000000) >> 6)
            self.ADC_DONE_MASK         = ((self._value & 0b00100000) >> 5)
            self.VSYS_MASK             = ((self._value & 0b00010000) >> 4)
            self.CHG_TMR_MASK          = ((self._value & 0b00001000) >> 3)
            self.TRICHG_TMR_MASK       = ((self._value & 0b00000100) >> 2)
            self.PRECHG_TMR_MASK       = ((self._value & 0b00000010) >> 1)
            self.TOPOFF_TMR_MASK        = ((self._value & 0b00000001) >> 0)
            self.DPDM_DONE_MASK_STRG    = self.get_DPDM_DONE_MASK_string()
            self.ADC_DONE_MASK_STRG     = self.get_ADC_DONE_MASK_string()
            self.VSYS_MASK_STRG         = self.get_VSYS_MASK_string()
            self.CHG_TMR_MASK_STRG      = self.get_CHG_TMR_MASK_string()
            self.TRICHG_TMR_MASK_STRG   = self.get_TRICHG_TMR_MASK_string() 
            self.PRECHG_TMR_MASK_STRG   = self.get_PRECHG_TMR_MASK_string()
            self.TOPOFF_TMR_MASK_STRG    = self.get_TOPOFF_TMR_MASK_string()
            
            
        def set (self, value):  
            super().set(value)
            self.DPDM_DONE_MASK        = ((self._value & 0b01000000) >> 6)
            self.ADC_DONE_MASK         = ((self._value & 0b00100000) >> 5)
            self.VSYS_MASK             = ((self._value & 0b00010000) >> 4)
            self.CHG_TMR_MASK          = ((self._value & 0b00001000) >> 3)
            self.TRICHG_TMR_MASK       = ((self._value & 0b00000100) >> 2)
            self.PRECHG_TMR_MASK       = ((self._value & 0b00000010) >> 1)
            self.TOPOFF_TMR_MASK        = ((self._value & 0b00000001) >> 0)
            self.DPDM_DONE_MASK_STRG    = self.get_DPDM_DONE_MASK_string()
            self.ADC_DONE_MASK_STRG     = self.get_ADC_DONE_MASK_string()
            self.VSYS_MASK_STRG         = self.get_VSYS_MASK_string()
            self.CHG_TMR_MASK_STRG      = self.get_CHG_TMR_MASK_string()
            self.TRICHG_TMR_MASK_STRG   = self.get_TRICHG_TMR_MASK_string() 
            self.PRECHG_TMR_MASK_STRG   = self.get_PRECHG_TMR_MASK_string()
            self.TOPOFF_TMR_MASK_STRG    = self.get_TOPOFF_TMR_MASK_string()
        def get (self):
            '''
            return DPDM_DONE_MASK, ADC_DONE_MASK, VSYS_MASK, CHG_TMR_MASK, TRICHG_TMR_MASK, PRECHG_TMR_MASK, TOPOFF_TMR_MASK
            '''
            self._value = 0 | (self.DPDM_DONE_MASK << 6) | (self.ADC_DONE_MASK << 5) | (self.VSYS_MASK << 4) | (self.CHG_TMR_MASK << 3) | (self.TRICHG_TMR_MASK << 2) | (self.PRECHG_TMR_MASK << 1) | (self.TOPOFF_TMR_MASK << 0)
            return self._value, self.DPDM_DONE_MASK, self.ADC_DONE_MASK, self.VSYS_MASK, self.CHG_TMR_MASK, self.TRICHG_TMR_MASK, self.PRECHG_TMR_MASK, self.TOPOFF_TMR_MASK
        def get_DPDM_DONE_MASK(self):
            '''return DPDM_DONE_MASK'''
            return self.DPDM_DONE_MASK
        def get_ADC_DONE_MASK(self):
            '''return ADC_DONE_MASK'''
            return self.ADC_DONE_MASK
        def get_VSYS_MASK(self):
            '''return VSYS_MASK'''
            return self.VSYS_MASK
        def get_CHG_TMR_MASK(self):
            '''return CHG_TMR_MASK'''
            return self.CHG_TMR_MASK
        def get_TRICHG_TMR_MASK(self):
            '''return TRICHG_TMR_MASK'''
            return self.TRICHG_TMR_MASK
        def get_PRECHG_TMR_MASK(self):
            '''return PRECHG_TMR_MASK'''
            return self.PRECHG_TMR_MASK
        def get_TOPOFF_TMR_MASK(self):
            '''return TOPOFF_TMR_MASK'''
            return self.TOPOFF_TMR_MASK
        def get_DPDM_DONE_MASK_string(self):    
            '''
            Returns DPDM_DONE_MASK string
            0h = D+/D- detection done does produce INT pulse
            1h = D+/D- detection done does NOT produce INT pulse
            '''
            if self.DPDM_DONE_MASK == 0: return "D+/D- detection done does produce INT pulse"
            elif self.DPDM_DONE_MASK == 1: return "D+/D- detection done does NOT produce INT pulse"
            else: return "unknown"
        def get_ADC_DONE_MASK_string(self):
            '''
            Returns ADC_DONE_MASK string
            0h = ADC conversion done does produce INT pulse
            1h = ADC conversion done does NOT produce INT pulse
            '''
            if self.ADC_DONE_MASK == 0: return "ADC conversion done does produce INT pulse"
            elif self.ADC_DONE_MASK == 1: return "ADC conversion done does NOT produce INT pulse"
            else: return "unknown"
        def get_VSYS_MASK_string(self):
            '''
            Returns VSYS_MASK string
            0h = enter or exit VSYSMIN regulation does produce INT pulse
            1h = enter or exit VSYSMIN regulation does NOT produce INT pulse
            '''
            if self.VSYS_MASK == 0: return "enter or exit VSYSMIN regulation does produce INT pulse"
            elif self.VSYS_MASK == 1: return "enter or exit VSYSMIN regulation does NOT produce INT pulse"
            else: return "unknown"
        def get_CHG_TMR_MASK_string(self):
            '''
            Returns CHG_TMR_MASK string
            0h = Fast charge timer expire does produce INT
            1h = Fast charge timer expire does NOT produce INT
            '''
            if self.CHG_TMR_MASK == 0: return "Fast charge timer expire does produce INT"
            elif self.CHG_TMR_MASK == 1: return "Fast charge timer expire does NOT produce INT"
            else: return "unknown"
        def get_TRICHG_TMR_MASK_string(self):
            '''
            Returns TRICHG_TMR_MASK string
            0h = Trickle charge timer expire does produce INT
            1h = Trickle charge timer expire does NOT produce INT
            '''
            if self.TRICHG_TMR_MASK == 0: return "Trickle charge timer expire does produce INT"
            elif self.TRICHG_TMR_MASK == 1: return "Trickle charge timer expire does NOT produce INT"
            else: return "unknown"
        def get_PRECHG_TMR_MASK_string(self):
            '''
            Returns PRECHG_TMR_MASK string
            0h = Precharge timer expire does produce INT
            1h = Precharge timer expire does NOT produce INT
            '''
            if self.PRECHG_TMR_MASK == 0: return "Precharge timer expire does produce INT"
            elif self.PRECHG_TMR_MASK == 1: return "Precharge timer expire does NOT produce INT"
            else: return "unknown"
        def get_TOPOFF_TMR_MASK_string(self):
            '''
            Returns TOPOFF_TMR_MASK string
            0h = Top off timer expire does produce INT
            1h = Top off timer expire does NOT produce INT
            '''
            if self.TOPOFF_TMR_MASK == 0: return "Top off timer expire does produce INT"
            elif self.TOPOFF_TMR_MASK == 1: return "Top off timer expire does NOT produce INT"
            else: return "unknown"
        def set_DPDM_DONE_MASK(self, DPDM_DONE_MASK):
            '''
            Set DPDM_DONE_MASK (0h = D+/D- detection done does produce INT pulse, 1h = D+/D- detection done does NOT produce INT pulse) 
            '''
            self.DPDM_DONE_MASK = DPDM_DONE_MASK  
            self.get()
        def set_ADC_DONE_MASK(self, ADC_DONE_MASK):
            '''
            Set ADC_DONE_MASK (0h = ADC conversion done does produce INT pulse, 1h = ADC conversion done does NOT produce INT pulse) 
            '''
            self.ADC_DONE_MASK = ADC_DONE_MASK  
            self.get()
        def set_VSYS_MASK(self, VSYS_MASK):
            '''
            Set VSYS_MASK (0h = enter or exit VSYSMIN regulation does produce INT pulse, 1h = enter or exit VSYSMIN regulation does NOT produce INT pulse) 
            '''
            self.VSYS_MASK = VSYS_MASK  
            self.get()
        def set_CHG_TMR_MASK(self, CHG_TMR_MASK):
            '''
            Set CHG_TMR_MASK (0h = Fast charge timer expire does produce INT, 1h = Fast charge timer expire does NOT produce INT) 
            '''
            self.CHG_TMR_MASK = CHG_TMR_MASK  
            self.get()
        def set_TRICHG_TMR_MASK(self, TRICHG_TMR_MASK):
            '''
            Set TRICHG_TMR_MASK (0h = Trickle charge timer expire does produce INT, 1h = Trickle charge timer expire does NOT produce INT) 
            '''
            self.TRICHG_TMR_MASK = TRICHG_TMR_MASK  
            self.get()
        def set_PRECHG_TMR_MASK(self, PRECHG_TMR_MASK):
            '''
            Set PRECHG_TMR_MASK (0h = Precharge timer expire does produce INT, 1h = Precharge timer expire does NOT produce INT) 
            '''
            self.PRECHG_TMR_MASK = PRECHG_TMR_MASK  
            self.get()
        def set_TOPOFF_TMR_MASK(self, TOPOFF_TMR_MASK):
            '''
            Set TOPOFF_TMR_MASK (0h = Top off timer expire does produce INT, 1h = Top off timer expire does NOT produce INT) 
            '''
            self.TOPOFF_TMR_MASK = TOPOFF_TMR_MASK  
            self.get()
        
           
        
        
    class REG2B_Charger_Mask_3(BQ25795_REGISTER):
        """
        BQ25795 - REG2B_Charger_Mask_3
        ----------
        VBATOTG_LOW_MASK
            VBAT too low to enable OTG mask 
            Type : RW 
            POR: 0b 
            0h = VBAT falling below the threshold to enable the OTG mode, does produce INT 
            1h = VBAT falling below the threshold to enable the OTG mode, does NOT produce INT
        TS_COLD_MASK
            TS cold temperature interrupt mask 
            Type : RW 
            POR: 0b 
            0h = TS across cold temperature (T1) does produce INT 
            1h = TS across cold temperature (T1) does NOT produce INT
        TS_COOL_MASK
            TS cool temperature interrupt mask 
            Type : RW 
            POR: 0b 
            0h = TS across cool temperature (T2) does produce INT 
            1h = TS across cool temperature (T2) does NOT produce INT
        TS_WARM_MASK
            TS warm temperature interrupt mask 
            Type : RW 
            POR: 0b 
            0h = TS across warm temperature (T3) does produce INT 
            1h = TS across warm temperature (T3) does NOT produce INT
        TS_HOT_MASK
            TS hot temperature interrupt mask 
            Type : RW 
            POR: 0b 
            0h = TS across hot temperature (T5) does produce INT 
            1h = TS across hot temperature (T5) does NOT produce INT
        """
        def __init__(self, addr=0x2b, value = 0):
            super().__init__(addr, value)
            self.VBATOTG_LOW_MASK      = ((self._value & 0b00010000) >> 4) 
            self.TS_COLD_MASK          = ((self._value & 0b00001000) >> 3)
            self.TS_COOL_MASK          = ((self._value & 0b00000100) >> 2)
            self.TS_WARM_MASK          = ((self._value & 0b00000010) >> 1)
            self.TS_HOT_MASK           = ((self._value & 0b00000001) >> 0)
            self.VBATOTG_LOW_MASK_STRG  = self.get_VBATOTG_LOW_MASK_string()
            self.TS_COLD_MASK_STRG      = self.get_TS_COLD_MASK_string()
            self.TS_COOL_MASK_STRG      = self.get_TS_COOL_MASK_string()
            self.TS_WARM_MASK_STRG      = self.get_TS_WARM_MASK_string()
            self.TS_HOT_MASK_STRG       = self.get_TS_HOT_MASK_string()
        def set (self, value):  
            super().set(value)
            self.VBATOTG_LOW_MASK      = ((self._value & 0b00010000) >> 4) 
            self.TS_COLD_MASK          = ((self._value & 0b00001000) >> 3)
            self.TS_COOL_MASK          = ((self._value & 0b00000100) >> 2)
            self.TS_WARM_MASK          = ((self._value & 0b00000010) >> 1)
            self.TS_HOT_MASK           = ((self._value & 0b00000001) >> 0)
            self.VBATOTG_LOW_MASK_STRG  = self.get_VBATOTG_LOW_MASK_string()
            self.TS_COLD_MASK_STRG      = self.get_TS_COLD_MASK_string()
            self.TS_COOL_MASK_STRG      = self.get_TS_COOL_MASK_string()
            self.TS_WARM_MASK_STRG      = self.get_TS_WARM_MASK_string()
            self.TS_HOT_MASK_STRG       = self.get_TS_HOT_MASK_string()
        def get (self):
            '''
            return VBATOTG_LOW_MASK, TS_COLD_MASK, TS_COOL_MASK, TS_WARM_MASK, TS_HOT_MASK
            '''
            self._value = 0 | (self.VBATOTG_LOW_MASK << 4) | (self.TS_COLD_MASK << 3) | (self.TS_COOL_MASK << 2) | (self.TS_WARM_MASK << 1) | (self.TS_HOT_MASK << 0)
            return self._value, self.VBATOTG_LOW_MASK, self.TS_COLD_MASK, self.TS_COOL_MASK, self.TS_WARM_MASK, self.TS_HOT_MASK
        def get_VBATOTG_LOW_MASK(self):
            '''return VBATOTG_LOW_MASK'''
            return self.VBATOTG_LOW_MASK
        def get_TS_COLD_MASK(self):
            '''return TS_COLD_MASK'''
            return self.TS_COLD_MASK
        def get_TS_COOL_MASK(self):
            '''return TS_COOL_MASK'''
            return self.TS_COOL_MASK
        def get_TS_WARM_MASK(self):
            '''return TS_WARM_MASK'''
            return self.TS_WARM_MASK
        def get_TS_HOT_MASK(self):
            '''return TS_HOT_MASK'''
            return self.TS_HOT_MASK
        def get_VBATOTG_LOW_MASK_string(self):  
            '''
            Returns VBATOTG_LOW_MASK string
            0h = VBAT falling below the threshold to enable the OTG mode, does produce INT
            1h = VBAT falling below the threshold to enable the OTG mode, does NOT produce INT
            '''
            if self.VBATOTG_LOW_MASK == 0: return "VBAT falling below the threshold to enable the OTG mode, does produce INT"
            elif self.VBATOTG_LOW_MASK == 1: return "VBAT falling below the threshold to enable the OTG mode, does NOT produce INT"
            else: return "unknown"
        def get_TS_COLD_MASK_string(self):
            '''
            Returns TS_COLD_MASK string
            0h = TS across cold temperature (T1) does produce INT
            1h = TS across cold temperature (T1) does NOT produce INT
            '''
            if self.TS_COLD_MASK == 0: return "TS across cold temperature (T1) does produce INT"
            elif self.TS_COLD_MASK == 1: return "TS across cold temperature (T1) does NOT produce INT"
            else: return "unknown"
        def get_TS_COOL_MASK_string(self):
            '''
            Returns TS_COOL_MASK string
            0h = TS across cool temperature (T2) does produce INT
            1h = TS across cool temperature (T2) does NOT produce INT
            '''
            if self.TS_COOL_MASK == 0: return "TS across cool temperature (T2) does produce INT"
            elif self.TS_COOL_MASK == 1: return "TS across cool temperature (T2) does NOT produce INT"
            else: return "unknown"
        def get_TS_WARM_MASK_string(self):
            '''
            Returns TS_WARM_MASK string
            0h = TS across warm temperature (T3) does produce INT
            1h = TS across warm temperature (T3) does NOT produce INT
            '''
            if self.TS_WARM_MASK == 0: return "TS across warm temperature (T3) does produce INT"
            elif self.TS_WARM_MASK == 1: return "TS across warm temperature (T3) does NOT produce INT"
            else: return "unknown"
        def get_TS_HOT_MASK_string(self):
            '''
            Returns TS_HOT_MASK string
            0h = TS across hot temperature (T5) does produce INT
            1h = TS across hot temperature (T5) does NOT produce INT
            '''
            if self.TS_HOT_MASK == 0: return "TS across hot temperature (T5) does produce INT"
            elif self.TS_HOT_MASK == 1: return "TS across hot temperature (T5) does NOT produce INT"
            else: return "unknown"
        def set_VBATOTG_LOW_MASK(self, VBATOTG_LOW_MASK):
            '''
            Set VBATOTG_LOW_MASK (0h = VBAT falling below the threshold to enable the OTG mode, does produce INT, 1h = VBAT falling below the threshold to enable the OTG mode, does NOT produce INT) 
            '''
            self.VBATOTG_LOW_MASK = VBATOTG_LOW_MASK  
            self.get()
        def set_TS_COLD_MASK(self, TS_COLD_MASK):
            '''
            Set TS_COLD_MASK (0h = TS across cold temperature (T1) does produce INT, 1h = TS across cold temperature (T1) does NOT produce INT) 
            '''
            self.TS_COLD_MASK = TS_COLD_MASK  
            self.get()
        def set_TS_COOL_MASK(self, TS_COOL_MASK):
            '''
            Set TS_COOL_MASK (0h = TS across cool temperature (T2) does produce INT, 1h = TS across cool temperature (T2) does NOT produce INT) 
            '''
            self.TS_COOL_MASK = TS_COOL_MASK  
            self.get()
        def set_TS_WARM_MASK(self, TS_WARM_MASK):
            '''
            Set TS_WARM_MASK (0h = TS across warm temperature (T3) does produce INT, 1h = TS across warm temperature (T3) does NOT produce INT) 
            '''
            self.TS_WARM_MASK = TS_WARM_MASK  
            self.get()
        def set_TS_HOT_MASK(self, TS_HOT_MASK):
            '''
            Set TS_HOT_MASK (0h = TS across hot temperature (T5) does produce INT, 1h = TS across hot temperature (T5) does NOT produce INT) 
            '''
            self.TS_HOT_MASK = TS_HOT_MASK  
            self.get()
             
    class REG2C_FAULT_Mask_0(BQ25795_REGISTER):
        """
        BQ25795 - REG2C_FAULT_Mask_0
        ----------
        IBAT_REG_MASK
            IBAT regulation mask flag 
            Type : RW 
            POR: 0b 
            0h = enter or exit IBAT regulation does produce INT 
            1h = enter or exit IBAT regulation does NOT produce INT
        VBUS_OVP_MASK
            VBUS over-voltage mask flag 
            Type : RW 
            POR: 0b 
            0h = entering VBUS OVP does produce INT 
            1h = entering VBUS OVP does NOT produce INT 
        VBAT_OVP_MASK
            VBAT over-voltage mask flag
            Type : RW
            POR: 0b
            0h = entering VBAT OVP does produce INT
            1h = entering VBAT OVP does NOT produce INT   
        IBUS_OCP_MASK
            IBUS over-current mask flag 
            Type : RW 
            POR: 0b 
            0h = entering IBUS OCP does produce INT 
            1h = entering IBUS OCP does NOT produce INT
        IBAT_OCP_MASK
            IBAT over-current mask flag
            Type : RW
            POR: 0b
            0h = entering IBAT OCP does produce INT
            1h = entering IBAT OCP does NOT produce INT
        CONV_OCP_MASK
            Converter over-current mask flag 
            Type : RW 
            POR: 0b 
            0h = entering converter OCP does produce INT 
            1h = entering converter OCP does NOT produce INT
        VAC2_OVP_MASK
            VAC2 over-voltage mask flag
            Type : RW
            POR: 0b
            0h = entering VAC2 OVP does produce INT
            1h = entering VAC2 OVP does NOT produce INT
        VAC1_OVP_MASK
            VAC1 over-voltage mask flag
            Type : RW
            POR: 0b
            0h = entering VAC1 OVP does produce INT 
            1h = entering VAC1 OVP does NOT produce INT    
        """
        def __init__(self, addr=0x2c, value = 0):
            super().__init__(addr, value)
            self.IBAT_REG_MASK         = ((self._value & 0b10000000) >> 7)
            self.VBUS_OVP_MASK         = ((self._value & 0b01000000) >> 6)
            self.VBAT_OVP_MASK         = ((self._value & 0b00100000) >> 5)
            self.IBUS_OCP_MASK         = ((self._value & 0b00010000) >> 4)
            self.IBAT_OCP_MASK         = ((self._value & 0b00001000) >> 3)
            self.CONV_OCP_MASK         = ((self._value & 0b00000100) >> 2)
            self.VAC2_OVP_MASK         = ((self._value & 0b00000010) >> 1)
            self.VAC1_OVP_MASK         = ((self._value & 0b00000001) >> 0)
            self.IBAT_REG_MASK_STRG     = self.get_IBAT_REG_MASK_string()
            self.VBUS_OVP_MASK_STRG     = self.get_VBUS_OVP_MASK_string()
            self.VBAT_OVP_MASK_STRG     = self.get_VBAT_OVP_MASK_string()
            self.IBUS_OCP_MASK_STRG     = self.get_IBUS_OCP_MASK_string()
            self.IBAT_OCP_MASK_STRG     = self.get_IBAT_OCP_MASK_string()
            self.CONV_OCP_MASK_STRG     = self.get_CONV_OCP_MASK_string()
            self.VAC2_OVP_MASK_STRG     = self.get_VAC2_OVP_MASK_string()
            self.VAC1_OVP_MASK_STRG     = self.get_VAC1_OVP_MASK_string()
        def set (self, value):
            super().set(value)
            self.IBAT_REG_MASK         = ((self._value & 0b10000000) >> 7)
            self.VBUS_OVP_MASK         = ((self._value & 0b01000000) >> 6)
            self.VBAT_OVP_MASK         = ((self._value & 0b00100000) >> 5)
            self.IBUS_OCP_MASK         = ((self._value & 0b00010000) >> 4)
            self.IBAT_OCP_MASK         = ((self._value & 0b00001000) >> 3)
            self.CONV_OCP_MASK         = ((self._value & 0b00000100) >> 2)
            self.VAC2_OVP_MASK         = ((self._value & 0b00000010) >> 1)
            self.VAC1_OVP_MASK         = ((self._value & 0b00000001) >> 0)
            self.IBAT_REG_MASK_STRG     = self.get_IBAT_REG_MASK_string()
            self.VBUS_OVP_MASK_STRG     = self.get_VBUS_OVP_MASK_string()
            self.VBAT_OVP_MASK_STRG     = self.get_VBAT_OVP_MASK_string()
            self.IBUS_OCP_MASK_STRG     = self.get_IBUS_OCP_MASK_string()
            self.IBAT_OCP_MASK_STRG     = self.get_IBAT_OCP_MASK_string()
            self.CONV_OCP_MASK_STRG     = self.get_CONV_OCP_MASK_string()
            self.VAC2_OVP_MASK_STRG     = self.get_VAC2_OVP_MASK_string()
            self.VAC1_OVP_MASK_STRG     = self.get_VAC1_OVP_MASK_string()
        def get (self):
            '''
            return IBAT_REG_MASK, VBUS_OVP_MASK, VBAT_OVP_MASK, IBUS_OCP_MASK, IBAT_OCP_MASK, CONV_OCP_MASK, VAC2_OVP_MASK, VAC1_OVP_MASK
            '''
            self._value = 0 | (self.IBAT_REG_MASK << 7) | (self.VBUS_OVP_MASK << 6) | (self.VBAT_OVP_MASK << 5) | (self.IBUS_OCP_MASK << 4) | (self.IBAT_OCP_MASK << 3) | (self.CONV_OCP_MASK << 2) | (self.VAC2_OVP_MASK << 1) | (self.VAC1_OVP_MASK << 0)
            return self._value, self.IBAT_REG_MASK, self.VBUS_OVP_MASK, self.VBAT_OVP_MASK, self.IBUS_OCP_MASK, self.IBAT_OCP_MASK, self.CONV_OCP_MASK, self.VAC2_OVP_MASK, self.VAC1_OVP_MASK
        def get_IBAT_REG_MASK(self):
            '''return IBAT_REG_MASK'''
            return self.IBAT_REG_MASK
        def get_VBUS_OVP_MASK(self):
            '''return VBUS_OVP_MASK'''
            return self.VBUS_OVP_MASK
        def get_VBAT_OVP_MASK(self):
            '''return VBAT_OVP_MASK'''
            return self.VBAT_OVP_MASK
        def get_IBUS_OCP_MASK(self):
            '''return IBUS_OCP_MASK'''
            return self.IBUS_OCP_MASK
        def get_IBAT_OCP_MASK(self):
            '''return IBAT_OCP_MASK'''
            return self.IBAT_OCP_MASK
        def get_CONV_OCP_MASK(self):
            '''return CONV_OCP_MASK'''
            return self.CONV_OCP_MASK
        def get_VAC2_OVP_MASK(self):
            '''return VAC2_OVP_MASK'''
            return self.VAC2_OVP_MASK
        def get_VAC1_OVP_MASK(self):
            '''return VAC1_OVP_MASK'''
            return self.VAC1_OVP_MASK
        def get_IBAT_REG_MASK_string(self):
            '''
            Returns IBAT_REG_MASK string
            0h = enter or exit IBAT regulation does produce INT
            1h = enter or exit IBAT regulation does NOT produce INT
            '''
            if self.IBAT_REG_MASK == 0: return "enter or exit IBAT regulation does produce INT"
            elif self.IBAT_REG_MASK == 1: return "enter or exit IBAT regulation does NOT produce INT"
            else: return "unknown"
        def get_VBUS_OVP_MASK_string(self):
            '''
            Returns VBUS_OVP_MASK string
            0h = entering VBUS OVP does produce INT
            1h = entering VBUS OVP does NOT produce INT
            '''
            if self.VBUS_OVP_MASK == 0: return "entering VBUS OVP does produce INT"
            elif self.VBUS_OVP_MASK == 1: return "entering VBUS OVP does NOT produce INT"
            else: return "unknown"
        def get_VBAT_OVP_MASK_string(self):
            '''
            Returns VBAT_OVP_MASK string
            0h = entering VBAT OVP does produce INT
            1h = entering VBAT OVP does NOT produce INT
            '''
            if self.VBAT_OVP_MASK == 0: return "entering VBAT OVP does produce INT"
            elif self.VBAT_OVP_MASK == 1: return "entering VBAT OVP does NOT produce INT"
            else: return "unknown"
        def get_IBUS_OCP_MASK_string(self):
            '''
            Returns IBUS_OCP_MASK string
            0h = entering IBUS OCP does produce INT
            1h = entering IBUS OCP does NOT produce INT
            '''
            if self.IBUS_OCP_MASK == 0: return "entering IBUS OCP does produce INT"
            elif self.IBUS_OCP_MASK == 1: return "entering IBUS OCP does NOT produce INT"
            else: return "unknown"
        def get_IBAT_OCP_MASK_string(self):
            '''
            Returns IBAT_OCP_MASK string
            0h = entering IBAT OCP does produce INT
            1h = entering IBAT OCP does NOT produce INT
            '''
            if self.IBAT_OCP_MASK == 0: return "entering IBAT OCP does produce INT"
            elif self.IBAT_OCP_MASK == 1: return "entering IBAT OCP does NOT produce INT"
            else: return "unknown"
        def get_CONV_OCP_MASK_string(self):
            '''
            Returns CONV_OCP_MASK string
            0h = entering converter OCP does produce INT
            1h = entering converter OCP does NOT produce INT
            '''
            if self.CONV_OCP_MASK == 0: return "entering converter OCP does produce INT"
            elif self.CONV_OCP_MASK == 1: return "entering converter OCP does NOT produce INT"
            else: return "unknown"
        def get_VAC2_OVP_MASK_string(self):
            '''
            Returns VAC2_OVP_MASK string
            0h = entering VAC2 OVP does produce INT
            1h = entering VAC2 OVP does NOT produce INT
            '''
            if self.VAC2_OVP_MASK == 0: return "entering VAC2 OVP does produce INT"
            elif self.VAC2_OVP_MASK == 1: return "entering VAC2 OVP does NOT produce INT"
            else: return "unknown"
        def get_VAC1_OVP_MASK_string(self):
            '''
            Returns VAC1_OVP_MASK string
            0h = entering VAC1 OVP does produce INT
            1h = entering VAC1 OVP does NOT produce INT
            '''
            if self.VAC1_OVP_MASK == 0: return "entering VAC1 OVP does produce INT"
            elif self.VAC1_OVP_MASK == 1: return "entering VAC1 OVP does NOT produce INT"
            else: return "unknown"
    
    class REG2D_FAULT_Mask_1(BQ25795_REGISTER):
        """
        BQ25795 - REG2D_FAULT_Mask_1
        ----------
        VSYS_SHORT_MASK
            VSYS short circuit mask flag
            Type : RW
            POR: 0b
            0h = entering VSYS short circuit does produce INT
            1h = entering VSYS short circuit does NOT produce INT 
        VSYS_OVP_MASK
            VSYS over-voltage mask flag
            Type : RW
            POR: 0b
            0h = entering VSYS OVP does produce INT
            1h = entering VSYS OVP does NOT produce INT
        OTG_OVP_MASK
            OTG over-voltage mask flag
            Type : RW
            POR: 0b
            0h = OTG VBUS over-voltage fault does produce INT
            1h = OTG VBUS over-voltage fault does NOT produce INT
        OTG_UVP_MASK
            OTG under-voltage mask flag
            Type : RW
            POR: 0b
            0h = OTG VBUS under-voltage fault does produce INT
            1h = OTG VBUS under-voltage fault does NOT produce INT
        TSHUT_MASK
            Thermal shutdown mask flag
            Type : RW
            POR: 0b
            0h = entering thermal shutdown does produce INT
            1h = entering thermal shutdown does NOT produce INT             
        """
        def __init__(self, addr=0x2d, value = 0):
            super().__init__(addr, value)
            self.VSYS_SHORT_MASK       = ((self._value & 0b10000000) >> 7)
            self.VSYS_OVP_MASK         = ((self._value & 0b01000000) >> 6)
            self.OTG_OVP_MASK          = ((self._value & 0b00100000) >> 5)
            self.OTG_UVP_MASK          = ((self._value & 0b00010000) >> 4)
            self.TSHUT_MASK            = ((self._value & 0b00000100) >> 2)
        def set (self, value):
            super().set(value)
            self.VSYS_SHORT_MASK       = ((self._value & 0b10000000) >> 7)
            self.VSYS_OVP_MASK         = ((self._value & 0b01000000) >> 6)
            self.OTG_OVP_MASK          = ((self._value & 0b00100000) >> 5)
            self.OTG_UVP_MASK          = ((self._value & 0b00010000) >> 4)
            self.TSHUT_MASK            = ((self._value & 0b00000100) >> 2)
            self.VSYS_SHORT_MASK_STRG   = self.get_VSYS_SHORT_MASK_string()
            self.VSYS_OVP_MASK_STRG     = self.get_VSYS_OVP_MASK_string()
            self.OTG_OVP_MASK_STRG      = self.get_OTG_OVP_MASK_string()
            self.OTG_UVP_MASK_STRG      = self.get_OTG_UVP_MASK_string()
            self.TSHUT_MASK_STRG        = self.get_TSHUT_MASK_string()
        def get (self):
            '''
            return VSYS_SHORT_MASK, VSYS_OVP_MASK, OTG_OVP_MASK, OTG_UVP_MASK, TSHUT_MASK
            '''
            self._value = 0 | (self.VSYS_SHORT_MASK << 7) | (self.VSYS_OVP_MASK << 6) | (self.OTG_OVP_MASK << 5) | (self.OTG_UVP_MASK << 4) | (self.TSHUT_MASK << 2)
            return self._value, self.VSYS_SHORT_MASK, self.VSYS_OVP_MASK, self.OTG_OVP_MASK, self.OTG_UVP_MASK, self.TSHUT_MASK
        def get_VSYS_SHORT_MASK(self):
            '''return VSYS_SHORT_MASK'''
            return self.VSYS_SHORT_MASK
        def get_VSYS_OVP_MASK(self):
            '''return VSYS_OVP_MASK'''
            return self.VSYS_OVP_MASK
        def get_OTG_OVP_MASK(self):
            '''return OTG_OVP_MASK'''
            return self.OTG_OVP_MASK
        def get_OTG_UVP_MASK(self):
            '''return OTG_UVP_MASK'''
            return self.OTG_UVP_MASK
        def get_TSHUT_MASK(self):
            '''return TSHUT_MASK'''
            return self.TSHUT_MASK  
        def get_VSYS_SHORT_MASK_string(self):
            '''
            Returns VSYS_SHORT_MASK string
            0h = entering VSYS short circuit does produce INT
            1h = entering VSYS short circuit does NOT produce INT
            '''
            if self.VSYS_SHORT_MASK == 0: return "entering VSYS short circuit does produce INT"
            elif self.VSYS_SHORT_MASK == 1: return "entering VSYS short circuit does NOT produce INT"
            else: return "unknown"
        def get_VSYS_OVP_MASK_string(self):
            '''
            Returns VSYS_OVP_MASK string
            0h = entering VSYS OVP does produce INT
            1h = entering VSYS OVP does NOT produce INT
            '''
            if self.VSYS_OVP_MASK == 0: return "entering VSYS OVP does produce INT"
            elif self.VSYS_OVP_MASK == 1: return "entering VSYS OVP does NOT produce INT"
            else: return "unknown"
        def get_OTG_OVP_MASK_string(self):
            '''
            Returns OTG_OVP_MASK string
            0h = OTG VBUS over-voltage fault does produce INT
            1h = OTG VBUS over-voltage fault does NOT produce INT
            '''
            if self.OTG_OVP_MASK == 0: return "OTG VBUS over-voltage fault does produce INT"
            elif self.OTG_OVP_MASK == 1: return "OTG VBUS over-voltage fault does NOT produce INT"
            else: return "unknown"
        def get_OTG_UVP_MASK_string(self):
            '''
            Returns OTG_UVP_MASK string
            0h = OTG VBUS under-voltage fault does produce INT
            1h = OTG VBUS under-voltage fault does NOT produce INT
            '''
            if self.OTG_UVP_MASK == 0: return "OTG VBUS under-voltage fault does produce INT"
            elif self.OTG_UVP_MASK == 1: return "OTG VBUS under-voltage fault does NOT produce INT"
            else: return "unknown"
        def get_TSHUT_MASK_string(self):
            '''
            Returns TSHUT_MASK string
            0h = entering thermal shutdown does produce INT
            1h = entering thermal shutdown does NOT produce INT
            '''
            if self.TSHUT_MASK == 0: return "entering thermal shutdown does produce INT"
            elif self.TSHUT_MASK == 1: return "entering thermal shutdown does NOT produce INT"
            else: return "unknown"
            
                 
    
    class REG2E_ADC_Control(BQ25795_REGISTER):
        """
        BQ25795 - REG2E_ADC_Control
        ----------
        ADC_EN
            ADC Control 
            Type : RW POR: 0b 
            0h = Disable 
            1h = Enable
        ADC_RATE
            ADC conversion rate control 
            Type : RW POR: 0b 
            0h = Continuous conversion 
            1h = One shot conversion
        ADC_SAMPLE
            ADC sample speed 
            Type : RW POR: 11b 
            0h = 15 bit effective resolution 
            1h = 14 bit effective resolution 
            2h = 13 bit effective resolution 
            3h = 12 bit effective resolution (default - not recommended)
        ADC_AVG
            ADC average control 
            Type : RW POR: 0b 
            0h = Single value 
            1h = Running average
        ADC_AVG_INIT
            ADC average initial value control 
            Type : RW POR: 0b 
            0h = Start average using the existing register value 
            1h = Start average using a new ADC conversion
        """
        def __init__(self, addr=0x2e, value = 0):
            super().__init__(addr, value)
            self.ADC_EN             = ((self._value & 0b10000000) >> 7)
            self.ADC_RATE           = ((self._value & 0b01000000) >> 6)
            self.ADC_SAMPLE         = ((self._value & 0b00110000) >> 4)
            self.ADC_AVG            = ((self._value & 0b00001000) >> 3)
            self.ADC_AVG_INIT       = ((self._value & 0b00000100) >> 2)
        def set (self, value):
            super().set(value)
            self.ADC_EN             = ((self._value & 0b10000000) >> 7)
            self.ADC_RATE           = ((self._value & 0b01000000) >> 6)
            self.ADC_SAMPLE         = ((self._value & 0b00110000) >> 4)
            self.ADC_AVG            = ((self._value & 0b00001000) >> 3)
            self.ADC_AVG_INIT       = ((self._value & 0b00000100) >> 2)
        def get(self):
            self._value = (self.ADC_EN << 7) | (self.ADC_RATE << 6) | (self.ADC_SAMPLE << 4) | (self.ADC_AVG << 3) | (self.ADC_AVG_INIT << 2) | 0b00
            return self._value, self.ADC_EN, self.ADC_RATE, self.ADC_SAMPLE, self.ADC_AVG, self.ADC_AVG_INIT
        def get_ADC_EN(self):
            '''return ADC_EN'''
            return self.ADC_EN  
        def set_ADC_EN(self, ADC_EN):
            '''
            Set ADC_EN (0h = Disable, 1h = Enable) 
            '''
            self.ADC_EN = ADC_EN  
            self.get()
        def get_ADC_RATE(self):
            '''return ADC_RATE'''
            return self.ADC_RATE
        def set_ADC_RATE(self, ADC_RATE):
            '''
            Set ADC_RATE (0h = Continuous conversion, 1h = One shot conversion) 
            '''
            self.ADC_RATE = ADC_RATE  
            self.get()
        def get_ADC_SAMPLE(self):
            '''return ADC_SAMPLE'''
            return self.ADC_SAMPLE
        def set_ADC_SAMPLE(self, ADC_SAMPLE):
            '''
            Set ADC_SAMPLE (0h = 15 bit effective resolution, 1h = 14 bit effective resolution, 2h = 13 bit effective resolution, 3h = 12 bit effective resolution (default - not recommended)) 
            '''
            self.ADC_SAMPLE = ADC_SAMPLE  
            self.get()
        def get_ADC_AVG(self):
            '''return ADC_AVG'''
            return self.ADC_AVG
        def set_ADC_AVG(self, ADC_AVG):
            '''
            Set ADC_AVG (0h = Single value, 1h = Running average) 
            '''
            self.ADC_AVG = ADC_AVG  
            self.get()
        def get_ADC_AVG_INIT(self):
            '''return ADC_AVG_INIT'''
            return self.ADC_AVG_INIT    
        def set_ADC_AVG_INIT(self, ADC_AVG_INIT):
            '''
            Set ADC_AVG_INIT (0h = Start average using the existing register value, 1h = Start average using a new ADC conversion)
            '''
            self.ADC_AVG_INIT = ADC_AVG_INIT
            self.get()
        
    class REG2F_ADC_Function_Disable_0(BQ25795_REGISTER):
        """
        BQ25795 - REG2F_ADC_Function_Disable_0
        ----------
        IBUS_ADC_DIS
            IBUS ADC disable 
            Type : RW POR: 0b 
            0h = Enable IBUS ADC 
            1h = Disable IBUS ADC
        IBAT_ADC_DIS
            IBAT ADC disable 
            Type : RW POR: 0b 
            0h = Enable IBAT ADC 
            1h = Disable IBAT ADC
        VBUS_ADC_DIS
            VBUS ADC disable 
            Type : RW POR: 0b 
            0h = Enable VBUS ADC 
            1h = Disable VBUS ADC
        VBAT_ADC_DIS
            VBAT ADC disable 
            Type : RW POR: 0b 
            0h = Enable VBAT ADC 
            1h = Disable VBAT ADC
        VSYS_ADC_DIS
            VSYS ADC disable 
            Type : RW POR: 0b 
            0h = Enable VSYS ADC 
            1h = Disable VSYS ADC
        TS_ADC_DIS
            TS ADC disable 
            Type : RW POR: 0b 
            0h = Enable TS ADC 
            1h = Disable TS ADC
        TDIE_ADC_DIS
            TDIE ADC disable 
            Type : RW POR: 0b 
            0h = Enable TDIE ADC 
            1h = Disable TDIE ADC            
        """
        def __init__(self, addr=0x2f, value = 0):
            super().__init__(addr, value)
            
            self.IBUS_ADC_DIS         = ((self._value & 0b10000000) >> 7)
            self.IBAT_ADC_DIS         = ((self._value & 0b01000000) >> 6)
            self.VBUS_ADC_DIS         = ((self._value & 0b00100000) >> 5)
            self.VBAT_ADC_DIS         = ((self._value & 0b00010000) >> 4)
            self.VSYS_ADC_DIS         = ((self._value & 0b00001000) >> 3)
            self.TS_ADC_DIS           = ((self._value & 0b00000100) >> 2)
            self.TDIE_ADC_DIS         = ((self._value & 0b00000010) >> 1)
            self.IBUS_ADC_DIS_STRG     = self.get_IBUS_ADC_DIS_string()
            self.IBAT_ADC_DIS_STRG     = self.get_IBAT_ADC_DIS_string()
            self.VBUS_ADC_DIS_STRG     = self.get_VBUS_ADC_DIS_string()
            self.VBAT_ADC_DIS_STRG     = self.get_VBAT_ADC_DIS_string()
            self.VSYS_ADC_DIS_STRG     = self.get_VSYS_ADC_DIS_string()
            self.TS_ADC_DIS_STRG       = self.get_TS_ADC_DIS_string()
            self.TDIE_ADC_DIS_STRG     = self.get_TDIE_ADC_DIS_string()
        def set (self, value):
            super().set(value)
            self.IBUS_ADC_DIS         = ((self._value & 0b10000000) >> 7)
            self.IBAT_ADC_DIS         = ((self._value & 0b01000000) >> 6)
            self.VBUS_ADC_DIS         = ((self._value & 0b00100000) >> 5)
            self.VBAT_ADC_DIS         = ((self._value & 0b00010000) >> 4)
            self.VSYS_ADC_DIS         = ((self._value & 0b00001000) >> 3)
            self.TS_ADC_DIS           = ((self._value & 0b00000100) >> 2)
            self.TDIE_ADC_DIS         = ((self._value & 0b00000010) >> 1)
            self.IBUS_ADC_DIS_STRG     = self.get_IBUS_ADC_DIS_string()
            self.IBAT_ADC_DIS_STRG     = self.get_IBAT_ADC_DIS_string()
            self.VBUS_ADC_DIS_STRG     = self.get_VBUS_ADC_DIS_string()
            self.VBAT_ADC_DIS_STRG     = self.get_VBAT_ADC_DIS_string()
            self.VSYS_ADC_DIS_STRG     = self.get_VSYS_ADC_DIS_string()
            self.TS_ADC_DIS_STRG       = self.get_TS_ADC_DIS_string()
            self.TDIE_ADC_DIS_STRG     = self.get_TDIE_ADC_DIS_string()
        def get(self):
            '''
            return IBUS_ADC_DIS, IBAT_ADC_DIS, VBUS_ADC_DIS, VBAT_ADC_DIS, VSYS_ADC_DIS, TS_ADC_DIS, TDIE_ADC_DIS
            '''
            self._value = 0 | (self.IBUS_ADC_DIS << 7) | (self.IBAT_ADC_DIS << 6) | (self.VBUS_ADC_DIS << 5) | (self.VBAT_ADC_DIS << 4) | (self.VSYS_ADC_DIS << 3) | (self.TS_ADC_DIS << 2) | (self.TDIE_ADC_DIS << 1)
            return self._value, self.IBUS_ADC_DIS, self.IBAT_ADC_DIS, self.VBUS_ADC_DIS, self.VBAT_ADC_DIS, self.VSYS_ADC_DIS, self.TS_ADC_DIS, self.TDIE_ADC_DIS
        def get_IBUS_ADC_DIS(self):
            '''return IBUS_ADC_DIS'''
            return self.IBUS_ADC_DIS
        def set_IBUS_ADC_DIS(self, IBUS_ADC_DIS):
            '''
            Set IBUS_ADC_DIS (0h = Enable IBUS ADC, 1h = Disable IBUS ADC)
            '''
            self.IBUS_ADC_DIS = IBUS_ADC_DIS
            self.get()
        def get_IBAT_ADC_DIS(self):
            '''return IBAT_ADC_DIS'''
            return self.IBAT_ADC_DIS
        def set_IBAT_ADC_DIS(self, IBAT_ADC_DIS):
            ''' 
            Set IBAT_ADC_DIS (0h = Enable IBAT ADC, 1h = Disable IBAT ADC)
            '''
            self.IBAT_ADC_DIS = IBAT_ADC_DIS
            self.get()
        def get_VBUS_ADC_DIS(self):
            '''return VBUS_ADC_DIS'''
            return self.VBUS_ADC_DIS
        def set_VBUS_ADC_DIS(self, VBUS_ADC_DIS):
            '''
            Set VBUS_ADC_DIS (0h = Enable VBUS ADC, 1h = Disable VBUS ADC)
            '''
            self.VBUS_ADC_DIS = VBUS_ADC_DIS
            self.get()
        def get_VBAT_ADC_DIS(self):
            '''return VBAT_ADC_DIS'''
            return self.VBAT_ADC_DIS
        def set_VBAT_ADC_DIS(self, VBAT_ADC_DIS):
            '''
            Set VBAT_ADC_DIS (0h = Enable VBAT ADC, 1h = Disable VBAT ADC)
            '''
            self.VBAT_ADC_DIS = VBAT_ADC_DIS
            self.get()
        def get_VSYS_ADC_DIS(self):
            '''return VSYS_ADC_DIS'''
            return self.VSYS_ADC_DIS
        def set_VSYS_ADC_DIS(self, VSYS_ADC_DIS):
            '''
            Set VSYS_ADC_DIS (0h = Enable VSYS ADC, 1h = Disable VSYS ADC)
            '''
            self.VSYS_ADC_DIS = VSYS_ADC_DIS
            self.get()
        def get_TS_ADC_DIS(self):
            '''return TS_ADC_DIS'''
            return self.TS_ADC_DIS
        def set_TS_ADC_DIS(self, TS_ADC_DIS):
            '''
            Set TS_ADC_DIS (0h = Enable TS ADC, 1h = Disable TS ADC)
            '''
            self.TS_ADC_DIS = TS_ADC_DIS
            self.get()
        def get_TDIE_ADC_DIS(self):
            '''return TDIE_ADC_DIS'''
            return self.TDIE_ADC_DIS
        def set_TDIE_ADC_DIS(self, TDIE_ADC_DIS):
            '''
            Set TDIE_ADC_DIS (0h = Enable TDIE ADC, 1h = Disable TDIE ADC)
            '''
            self.TDIE_ADC_DIS = TDIE_ADC_DIS
            self.get()
        def get_IBUS_ADC_DIS_string(self):
            '''
            Returns IBUS_ADC_DIS string
            0h = Enable IBUS ADC
            1h = Disable IBUS ADC
            '''
            if self.IBUS_ADC_DIS == 0: return "Enable IBUS ADC"
            elif self.IBUS_ADC_DIS == 1: return "Disable IBUS ADC"
            else: return "unknown"
        def get_IBAT_ADC_DIS_string(self):
            '''
            Returns IBAT_ADC_DIS string
            0h = Enable IBAT ADC
            1h = Disable IBAT ADC
            '''
            if self.IBAT_ADC_DIS == 0: return "Enable IBAT ADC"
            elif self.IBAT_ADC_DIS == 1: return "Disable IBAT ADC"
            else: return "unknown"
        def get_VBUS_ADC_DIS_string(self):
            '''
            Returns VBUS_ADC_DIS string
            0h = Enable VBUS ADC
            1h = Disable VBUS ADC
            '''
            if self.VBUS_ADC_DIS == 0: return "Enable VBUS ADC"
            elif self.VBUS_ADC_DIS == 1: return "Disable VBUS ADC"
            else: return "unknown"
        def get_VBAT_ADC_DIS_string(self):
            '''
            Returns VBAT_ADC_DIS string
            0h = Enable VBAT ADC
            1h = Disable VBAT ADC
            '''
            if self.VBAT_ADC_DIS == 0: return "Enable VBAT ADC"
            elif self.VBAT_ADC_DIS == 1: return "Disable VBAT ADC"
            else: return "unknown"
        def get_VSYS_ADC_DIS_string(self):
            '''
            Returns VSYS_ADC_DIS string 
            0h = Enable VSYS ADC
            1h = Disable VSYS ADC
            ''' 
            if self.VSYS_ADC_DIS == 0: return "Enable VSYS ADC"
            elif self.VSYS_ADC_DIS == 1: return "Disable VSYS ADC"
            else: return "unknown"
        def get_TS_ADC_DIS_string(self):
            '''
            Returns TS_ADC_DIS string
            0h = Enable TS ADC
            1h = Disable TS ADC
            '''
            if self.TS_ADC_DIS == 0: return "Enable TS ADC"
            elif self.TS_ADC_DIS == 1: return "Disable TS ADC"
            else: return "unknown"
        def get_TDIE_ADC_DIS_string(self):
            '''
            Returns TDIE_ADC_DIS string
            0h = Enable TDIE ADC
            1h = Disable TDIE ADC
            '''
            if self.TDIE_ADC_DIS == 0: return "Enable TDIE ADC"
            elif self.TDIE_ADC_DIS == 1: return "Disable TDIE ADC"
            else: return "unknown"

            
            
    class REG30_ADC_Function_Disable_1(BQ25795_REGISTER):
        """
        BQ25795 - REG30_ADC_Function_Disable_1
        ----------
        DP_ADC_DIS
            D+ ADC Control 
            Type : RW 
            POR: 0b 
            0h = Enable (Default) 
            1h = Disable
        DM_ADC_DIS
            D- ADC Control 
            Type : RW 
            POR: 0b 
            0h = Enable (Default) 
            1h = Disable
        VAC2_ADC_DIS
            VAC2 ADC disable 
            Type : RW POR: 0b 
            0h = Enable VAC2 ADC 
            1h = Disable VAC2 ADC
        VAC1_ADC_DIS
            VAC1 ADC disable 
            Type : RW POR: 0b 
            0h = Enable VAC1 ADC 
            1h = Disable VAC1 ADC    
        """
        def __init__(self, addr=0x30, value = 0):
            super().__init__(addr, value)
            self.DP_ADC_DIS           = ((self._value & 0b10000000) >> 7)
            self.DM_ADC_DIS           = ((self._value & 0b01000000) >> 6)
            self.VAC2_ADC_DIS         = ((self._value & 0b00100000) >> 5)
            self.VAC1_ADC_DIS         = ((self._value & 0b00010000) >> 4)
            self.DP_ADC_DIS_STRG       = self.get_DP_ADC_DIS_string()
            self.DM_ADC_DIS_STRG       = self.get_DM_ADC_DIS_string()
            self.VAC2_ADC_DIS_STRG     = self.get_VAC2_ADC_DIS_string()
            self.VAC1_ADC_DIS_STRG     = self.get_VAC1_ADC_DIS_string()
        def get(self):
            '''
            return DP_ADC_DIS, DM_ADC_DIS, VAC2_ADC_DIS, VAC1_ADC_DIS
            '''
            self._value = 0 | (self.DP_ADC_DIS << 7) | (self.DM_ADC_DIS << 6) | (self.VAC2_ADC_DIS << 5) | (self.VAC1_ADC_DIS << 4)
            return self._value, self.DP_ADC_DIS, self.DM_ADC_DIS, self.VAC2_ADC_DIS, self.VAC1_ADC_DIS
        def set (self, value):
            super().set(value)
            self.DP_ADC_DIS           = ((self._value & 0b10000000) >> 7)
            self.DM_ADC_DIS           = ((self._value & 0b01000000) >> 6)
            self.VAC2_ADC_DIS         = ((self._value & 0b00100000) >> 5)
            self.VAC1_ADC_DIS         = ((self._value & 0b00010000) >> 4)
            self.DP_ADC_DIS_STRG       = self.get_DP_ADC_DIS_string()
            self.DM_ADC_DIS_STRG       = self.get_DM_ADC_DIS_string()
            self.VAC2_ADC_DIS_STRG     = self.get_VAC2_ADC_DIS_string()
            self.VAC1_ADC_DIS_STRG     = self.get_VAC1_ADC_DIS_string()
        def get_DP_ADC_DIS_string(self):
            '''
            Returns DP_ADC_DIS string
            0h = Enable (Default)
            1h = Disable
            '''
            if self.DP_ADC_DIS == 0: return "Enable (Default)"
            elif self.DP_ADC_DIS == 1: return "Disable"
            else: return "unknown"
        def get_DM_ADC_DIS_string(self):
            '''
            Returns DM_ADC_DIS string
            0h = Enable (Default)
            1h = Disable
            '''
            if self.DM_ADC_DIS == 0: return "Enable (Default)"
            elif self.DM_ADC_DIS == 1: return "Disable"
            else: return "unknown"
        def get_VAC2_ADC_DIS_string(self):
            '''
            Returns VAC2_ADC_DIS string
            0h = Enable VAC2 ADC
            1h = Disable VAC2 ADC
            '''
            if self.VAC2_ADC_DIS == 0: return "Enable VAC2 ADC"
            elif self.VAC2_ADC_DIS == 1: return "Disable VAC2 ADC"
            else: return "unknown"
        def get_VAC1_ADC_DIS_string(self):
            '''
            Returns VAC1_ADC_DIS string
            0h = Enable VAC1 ADC
            1h = Disable VAC1 ADC
            '''
            if self.VAC1_ADC_DIS == 0: return "Enable VAC1 ADC"
            elif self.VAC1_ADC_DIS == 1: return "Disable VAC1 ADC"
            else: return "unknown"
        def get_DP_ADC_DIS(self):
            '''return DP_ADC_DIS'''
            return self.DP_ADC_DIS
        def set_DP_ADC_DIS(self, DP_ADC_DIS):
            '''
            Set DP_ADC_DIS (0h = Enable, 1h = Disable)
            '''
            self.DP_ADC_DIS = DP_ADC_DIS
            self.get()
        def get_DM_ADC_DIS(self):
            '''return DM_ADC_DIS'''
            return self.DM_ADC_DIS
        def set_DM_ADC_DIS(self, DM_ADC_DIS):
            '''
            Set DM_ADC_DIS (0h = Enable, 1h = Disable)
            '''
            self.DM_ADC_DIS = DM_ADC_DIS
            self.get()
        def get_VAC2_ADC_DIS(self):
            '''return VAC2_ADC_DIS'''
            return self.VAC2_ADC_DIS
        def set_VAC2_ADC_DIS(self, VAC2_ADC_DIS):
            '''
            Set VAC2_ADC_DIS (0h = Enable VAC2 ADC, 1h = Disable VAC2 ADC)
            '''
            self.VAC2_ADC_DIS = VAC2_ADC_DIS
            self.get()
        def get_VAC1_ADC_DIS(self):
            '''return VAC1_ADC_DIS'''
            return self.VAC1_ADC_DIS
        def set_VAC1_ADC_DIS(self, VAC1_ADC_DIS):
            '''
            Set VAC1_ADC_DIS (0h = Enable VAC1 ADC, 1h = Disable VAC1 ADC)
            '''
            self.VAC1_ADC_DIS = VAC1_ADC_DIS
            self.get()

        
    class REG31_IBUS_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG31_IBUS_ADC
        ----------
            IBUS_ADC
                IBUS ADC reading Reported in 2 's Complement. 
                When the current is flowing from VBUS to PMID, IBUS ADC reports positive value, and when the current is flowing from PMID to VBUS, IBUS ADC reports negative value. 
                Type : R POR: 0mA (0h) 
                Range : 0mA-5000mA 
                Fixed Offset : 0mA 
                Bit Step Size : 1mA
        """
        def __init__(self, addr=0x31, value = 0):
            super().__init__(addr, value)
            self.IBUS_ADC             = super().twos_complement()
        def set (self, value):
            super().set(value)
            self.IBUS_ADC             = super().twos_complement()
        def get(self):
            return self._value, self.IBUS_ADC
        def get_Ibus(self):
            return self.IBUS_ADC
        def get_Ibus_mA(self):
            '''
            Returns IBUS_ADC in [mA]    
            '''
            return self.IBUS_ADC*1.0
        

        
    class REG33_IBAT_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG33_IBAT_ADC
        ----------
            IBAT_ADC
                IBAT ADC reading Reported in 2 's Complement. 
                The IBAT ADC reports positive value for the battery charging current, and negative value for the battery discharging current if EN_IBAT in REG0x14[5] = 1. 
                Type : R POR: 0mA (0h) 
                Range : 0mA-8000mA 
                Fixed Offset : 0mA 
                Bit Step Size : 1mA
        """
        def __init__(self, addr=0x33, value = 0):
            super().__init__(addr, value)
            self.IBAT_ADC             = super().twos_complement()
        def set (self, value):
            super().set(value)
            self.IBAT_ADC             = super().twos_complement()
        def get(self):
            return self._value, self.IBAT_ADC
        def get_Ibat(self):
            return self.IBAT_ADC
        def get_Ibat_mA(self):
            '''
            Returns IBAT_ADC in [mA] 
            '''
            return self.IBAT_ADC*1.0    
        
        
    class REG35_VBUS_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG35_VBUS_ADC
        ----------
            VBUS_ADC
                VBUS ADC reading 
                Type : R POR: 0mV (0h) 
                Range : 0mV-30000mV 
                Fixed Offset : 0mV Bit Step Size : 1mV
        """
        def __init__(self, addr=0x35, value = 0):
            super().__init__(addr, value)
            self.VBUS_ADC             = self._value
        def set (self, value):
            super().set(value)
            self.VBUS_ADC             = self._value
        def get(self):
            return self._value, self.VBUS_ADC  
        def get_Vbus(self):
            return self.VBUS_ADC  
          
    class REG37_VAC1_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG37_VAC1_ADC
        ----------
            VAC1_ADC
                VAC1 ADC reading. 
                Type : R POR: 0mV (0h) 
                Range : 0mV-30000mV 
                Fixed Offset : 0mV Bit Step Size : 1mV
        """
        def __init__(self, addr=0x37, value = 0):
            super().__init__(addr, value)
            self.VAC1_ADC             = self._value
        def set (self, value):
            super().set(value)
            self.VAC1_ADC             = self._value
        def get(self):
            return self._value, self.VAC1_ADC   
        def get_Vac1(self):
            return self.VAC1_ADC 
    
    class REG39_VAC2_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG39_VAC2_ADC
        ----------
            VAC2_ADC
                VAC2 ADC reading. 
                Type : R POR: 0mV (0h) 
                Range : 0mV-30000mV 
                Fixed Offset : 0mV Bit Step Size : 1mV
        """
        def __init__(self, addr=0x39, value = 0):
            super().__init__(addr, value)
            self.VAC2_ADC             = self._value
        def set (self, value):
            super().set(value)
            self.VAC2_ADC             = self._value
        def get(self):
            return self._value, self.VAC2_ADC
        def get_Vac2(self):
            return self.VAC2_ADC

    class REG3B_VBAT_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG3B_VBAT_ADC
        ----------
            VBAT_ADC
                The battery remote sensing voltage (VBATP-GND) ADC reading 
                Type : R POR: 0mV (0h) 
                Range : 0mV-20000mV 
                Fixed Offset : 0mV 
                Bit Step Size : 1mV
        """
        def __init__(self, addr=0x3B, value = 0):
            super().__init__(addr, value)
            self.VBAT_ADC             = self._value
        def set (self, value):
            super().set(value)
            self.VBAT_ADC             = self._value
        def get(self):
            return self._value, self.VBAT_ADC
        def get_Vbat(self):
            return self.VBAT_ADC
    
    class REG3D_VSYS_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG3D_VSYS_ADC
        ----------
            VSYS_ADC
                VSYS ADC reading Type : R POR: 0mV (0h) 
                Range : 0mV-24000mV 
                Fixed Offset : 0mV 
                Bit Step Size : 1mV
        """
        def __init__(self, addr=0x3D, value = 0):
            super().__init__(addr, value)
            self.VSYS_ADC             = self._value
        def set (self, value):
            super().set(value)
            self.VSYS_ADC             = self._value
        def get(self):
            return self._value, self.VSYS_ADC
        def get_Vsys(self):
            return self.VSYS_ADC

    class REG3F_TS_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG3F_TS_ADC
        ----------
            TS_ADC
                TS ADC reading 
                Type : R 
                POR: 0% (0h) 
                Range : 0%-99.9023% 
                Fixed Offset : 0% 
                Bit Step Size : 0.0976563%
        """
        def __init__(self, addr=0x3F, value = 0):
            super().__init__(addr, value)
            self.TS_ADC               = self._value
        def set (self, value):
            super().set(value)
            self.TS_ADC               = self._value
        def get(self):
            return self._value, self.TS_ADC
        def get_TS(self):
            '''
            Returns TS_ADC in %
            '''
            return self.TS_ADC * 0.0976563
    class REG41_TDIE_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG41_TDIE_ADC
        ----------
            TDIE_ADC
                TDIE ADC reading Reported in 2 's Complement. 
                Type : R POR: 0°C (0h) 
                Range : -40°C-150°C 
                Fixed Offset : 0°C 
                Bit Step Size : 0.5°C
        """
        def __init__(self, addr=0x41, value = 0):
            super().__init__(addr, value)
            self.TDIE_ADC             = super().twos_complement()
            self.TemperatureIC       = self.TDIE_ADC*0.5
        def set (self, value):
            super().set(value)
            self.TDIE_ADC             = super().twos_complement()
            self.TemperatureIC       = self.TDIE_ADC*0.5
        def get(self):
            return self._value, self.TDIE_ADC, self.TemperatureIC
        def get_IC_temperature(self):
            '''
            Get Temperature of BQ2595 IC in °C
            '''
            return self.TemperatureIC 
        def get_TDIE_ADC(self):
            '''
            Get TDIE_ADC value in °C
            '''
            return self.TDIE_ADC

    class REG43_DP_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG43_DP_ADC
        ----------
            DP_ADC
                D+ ADC reading 
                Type : R 
                POR: 0mV (0h) 
                Range : 0mV-3600mV 
                Fixed Offset : 0mV 
                Bit Step Size : 1mV
        """
        def __init__(self, addr=0x43, value = 0):
            super().__init__(addr, value)
            self.DP_ADC               = self._value
        def set (self, value):
            super().set(value)
            self.DP_ADC               = self._value
        def get(self):
            return self._value, self.DP_ADC
        def get_DP(self):
            '''
            Returns DP_ADC in [mV]
            '''
            return self.DP_ADC * 1.0
    
    class REG45_DM_ADC(BQ25795_REGISTER):
        """
        BQ25795 - REG45_DM_ADC
        ----------
            DM_ADC
                D- ADC reading 
                Type : R 
                POR: 0mV (0h) 
                Range : 0mV-3600mV 
                Fixed Offset : 0mV 
                Bit Step Size : 1mV
        """
        def __init__(self, addr=0x45, value = 0):
            super().__init__(addr, value)
            self.DM_ADC               = self._value
        def set (self, value):
            super().set(value)
            self.DM_ADC               = self._value
        def get(self):
            return self._value, self.DM_ADC
        def get_DM(self):
            '''
            Returns DM_ADC in [mV]
            '''
            return self.DM_ADC * 1.0
                
    class REG47_DPDM_Driver(BQ25795_REGISTER):
        """
        BQ25795 - REG47_DPDM_Driver
        ----------
            DPLUS_DAC
                D+ Output Driver 
                Type : RW 
                POR: 000b 
                0h = HIZ 
                1h = 0 
                2h = 0.6V 
                3h = 1.2V 
                4h = 2.0V 
                5h = 2.7V 
                6h = 3.3V 
                7h = D+/D- Short  
            DMINUS_DAC
                D- Output Driver 
                Type : RW 
                POR: 000b 
                0h = HIZ 
                1h = 0 
                2h = 0.6V 
                3h = 1.2V 
                4h = 2.0V 
                5h = 2.7V 
                6h = 3.3V 
                7h = reserved  
        """
        def __init__(self, addr=0x47, value = 0):
            super().__init__(addr, value)
            self.DPLUS_DAC            = ((self._value & 0b11100000) >> 5)
            self.DMINUS_DAC           = ((self._value & 0b00011100) >> 2) 
            self.DPLUS_DAC_STRG       = self.get_DPLUS_DAC_string()
            self.DMINUS_DAC_STRG      = self.get_DMINUS_DAC_string()  
        def set (self, value):
            super().set(value)
            self.DPLUS_DAC            = ((self._value & 0b11100000) >> 5)
            self.DMINUS_DAC           = ((self._value & 0b00011100) >> 2)
            self.DPLUS_DAC_STRG       = self.get_DPLUS_DAC_string()
            self.DMINUS_DAC_STRG      = self.get_DMINUS_DAC_string()  
        def get(self):
            """
            Returns the current register value and the D+ and D- driver values.
            """
            self._value = 0 | (self.DPLUS_DAC << 5) | (self.DMINUS_DAC << 2)
            return self._value, self.DPLUS_DAC, self.DMINUS_DAC
        def get_DPLUS_DAC_string(self):
            """
            Returns the D+ driver string based on the current value.
            """
            if self.DPLUS_DAC == 0: return "HIZ"
            elif self.DPLUS_DAC == 1: return "0V"
            elif self.DPLUS_DAC == 2: return "0.6V"
            elif self.DPLUS_DAC == 3: return "1.2V"
            elif self.DPLUS_DAC == 4: return "2.0V"
            elif self.DPLUS_DAC == 5: return "2.7V"
            elif self.DPLUS_DAC == 6: return "3.3V"
            elif self.DPLUS_DAC == 7: return "D+/D- Short"
            else: return "unknown"
        def get_DMINUS_DAC_string(self):
            """
            Returns the D- driver string based on the current value.
            """
            if self.DMINUS_DAC == 0: return "HIZ"
            elif self.DMINUS_DAC == 1: return "0V"
            elif self.DMINUS_DAC == 2: return "0.6V"
            elif self.DMINUS_DAC == 3: return "1.2V"
            elif self.DMINUS_DAC == 4: return "2.0V"
            elif self.DMINUS_DAC == 5: return "2.7V"
            elif self.DMINUS_DAC == 6: return "3.3V"
            elif self.DMINUS_DAC == 7: return "reserved"
            else: return "unknown"

    class REG48_Part_Information(BQ25795_REGISTER):
        """
        BQ25795 - REG48_Part_Information
        ----------
            PART_NUMBER
                Device Part number 
                POR: 001b = BQ25792 
                All the other options are reserved 
                Type : R
            PART_REVISION
                Device Revision 
                POR: 000b = BQ25792 
                Type : R
        """
        def __init__(self, addr=0x48, value = 0):
            super().__init__(addr, value)
            self.PART_NUMBER          = ((self._value & 0b00111000) >> 5)
            self.PART_REVISION        = ((self._value & 0b00000111) >> 0)
        def set (self, value):
            super().set(value)
            self.PART_NUMBER          = ((self._value & 0b00111000) >> 5)
            self.PART_REVISION        = ((self._value & 0b00000111) >> 0)
            self.PART_NUMBER_STRG     = self.get_PART_NUMBER_string()
            self.PART_REVISION_STRG   = self.get_PART_REVISION_string()
        def get(self):
            """
            Returns the current register value and the part number and revision.
            """
            self._value = 0 | (self.PART_NUMBER << 5) | (self.PART_REVISION << 0)
            return self._value, self.PART_NUMBER, self.PART_REVISION
        def get_PART_NUMBER_string(self):
            """
            Returns the part number string based on the current value.
            """
            if self.PART_NUMBER == 1: return "BQ25792"
            elif self.PART_NUMBER == 0: return "Reserved"
            elif self.PART_NUMBER == 2: return "Reserved"
            elif self.PART_NUMBER == 3: return "Reserved"
            elif self.PART_NUMBER == 4: return "Reserved"
            elif self.PART_NUMBER == 5: return "Reserved"
            elif self.PART_NUMBER == 6: return "Reserved"
            elif self.PART_NUMBER == 7: return "Reserved"
            else: return "unknown"
        def get_PART_REVISION_string(self):
            """
            Returns the part revision string based on the current value.
            """
            if self.PART_REVISION == 0: return "BQ25792"
            elif self.PART_REVISION == 1: return "Reserved"
            elif self.PART_REVISION == 2: return "Reserved"
            elif self.PART_REVISION == 3: return "Reserved"
            elif self.PART_REVISION == 4: return "Reserved"
            elif self.PART_REVISION == 5: return "Reserved"
            elif self.PART_REVISION == 6: return "Reserved"
            elif self.PART_REVISION == 7: return "Reserved"
            else: return "unknown"

            
    
        
    # class methods 
    

    def safe_execute(self, func, *args, **kwargs):
        """
        Executes a function safely, catching exceptions and handling errors.
        If `_exit_on_error` is True, the program will exit on error.
        """
        try:
            return func(*args, **kwargs)
        except Exception as e:
            #sys.stderr.write(f"Error in {func.__name__}: {str(e)}\n")
            logging.error(f"Error in {func.__name__}: {str(e)}")
            if self._exit_on_error:
                sys.exit(1)
            raise I2CError(f"Failed to execute {func.__name__}") from e

    def read_register(self, reg_addr, length=1):
        """
        Reads data from a register safely using the `safe_execute` method.
        """
        return self.safe_execute(self.bq.read_i2c_block_data, self.i2c_addr, reg_addr, length)

    def write_register(self, reg):
        """
        Writes a single-byte register value safely.
        """
        reg.get()
        self.safe_execute(self.bq.write_byte_data, self.i2c_addr, reg._addr, reg._value)

    def write_register_word(self, reg):
        """
        Writes a two-byte register value safely.
        """
        reg.get()
        self.safe_execute(self.bq.write_byte_data, self.i2c_addr, reg._addr, reg._value & 0xFF)
        self.safe_execute(self.bq.write_byte_data, self.i2c_addr, reg._addr + 1, (reg._value >> 8) & 0xFF)

    def read_all_register(self):
        """
        Reads all BQ25792 registers and updates the class attributes.
        """
        try:
            val = [0xFF] * 73
            val[0:31] = self.read_register(0x0, 32)
            val[32:63] = self.read_register(0x20, 32)
            val[64:72] = self.read_register(0x40, 9)
            self.registers = val
            # Update register values
            self.REG00_Minimal_System_Voltage.set(self.registers[self.REG00_Minimal_System_Voltage._addr])
            self.REG01_Charge_Voltage_Limit.set((self.registers[self.REG01_Charge_Voltage_Limit._addr] << 8) | (self.registers[self.REG01_Charge_Voltage_Limit._addr+1]))
            self.REG03_Charge_Current_Limit.set((self.registers[self.REG03_Charge_Current_Limit._addr] << 8) | (self.registers[self.REG03_Charge_Current_Limit._addr+1]))
            self.REG05_Input_Voltage_Limit.set(self.registers[self.REG05_Input_Voltage_Limit._addr])
            self.REG06_Input_Current_Limit.set((self.registers[self.REG06_Input_Current_Limit._addr] << 8) | (self.registers[self.REG06_Input_Current_Limit._addr+1]))
            self.REG08_Precharge_Control.set(self.registers[self.REG08_Precharge_Control._addr])
            self.REG09_Termination_Control.set(self.registers[self.REG09_Termination_Control._addr])
            self.REG0A_Recharge_Control.set(self.registers[self.REG0A_Recharge_Control._addr])
            self.REG0B_VOTG_regulation.set((self.registers[self.REG0B_VOTG_regulation._addr]<< 8) | (self.registers[self.REG0B_VOTG_regulation._addr+1]))  
            self.REG0D_IOTG_regulation.set(self.registers[self.REG0D_IOTG_regulation._addr])
            self.REG0E_Timer_Control.set(self.registers[self.REG0E_Timer_Control._addr])
            self.REG0F_Charger_Control_0.set(self.registers[self.REG0F_Charger_Control_0._addr])
            self.REG10_Charger_Control_1.set(self.registers[self.REG10_Charger_Control_1._addr])
            self.REG11_Charger_Control_2.set(self.registers[self.REG11_Charger_Control_2._addr])
            self.REG12_Charger_Control_3.set(self.registers[self.REG12_Charger_Control_3._addr])
            self.REG13_Charger_Control_4.set(self.registers[self.REG13_Charger_Control_4._addr])
            self.REG14_Charger_Control_5.set(self.registers[self.REG14_Charger_Control_5._addr])
            self.REG15_Reserved.set(self.registers[self.REG15_Reserved._addr])
            self.REG16_Temperature_Control.set(self.registers[self.REG16_Temperature_Control._addr])
            self.REG17_NTC_Control_0.set(self.registers[self.REG17_NTC_Control_0._addr])
            self.REG18_NTC_Control_1.set(self.registers[self.REG18_NTC_Control_1._addr])
            self.REG19_ICO_Current_Limit.set((self.registers[self.REG19_ICO_Current_Limit._addr] << 8) | (self.registers[self.REG19_ICO_Current_Limit._addr+1]))
            self.REG1B_Charger_Status_0.set(self.registers[self.REG1B_Charger_Status_0._addr])
            self.REG1C_Charger_Status_1.set(self.registers[self.REG1C_Charger_Status_1._addr])
            self.REG1D_Charger_Status_2.set(self.registers[self.REG1D_Charger_Status_2._addr])
            self.REG1E_Charger_Status_3.set(self.registers[self.REG1E_Charger_Status_3._addr])
            self.REG1F_Charger_Status_4.set(self.registers[self.REG1F_Charger_Status_4._addr])
            self.REG20_FAULT_Status_0.set(self.registers[self.REG20_FAULT_Status_0._addr])
            self.REG21_FAULT_Status_1.set(self.registers[self.REG21_FAULT_Status_1._addr])
            self.REG22_Charger_Flag_0.set(self.registers[self.REG22_Charger_Flag_0._addr])
            self.REG23_Charger_Flag_1.set(self.registers[self.REG23_Charger_Flag_1._addr])
            self.REG24_Charger_Flag_2.set(self.registers[self.REG24_Charger_Flag_2._addr])
            self.REG25_Charger_Flag_3.set(self.registers[self.REG25_Charger_Flag_3._addr])
            self.REG26_FAULT_Flag_0.set(self.registers[self.REG26_FAULT_Flag_0._addr])
            self.REG27_FAULT_Flag_1.set(self.registers[self.REG27_FAULT_Flag_1._addr])
            self.REG28_Charger_Mask_0.set(self.registers[self.REG28_Charger_Mask_0._addr])
            self.REG29_Charger_Mask_1.set(self.registers[self.REG29_Charger_Mask_1._addr])
            self.REG2A_Charger_Mask_2.set(self.registers[self.REG2A_Charger_Mask_2._addr])
            self.REG2B_Charger_Mask_3.set(self.registers[self.REG2B_Charger_Mask_3._addr])
            self.REG2C_FAULT_Mask_0.set(self.registers[self.REG2C_FAULT_Mask_0._addr])
            self.REG2D_FAULT_Mask_1.set(self.registers[self.REG2D_FAULT_Mask_1._addr])
            self.REG2E_ADC_Control.set(self.registers[self.REG2E_ADC_Control._addr])
            self.REG2F_ADC_Function_Disable_0.set(self.registers[self.REG2F_ADC_Function_Disable_0._addr])
            self.REG30_ADC_Function_Disable_1.set(self.registers[self.REG30_ADC_Function_Disable_1._addr])
            self.REG31_IBUS_ADC.set((self.registers[self.REG31_IBUS_ADC._addr] << 8) | (self.registers[self.REG31_IBUS_ADC._addr+1]))
            self.REG33_IBAT_ADC.set((self.registers[self.REG33_IBAT_ADC._addr] << 8) | (self.registers[self.REG33_IBAT_ADC._addr+1]))
            self.REG35_VBUS_ADC.set((self.registers[self.REG35_VBUS_ADC._addr] << 8) | (self.registers[self.REG35_VBUS_ADC._addr+1]))
            self.REG37_VAC1_ADC.set((self.registers[self.REG37_VAC1_ADC._addr] << 8) | (self.registers[self.REG37_VAC1_ADC._addr+1]))
            self.REG39_VAC2_ADC.set((self.registers[self.REG39_VAC2_ADC._addr] << 8) | (self.registers[self.REG39_VAC2_ADC._addr+1]))
            self.REG3B_VBAT_ADC.set((self.registers[self.REG3B_VBAT_ADC._addr] << 8) | (self.registers[self.REG3B_VBAT_ADC._addr+1]))
            self.REG3D_VSYS_ADC.set((self.registers[self.REG3D_VSYS_ADC._addr] << 8) | (self.registers[self.REG3D_VSYS_ADC._addr+1]))
            self.REG3F_TS_ADC.set((self.registers[self.REG3F_TS_ADC._addr] << 8) | (self.registers[self.REG3F_TS_ADC._addr+1]))
            self.REG41_TDIE_ADC.set((self.registers[self.REG41_TDIE_ADC._addr] << 8) | (self.registers[self.REG41_TDIE_ADC._addr+1]))
            self.REG43_DP_ADC.set((self.registers[self.REG43_DP_ADC._addr] << 8) | (self.registers[self.REG43_DP_ADC._addr+1]))
            self.REG45_DM_ADC.set((self.registers[self.REG45_DM_ADC._addr] << 8) | (self.registers[self.REG45_DM_ADC._addr+1]))
            self.REG47_DPDM_Driver.set(self.registers[self.REG47_DPDM_Driver._addr])
            self.REG48_Part_Information.set(self.registers[self.REG48_Part_Information._addr])
            return 0
        except I2CError:
            #ys.stderr.write("read_all_register failed.\n")
            logging.error("read_all_register failed.")
            return -1 

    def read_TDIE_Temp(self):
        """
        Reads the TDIE_ADC register and returns the IC temperature in degrees Celsius.
        If the read operation fails, it returns the last known value.
        """
        return self.REG41_TDIE_ADC.get_IC_temperature()

    def read_Vbat(self) -> int:
        """
        Reads the VBAT_ADC register and returns the battery voltage in mV.
        """
        return self.REG3B_VBAT_ADC.get_Vbat()


    def read_Vbus(self):
        """
        Reads the VBUS_ADC register and returns the bus voltage in mV.
        If the read operation fails, it returns the last known value.
        """
        return self.REG35_VBUS_ADC.get_Vbus()

    def read_Ibus(self):
        """
        Reads the IBUS_ADC register and returns the bus current in mA.
        The IBUS ADC reading is reported in 2's complement.
        If the read operation fails, it returns the last known value.
        """
        return self.REG31_IBUS_ADC.get_Ibus()

    def read_Ibat(self) -> int:
        """
        Reads the IBAT_ADC register and returns the battery current in mA.
        """
        return self.REG33_IBAT_ADC.get_Ibat()


    def read_InputCurrentLimit(self) -> int:
        """
        Reads the input current limit (ICO_ILIM) in mA.
        Returns the last known value if the read operation fails.
        """
        return self.REG19_ICO_Current_Limit.get_ICO_ILIM()
                  

    def read_ChargerStatus(self) -> str:
        """
        Reads the charger status and returns the charge status string.
        """
        return self.REG1C_Charger_Status_1.get_CHG_STAT_STRG()
    
    def soft_reset(self):
        """
        Performs a soft reset of the charger IC.
        """
        try:
            reg = self.REG09_Termination_Control
            reg.set_REG_RST(1)
            self.write_register(reg)
            time.sleep(0.1)
            reg = self.REG09_Termination_Control
            reg.set_REG_RST(0)
            self.write_register(reg)
            time.sleep(0.1)
            logging.info("soft_reset done.")
            return 0
        except I2CError:
            logging.error("soft_reset failed.")
            return -1

    def watchdog_reset(self):
        """
        Resets the watchdog timer of the charger IC.
        This is done by writing to the REG10_Charger_Control_1 register.
        """
        try:
            reg = self.REG10_Charger_Control_1
            reg.set_WD_RST(1)  # Reset watchdog
            self.write_register(reg)
            logging.info("watchdog_reset done.")
            return 0
        except I2CError:
            logging.error("watchdog_reset failed.")
            return -1
    
    def mask_all_INTERRUPTS(self):
        """
        Masks all interrupts by setting the mask registers to 0xFF.
        This is done by writing to the REG28_Charger_Mask_0, REG29_Charger_Mask_1, REG2A_Charger_Mask_2, REG2B_Charger_Mask_3, REG2C_FAULT_Mask_0, and REG2D_FAULT_Mask_1 registers.
        """
        try:
            self.REG28_Charger_Mask_0.set(0xFF)
            self.REG29_Charger_Mask_1.set(0xFF)
            self.REG2A_Charger_Mask_2.set(0xFF)
            self.REG2B_Charger_Mask_3.set(0xFF)
            self.REG2C_FAULT_Mask_0.set(0xFF)
            self.REG2D_FAULT_Mask_1.set(0xFF)
            self.write_register(self.REG28_Charger_Mask_0)
            self.write_register(self.REG29_Charger_Mask_1)
            self.write_register(self.REG2A_Charger_Mask_2)
            self.write_register(self.REG2B_Charger_Mask_3)
            self.write_register(self.REG2C_FAULT_Mask_0)
            self.write_register(self.REG2D_FAULT_Mask_1)
            logging.info("mask_all_INTERRUPTS done.")
            return 0
        except I2CError:
            logging.error("mask_all_INTERRUPTS failed.")
            return -1
    
    def write_defaults(self):
        '''
        Write default settings to the charger IC.   
        ''' 
        #Watchdog
        reg = self.REG10_Charger_Control_1
        reg.set_WATCHDOG(7) #160s watchdog
        reg.set_WD_RST(1) #reset watchdog    
        self.write_register(reg)

        # Thermal Regulation Threshold - a bit more conservative
        reg = self.REG16_Temperature_Control
        reg.set_TREG(0x2) #100°C
        reg.set_TSHUT(0x2) #120°C
        self.write_register(reg)

        reg = self.REG2E_ADC_Control
        reg.set_ADC_RATE(0) # Continuous conversion
        reg.set_ADC_EN(1) # Enable ADC
        reg.set_ADC_SAMPLE(0) # 15bit resolution
        reg.set_ADC_AVG(0) # running avg
        reg.set_ADC_AVG_INIT(0) # start average using the existing register value
        self.write_register(reg)

        reg = self.REG0F_Charger_Control_0
        reg.set_EN_CHG(1)   # Enable Charger
        reg.set_EN_TERM(1)  # Enable Charge Termination
        self.write_register(reg)

        reg = self.REG14_Charger_Control_5
        reg.set_EN_IBAT(1) # Enable the IBAT discharge current sensing for ADC
        reg.set_EN_EXTILIM(1) # Enable External ILIM_HIZ Input Current Limit pin input
        self.write_register(reg)
        
        
        self.set_input_current_limit(2200) # 2.2A input current limit

        self.mask_all_INTERRUPTS()  
        return

    def MuPiHAT_Default(self):
        ''' 
        Write MuPiHAT Default Settings to Charger IC
        '''
        self.soft_reset()
        self.read_all_register()
        self.write_defaults()
        return

    def get_IC_temperature(self):
        '''
        reads and return IC temperature of charger IC 
        '''
        self.read_all_register()
        return self.REG41_TDIE_ADC.get_IC_temperature()

    
    
    def read_VBAT_PRESENT(self):
        '''
        Read REG1D_Charger_Status_2 and return value VBAT_PRESENT_STAT
        Return Value
        ---------
          0h = VBAT NOT present 
          1h = VBAT present
        '''
        return self.REG1D_Charger_Status_2.get_VBAT_PRESENT_STAT()


    def set_input_current_limit(self, input_current_limit: int) -> None:
        """
        Sets the input current limit (IINDPM) in mA.
        The value is written to the REG06_Input_Current_Limit register.

        Parameters:
            input_current_limit (int): Desired input current limit in mA (10mA steps, range: 100mA-3300mA).

        Raises:
            ValueError: If the input current limit is out of the valid range.
            I2CError: If the I2C write operation fails.
        """
        try:
            # Validate the input current limit
            if input_current_limit < 100 or input_current_limit > 3300:
                raise ValueError("Input current limit must be between 100mA and 3300mA (inclusive).")

            # Align the input current limit to the nearest 10mA step
            input_current_limit = (input_current_limit // 10) * 10

            # Set the input current limit in the register
            reg = self.REG06_Input_Current_Limit
            reg.set_input_current_limit(input_current_limit)

            # Write the high and low bytes of the register value
            self.write_register_word(reg)

            logging.info(f"Input current limit set to {input_current_limit} mA.")
        except ValueError as ve:
            #sys.stderr.write(f"Invalid input current limit: {str(ve)}\n")
            logging.error(f"Invalid input current limit: {str(ve)}")
            if self._exit_on_error:
                sys.exit(1)
        except I2CError as ie:
            #sys.stderr.write(f"Failed to set input current limit: {str(ie)}\n")
            logging.error(f"Failed to set input current limit: {str(ie)}")
            if self._exit_on_error:
                sys.exit(1)

    
    def get_ibat(self) -> int:
        """
        Get the IBAT current in mA, reports positive value for the battery charging current, and negative value for the battery discharging current
        """
        return self.REG33_IBAT_ADC.IBAT_ADC
    
    def get_ibus(self) -> int:
        """
        Get the IBUS current in mA
        """
        return self.REG31_IBUS_ADC.IBUS_ADC
    
    def get_vbat(self) -> int:
        """
        Get the VBAT Battery Voltage  in mV
        """
        return self.REG3B_VBAT_ADC.VBAT_ADC
    def get_vbus(self) -> int:
        """
        Get the VBUS Bus Voltage  in mV
        """
        return self.REG35_VBUS_ADC.VBUS_ADC
    
    def bq25792_REG1C_Charger_Status_1(self, i2c_read=True):
        if i2c_read:
            self.read_all_register()
        val = self.registers[self.REG1C_Charger_Status_1]
        CHG_STAT = val >> 5
        if CHG_STAT == 0x0: ret = 'Not Charging'
        elif CHG_STAT == 0x01: ret = 'Trickle Charge'
        elif CHG_STAT == 0x02: ret = 'Pre-Charge'
        elif CHG_STAT == 0x03: ret = 'Fast-Charge'
        elif CHG_STAT == 0x04: ret = 'Taper-Charge'
        elif CHG_STAT == 0x05: ret = 'Reserved'
        elif CHG_STAT == 0x06: ret = 'Top-off Timer Active Charging'
        elif CHG_STAT == 0x07: ret = 'Charge Termination Done' 
        else: ret = CHG_STAT
        return val, ret 
    
    def bq25792_REG0F_Charger_Control_0(self, i2c_read=True):
        if i2c_read:
            self.read_all_register()
        val = self.registers[self.REG0F_Charger_Control_0]
        EN_AUTO_IBATDIS = ((val & 0b10000000) == 128)
        FORCE_IBATDIS   = ((val & 0b01000000) == 64)
        EN_CHG          = ((val & 0b00100000) == 32)
        EN_ICO          = ((val & 0b00010000) == 16)
        FORCE_ICO       = ((val & 0b00001000) == 8)
        EN_HIZ          = ((val & 0b00000100) == 4)
        EN_TERM         = ((val & 0b00000010) == 2)
        return val, EN_AUTO_IBATDIS, FORCE_IBATDIS, EN_CHG, EN_ICO, FORCE_ICO, EN_HIZ, EN_TERM

    def to_json(self):
        '''
        Returns json input
        
        Output Values
        ------

        'Charger_Status'
            Not Charging 
            Trickle Charge 
            Pre-charge 
            Fast charge (CC mode) 
            Taper Charge (CV mode) 
            Reserved 
            Top-off Timer Active Charging 
            Charge Termination Done
        'VBus'
            Bus Power (USB-C or from J2) in mV
        'Vbat'
            Battery Voltage in mV
        'Ibat'
            Battery Current in mA, reports positive value for the battery charging current, and negative value for the battery discharging current
        'IBus'
            Bus Current in mA
        'Temp'
            Temperature of Charger IC
        'BatteryConnected'
            0 = Battery not present 
            1 = Battery present
        'Bat_SOC'
            Estimated State-oF-Charge of Battery (based on VBat) and Battery Config File
        'Bat_Stat'
            Battery Status - Indication for Front-End, (OK, LOW, SHUTDOWN)
        'Bat_Type'
            Battery Type as read from Battery Config File
        'Input_Current_Limit'
            Input Current Limit obtained from ICO or ILIM_HIZ pin setting
        '''
        bat_SOC, bat_Stat = self.battery_soc()
        return {
            'Charger_Status': self.read_ChargerStatus(),
            'Vbat': self.read_Vbat(),
            'Vbus': self.read_Vbus(),
            'Ibat': self.read_Ibat(),
            'IBus': self.read_Ibus(),
            'Temp': self.read_TDIE_Temp(),
            'BatteryConnected' : self.read_VBAT_PRESENT(),
            'Bat_SOC' : bat_SOC,
            'Bat_Stat' : bat_Stat,
            'Bat_Type' : self.battery_conf['battery_type'],
            'Input_Current_Limit' : self.read_InputCurrentLimit()
        }
    
    def to_json_registers(self):
        """
        returns a JSON object containing all variables with their names and values
        from instances of BQ25795_REGISTER, as well as the content of battery_conf.
        """
        registers_data = {}

        # Iterate over all attributes of the bq25792 class
        for attr_name in dir(self):
            attr = getattr(self, attr_name)
            # Check if the attribute is an instance of BQ25795_REGISTER
            if isinstance(attr, self.BQ25795_REGISTER):
                # Collect all variables and their values from the instance
                register_values = {}
                for var_name, var_value in vars(attr).items():
                    if not var_name.startswith("_"):  # Skip private/internal variables
                        register_values[var_name] = var_value
                registers_data[attr_name] = register_values

        # Add battery_conf to the JSON output
        registers_data["battery_conf"] = self.battery_conf

        return registers_data
####
