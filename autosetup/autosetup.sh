#!/bin/bash
#
# Script for MuPiBox preperation
# Start with: cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup.sh | bash

LOG="/tmp/autosetup.log"
exec 3>${LOG}

{
	echo -e "XXX\n0\nCreate Logfile... \nXXX"	
	
	###############################################################################################
	echo -e "XXX\n1\nInstall some packeges... \nXXX"	
	echo "###################################################" >&3 2>&3
	echo "Install some packages" >&3 2>&3
	# Get missing packages
	sudo apt-get update &>&3 2>&3
	sudo apt-get install git libasound2 jq samba mplayer pulseaudio-module-bluetooth bluez zip -y &>&3 2>&3

	###############################################################################################
	echo -e "XXX\n6\nInstall nodeJS 16... \nXXX"	
	echo "###################################################" &>&3 2>&3
	echo "Install nodeJS" &>&3 2>&3
	curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash - &>&3 2>&3
	sudo apt-get install -y nodejs &>&3 2>&3

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Install ionic" &>&3 2>&3
	echo -e "XXX\n10\nInstall ionic... \nXXX"	
	sudo npm install -g @ionic/cli &>&3 2>&3

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Install pm2" &>&3 2>&3
	echo -e "XXX\n15\nInstall pm2... \nXXX"	
	cd ~
	sudo npm install pm2 -g  &>&3 2>&3
	pm2 startup &>&3 2>&3
	PM2_ENV=$(sudo cat ${LOG} | sudo grep "sudo env")  &>&3 2>&3
	echo ${PM2} &>&3 2>&3
	${PM2_ENV} &>&3 2>&3

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Clean and create Directorys" &>&3 2>&3
	echo -e "XXX\n20\nClean and create directories... \nXXX"	
	# Clean and create Directorys
	sudo rm -R ~/.mupibox &>&3 2>&3
	sudo rm -R ~/MuPiBox/  &>&3 2>&3
	mkdir -p ~/.mupibox &>&3 2>&3
	mkdir -p ~/MuPiBox/media &>&3 2>&3
	mkdir ~/MuPiBox/tts_files &>&3 2>&3
	mkdir -p ~/MuPiBox/sysmedia/sound &>&3 2>&3
	mkdir ~/MuPiBox/sysmedia/images &>&3 2>&3
	mkdir ~/MuPiBox/media &>&3 2>&3 ${LOG} 2>>${LOG}
	mkdir -p ~/MuPiBox/Sonos-Kids-Controller-master/config &>&3 2>&3
	sudo mkdir /usr/local/bin/mupibox &>&3 2>&3
	sudo mkdir /etc/spotifyd &>&3 2>&3
	sudo mkdir /etc/mupibox &>&3 2>&3
	sudo mkdir /var/log/mupibox/ &>&3 2>&3
	sleep 1

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Create hushlogin" &>&3 2>&3

	echo -e "XXX\n21\nCreate hushlogin... \nXXX"	
	# Boot
	touch ~/.hushlogin
	sleep 1

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Install mplayer-wrapper" &>&3 2>&3
	echo -e "XXX\n22\nInstall mplayer-wrapper... \nXXX"	
	# Sources
	cd ~/.mupibox >>${LOG}
	git clone https://github.com/derhuerst/mplayer-wrapper &>&3 2>&3
	wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/mplayer-wrapper/index.js -O ~/.mupibox/mplayer-wrapper/index.js &>&3 2>&3
	cd ~/.mupibox/mplayer-wrapper &>&3 2>&3
	npm install &>&3 2>&3

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Install google-tts" &>&3 2>&3
	echo -e "XXX\n27\nInstall google-tts... \nXXX"	

	cd ~/.mupibox &>&3 2>&3
	git clone https://github.com/zlargon/google-tts &>&3 2>&3
	cd google-tts/ &>&3 2>&3
	npm install --save &>&3 2>&3
	npm audit fix &>&3 2>&3
	npm test &>&3 2>&3

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Install Sonos-Kids-Controller-master" &>&3 2>&3

	echo -e "XXX\n32\nInstall Kids-Controller-master... \nXXX"	

	cd ~/.mupibox/Sonos-Kids-Controller-master
	wget https://github.com/splitti/MuPiBox/raw/main/bin/nodejs/sonos-kids-controller.zip &>&3 2>&3
	unzip sonos-kids-controller.zip &>&3 2>&3
	rm sonos-kids-controller.zip &>&3 2>&3
	wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json 2>>${LOG}
	npm install  &>&3 2>&3
	#npm start & &>&3 2>&3
	#sleep 10  &>&3 2>&3
	pm2 start server.js  &>&3 2>&3
	pm2 save  &>&3 2>&3

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Install Spotify Controller" &>&3 2>&3

	echo -e "XXX\n53\nInstall Spotify Controller... \nXXX"	

	cd ~/.mupibox  &>&3 2>&3
	wget https://github.com/amueller-tech/spotifycontroller/archive/main.zip  &>&3 2>&3
	unzip main.zip  &>&3 2>&3
	rm main.zip  &>&3 2>&3
	cd ~/.mupibox/spotifycontroller-main  &>&3 2>&3
	wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json &>&3 2>&3
	wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/spotiycontroller-main/spotify-control.js -O ~/.mupibox/spotifycontroller-main/spotify-control.js  &>&3 2>&3
	npm install  &>&3 2>&3
	#npm start & &>&3 2>&3
	#sleep 10  &>&3 2>&3
	pm2 start spotify-control.js  &>&3 2>&3
	pm2 save  &>&3 2>&3

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Copy binaries" &>&3 2>&3

	echo -e "XXX\n63\nDownload binaries... \nXXX"	

	# Binaries
	sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/fbv/fbv -O /usr/bin/fbv  &>&3 2>&3
	sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/spotifyd/0.3.3/dietpi8_64bit/spotifyd -O /usr/bin/spotifyd  &>&3 2>&3
	sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd &>&3 2>&3
	sleep 1

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Copy dietpi-config" &>&3 2>&3

	echo -e "XXX\n68\nDownload DietPi-Config... \nXXX"	

	# DietPi-Configs
	#sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf &>&3 2>&3
	sleep 1

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Copy spotify-configs" &>&3 2>&3

	echo -e "XXX\n69\nDownload Spotify-Config... \nXXX"	


	# Spotify-Configs
	#wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json &>&3 2>&3
	#wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifyd.conf -O /etc/spotifyd/spotifyd.conf &>&3 2>&3
	sleep 1

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Copy media-files" &>&3 2>&3

	echo -e "XXX\n70\nDownload some media files... \nXXX"	
	# Splash and Media
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/splash.txt -O /boot/splash.txt &>&3 2>&3
	sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img &>&3 2>&3
	wget https://github.com/splitti/MuPiBox/raw/main/media/images/goodbye.png -O ~/MuPiBox/sysmedia/images/goodbye.png &>&3 2>&3
	sudo wget https://github.com/splitti/MuPiBox/raw/main/media/images/splash.png -O /boot/splash.png &>&3 2>&3
	wget https://github.com/splitti/MuPiBox/raw/main/media/sound/shutdown.wav -O ~/MuPiBox/sysmedia/sound/shutdown.wav &>&3 2>&3
	wget https://github.com/splitti/MuPiBox/raw/main/media/sound/startup.wav -O ~/MuPiBox/sysmedia/sound/startup.wav &>&3 2>&3
	sleep 1

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Copy mupibox-files" &>&3 2>&3

	echo -e "XXX\n75\nDownload MuPiBox-Files... \nXXX"	

	# MuPiBox
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh &>&3 2>&3
	sudo chmod 755 /usr/local/bin/mupibox/change_checker.sh /usr/local/bin/mupibox/idle_shutdown.sh /usr/local/bin/mupibox/m3u_generator.sh /usr/local/bin/mupibox/setting_update.sh /usr/local/bin/mupibox/software_shutdown.sh /usr/local/bin/mupibox/splash_screen.sh &>&3 2>&3
	sleep 1

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Install Hifiberry-MiniAmp and Bluetooth support" &>&3 2>&3

	echo -e "XXX\n77\nInstall Hifiberry-MiniAmp and Bluetooth support... \nXXX"	

	sudo /boot/dietpi/func/dietpi-set_hardware bluetooth enable &>&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware soundcard "hifiberry-dac"  &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf  &>&3 2>&3
	sudo usermod -g pulse -G audio --home /var/run/pulse pulse &>&3 2>&3
	sudo usermod -a -G audio dietpi &>&3 2>&3
	sudo usermod -a -G bluetooth dietpi &>&3 2>&3
	sudo usermod -a -G pulse dietpi &>&3 2>&3
	sudo usermod -a -G pulse-access dietpi &>&3 2>&3
	sudo usermod -a -G pulse root &>&3 2>&3
	sudo usermod -a -G pulse-access root &>&3 2>&3
	sudo /usr/bin/sed -i 's/; system-instance = no/system-instance = yes/g' /etc/pulse/daemon.conf &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/pulseaudio.service -O /etc/systemd/system/pulseaudio.service  &>&3 2>&3

	if grep -q '^load-module module-bluetooth-discover' /etc/pulse/system.pa; then
	  echo -e "load-module module-bluetooth-discover already set" &>&3 2>&3
	else
	  echo '' | sudo tee -a /etc/pulse/system.pa &>&3 2>&3
	  echo 'load-module module-bluetooth-discover' | sudo tee -a /etc/pulse/system.pa &>&3 2>&3
	fi
	if grep -q '^load-module module-bluetooth-policy' /etc/pulse/system.pa; then
	  echo -e "load-module module-bluetooth-policy already set" &>&3 2>&3
	else
	  echo '' | sudo tee -a /etc/pulse/system.pa &>&3 2>&3
	  echo 'load-module module-bluetooth-policy' | sudo tee -a /etc/pulse/system.pa &>&3 2>&3
	fi

	sudo /usr/bin/sed -i 's/; default-server =/default-server = \/var\/run\/pulse\/native/g' /etc/pulse/client.conf &>&3 2>&3
	sudo /usr/bin/sed -i 's/; autospawn = yes/autospawn = no/g' /etc/pulse/client.conf &>&3 2>&3
	sudo systemctl daemon-reload &>&3 2>&3
	sudo systemctl enable pulseaudio &>&3 2>&3
	sudo systemctl start pulseaudio &>&3 2>&3
	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Set environment" &>&3 2>&3

	echo -e "XXX\n82\nSet environment variable... \nXXX"	

	# ENV
	(echo "mupibox"; echo "mupibox") | sudo smbpasswd -s -a dietpi &>&3 2>&3
	sudo env PATH=$PATH:/usr/local/bin/mupibox &>&3 2>&3
	sleep 1


	echo "###################################################" &>&3 2>&3
	echo "Copy OnOffShim-scripts" &>&3 2>&3

	echo -e "XXX\n83\nDownload OnOffShim-Scripts... \nXXX"	

	# OnOffShim & hifiberry
	#sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh &>&3 2>&3
	sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh &>&3 2>&3
	sleep 1

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Configure Chromium" &>&3 2>&3

	echo -e "XXX\n85\nInstall Chromium-Kiosk... \nXXX"	

	suggest_gpu_mem=76 &>&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware gpumemsplit $suggest_gpu_mem &>&3 2>&3
	sudo /boot/dietpi/dietpi-autostart 11 &>&3 2>&3
	echo -ne '\n' | sudo dietpi-software install 113 &>&3 2>&3
	sudo /boot/dietpi/dietpi-autostart 11 &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/chromium-autostart.sh -O /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh &>&3 2>&3
	sudo chmod +x /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh &>&3 2>&3
	sudo usermod -a -G tty dietpi &>&3 2>&3
	sudo apt install xserver-xorg-legacy -y &>&3 2>&3
	sudo /usr/bin/sed -i 's/allowed_users\=console/allowed_users\=anybody/g' /etc/X11/Xwrapper.config &>&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf &>&3 2>&3
	sudo /usr/bin/sed -i 's/tty1/tty3 vt.global_cursor_default\=0 fastboot noatime nodiratime noram splash silent loglevel\=0 vt.default_red\=68,68,68,68,68,68,68,68 vt.default_grn\=175,175,175,175,175,175,175,175 vt.default_blu\=226,226,226,226,226,226,226,226/g' /boot/cmdline.txt &>&3 2>&3

	sudo /usr/bin/sed -i 's/session    optional   pam_motd.so motd\=\/run\/motd.dynamic/#session    optional   pam_motd.so motd\=\/run\/motd.dynamic/g' /etc/pam.d/login &>&3 2>&3
	sudo /usr/bin/sed -i 's/session    optional   pam_motd.so noupdate/#session    optional   pam_motd.so noupdate/g' /etc/pam.d/login &>&3 2>&3
	sudo /usr/bin/sed -i 's/session    optional   pam_lastlog.so/session    optional   pam_lastlog.so/g' /etc/pam.d/login &>&3 2>&3

	sudo /usr/bin/sed -i 's/ExecStart\=-\/sbin\/agetty -a dietpi -J \%I \$TERM/ExecStart\=-\/sbin\/agetty --skip-login --noclear --noissue --login-options \"-f pi\" \%I \$TERM/g' /etc/systemd/system/getty@tty1.service.d/dietpi-autologin.conf &>&3 2>&3

	if grep -q '^initramfs initramfs.img' /boot/config.txt; then
	  echo -e "initramfs initramfs.img already set" &>&3 2>&3
	else
	  echo '' | sudo tee -a /boot/config.txt &>&3 2>&3
	  echo 'initramfs initramfs.img' | sudo tee -a /boot/config.txt &>&3 2>&3
	fi

	###############################################################################################

	echo "###################################################" &>&3 2>&3
	echo "Enable services" &>&3 2>&3

	echo -e "XXX\n95\nEnable and start services... \nXXX"	


	# Enable Services
	sudo systemctl daemon-reload &>&3 2>&3
	sudo systemctl enable mupi_change_checker.service &>&3 2>&3
	sudo systemctl start mupi_change_checker.service &>&3 2>&3
	sudo systemctl enable mupi_idle_shutdown.service &>&3 2>&3
	sudo systemctl start mupi_idle_shutdown.service &>&3 2>&3
	sudo systemctl enable mupi_splash.service &>&3 2>&3
	sudo systemctl start mupi_splash.service &>&3 2>&3
	sudo systemctl enable spotifyd.service &>&3 2>&3
	sudo systemctl start spotifyd.service &>&3 2>&3
	sudo systemctl enable smbd.service &>&3 2>&3
	sudo systemctl start smbd.service &>&3 2>&3
	head -n -2 ~/.bashrc > /tmp/.bashrc && mv /tmp/.bashrc ~/.bashrc &>&3 2>&3



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