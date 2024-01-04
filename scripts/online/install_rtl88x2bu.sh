#!/bin/bash

/usr/bin/fbv ${SHUT_SPLASH}
sudo apt-get update
sudo apt-get install -y raspberrypi-kernel-headers dkms 
mkdir -p /home/dietpi/.driver/network
cd /home/dietpi/.driver/network/
git clone https://github.com/morrownr/88x2bu-20210702.git
cd /home/dietpi/.driver/network/88x2bu-20210702
chmod +x install-driver.sh
sudo ./install-driver.sh NoPrompt