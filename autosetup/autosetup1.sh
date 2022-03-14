#!/bin/bash
#
# Script for MuPiBox Autosetup
# Start with: cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup.sh | bash

#exec {tracefd}>~/.mupibox/autosetup.log; BASH_XTRACEFD=$tracefd; PS4=':$LINENO+'; set -x

LOG="/tmp/autosetup.log"

autosetup="$(cat ~/.bashrc | grep autosetup)"

if(( ${#autosetup} > 0 ))
then
  head -n -2 ~/.bashrc > /tmp/.bashrc && mv /tmp/.bashrc ~/.bashrc
fi

exec 3>${LOG}

{
	###############################################################################################

	echo -e "XXX\n0\nInstall some packages... Please wait!\nXXX"
	# Get missing packages
	packages2install="pulseaudio bluez pulseaudio-module-bluetooth libasound2"
	sudo apt-get install ${packages2install} -y >&3 2>&3

	packages2install="git jq mplayer"
	sudo apt-get install ${packages2install} -y >&3 2>&3

	packages2install="samba zip rrdtool scrot"
	sudo apt-get install ${packages2install} -y >&3 2>&3
	
	###############################################################################################
	
	echo -e "XXX\n6\nInstall nodeJS 16... \nXXX"	
	curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash - >&3 2>&3
	sudo apt-get install -y nodejs >&3 2>&3

	###############################################################################################

	echo -e "XXX\n10\nInstall ionic... \nXXX"	
	sudo npm install -g @ionic/cli >&3 2>&3

	###############################################################################################

	echo -e "XXX\n15\nInstall pm2... \nXXX"	
	sudo npm install pm2 -g  >&3 2>&3
	pm2 startup >&3 2>&3
	PM2_ENV=$(sudo cat ${LOG} | sudo grep "sudo env") >&3 2>&3
	echo ${PM2_ENV} >&3 2>&3
	${PM2_ENV} >&3 2>&3

	###############################################################################################

	echo -e "XXX\n20\nClean and create directories... \nXXX"	
	# Clean and create Directorys
	sudo rm -R ~/.mupibox >&3 2>&3
	sudo rm -R ~/MuPiBox >&3 2>&3
	mkdir -p ~/.mupibox >&3 2>&3
	mkdir -p ~/MuPiBox/tts_files >&3 2>&3
	mkdir -p ~/MuPiBox/sysmedia/sound >&3 2>&3
	mkdir ~/MuPiBox/sysmedia/images >&3 2>&3
	mkdir ~/MuPiBox/media >&3 2>&3
	mkdir ~/MuPiBox/themes >&3 2>&3
	mkdir -p ~/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	sudo mkdir /usr/local/bin/mupibox >&3 2>&3
	sudo mkdir /etc/spotifyd >&3 2>&3
	sudo mkdir /etc/mupibox >&3 2>&3
	sudo mkdir /var/log/mupibox/ >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n21\nCreate hushlogin and load MuPiBox-Config... \nXXX"	
	# Boot
	touch ~/.hushlogin >&3 2>&3
	MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json" >&3 2>&3
	if [ -f "/boot/mupiboxconfig.json" ]; then
		sudo mv /boot/mupiboxconfig.json ${MUPIBOX_CONFIG} >&3 2>&3
	else 
		sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json >&3 2>&3
	fi
	sudo chown root:www-data /etc/mupibox/mupiboxconfig.json >&3 2>&3
	sudo chmod 777 /etc/mupibox/mupiboxconfig.json >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n22\nSystem will reboot in a few seconds... \nXXX"

	sudo echo "echo '' && echo '' && echo 'Please wait, MuPiBox-Installer starts soon...' && sleep 10" >> /home/dietpi/.bashrc
	sudo echo "cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup2.sh | bash" >> /home/dietpi/.bashrc
	sudo mv ${LOG} /boot/autosetup1.log
	sleep 10
	sudo reboot

} | whiptail --title "MuPiBox Autosetup" --gauge "Please wait while installing" 6 60 0


