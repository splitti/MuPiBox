#!/usr/bin/python3
"""\
This script controls the power led.
"""

__author__ = "Olaf Splitt"
__license__ = "GPLv3"
__version__ = "1.0.1"
__email__ = "splitti@mupibox.de"
__status__ = "dev"


import os
import signal
import sys
import json
from time import sleep
from gpiozero import PWMLED

DEFAULT_PWM_FREQUENCY = 1000


def read_json():
    try:
        with open(JSON_DATA_FILE) as file:
            rc = file.read()   # read first time
        rc = json.loads(rc)
    except:
        rc = "skip"
    return rc

def led_control(start, end, sleep_time):
    if start < end:
        cnt = +1
    else:
        cnt = -1
    for x in range(start, end, cnt):
        try:
            POWER_LED.value = x/100
        except:
            pass
        sleep(sleep_time)
    try:
        POWER_LED.value = end/100
    except:
        pass
    print("LED Brightness = " + str(end) + "%")

def sigterm_handler(*_):
    led_control(int(JSON_DATA["led_max_brightness"]), 0, 0.003)
    for x in range(0, 3, +1):
        led_control(0, int(JSON_DATA["led_max_brightness"]), 0.003)
        led_control(int(JSON_DATA["led_max_brightness"]), 0, 0.003)
    sys.exit(0)

def init():
    tmp = os.popen("ps -ef | grep chromium-browser | grep http | grep -v grep").read()
    while tmp == "":
        for x in range(0, 10, +1):
            led_control(0, int(JSON_DATA["led_max_brightness"]), 0.003)
            led_control(int(JSON_DATA["led_max_brightness"]), 0, 0.003)
        tmp = os.popen("ps -ef | grep chromium-browser | grep http | grep -v grep").read()
    led_control(0, int(JSON_DATA["led_max_brightness"]), 0.01)


def main():
    JSON_DATA = read_json()
    LED_DIM_MODE_LAST = JSON_DATA["led_dim_mode"]
    while True:
        JSON_DATA = read_json()
        if JSON_DATA != "skip":
            if JSON_DATA["led_dim_mode"] == "0" and JSON_DATA["led_dim_mode"] != LED_DIM_MODE_LAST:
                led_control(int(JSON_DATA["led_min_brightness"]), int(JSON_DATA["led_max_brightness"]), 0.02)
            if JSON_DATA["led_dim_mode"] == "1" and JSON_DATA["led_dim_mode"] != LED_DIM_MODE_LAST:
                led_control(int(JSON_DATA["led_max_brightness"]), int(JSON_DATA["led_min_brightness"]), 0.02)
            LED_DIM_MODE_LAST = JSON_DATA["led_dim_mode"]
        sleep(1)

if __name__ == "__main__":
    JSON_DATA = "skip"
    JSON_DATA_FILE = "/tmp/.power_led"
    while JSON_DATA == "skip":
        JSON_DATA = read_json()
        
    pwm_frequency = int(JSON_DATA.get("pwm_frequency", DEFAULT_PWM_FREQUENCY))    
    POWER_LED = PWMLED(JSON_DATA["led_gpio"], frequency=pwm_frequency)
    init()
    signal.signal(signal.SIGTERM, sigterm_handler)
    main()
