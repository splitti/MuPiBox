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

	echo -e "XXX\n21\nCreate hushlogin... \nXXX"	
	# Boot
	touch ~/.hushlogin >&3 2>&3
<<<<<<< HEAD
	MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json" >&3 2>&3
	if [ -f "/boot/mupiboxconfig.json" ]; then
		sudo mv /boot/mupiboxconfig.json ${MUPIBOX_CONFIG} >&3 2>&3
	else 
		sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json >&3 2>&3
	fi
=======
	sleep 1

	###############################################################################################

	echo -e "XXX\n22\nInstall mplayer-wrapper... \nXXX"	
	# Sources
	cd ~/.mupibox >&3 2>&3
	git clone https://github.com/derhuerst/mplayer-wrapper >&3 2>&3
	wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/mplayer-wrapper/index.js -O ~/.mupibox/mplayer-wrapper/index.js >&3 2>&3
	cd ~/.mupibox/mplayer-wrapper >&3 2>&3
	npm install >&3 2>&3

	###############################################################################################

	echo -e "XXX\n27\nInstall google-tts... \nXXX"	

	cd ~/.mupibox >&3 2>&3
	git clone https://github.com/zlargon/google-tts >&3 2>&3
	cd google-tts/ >&3 2>&3
	npm install --save >&3 2>&3
	npm audit fix >&3 2>&3
	npm test >&3 2>&3

	###############################################################################################

	echo -e "XXX\n32\nInstall Kids-Controller-master... \nXXX"	

	wget https://github.com/splitti/MuPiBox/raw/main/bin/nodejs/deploy.zip -O ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip >&3 2>&3
	unzip ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip -d ~/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	rm ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip >&3 2>&3
	wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	cd ~/.mupibox/Sonos-Kids-Controller-master  >&3 2>&3
	npm install >&3 2>&3
	pm2 start server.js >&3 2>&3
	pm2 save >&3 2>&3

	###############################################################################################

	echo -e "XXX\n53\nInstall Spotify Controller... \nXXX"	

	cd ~/.mupibox >&3 2>&3
	wget https://github.com/amueller-tech/spotifycontroller/archive/main.zip >&3 2>&3
	unzip main.zip >&3 2>&3
	rm main.zip >&3 2>&3
	cd ~/.mupibox/spotifycontroller-main >&3 2>&3
	wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json >&3 2>&3
	wget https://raw.githubusercontent.com/splitti/MuPiBox/main/bin/nodejs/spotify-control.js -O ~/.mupibox/spotifycontroller-main/spotify-control.js >&3 2>&3
	ln -s /etc/mupibox/mupiboxconfig.json ~/.mupibox/spotifycontroller-main/config/mupiboxconfig.json >&3 2>&3
	npm install >&3 2>&3 
	pm2 start spotify-control.js >&3 2>&3
	pm2 save >&3 2>&3

	###############################################################################################

	echo -e "XXX\n63\nDownload binaries... \nXXX"	

	# Binaries
	sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/fbv/fbv -O /usr/bin/fbv >&3 2>&3
	sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/spotifyd/0.3.3/spotifyd -O /usr/bin/spotifyd >&3 2>&3
	sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n68\nDownload DietPi-Config... \nXXX"	

	# DietPi-Configs
	#sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n69\nDownload spotifyd-Config... \nXXX"	


	# spotifyd-Config
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifyd.conf -O /etc/spotifyd/spotifyd.conf >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n70\nDownload some media files... \nXXX"	
	# Splash and Media
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/splash.txt -O /boot/splash.txt >&3 2>&3
	sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img >&3 2>&3
	wget https://github.com/splitti/MuPiBox/raw/main/media/images/goodbye.png -O ~/MuPiBox/sysmedia/images/goodbye.png >&3 2>&3
	sudo wget https://github.com/splitti/MuPiBox/raw/main/media/images/splash.png -O /boot/splash.png >&3 2>&3
	wget https://github.com/splitti/MuPiBox/raw/main/media/sound/shutdown.wav -O ~/MuPiBox/sysmedia/sound/shutdown.wav >&3 2>&3
	wget https://github.com/splitti/MuPiBox/raw/main/media/sound/startup.wav -O ~/MuPiBox/sysmedia/sound/startup.wav >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n75\nDownload MuPiBox-Files... \nXXX"	

	# MuPiBox
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/dark.css -O ~/MuPiBox/themes/dark.css >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/blue.css -O ~/MuPiBox/themes/blue.css >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/purple.css -O ~/MuPiBox/themes/purple.css >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/red.css -O ~/MuPiBox/themes/red.css >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/chocolate.css -O ~/MuPiBox/themes/chocolate.css >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/vintage.css -O ~/MuPiBox/themes/vintage.css >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/orange.css -O ~/MuPiBox/themes/orange.css >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/green.css -O ~/MuPiBox/themes/green.css >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/light.css -O ~/MuPiBox/themes/light.css >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/deepblue.css -O ~/MuPiBox/themes/deepblue.css >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/themes/pink.css -O ~/MuPiBox/themes/pink.css >&3 2>&3

	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/mupi_shutdown.sh -O /usr/local/bin/mupibox/mupi_shutdown.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/mupi_startup.sh -O /usr/local/bin/mupibox/mupi_startup.sh >&3 2>&3

	if [ -f "/boot/mupiboxconfig.json" ]; then
		sudo mv /boot/mupiboxconfig.json /etc/mupibox/mupiboxconfig.json >&3 2>&3
	else 
		sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json >&3 2>&3
	fi

	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/shutdown.sh -O /usr/local/bin/mupibox/shutdown.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/restart.sh -O /usr/local/bin/mupibox/restart.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/add_wifi.sh -O /usr/local/bin/mupibox/add_wifi.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/save_rrd.sh -O /usr/local/bin/mupibox/save_rrd.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/crontab.template -O /tmp/crontab.template >&3 2>&3


	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/bluetooth/start_bt.sh -O /usr/local/bin/mupibox/start_bt.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/bluetooth/stop_bt.sh -O /usr/local/bin/mupibox/stop_bt.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/bluetooth/scan_bt.sh -O /usr/local/bin/mupibox/scan_bt.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/bluetooth/pair_bt.sh -O /usr/local/bin/mupibox/pair_bt.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/bluetooth/remove_bt.sh -O /usr/local/bin/mupibox/remove_bt.sh >&3 2>&3
	
		
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/restart_kiosk.sh -O /usr/local/bin/mupibox/restart_kiosk.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/set_deviceid.sh -O /usr/local/bin/mupibox/set_deviceid.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/spotify_restart.sh -O /usr/local/bin/mupibox/spotify_restart.sh >&3 2>&3
	
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh >&3 2>&3
	sudo chmod 755 /usr/local/bin/mupibox/* >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n77\nInstall Hifiberry-MiniAmp and Bluetooth support... \nXXX"	

	sudo /boot/dietpi/dietpi-software install 5 >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware bluetooth enable >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware soundcard "hifiberry-dac"  >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf  >&3 2>&3
	sudo usermod -g pulse -G audio --home /var/run/pulse pulse >&3 2>&3
	sudo usermod -a -G audio dietpi >&3 2>&3
	sudo usermod -a -G bluetooth dietpi >&3 2>&3
	sudo usermod -a -G pulse dietpi >&3 2>&3
	sudo usermod -a -G pulse-access dietpi >&3 2>&3
	sudo usermod -a -G pulse root >&3 2>&3
	sudo usermod -a -G pulse-access root >&3 2>&3
	sudo /usr/bin/sed -i 's/; system-instance = no/system-instance = yes/g' /etc/pulse/daemon.conf >&3 2>&3

	if grep -q '^load-module module-bluetooth-discover' /etc/pulse/system.pa; then
	  echo -e "load-module module-bluetooth-discover already set" >&3 2>&3
	else
	  echo '' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
	  echo 'load-module module-bluetooth-discover' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
	fi
	if grep -q '^load-module module-bluetooth-policy' /etc/pulse/system.pa; then
	  echo -e "load-module module-bluetooth-policy already set" >&3 2>&3
	else
	  echo '' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
	  echo 'load-module module-bluetooth-policy' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
	fi

	sudo /usr/bin/sed -i 's/; default-server =/default-server = \/var\/run\/pulse\/native/g' /etc/pulse/client.conf >&3 2>&3
	sudo /usr/bin/sed -i 's/; autospawn = yes/autospawn = no/g' /etc/pulse/client.conf >&3 2>&3
	sudo /usr/bin/sed -i 's/ExecStart=\/usr\/libexec\/bluetooth\/bluetoothd/ExecStart=\/usr\/libexec\/bluetooth\/bluetoothd --noplugin=sap/g' /lib/systemd/system/bluetooth.service >&3 2>&3

	###############################################################################################

	echo -e "XXX\n82\nEnable Admin-Webservice... \nXXX"	

	sudo /boot/dietpi/dietpi-software install 5 84 89 >&3 2>&3

	sudo rm -R /var/www/* >&3 2>&3
	sudo wget https://github.com/splitti/MuPiBox/raw/main/AdminInterface/release/www.zip -O /var/www/www.zip >&3 2>&3
	sudo unzip /var/www/www.zip -d /var/www/ >&3 2>&3
	sudo rm /var/www/www.zip >&3 2>&3
	sudo chown -R www-data:www-data /var/www/ >&3 2>&3
	sudo chmod -R 755 /var/www/ >&3 2>&3

	###############################################################################################

	echo -e "XXX\n87\nSet environment... \nXXX"	

	# ENV
	(echo "mupibox"; echo "mupibox") | sudo smbpasswd -s -a dietpi >&3 2>&3
	sudo env PATH=$PATH:/usr/local/bin/mupibox >&3 2>&3
	MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json" >&3 2>&3
	THEME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/styles.242c97d50a9a860d.css" >&3 2>&3
	NEW_THEME=$(/usr/bin/jq -r .mupibox.theme ${MUPIBOX_CONFIG}) >&3 2>&3

	rm ${THEME_FILE} >&3 2>&3
	ln -s /home/dietpi/MuPiBox/themes/${NEW_THEME}.css ${THEME_FILE} >&3 2>&3
>>>>>>> parent of 2dcd077 (Update autosetup.sh)
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


