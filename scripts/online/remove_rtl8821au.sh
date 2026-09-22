#!/bin/bash

if [ -d "/home/dietpi/.driver/network/8821au-20210708" ]; then
	cd /home/dietpi/.driver/network/8821au-20210708
	sudo ./remove-driver.sh
	cd /home/dietpi
	sudo rm -rf /home/dietpi/.driver/network/8821au-20210708
fi
