#!/bin/bash

echo "sleep 10" >> /home/dietpi/.bashrc
echo "cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup.sh | bash" >> /home/dietpi/.bashrc
reboot