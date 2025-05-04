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
__version__ = "0.2.0"
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
            self.REG00_Minimal_System_Voltage = self.REG00_Minimal_System_Voltage(0x0)
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
            self.REG12_Charger_Control_3 = 0x12
            self.REG13_Charger_Control_4 = self.REG13_Charger_Control_4()
            self.REG14_Charger_Control_5 = self.REG14_Charger_Control_5()
            self.REG15_Reserved = 0x15
            self.REG16_Temperature_Control = self.REG16_Temperature_Control()
            self.REG17_NTC_Control_0 = 0x17
            self.REG18_NTC_Control_1 = 0x18
            self.REG19_ICO_Current_Limit = self.REG19_ICO_Current_Limit()
            self.REG1B_Charger_Status_0 = 0x1b
            self.REG1C_Charger_Status_1 = self.REG1C_Charger_Status_1()
            self.REG1D_Charger_Status_2 = self.REG1D_Charger_Status_2()
            self.REG1E_Charger_Status_3 = 0x1e
            self.REG1F_Charger_Status_4 = 0x1f
            self.REG20_FAULT_Status_0  = 0x20
            self.REG21_FAULT_Status_1  = 0x21
            self.REG22_Charger_Flag_0  = 0x22
            self.REG23_Charger_Flag_1  = 0x23
            self.REG24_Charger_Flag_2  = 0x24
            self.REG25_Charger_Flag_3  = 0x25
            self.REG26_FAULT_Flag_0  = 0x26
            self.REG27_FAULT_Flag_1  = 0x27
            self.REG28_Charger_Mask_0  = 0x28
            self.REG29_Charger_Mask_1  = 0x29
            self.REG2A_Charger_Mask_2  = 0x2a
            self.REG2B_Charger_Mask_3  = 0x2b
            self.REG2C_FAULT_Mask_0   = 0x2c
            self.REG2D_FAULT_Mask_1  = 0x2d
            self.REG2E_ADC_Control = self.REG2E_ADC_Control()
            self.REG2F_ADC_Function_Disable_0 = 0x2f 
            self.REG30_ADC_Function_Disable_1 = 0x30
            self.REG31_IBUS_ADC = self.REG31_IBUS_ADC()
            self.REG33_IBAT_ADC = self.REG33_IBAT_ADC()
            self.REG35_VBUS_ADC = self.REG35_VBUS_ADC()
            self.REG37_VAC1_ADC = self.REG37_VAC1_ADC()
            self.REG39_VAC2_ADC = self.REG39_VAC2_ADC()
            self.REG3B_VBAT_ADC = self.REG3B_VBAT_ADC()
            self.REG3D_VSYS_ADC = self.REG3D_VSYS_ADC()
            self.REG3F_TS_ADC = 0x3f
            self.REG41_TDIE_ADC  = self.REG41_TDIE_ADC()
            self.REG43_Dp_ADC = 0x43
            self.REG45_Dm_ADC = 0x45
            self.REG47_DPDM_Driver = 0x47
            self.REG48_Part_Information = 0x48
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
        def __init__(self, addr, value=0):
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
        def set (self, value):
            super().set(value)
            self.TREG                   = ((self._value & 0b11000000) >> 6)
            self.TSHUT                  = ((self._value & 0b00110000) >> 4)
            self.VBUS_PD_EN             = ((self._value & 0b00001000) >> 3)
            self.VAC1_PD_EN             = ((self._value & 0b00000100) >> 2)
            self.VAC2_PD_EN             = ((self._value & 0b00000010) >> 1)
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
            return self._value, self.ICO_ILIM
        def get_ICO_ILIM (self):
            '''return Input Current Limit obtained from ICO or ILIM_HIZ pin setting in [mA]'''
            return self.ICO_ILIM*10
        
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
        def set (self, value):
            super().set(value)
            self.CHG_STAT           = ((self._value & 0b11100000) >> 5)
            self.VBUS_STAT          = ((self._value & 0b00011110) >> 1)
            self.CHG_STAT_STRG      = self.chg_stat_get_string(self.CHG_STAT)
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
        def set (self, value):
            super().set(value)
            self.ICO_STAT           = ((self._value & 0b11000000) >> 6)
            self.TREG_STAT          = ((self._value & 0b00000100) >> 2)
            self.DPDM_STAT          = ((self._value & 0b00000010) >> 1)
            self.VBAT_PRESENT_STAT  = ((self._value & 0b00000001) >> 0)
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

   

    def read_TDIE_Temp(self):
        """
        Reads the TDIE_ADC register and returns the IC temperature in degrees Celsius.
        If the read operation fails, it returns the last known value.
        """
        try:
            reg_addr = self.REG41_TDIE_ADC._addr
            data = self.safe_execute(self.bq.read_i2c_block_data, self.i2c_addr, reg_addr, 2)
            if data:
                self.REG41_TDIE_ADC.set((data[0] << 8) | data[1])
        except I2CError:
            #sys.stderr.write("read_TDIE_Temp failed, returning previous value.\n")
            logging.error("read_TDIE_Temp failed, returning previous value.")
        return self.REG41_TDIE_ADC.get_IC_temperature()

    def read_Vbat(self) -> int:
        """
        Reads the VBAT_ADC register and returns the battery voltage in mV.
        """
        try:
            reg_addr = self.REG3B_VBAT_ADC._addr
            data = self.read_register(reg_addr, length=2)
            self.REG3B_VBAT_ADC.set((data[0] << 8) | data[1])
        except I2CError:
            #sys.stderr.write("read_Vbat failed, returning previous value.\n")
            logging.error("read_Vbat failed, returning previous value.")
        return self.REG3B_VBAT_ADC.get_Vbat()


    def read_Vbus(self):
        """
        Reads the VBUS_ADC register and returns the bus voltage in mV.
        If the read operation fails, it returns the last known value.
        """
        try:
            reg_addr = self.REG35_VBUS_ADC._addr
            data = self.safe_execute(self.bq.read_i2c_block_data, self.i2c_addr, reg_addr, 2)
            if data:
                self.REG35_VBUS_ADC.set((data[0] << 8) | data[1])
        except I2CError:
            #sys.stderr.write("read_Vbus failed, returning previous value.\n")
            logging.error("read_Vbus failed, returning previous value.")
        return self.REG35_VBUS_ADC.get_Vbus()

    def read_Ibus(self):
        """
        Reads the IBUS_ADC register and returns the bus current in mA.
        The IBUS ADC reading is reported in 2's complement.
        If the read operation fails, it returns the last known value.
        """
        try:
            reg_addr = self.REG31_IBUS_ADC._addr
            data = self.safe_execute(self.bq.read_i2c_block_data, self.i2c_addr, reg_addr, 2)
            if data:
                self.REG31_IBUS_ADC.set((data[0] << 8) | data[1])
        except I2CError:
            #sys.stderr.write("read_Ibus failed, returning previous value.\n")
            logging.error("read_Ibus failed, returning previous value.")
        return self.REG31_IBUS_ADC.get_Ibus()

    def read_Ibat(self) -> int:
        """
        Reads the IBAT_ADC register and returns the battery current in mA.
        """
        try:
            reg_addr = self.REG33_IBAT_ADC._addr
            data = self.read_register(reg_addr, length=2)
            self.REG33_IBAT_ADC.set((data[0] << 8) | data[1])
        except I2CError:
            #sys.stderr.write("read_Ibat failed, returning previous value.\n")
            logging.error("read_Ibat failed, returning previous value.")
        return self.REG33_IBAT_ADC.get_Ibat()


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
            self.REG13_Charger_Control_4.set(self.registers[self.REG13_Charger_Control_4._addr])
            self.REG14_Charger_Control_5.set(self.registers[self.REG14_Charger_Control_5._addr])
            self.REG16_Temperature_Control.set(self.registers[self.REG16_Temperature_Control._addr])
            self.REG1C_Charger_Status_1.set(self.registers[self.REG1C_Charger_Status_1._addr])
            self.REG1D_Charger_Status_2.set(self.registers[self.REG1D_Charger_Status_2._addr])
            self.REG2E_ADC_Control.set(self.registers[self.REG2E_ADC_Control._addr])
            self.REG31_IBUS_ADC.set((self.registers[self.REG31_IBUS_ADC._addr] << 8) | (self.registers[self.REG31_IBUS_ADC._addr+1]))
            self.REG33_IBAT_ADC.set((self.registers[self.REG33_IBAT_ADC._addr] << 8) | (self.registers[self.REG33_IBAT_ADC._addr+1]))
            self.REG35_VBUS_ADC.set((self.registers[self.REG35_VBUS_ADC._addr] << 8) | (self.registers[self.REG35_VBUS_ADC._addr+1]))
            self.REG37_VAC1_ADC.set((self.registers[self.REG37_VAC1_ADC._addr] << 8) | (self.registers[self.REG37_VAC1_ADC._addr+1]))
            self.REG39_VAC2_ADC.set((self.registers[self.REG39_VAC2_ADC._addr] << 8) | (self.registers[self.REG39_VAC2_ADC._addr+1]))
            self.REG3B_VBAT_ADC.set((self.registers[self.REG3B_VBAT_ADC._addr] << 8) | (self.registers[self.REG3B_VBAT_ADC._addr+1]))
            self.REG3D_VSYS_ADC.set((self.registers[self.REG3D_VSYS_ADC._addr] << 8) | (self.registers[self.REG3D_VSYS_ADC._addr+1]))
            self.REG41_TDIE_ADC.set((self.registers[self.REG41_TDIE_ADC._addr] << 8) | (self.registers[self.REG41_TDIE_ADC._addr+1]))
            return 0
        except I2CError:
            #ys.stderr.write("read_all_register failed.\n")
            logging.error("read_all_register failed.")
            return -1

    def read_InputCurrentLimit(self) -> int:
        """
        Reads the input current limit (ICO_ILIM) in mA.
        Returns the last known value if the read operation fails.
        """
        try:
            reg_addr = self.REG19_ICO_Current_Limit._addr
            data = self.read_register(reg_addr, length=2)
            self.REG19_ICO_Current_Limit.set((data[0] << 8) | data[1])
        except I2CError:
            #sys.stderr.write("read_InputCurrentLimit failed, returning previous value.\n")
            logging.error("read_InputCurrentLimit failed, returning previous value.")

        return self.REG19_ICO_Current_Limit.get_ICO_ILIM()
                  

    def read_ChargerStatus(self) -> str:
        """
        Reads the charger status and returns the charge status string.
        """
        try:
            reg_addr = self.REG1C_Charger_Status_1._addr
            data = self.read_register(reg_addr, length=1)
            self.REG1C_Charger_Status_1.set(data[0])
        except I2CError:
            #sys.stderr.write("read_ChargerStatus failed, returning previous value.\n")
            logging.error("read_ChargerStatus failed, returning previous value.")
        return self.REG1C_Charger_Status_1.CHG_STAT_STRG
    
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
        try:
            #self.read_all_register()
            # first read register
            reg_addr = self.REG1D_Charger_Status_2._addr 
            val = self.bq.read_byte_data(self.i2c_addr, reg_addr)
            self.registers[reg_addr] = val
            self.REG1D_Charger_Status_2.set((self.registers[reg_addr]))
            value, ICO_STAT, TREG_STAT, DPDM_STAT, VBAT_PRESENT_STAT = self.REG1D_Charger_Status_2.get()
            return VBAT_PRESENT_STAT
        except Exception as _error:
            #sys.stderr.write('read_VBAT_PRESENT failed, %s\n' % str(_error))
            logging.error('read_VBAT_PRESENT failed, %s\n' % str(_error))
            if self._exit_on_error: sys.exit(1)
            value, ICO_STAT, TREG_STAT, DPDM_STAT, VBAT_PRESENT_STAT = self.REG1D_Charger_Status_2.get()
            return VBAT_PRESENT_STAT
        finally:
            pass


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
        #self.read_all_register()
        self.write_defaults()

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
