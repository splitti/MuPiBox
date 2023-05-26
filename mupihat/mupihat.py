import smbus
import time
import calendar
from datetime import datetime  
bus = smbus.SMBus(1)
address = 0x6b

#BQ25792 Register
REG00_Minimal_System_Voltage = 0x0
REG01_Charge_Voltage_Limit = 0x1
REG03_Charge_Current_Limit = 0x4
REG05_Input_Voltage_Limit = 0x5
REG06_Input_Current_Limit = 0x6
REG08_Precharge_Control = 0x8
REG09_Termination_Control = 0x9
REG0A_Recharge_Control = 0xA	 
REG0B_VOTG_regulation = 0xB
REG0D_IOTG_regulation = 0xD
REG0E_Timer_Control = 0xE
REG0F_Charger_Control_0 = 0xF
REG10_Charger_Control_1 = 0x10
REG11_Charger_Control_2 = 0x11
REG12_Charger_Control_3 = 0x12
REG13_Charger_Control_4 = 0x13
REG14_Charger_Control_5 = 0x14
REG15_Reserved = 0x15
REG16_Temperature_Control = 0x16 
REG17_NTC_Control_0 = 0x17
REG18_NTC_Control_1 = 0x18
REG19_ICO_Current_Limit =0x19
REG1B_Charger_Status_0 = 0x1b
REG1C_Charger_Status_1 = 0x1c
REG1D_Charger_Status_2 = 0x1d
REG1E_Charger_Status_3 = 0x1e
REG1F_Charger_Status_4 = 0x1f
REG20_FAULT_Status_0  = 0x20
REG21_FAULT_Status_1  = 0x21
REG22_Charger_Flag_0  = 0x22
REG23_Charger_Flag_1  = 0x23
REG24_Charger_Flag_2  = 0x24
REG25_Charger_Flag_3  = 0x25
REG26_FAULT_Flag_0  = 0x26
REG27_FAULT_Flag_1  = 0x27
REG28_Charger_Mask_0  = 0x28
REG29_Charger_Mask_1  = 0x29
REG2A_Charger_Mask_2  = 0x2a
REG2B_Charger_Mask_3  = 0x2b
REG2C_FAULT_Mask_0   = 0x2c
REG2D_FAULT_Mask_1  = 0x2d
REG2E_ADC_Control = 0x2e
REG2F_ADC_Function_Disable_0 = 0x2f
REG30_ADC_Function_Disable_1 = 0x30
REG31_IBUS_ADC = 0x31
REG33_IBAT_ADC = 0x33
REG35_VBUS_ADC = 0x35
REG37_VAC1_ADC = 0x37
REG39_VAC2_ADC = 0x38
REG3B_VBAT_ADC = 0x3b
REG3D_VSYS_ADC = 0x3d
REG3F_TS_ADC = 0x3f
REG41_TDIE_ADC  = 0x41
REG43_Dp_ADC = 0x43
REG45_Dm_ADC = 0x45
REG47_DPDM_Driver = 0x47
REG48_Part_Information = 0x48

def write(REG, value):
        bus.write_byte_data(address, REG, value)
        return -1

def read(REG):
    val = bus.read_byte_data(address, REG)
    return val

def read16(REG):
    val_lsb = bus.read_byte_data(address, REG+1)
    val_msb = bus.read_byte_data(address, REG)
    val = (val_msb << 8) + val_lsb
    return val

def twosCom_binDec(bin, digit):
        while len(bin)<digit :
                bin = '0'+bin
        if bin[0] == '0':
                return int(bin, 2)
        else:
                return -1 * (int(''.join('1' if x == '0' else '0' for x in bin), 2) + 1)

'''
Minimal System Voltage:
During POR, the device reads the resistance tie to
PROG pin, to identify the default battery cell count and
determine the default power on VSYSMIN list below:
1s: 3.5V
2s: 7V
3s: 9V
4s: 12V
Type : RW
Range : 2500mV-16000mV
Fixed Offset : 2500mV
Bit Step Size : 250mV
'''
def bq25792_get_Minimal_System_Voltage():
    val = read(REG00_Minimal_System_Voltage) * 250 + 2500
    return val

#Charge Current Limit
#During POR, the device reads the resistance tie to
#PROG pin, to identify the default battery cell count
#and determine the default power-on battery charging
#current:
#1s and 2s:
#3s and 4s: 1A
#Type : RW
#Range : 50mA-5000mA
#Fixed Offset : 0mA
#Bit Step Size : 10mA
def bq25792_get_battery_charging_current():
    val = read(REG03_Charge_Current_Limit) * 10
    return val

#Battery Voltage Limit:
#During POR, the device reads the resistance tie to
#PROG pin, to identify the default battery cell count
#and determine the default power-on battery voltage
#regulation limit:
#1s: 4.2V
#2s: 8.4V
#3s: 12.6V
#4s: 16.8V
#Type : RW
#Range : 3000mV-18800mV
#Fixed Offset : 0mV
#Bit Step Size : 10mV
#Clamped Low
def bq25792_get_battery_voltage_limit():
    val = read16(REG01_Charge_Voltage_Limit) * 10
    return val


'''
Charge Status bits
Type : R
POR: 000b
0h = Not Charging
1h = Trickle Charge
2h = Pre-charge
3h = Fast charge (CC mode)
4h = Taper Charge (CV mode)
5h = Reserved
6h = Top-off Timer Active Charging
7h = Charge Termination Done
'''
def bq25792_get_charger_status_bits():
    val = read(REG1C_Charger_Status_1)
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

'''
Charger Control
'''
def bq25792_get_charger_control_0():
    val = read(REG0F_Charger_Control_0)
    EN_AUTO_IBATDIS = ((val & 0b10000000) == 128)
    FORCE_IBATDIS   = ((val & 0b01000000) == 64)
    EN_CHG          = ((val & 0b00100000) == 32)
    EN_ICO          = ((val & 0b00010000) == 16)
    FORCE_ICO       = ((val & 0b00001000) == 8)
    EN_HIZ          = ((val & 0b00000100) == 4)
    EN_TERM         = ((val & 0b00000010) == 2)
    return val, EN_AUTO_IBATDIS, FORCE_IBATDIS, EN_CHG, EN_ICO, FORCE_ICO, EN_HIZ, EN_TERM

''' NTC (Thermistor Control'''
def bq25792_get_NTC_Control_1():
    val = read(REG18_NTC_Control_1)
    TS_COOL     = (val & 0b11000000) >> 6
    TS_WARM     = (val & 0b00110000) >> 4
    BHOT        = (val & 0b00001100) >> 2
    BCOLD       = (val & 0b00000010) >> 1
    TS_IGNORE   = (val & 0b00000001)
    return val, TS_COOL, TS_WARM, BHOT, BCOLD, TS_IGNORE

def bq25792_set_NTC_Control_1(TS_COOL, TS_WARM, BHOT, BCOLD, TS_IGNORE):
    write_val = (TS_COOL << 6) | (TS_WARM << 4) | (BHOT << 2) | (BCOLD << 1) | TS_IGNORE
    return write(REG18_NTC_Control_1, write_val)

''' Part Information'''
def bq25792_get_Part_Information():
    val = read(REG48_Part_Information)
    return val

''' ADC for Monitoring'''
def bq25792_get_ADC_Control():
    val = read(REG2E_ADC_Control)
    ADC_EN      = (val & 0b10000000) >> 7
    ADC_RATE    = (val & 0b01000000) >> 6
    ADC_SAMPLE  = (val & 0b00110000) >> 4
    ADC_AVG     = (val & 0b00001000) >> 3
    ADC_AVG_INIT= (val & 0b00000100) >> 2
    return val, ADC_EN, ADC_RATE, ADC_SAMPLE, ADC_AVG, ADC_AVG_INIT

def bq25792_set_ADC_Control(ADC_EN, ADC_RATE, ADC_SAMPLE, ADC_AVG, ADC_AVG_INIT):
    write_val = (ADC_EN << 7) | (ADC_RATE << 6) | (ADC_SAMPLE << 4) | (ADC_AVG << 3) | (ADC_AVG_INIT << 2) | 0b00
    return write(REG2E_ADC_Control, write_val)

''' REG14_Charger_Control_5'''
def bq25792_get_REG14_Charger_Control_5():
    val = read(REG14_Charger_Control_5)
    SFET_PRESENT = ((val & 0b10000000) == 128)
    EN_IBAT      = ((val & 0b00100000) == 32)
    IBAT_REG     = ( val & 0b00011000) >> 3
    EN_IINDPM    = ((val & 0b00000100) == 4)
    EN_EXTILIM   = ((val & 0b00000010) == 2)
    EN_BATOC     = ((val & 0b00000001) == 1)
    return val, SFET_PRESENT, EN_IBAT, IBAT_REG, EN_IINDPM, EN_EXTILIM, EN_BATOC

def bq25792_set_REG14_Charger_Control_5(SFET_PRESENT, EN_IBAT, IBAT_REG, EN_IINDPM, EN_EXTILIM, EN_BATOC):
    write_val = (SFET_PRESENT << 7) | 0 | (EN_IBAT << 5) | (IBAT_REG << 3) | (EN_IINDPM << 2) | (EN_EXTILIM << 1) | EN_BATOC
    return write(REG14_Charger_Control_5, write_val)

def bq25792_get_VBAT():
    val = read16(REG3B_VBAT_ADC)
    return val

def bq25792_get_VBUS():
    val = read16(REG35_VBUS_ADC)
    return val

def bq25792_get_VSYS():
    val = read16(REG3D_VSYS_ADC)
    return val

def bq25792_get_IBAT():
    val = read16(REG33_IBAT_ADC)
    if (val >> 15) == 1:
        ret = (-1)*(65535 + 1 - val) #two's complement
    else:
        ret = val
    return  ret

def bq25792_get_IBUS():
    val = read16(REG31_IBUS_ADC)
    return val

while True:
    time_stamp = time.time()
    date_time = datetime.fromtimestamp(time_stamp)
    print("Timestamp: ", date_time)
    print ('*** BQ25792 - Status ***')
    print('Minimal System Voltage [mV]  = ' +  str(bq25792_get_Minimal_System_Voltage()))
    print('Battery Voltage Limit [mV]   = ' +  str(bq25792_get_battery_voltage_limit()))
    print('Charge Current Limit [mA]    = ' + str(bq25792_get_battery_charging_current()))
    val, CHG_STAT = bq25792_get_charger_status_bits()
    print('Charger Status (' + str(hex(val)) + ') = ' + str(CHG_STAT))
    val, EN_AUTO_IBATDIS, FORCE_IBATDIS, EN_CHG, EN_ICO, FORCE_ICO, EN_HIZ, EN_TERM = bq25792_get_charger_control_0()
    print ('*** BQ25792 - Charger Control (=' + str(hex(val)) + ')***')
    print('     EN_AUTO_IBATDIS = ' + str(EN_AUTO_IBATDIS))
    print('     FORCE_IBATDIS   = ' + str(FORCE_IBATDIS))
    print('     EN_CHGs         = ' + str(EN_CHG))
    print('     EN_ICO          = ' + str(EN_ICO))
    print('     FORCE_ICO       = ' + str(FORCE_ICO))
    print('     EN_HIZ          = ' + str(EN_HIZ))
    print('     EN_TERM         = ' + str(EN_TERM))
    val, TS_COOL, TS_WARM, BHOT, BCOLD, TS_IGNORE = bq25792_get_NTC_Control_1()
    print ('*** BQ25792 - NTC Control (=' + str(hex(val)) + ')***')
    print('     TS_COOL     = ' + str(TS_COOL))
    print('     TS_WARM     = ' + str(TS_WARM))
    print('     BHOT        = ' + str(BHOT))
    print('     BCOLD       = ' + str(BCOLD))
    print('     TS_IGNORE   = ' + str(TS_IGNORE))
    # Set Thermistor Ignore = 1
    #if TS_IGNORE == 0:
    #    TS_IGNORE = 1
    #    print('    Set TS_IGNORE to 1 ')
    #   bq25792_set_NTC_Control_1 (TS_COOL, TS_WARM, BHOT, BCOLD, TS_IGNORE)

    val, ADC_EN, ADC_RATE, ADC_SAMPLE, ADC_AVG, ADC_AVG_INIT = bq25792_get_ADC_Control()
    print ('*** BQ25792 - ADC Control (=' + str(hex(val)) + ')***')
    if ADC_EN == 0:
        ADC_EN = 1
        print('    Set ADC_EN to 1 ')
        bq25792_set_ADC_Control(ADC_EN, ADC_RATE, ADC_SAMPLE, ADC_AVG, ADC_AVG_INIT)
    print('Battery Voltage  [mV]     = ' +  str(bq25792_get_VBAT()))
    print('VBUS Voltage  [mV]        = ' +  str(bq25792_get_VBUS()))
    print('VSYS Voltage  [mV]        = ' +  str(bq25792_get_VSYS()))
    print('IBAT (Dis-)Charge [mA]    = ' +  str(bq25792_get_IBAT()))
    print('IBUS Current [mA]         = ' +  str(bq25792_get_IBUS()))

    val, SFET_PRESENT, EN_IBAT, IBAT_REG, EN_IINDPM, EN_EXTILIM, EN_BATOC = bq25792_get_REG14_Charger_Control_5()
    print ('*** BQ25792 - bq25792_get_REG14_Charger_Control_5 (=' + str(hex(val)) + ')***')
    if EN_IBAT == 0:
        EN_IBAT = 1
        print('    Set EN_IBAT to 1 ')
        bq25792_set_REG14_Charger_Control_5(SFET_PRESENT, EN_IBAT, IBAT_REG, EN_IINDPM, EN_EXTILIM, EN_BATOC)

    time.sleep(2)