#!/bin/bash

dietpi-autostart 7
apt-get install figlet lolcat -y
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/development_prepare/prepare-env.sh -O /var/lib/dietpi/postboot.d/prepare-env.sh
chmod 755 /var/lib/dietpi/postboot.d/prepare-env.sh
reboot