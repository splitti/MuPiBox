#!/bin/bash

echo "echo '' && echo '' && echo 'Please wait, MuPiBox-Installer starts soon...' && sleep 10" >> /home/dietpi/.bashrc
echo "cd; curl https://mupibox.de/version/latest/autosetup/autosetup.sh | bash" >> /home/dietpi/.bashrc
reboot