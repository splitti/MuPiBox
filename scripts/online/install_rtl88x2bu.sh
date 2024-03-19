#!/bin/bash

sudo killall -s 9 -w -q chromium-browser
sleep 0.5
sudo rm /tmp/driver-install.txt
sudo wget -O /tmp/installation.jpg https://raw.githubusercontent.com/friebi/MuPiBox/develop/media/images/installation.jpg
sudo /usr/bin/fbv /tmp/installation.jpg &

sudo apt-get update
sudo apt-get reinstall -y raspberrypi-kernel-headers dkms
if [ ! -d "/lib/modules/$(uname -r)/build" ]; then
	sudo touch /tmp/driver-install.txt
else
	mkdir -p /home/dietpi/.driver/network
	cd /home/dietpi/.driver/network/
	git clone https://github.com/morrownr/88x2bu-20210702.git
	cd /home/dietpi/.driver/network/88x2bu-20210702
	chmod +x install-driver.sh
	sudo ./install-driver.sh NoPrompt >> /home/dietpi/driver.txt
fi
