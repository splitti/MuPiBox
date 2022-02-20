#!/bin/bash

apt-get install figlet lolcat -y
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup.sh -O /var/lib/dietpi/dietpi-autostart/autosetup.sh
chmod 755 /var/lib/dietpi/dietpi-autostart/autosetup.sh
reboot