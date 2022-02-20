#!/bin/bash
#
# Script for MuPiBox Autosetup
# Start with: cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup.sh | bash

#exec {tracefd}>~/.mupibox/autosetup.log; BASH_XTRACEFD=$tracefd; PS4=':$LINENO+'; set -x

LOG="~/autosetup.log"
exec 3>${LOG}

{
	###############################################################################################

	echo -e "XXX\n0\nInstall some packages... \nXXX"	
	# Get missing packages
	sudo apt-get update
	sudo apt-get install git libasound2 jq samba mplayer pulseaudio-module-bluetooth bluez zip -y

	###############################################################################################
	
	echo -e "XXX\n6\nInstall nodeJS 16... \nXXX"	
	curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
	sudo apt-get install -y nodejs

	###############################################################################################

	echo -e "XXX\n10\nInstall ionic... \nXXX"	
	sudo npm install -g @ionic/cli

	###############################################################################################

	echo -e "XXX\n15\nInstall pm2... \nXXX"	
	sudo npm install pm2 -g 
	pm2 startup
	PM2_ENV=$(sudo cat ${LOG} | sudo grep "sudo env")
	echo ${PM2}
	${PM2_ENV}

	###############################################################################################

	echo -e "XXX\n20\nClean and create directories... \nXXX"	
	# Clean and create Directorys
	sudo rm -R ~/.mupibox
	sudo rm -R ~/MuPiBox/
	mkdir -p ~/.mupibox
	mkdir -p ~/MuPiBox/media
	mkdir ~/MuPiBox/tts_files
	mkdir -p ~/MuPiBox/sysmedia/sound
	mkdir ~/MuPiBox/sysmedia/images
	mkdir ~/MuPiBox/media
	mkdir -p ~/MuPiBox/Sonos-Kids-Controller-master/config
	sudo mkdir /usr/local/bin/mupibox
	sudo mkdir /etc/spotifyd
	sudo mkdir /etc/mupibox
	sudo mkdir /var/log/mupibox/
	sleep 1

	###############################################################################################

	echo -e "XXX\n21\nCreate hushlogin... \nXXX"	
	# Boot
	touch ~/.hushlogin
	sleep 1

	###############################################################################################

	echo -e "XXX\n22\nInstall mplayer-wrapper... \nXXX"	
	# Sources
	cd ~/.mupibox
	git clone https://github.com/derhuerst/mplayer-wrapper
	wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/mplayer-wrapper/index.js -O ~/.mupibox/mplayer-wrapper/index.js
	cd ~/.mupibox/mplayer-wrapper
	npm install

	###############################################################################################

	echo -e "XXX\n27\nInstall google-tts... \nXXX"	

	cd ~/.mupibox
	git clone https://github.com/zlargon/google-tts
	cd google-tts/
	npm install --save
	npm audit fix
	npm test

	###############################################################################################

	echo -e "XXX\n32\nInstall Kids-Controller-master... \nXXX"	

	wget https://github.com/splitti/MuPiBox/raw/main/bin/nodejs/sonos-kids-controller.zip -O ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip
	unzip ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip -d ~/.mupibox/Sonos-Kids-Controller-master/
	rm ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip
	wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json
	cd ~/.mupibox/Sonos-Kids-Controller-master 
	npm install
	#npm start &
	#sleep 10 
	pm2 start server.js
	pm2 save

	###############################################################################################

	echo -e "XXX\n53\nInstall Spotify Controller... \nXXX"	

	cd ~/.mupibox
	wget https://github.com/amueller-tech/spotifycontroller/archive/main.zip
	unzip main.zip
	rm main.zip
	cd ~/.mupibox/spotifycontroller-main
	wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json
	wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/spotiycontroller-main/spotify-control.js -O ~/.mupibox/spotifycontroller-main/spotify-control.js
	npm install
	#npm start &
	#sleep 10 
	pm2 start spotify-control.js
	pm2 save

	###############################################################################################

	echo -e "XXX\n63\nDownload binaries... \nXXX"	

	# Binaries
	sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/fbv/fbv -O /usr/bin/fbv
	sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/spotifyd/0.3.3/dietpi8_64bit/spotifyd -O /usr/bin/spotifyd
	sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd
	sleep 1

	###############################################################################################

	echo -e "XXX\n68\nDownload DietPi-Config... \nXXX"	

	# DietPi-Configs
	#sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf
	sleep 1

	###############################################################################################

	echo -e "XXX\n69\nDownload Spotify-Config... \nXXX"	


	# Spotify-Configs
	#wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json
	#wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifyd.conf -O /etc/spotifyd/spotifyd.conf
	sleep 1

	###############################################################################################

	echo -e "XXX\n70\nDownload some media files... \nXXX"	
	# Splash and Media
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/splash.txt -O /boot/splash.txt
	sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img
	wget https://github.com/splitti/MuPiBox/raw/main/media/images/goodbye.png -O ~/MuPiBox/sysmedia/images/goodbye.png
	sudo wget https://github.com/splitti/MuPiBox/raw/main/media/images/splash.png -O /boot/splash.png
	wget https://github.com/splitti/MuPiBox/raw/main/media/sound/shutdown.wav -O ~/MuPiBox/sysmedia/sound/shutdown.wav
	wget https://github.com/splitti/MuPiBox/raw/main/media/sound/startup.wav -O ~/MuPiBox/sysmedia/sound/startup.wav
	sleep 1

	###############################################################################################

	echo -e "XXX\n75\nDownload MuPiBox-Files... \nXXX"	

	# MuPiBox
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh
	sudo chmod 755 /usr/local/bin/mupibox/change_checker.sh /usr/local/bin/mupibox/idle_shutdown.sh /usr/local/bin/mupibox/m3u_generator.sh /usr/local/bin/mupibox/setting_update.sh /usr/local/bin/mupibox/software_shutdown.sh /usr/local/bin/mupibox/splash_screen.sh
	sleep 1

	###############################################################################################

	echo -e "XXX\n77\nInstall Hifiberry-MiniAmp and Bluetooth support... \nXXX"	

	sudo /boot/dietpi/func/dietpi-set_hardware bluetooth enable
	sudo dietpi-software install 5
	sudo /boot/dietpi/func/dietpi-set_hardware soundcard "hifiberry-dac" 
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf 
	sudo usermod -g pulse -G audio --home /var/run/pulse pulse
	sudo usermod -a -G audio dietpi
	sudo usermod -a -G bluetooth dietpi
	sudo usermod -a -G pulse dietpi
	sudo usermod -a -G pulse-access dietpi
	sudo usermod -a -G pulse root
	sudo usermod -a -G pulse-access root
	sudo /usr/bin/sed -i 's/; system-instance = no/system-instance = yes/g' /etc/pulse/daemon.conf
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/pulseaudio.service -O /etc/systemd/system/pulseaudio.service

	if grep -q '^load-module module-bluetooth-discover' /etc/pulse/system.pa; then
	  echo -e "load-module module-bluetooth-discover already set"
	else
	  echo '' | sudo tee -a /etc/pulse/system.pa
	  echo 'load-module module-bluetooth-discover' | sudo tee -a /etc/pulse/system.pa
	fi
	if grep -q '^load-module module-bluetooth-policy' /etc/pulse/system.pa; then
	  echo -e "load-module module-bluetooth-policy already set"
	else
	  echo '' | sudo tee -a /etc/pulse/system.pa
	  echo 'load-module module-bluetooth-policy' | sudo tee -a /etc/pulse/system.pa
	fi

	sudo /usr/bin/sed -i 's/; default-server =/default-server = \/var\/run\/pulse\/native/g' /etc/pulse/client.conf
	sudo /usr/bin/sed -i 's/; autospawn = yes/autospawn = no/g' /etc/pulse/client.conf

	###############################################################################################

	echo -e "XXX\n82\nSet environment variable... \nXXX"	

	# ENV
	(echo "mupibox"; echo "mupibox") | sudo smbpasswd -s -a dietpi
	sudo env PATH=$PATH:/usr/local/bin/mupibox
	sleep 1

	###############################################################################################

	echo -e "XXX\n83\nDownload OnOffShim-Scripts... \nXXX"	

	# OnOffShim & hifiberry
	#sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh
	sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh
	sleep 1

	###############################################################################################

	echo -e "XXX\n85\nInstall Chromium-Kiosk... \nXXX"	

	suggest_gpu_mem=76
	sudo /boot/dietpi/func/dietpi-set_hardware gpumemsplit $suggest_gpu_mem
	sudo /boot/dietpi/dietpi-autostart 11
	echo -ne '\n' | sudo dietpi-software install 113
	sudo /boot/dietpi/dietpi-autostart 11
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/chromium-autostart.sh -O /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh
	sudo chmod +x /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh
	sudo usermod -a -G tty dietpi
	sudo apt install xserver-xorg-legacy -y
	sudo /usr/bin/sed -i 's/allowed_users\=console/allowed_users\=anybody/g' /etc/X11/Xwrapper.config
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf
	sudo /usr/bin/sed -i 's/tty1/tty3 vt.global_cursor_default\=0 fastboot noatime nodiratime noram splash silent loglevel\=0 vt.default_red\=68,68,68,68,68,68,68,68 vt.default_grn\=175,175,175,175,175,175,175,175 vt.default_blu\=226,226,226,226,226,226,226,226/g' /boot/cmdline.txt
	sudo /usr/bin/sed -i 's/session    optional   pam_motd.so motd\=\/run\/motd.dynamic/#session    optional   pam_motd.so motd\=\/run\/motd.dynamic/g' /etc/pam.d/login
	sudo /usr/bin/sed -i 's/session    optional   pam_motd.so noupdate/#session    optional   pam_motd.so noupdate/g' /etc/pam.d/login
	sudo /usr/bin/sed -i 's/session    optional   pam_lastlog.so/session    optional   pam_lastlog.so/g' /etc/pam.d/login
	sudo /usr/bin/sed -i 's/ExecStart\=-\/sbin\/agetty -a dietpi -J \%I \$TERM/ExecStart\=-\/sbin\/agetty --skip-login --noclear --noissue --login-options \"-f pi\" \%I \$TERM/g' /etc/systemd/system/getty@tty1.service.d/dietpi-autologin.conf

	if grep -q '^initramfs initramfs.img' /boot/config.txt; then
	  echo -e "initramfs initramfs.img already set"
	else
	  echo '' | sudo tee -a /boot/config.txt
	  echo 'initramfs initramfs.img' | sudo tee -a /boot/config.txt
	fi

	###############################################################################################

	echo -e "XXX\n95\nEnable and start services... \nXXX"	

	# Enable Services
	sudo systemctl daemon-reload
	sudo systemctl enable mupi_change_checker.service
	sudo systemctl start mupi_change_checker.service
	sudo systemctl enable mupi_idle_shutdown.service
	sudo systemctl start mupi_idle_shutdown.service
	sudo systemctl enable mupi_splash.service
	sudo systemctl start mupi_splash.service
	sudo systemctl enable spotifyd.service
	sudo systemctl start spotifyd.service
	sudo systemctl enable smbd.service
	sudo systemctl start smbd.service
	sudo systemctl enable pulseaudio
	sudo systemctl start pulseaudio
	head -n -2 ~/.bashrc > /tmp/.bashrc && mv /tmp/.bashrc ~/.bashrc

	###############################################################################################

	echo -e "XXX\n100\nInstallation complete, please reboot the system... \nXXX"	

	#https://gist.github.com/yejun/2c1a070a839b3a7b146ede8a998b5495    !!!!!
	#discoverable on
	#pairable on
	#agent on
	#default-agent
	#scan on

} | whiptail --title "MuPiBox Autosetup" --gauge "Please wait while installing" 6 60 0

if (whiptail --title "MuPiBox Autosetup" --yesno "Finally, a restart is necessary! Do you want to reboot the system now?" 8 78); then
    sudo reboot
else
    #echo "Logfile:  ${LOG}\n\n"
    echo "Don't forget to reboot..."
fi