#!/bin/bash
#
# Script for MuPiBox preperation
# Start with: cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup.sh | bash

LOG="~/.mupibox/autosetup.log"
touch ${LOG}

{
	###############################################################################################
	echo -e "XXX\n0\nInstall some packeges... \nXXX"	
	echo "###################################################" >> "${LOG}" 2>>"${LOG}"
	echo "Install some packages" >> "${LOG}" 2>>"${LOG}"
	# Get missing packages
	sudo apt-get update &>> "${LOG}" 2>>"${LOG}"
	sudo apt-get install git libasound2 jq samba mplayer pulseaudio-module-bluetooth bluez zip -y &>> "${LOG}" 2>>"${LOG}"

	###############################################################################################
	echo -e "XXX\n6\nInstall nodeJS 16... \nXXX"	
	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Install nodeJS" &>> "${LOG}" 2>>"${LOG}"
	curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash - &>> "${LOG}" 2>>"${LOG}"
	sudo apt-get install -y nodejs &>> "${LOG}" 2>>"${LOG}"

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Install ionic" &>> "${LOG}" 2>>"${LOG}"
	echo -e "XXX\n10\nInstall ionic... \nXXX"	
	sudo npm install -g @ionic/cli &>> "${LOG}" 2>>"${LOG}"

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Install pm2" &>> "${LOG}" 2>>"${LOG}"
	echo -e "XXX\n15\nInstall pm2... \nXXX"	
	cd ~
	sudo npm install pm2 -g  &>> "${LOG}" 2>>"${LOG}"
	pm2 startup &>> "${LOG}" 2>>"${LOG}"
	PM2_ENV=$(sudo cat "${LOG}" | sudo grep "sudo env")  &>> "${LOG}" 2>>"${LOG}"
	echo ${PM2} &>> "${LOG}" 2>>"${LOG}"
	${PM2_ENV} &>> "${LOG}" 2>>"${LOG}"

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Clean and create Directorys" &>> "${LOG}" 2>>"${LOG}"
	echo -e "XXX\n20\nClean and create directories... \nXXX"	
	# Clean and create Directorys
	sudo rm -R ~/.mupibox &>> "${LOG}" 2>>"${LOG}"
	sudo rm -R ~/MuPiBox/  &>> "${LOG}" 2>>"${LOG}"
	mkdir -p ~/.mupibox &>> "${LOG}" 2>>"${LOG}"
	mkdir -p ~/MuPiBox/media &>> "${LOG}" 2>>"${LOG}"
	mkdir ~/MuPiBox/tts_files &>> "${LOG}" 2>>"${LOG}"
	mkdir -p ~/MuPiBox/sysmedia/sound &>> "${LOG}" 2>>"${LOG}"
	mkdir ~/MuPiBox/sysmedia/images &>> "${LOG}" 2>>"${LOG}"
	mkdir ~/MuPiBox/media &>> "${LOG}" 2>>"${LOG}" "${LOG}" 2>>"${LOG}"
	mkdir -p ~/MuPiBox/Sonos-Kids-Controller-master/config &>> "${LOG}" 2>>"${LOG}"
	sudo mkdir /usr/local/bin/mupibox &>> "${LOG}" 2>>"${LOG}"
	sudo mkdir /etc/spotifyd &>> "${LOG}" 2>>"${LOG}"
	sudo mkdir /etc/mupibox &>> "${LOG}" 2>>"${LOG}"
	sudo mkdir /var/log/mupibox/ &>> "${LOG}" 2>>"${LOG}"
	sleep 1

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Create hushlogin" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n21\nCreate hushlogin... \nXXX"	
	# Boot
	touch ~/.hushlogin
	sleep 1

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Install mplayer-wrapper" &>> "${LOG}" 2>>"${LOG}"
	echo -e "XXX\n22\nInstall mplayer-wrapper... \nXXX"	
	# Sources
	cd ~/.mupibox >> "${LOG}"
	git clone https://github.com/derhuerst/mplayer-wrapper &>> "${LOG}" 2>>"${LOG}"
	wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/mplayer-wrapper/index.js -O ~/.mupibox/mplayer-wrapper/index.js &>> "${LOG}" 2>>"${LOG}"
	cd ~/.mupibox/mplayer-wrapper &>> "${LOG}" 2>>"${LOG}"
	npm install &>> "${LOG}" 2>>"${LOG}"

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Install google-tts" &>> "${LOG}" 2>>"${LOG}"
	echo -e "XXX\n27\nInstall google-tts... \nXXX"	

	cd ~/.mupibox &>> "${LOG}" 2>>"${LOG}"
	git clone https://github.com/zlargon/google-tts &>> "${LOG}" 2>>"${LOG}"
	cd google-tts/ &>> "${LOG}" 2>>"${LOG}"
	npm install --save &>> "${LOG}" 2>>"${LOG}"
	npm audit fix &>> "${LOG}" 2>>"${LOG}"
	npm test &>> "${LOG}" 2>>"${LOG}"

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Install Sonos-Kids-Controller-master" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n32\nInstall Kids-Controller-master... \nXXX"	

	cd ~/.mupibox/Sonos-Kids-Controller-master
	wget https://github.com/splitti/MuPiBox/raw/main/bin/nodejs/sonos-kids-controller.zip &>> "${LOG}" 2>>"${LOG}"
	unzip sonos-kids-controller.zip &>> "${LOG}" 2>>"${LOG}"
	rm sonos-kids-controller.zip &>> "${LOG}" 2>>"${LOG}"
	wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json 2>>"${LOG}"
	npm install  &>> "${LOG}" 2>>"${LOG}"
	#npm start & &>> "${LOG}" 2>>"${LOG}"
	#sleep 10  &>> "${LOG}" 2>>"${LOG}"
	pm2 start server.js  &>> "${LOG}" 2>>"${LOG}"
	pm2 save  &>> "${LOG}" 2>>"${LOG}"

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Install Spotify Controller" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n53\nInstall Spotify Controller... \nXXX"	

	cd ~/.mupibox  &>> "${LOG}" 2>>"${LOG}"
	wget https://github.com/amueller-tech/spotifycontroller/archive/main.zip  &>> "${LOG}" 2>>"${LOG}"
	unzip main.zip  &>> "${LOG}" 2>>"${LOG}"
	rm main.zip  &>> "${LOG}" 2>>"${LOG}"
	cd ~/.mupibox/spotifycontroller-main  &>> "${LOG}" 2>>"${LOG}"
	wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json &>> "${LOG}" 2>>"${LOG}"
	wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/spotiycontroller-main/spotify-control.js -O ~/.mupibox/spotifycontroller-main/spotify-control.js  &>> "${LOG}" 2>>"${LOG}"
	npm install  &>> "${LOG}" 2>>"${LOG}"
	#npm start & &>> "${LOG}" 2>>"${LOG}"
	#sleep 10  &>> "${LOG}" 2>>"${LOG}"
	pm2 start spotify-control.js  &>> "${LOG}" 2>>"${LOG}"
	pm2 save  &>> "${LOG}" 2>>"${LOG}"

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Copy binaries" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n63\nDownload binaries... \nXXX"	

	# Binaries
	sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/fbv/fbv -O /usr/bin/fbv  &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/spotifyd/0.3.3/dietpi8_64bit/spotifyd -O /usr/bin/spotifyd  &>> "${LOG}" 2>>"${LOG}"
	sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd &>> "${LOG}" 2>>"${LOG}"
	sleep 1

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Copy dietpi-config" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n68\nDownload DietPi-Config... \nXXX"	

	# DietPi-Configs
	#sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf &>> "${LOG}" 2>>"${LOG}"
	sleep 1

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Copy spotify-configs" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n69\nDownload Spotify-Config... \nXXX"	


	# Spotify-Configs
	#wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json &>> "${LOG}" 2>>"${LOG}"
	#wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifyd.conf -O /etc/spotifyd/spotifyd.conf &>> "${LOG}" 2>>"${LOG}"
	sleep 1

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Copy media-files" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n70\nDownload some media files... \nXXX"	
	# Splash and Media
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/splash.txt -O /boot/splash.txt &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img &>> "${LOG}" 2>>"${LOG}"
	wget https://github.com/splitti/MuPiBox/raw/main/media/images/goodbye.png -O ~/MuPiBox/sysmedia/images/goodbye.png &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://github.com/splitti/MuPiBox/raw/main/media/images/splash.png -O /boot/splash.png &>> "${LOG}" 2>>"${LOG}"
	wget https://github.com/splitti/MuPiBox/raw/main/media/sound/shutdown.wav -O ~/MuPiBox/sysmedia/sound/shutdown.wav &>> "${LOG}" 2>>"${LOG}"
	wget https://github.com/splitti/MuPiBox/raw/main/media/sound/startup.wav -O ~/MuPiBox/sysmedia/sound/startup.wav &>> "${LOG}" 2>>"${LOG}"
	sleep 1

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Copy mupibox-files" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n75\nDownload MuPiBox-Files... \nXXX"	

	# MuPiBox
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh &>> "${LOG}" 2>>"${LOG}"
	sudo chmod 755 /usr/local/bin/mupibox/change_checker.sh /usr/local/bin/mupibox/idle_shutdown.sh /usr/local/bin/mupibox/m3u_generator.sh /usr/local/bin/mupibox/setting_update.sh /usr/local/bin/mupibox/software_shutdown.sh /usr/local/bin/mupibox/splash_screen.sh &>> "${LOG}" 2>>"${LOG}"
	sleep 1

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Install Hifiberry-MiniAmp and Bluetooth support" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n77\nInstall Hifiberry-MiniAmp and Bluetooth support... \nXXX"	

	sudo /boot/dietpi/func/dietpi-set_hardware bluetooth enable &>> "${LOG}" 2>>"${LOG}"
	sudo /boot/dietpi/func/dietpi-set_hardware soundcard "hifiberry-dac"  &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf  &>> "${LOG}" 2>>"${LOG}"
	sudo usermod -g pulse -G audio --home /var/run/pulse pulse &>> "${LOG}" 2>>"${LOG}"
	sudo usermod -a -G audio dietpi &>> "${LOG}" 2>>"${LOG}"
	sudo usermod -a -G bluetooth dietpi &>> "${LOG}" 2>>"${LOG}"
	sudo usermod -a -G pulse dietpi &>> "${LOG}" 2>>"${LOG}"
	sudo usermod -a -G pulse-access dietpi &>> "${LOG}" 2>>"${LOG}"
	sudo usermod -a -G pulse root &>> "${LOG}" 2>>"${LOG}"
	sudo usermod -a -G pulse-access root &>> "${LOG}" 2>>"${LOG}"
	sudo /usr/bin/sed -i 's/; system-instance = no/system-instance = yes/g' /etc/pulse/daemon.conf &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/pulseaudio.service -O /etc/systemd/system/pulseaudio.service  &>> "${LOG}" 2>>"${LOG}"

	if grep -q '^load-module module-bluetooth-discover' /etc/pulse/system.pa; then
	  echo -e "load-module module-bluetooth-discover already set" &>> "${LOG}" 2>>"${LOG}"
	else
	  echo '' | sudo tee -a /etc/pulse/system.pa &>> "${LOG}" 2>>"${LOG}"
	  echo 'load-module module-bluetooth-discover' | sudo tee -a /etc/pulse/system.pa &>> "${LOG}" 2>>"${LOG}"
	fi
	if grep -q '^load-module module-bluetooth-policy' /etc/pulse/system.pa; then
	  echo -e "load-module module-bluetooth-policy already set" &>> "${LOG}" 2>>"${LOG}"
	else
	  echo '' | sudo tee -a /etc/pulse/system.pa &>> "${LOG}" 2>>"${LOG}"
	  echo 'load-module module-bluetooth-policy' | sudo tee -a /etc/pulse/system.pa &>> "${LOG}" 2>>"${LOG}"
	fi

	sudo /usr/bin/sed -i 's/; default-server =/default-server = \/var\/run\/pulse\/native/g' /etc/pulse/client.conf &>> "${LOG}" 2>>"${LOG}"
	sudo /usr/bin/sed -i 's/; autospawn = yes/autospawn = no/g' /etc/pulse/client.conf &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl daemon-reload &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl enable pulseaudio &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl start pulseaudio &>> "${LOG}" 2>>"${LOG}"
	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Set environment" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n82\nSet environment variable... \nXXX"	

	# ENV
	(echo "mupibox"; echo "mupibox") | sudo smbpasswd -s -a dietpi &>> "${LOG}" 2>>"${LOG}"
	sudo env PATH=$PATH:/usr/local/bin/mupibox &>> "${LOG}" 2>>"${LOG}"
	sleep 1


	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Copy OnOffShim-scripts" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n83\nDownload OnOffShim-Scripts... \nXXX"	

	# OnOffShim & hifiberry
	#sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh &>> "${LOG}" 2>>"${LOG}"
	sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh &>> "${LOG}" 2>>"${LOG}"
	sleep 1

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Configure Chromium" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n85\nInstall Chromium-Kiosk... \nXXX"	

	suggest_gpu_mem=76 &>> "${LOG}" 2>>"${LOG}"
	sudo /boot/dietpi/func/dietpi-set_hardware gpumemsplit $suggest_gpu_mem &>> "${LOG}" 2>>"${LOG}"
	sudo /boot/dietpi/dietpi-autostart 11 &>> "${LOG}" 2>>"${LOG}"
	echo -ne '\n' | sudo dietpi-software install 113 &>> "${LOG}" 2>>"${LOG}"
	sudo /boot/dietpi/dietpi-autostart 11 &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/chromium-autostart.sh -O /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh &>> "${LOG}" 2>>"${LOG}"
	sudo chmod +x /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh &>> "${LOG}" 2>>"${LOG}"
	sudo usermod -a -G tty dietpi &>> "${LOG}" 2>>"${LOG}"
	sudo apt install xserver-xorg-legacy -y &>> "${LOG}" 2>>"${LOG}"
	sudo /usr/bin/sed -i 's/allowed_users\=console/allowed_users\=anybody/g' /etc/X11/Xwrapper.config &>> "${LOG}" 2>>"${LOG}"
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf &>> "${LOG}" 2>>"${LOG}"
	sudo /usr/bin/sed -i 's/tty1/tty3 vt.global_cursor_default\=0 fastboot noatime nodiratime noram splash silent loglevel\=0 vt.default_red\=68,68,68,68,68,68,68,68 vt.default_grn\=175,175,175,175,175,175,175,175 vt.default_blu\=226,226,226,226,226,226,226,226/g' /boot/cmdline.txt &>> "${LOG}" 2>>"${LOG}"

	sudo /usr/bin/sed -i 's/session    optional   pam_motd.so motd\=\/run\/motd.dynamic/#session    optional   pam_motd.so motd\=\/run\/motd.dynamic/g' /etc/pam.d/login &>> "${LOG}" 2>>"${LOG}"
	sudo /usr/bin/sed -i 's/session    optional   pam_motd.so noupdate/#session    optional   pam_motd.so noupdate/g' /etc/pam.d/login &>> "${LOG}" 2>>"${LOG}"
	sudo /usr/bin/sed -i 's/session    optional   pam_lastlog.so/session    optional   pam_lastlog.so/g' /etc/pam.d/login &>> "${LOG}" 2>>"${LOG}"

	sudo /usr/bin/sed -i 's/ExecStart\=-\/sbin\/agetty -a dietpi -J \%I \$TERM/ExecStart\=-\/sbin\/agetty --skip-login --noclear --noissue --login-options \"-f pi\" \%I \$TERM/g' /etc/systemd/system/getty@tty1.service.d/dietpi-autologin.conf &>> "${LOG}" 2>>"${LOG}"

	if grep -q '^initramfs initramfs.img' /boot/config.txt; then
	  echo -e "initramfs initramfs.img already set" &>> "${LOG}" 2>>"${LOG}"
	else
	  echo '' | sudo tee -a /boot/config.txt &>> "${LOG}" 2>>"${LOG}"
	  echo 'initramfs initramfs.img' | sudo tee -a /boot/config.txt &>> "${LOG}" 2>>"${LOG}"
	fi

	###############################################################################################

	echo "###################################################" &>> "${LOG}" 2>>"${LOG}"
	echo "Enable services" &>> "${LOG}" 2>>"${LOG}"

	echo -e "XXX\n95\nEnable and start services... \nXXX"	


	# Enable Services
	sudo systemctl daemon-reload &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl enable mupi_change_checker.service &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl start mupi_change_checker.service &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl enable mupi_idle_shutdown.service &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl start mupi_idle_shutdown.service &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl enable mupi_splash.service &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl start mupi_splash.service &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl enable spotifyd.service &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl start spotifyd.service &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl enable smbd.service &>> "${LOG}" 2>>"${LOG}"
	sudo systemctl start smbd.service &>> "${LOG}" 2>>"${LOG}"
	head -n -2 ~/.bashrc > /tmp/.bashrc && mv /tmp/.bashrc ~/.bashrc &>> "${LOG}" 2>>"${LOG}"



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