#!/bin/bash

if [ -d "/home/dietpi/.driver/network/88x2bu-20210702" ]; then
	cd /home/dietpi/.driver/network/88x2bu-20210702
	sudo ./remove-driver.sh
	cd /home/dietpi
	sudo rm -rf /home/dietpi/.driver/network/88x2bu-20210702
fi
