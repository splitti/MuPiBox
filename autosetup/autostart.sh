#!/bin/bash

echo "echo '' && echo '' && echo 'Please wait, MuPiBox-Installer starts soon...' && sleep 10" >> /home/dietpi/.bashrc
echo "cd; curl -L https://raw.githubusercontent.com/friebi/MuPiBox/develop/autosetup/autosetup.sh | bash" >> /home/dietpi/.bashrc
reboot
