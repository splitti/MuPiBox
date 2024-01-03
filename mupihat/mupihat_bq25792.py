#!/usr/bin/python3 
import smbus2
import sys
import time

class bq25792:
    """ 
    Summary
    ----------
      A class for accessing BQ25792 charger IC 
    
    Usage: 
    ----------
        TODO

    Attributes
    ----------
    i2c_device : int (default: 1)
         see number in /dev/i2c-X
    i2c_addr : int (default: 0x6b)
        i2c adresss of BQ25792
    busWS_ms : int (default: 10)
        sleep time after i2c access in [ms]

    Methods
    -------
    TODO
        
    """
     # constructor method
    def __init__(self, i2c_device=1, i2c_addr=0x6b, busWS_ms=10):
        try:
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
            self.REG0B_VOTG_regulation = 0xB
            self.REG0D_IOTG_regulation = 0xD
            self.REG0E_Timer_Control = 0xE
            self.REG0F_Charger_Control_0 = self.REG0F_Charger_Control_0()
            self.REG10_Charger_Control_1 = 0x10
            self.REG11_Charger_Control_2 = 0x11
            self.REG12_Charger_Control_3 = 0x12
            self.REG13_Charger_Control_4 = 0x13
            self.REG14_Charger_Control_5 = 0x14
            self.REG15_Reserved = 0x15
            self.REG16_Temperature_Control = 0x16 
            self.REG17_NTC_Control_0 = 0x17
            self.REG18_NTC_Control_1 = 0x18
            self.REG19_ICO_Current_Limit =0x19
            self.REG1B_Charger_Status_0 = 0x1b
            self.REG1C_Charger_Status_1 = 0x1c
            self.REG1D_Charger_Status_2 = 0x1d
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
            self.REG2E_ADC_Control = 0x2e
            self.REG2F_ADC_Function_Disable_0 = 0x2f
            self.REG30_ADC_Function_Disable_1 = 0x30
            self.REG31_IBUS_ADC = 0x31
            self.REG33_IBAT_ADC = 0x33
            self.REG35_VBUS_ADC = 0x35
            self.REG37_VAC1_ADC = 0x37
            self.REG39_VAC2_ADC = 0x38
            self.REG3B_VBAT_ADC = 0x3b
            self.REG3D_VSYS_ADC = 0x3d
            self.REG3F_TS_ADC = 0x3f
            self.REG41_TDIE_ADC  = 0x41
            self.REG43_Dp_ADC = 0x43
            self.REG45_Dm_ADC = 0x45
            self.REG47_DPDM_Driver = 0x47
            self.REG48_Part_Information = 0x48
            # handle to bus
            self.bq = smbus2.SMBus(i2c_device)
        except Exception as _error:
            sys.stderr.write('%s\n' % str(_error))
            sys.exit(1)
        finally:
            pass

    # BQ25795 Register
    class BQ25795_REGISTER:
        def __init__(self, addr, value=0):
            self._addr = addr
            self._value = value
        def set (self, value):
            self._value = value

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

    class REG01_Charge_Voltage_Limit:
        # Battery Voltage Limit: During POR, the device reads the resistance tie to PROG pin, to identify the default battery cell count and determine the default power-on battery voltage regulation limit: 1s: 4.2V 2s: 8.4V 3s: 12.6V 4s: 16.8V Type : RW Range : 3000mV-18800mV Fixed Offset : 0mV Bit Step Size : 10mV
        def __init__(self, value = 0):
            self._addr = 0x1
            self._value = value
            self.VREG = self._value * 10
        def set (self, value):
            self._value = value
            self.VREG = self._value * 10

    class REG03_Charge_Current_Limit:
        #Charge Current Limit During POR, the device reads the resistance tie to PROG pin, to identify the default battery cell count and determine the default power-on battery charging current: 1s and 2s: 3s and 4s: 1A Type : RW Range : 50mA-5000mA Fixed Offset : 0mA Bit Step Size : 10mA
        def __init__(self, value = 0):
            self._addr = 0x3
            self._value = value
            self.ICHG = self._value * 10
        def set (self, value):
            self._value = value
            self.ICHG = self._value * 10

    class REG05_Input_Voltage_Limit:
        #Absolute VINDPM Threshold VINDPM register is reset to 3600mV upon adapter unplugged and it is set to the value based on the VBUS measurement when the adapter plugs in. It is not reset by the REG_RST and the WATCHDOG Type : RW POR: 3600mV (24h) Range : 3600mV-22000mV Fixed Offset : 0mV Bit Step Size : 100mV
        def __init__(self, value = 0):
            self._addr = 0x5
            self._value = value
            self.VINDPM = self._value * 100
        def set (self, value):
            self._value = value
            self.VINDPM = self._value * 100
    class REG06_Input_Current_Limit:
        #Based on D+/D- detection results: USB SDP = 500mA USB CDP = 1.5A USB DCP = 3.25A Adjustable High Voltage DCP = 1.5A Unknown Adapter = 3A Non-Standard Adapter = 1A/2A/2.1A/2.4A Type : RW POR: 3000mA (12Ch) Range : 100mA-3300mA Fixed Offset : 0mA Bit Step Size : 10mA
        def __init__(self, value = 0):
            self._addr = 0x6
            self._value = value
            self.IINDPM = self._value * 10
        def set (self, value):
            self._value = value
            self.IINDPM = self._value * 10

    class REG08_Precharge_Control:
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
    
    class REG09_Termination_Control:
        # REG_RST: Reset registers to default values and reset timer Type : RW POR: 0b 0h = Not reset 1h = Reset
        # ITERM: Termination current Type : RW POR: 200mA (5h) Range : 40mA-1000mA Fixed Offset : 0mA Bit Step Size : 40mA
        def __init__(self, value = 0):
            self._addr = 0x9
            self._value = value
            self.REG_RST = ((self._value & 0b01000000) >> 6)
            self.ITERM   = (self._value & 0b00011111) * 40
        def set (self, value):
            self._value = value
            self.REG_RST = ((self._value & 0b01000000) >> 6)
            self.ITERM   = (self._value & 0b00011111) * 40

    class REG0A_Recharge_Control:
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
        def __init__(self, addr=0xf, value = 0):
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


    # class methods
    def read_all_register(self):
        try:
            val = [0xFF]*73
            val[0:31] = self.bq.read_i2c_block_data(self.i2c_addr, 0x0, 32)
            time.sleep(self.busWS_ms/1000)
            val[32:63] = self.bq.read_i2c_block_data(self.i2c_addr, 0x20, 32)
            time.sleep(self.busWS_ms/1000)
            val[64:72] = self.bq.read_i2c_block_data(self.i2c_addr, 0x40, 9)
            time.sleep(self.busWS_ms/1000)
            self.registers = val
            self.REG00_Minimal_System_Voltage.set(self.registers[self.REG00_Minimal_System_Voltage._addr])
            self.REG01_Charge_Voltage_Limit.set((self.registers[self.REG01_Charge_Voltage_Limit._addr] << 8) | (self.registers[self.REG01_Charge_Voltage_Limit._addr+1]))
            self.REG03_Charge_Current_Limit.set((self.registers[self.REG03_Charge_Current_Limit._addr] << 8) | (self.registers[self.REG03_Charge_Current_Limit._addr+1]))
            self.REG05_Input_Voltage_Limit.set(self.registers[self.REG05_Input_Voltage_Limit._addr])
            self.REG06_Input_Current_Limit.set((self.registers[self.REG06_Input_Current_Limit._addr] << 8) | (self.registers[self.REG06_Input_Current_Limit._addr+1]))
            self.REG08_Precharge_Control.set(self.registers[self.REG08_Precharge_Control._addr])
            self.REG09_Termination_Control.set(self.registers[self.REG09_Termination_Control._addr])
            self.REG0A_Recharge_Control.set(self.registers[self.REG0A_Recharge_Control._addr])
            self.REG0F_Charger_Control_0.set(self.registers[self.REG0F_Charger_Control_0._addr])
        except Exception as _error:
            sys.stderr.write('%s\n' % str(_error))
            sys.exit(1)
        finally:
            pass

    def write_register(self, reg):
        try:
            self.bq.write_byte_data(self.i2c_addr, reg._addr, reg._value)
            time.sleep(self.busWS_ms/1000)
            pass
        except Exception as _error:
            sys.stderr.write('%s\n' % str(_error))
            sys.exit(1)
        finally:
            pass

    def twosCom_binDec(bin, digit):
        while len(bin)<digit :
                bin = '0'+bin
        if bin[0] == '0':
                return int(bin, 2)
        else:
                return -1 * (int(''.join('1' if x == '0' else '0' for x in bin), 2) + 1)
        
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
####
    
"""
Test the class
"""

# create instance of bq25792 class
hat = bq25792()

###
# read all register and print some
hat.read_all_register()
print (hat.registers)
print ("hat.REG00_Minimal_System_Voltage.VSYSMIN:   ",hat.REG00_Minimal_System_Voltage.VSYSMIN)
print ("hat.REG01_Charge_Voltage_Limit.VREG:        ",hat.REG01_Charge_Voltage_Limit.VREG)
print ("hat.REG03_Charge_Current_Limit.ICHG:        ",hat.REG03_Charge_Current_Limit.ICHG)
print ("hat.REG05_Input_Voltage_Limit.VINDPM:       ",hat.REG05_Input_Voltage_Limit.VINDPM)
print ("hat.REG06_Input_Current_Limit.IINDPM:       ",hat.REG06_Input_Current_Limit.IINDPM)
print ("hat.REG08_Precharge_Control.VBAT_LOWV:      ",hat.REG08_Precharge_Control.VBAT_LOWV)
print ("hat.REG08_Precharge_Control.IPRECHG:        ",hat.REG08_Precharge_Control.IPRECHG)
print ("hat.REG09_Termination_Control.ITERM:        ",hat.REG09_Termination_Control.ITERM)
print ("hat.REG0F_Charger_Control_0:                ",hat.REG0F_Charger_Control_0.get())

###
# write a register
# create instance of register you want to access
reg = hat.REG0F_Charger_Control_0
# modify bits or parameter
reg.EN_CHG = 0
# call get() to update register value in register instance
reg.get()

# write register to i2c by passing register instance to write_register function
hat.write_register(reg)

# check if it worked
hat.read_all_register()
print ("hat.REG0F_Charger_Control_0:                ",hat.REG0F_Charger_Control_0.get())

# modify bits or parameter and to the same again
reg.EN_CHG = 1
reg.get()
hat.write_register(reg)
hat.read_all_register()
print ("hat.REG0F_Charger_Control_0:                ",hat.REG0F_Charger_Control_0.get())




