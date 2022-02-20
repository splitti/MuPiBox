#!/bin/bash

apt-get install figlet lolcat -y
echo "cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup.sh | bash" >> /home/dietpi/.bashrc
reboot