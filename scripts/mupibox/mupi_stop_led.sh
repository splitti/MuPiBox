#!/bin/sh
#

ps -ef | grep 'led_control.py' | grep -v grep | awk '{print $2}' | xargs kill > /dev/null
ps -ef | grep 'mupi_start_led.sh' | grep -v grep | awk '{print $2}' | xargs kill > /dev/null