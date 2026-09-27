#!/bin/bash

sudo killall -s 9 -w -q -r chromium
sleep 0.5
sudo rm /tmp/driver-install.txt
if [ -x /usr/local/bin/mupibox/maintenance_screen.sh ]; then
	sudo /usr/local/bin/mupibox/maintenance_screen.sh install
else
	sudo /usr/bin/fbv /home/dietpi/MuPiBox/sysmedia/images/installation.jpg &
fi

sudo apt-get update
sudo apt-get reinstall -y raspberrypi-kernel-headers dkms
if [ ! -d "/lib/modules/$(uname -r)/build" ]; then
	sudo touch /tmp/driver-install.txt
else
	mkdir -p /home/dietpi/.driver/network
	cd /home/dietpi/.driver/network/
	git clone https://github.com/morrownr/8821au-20210708.git
	cd /home/dietpi/.driver/network/8821au-20210708
	chmod +x install-driver.sh
	sudo ./install-driver.sh NoPrompt >> /home/dietpi/driver.txt
fi
