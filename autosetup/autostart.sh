#!/bin/bash

echo "echo '\n\n Please wait, MuPiBox-Installer starts soon...'0 && sleep 10" >> /home/dietpi/.bashrc
echo "cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup.sh | nice -n 19 bash" >> /home/dietpi/.bashrc
reboot