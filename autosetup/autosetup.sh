#!/bin/bash
#
# Script for MuPiBox Autosetup
# Start with: cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup.sh | bash

#exec {tracefd}>~/.mupibox/autosetup.log; BASH_XTRACEFD=$tracefd; PS4=':$LINENO+'; set -x

LOG="/tmp/autosetup.log"
#https://raw.githubusercontent.com/splitti/MuPiBox/main
SRC="https://mupibox.de/version/latest"

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
	sudo apt-get update >&3 2>&3
	packages2install="git libasound2 jq samba mplayer pulseaudio-module-bluetooth pip id3tool bluez zip rrdtool scrot net-tools wireless-tools autoconf automake bc build-essential"
	sudo apt-get install ${packages2install} -y >&3 2>&3

	for thispackage in `echo ${packages2install}`; do
		PKG_OK=$(dpkg -l ${thispackage} 2>/dev/null | egrep '^ii' | wc -l) >&3 2>&3
		if [ ${PKG_OK} -eq 1 ]; then
		  sudo apt-get --yes install ${thispackage} >&3 2>&3
		fi
	done
	sudo pip install mutagen  >&3 2>&3
	
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

	echo -e "XXX\n17\nInstall Pi-Blaster... \nXXX"	
	sudo rm -R /home/dietpi/pi-blaster >&3 2>&3
	sudo su dietpi -c 'cd /home/dietpi/; git clone https://github.com/sarfata/pi-blaster.git' >&3 2>&3
	sudo su - -c 'cd /home/dietpi/pi-blaster; ./autogen.sh; ./configure; make; make install' >&3 2>&3

	###############################################################################################

	echo -e "XXX\n20\nClean and create directories... \nXXX"	
	# Clean and create Directorys
	sudo rm -R ~/.mupibox >&3 2>&3
	sudo rm -R ~/MuPiBox >&3 2>&3
	mkdir -p ~/.mupibox >&3 2>&3
	mkdir -p ~/.mupibox/chromium_cache >&3 2>&3
	mkdir -p ~/MuPiBox/tts_files >&3 2>&3
	mkdir -p ~/MuPiBox/sysmedia/sound >&3 2>&3
	mkdir ~/MuPiBox/sysmedia/images >&3 2>&3
	mkdir ~/MuPiBox/media >&3 2>&3
	mkdir ~/MuPiBox/media/audiobook >&3 2>&3
	mkdir ~/MuPiBox/media/music >&3 2>&3
	mkdir ~/MuPiBox/media/cover >&3 2>&3
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
		sudo wget ${SRC}/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json >&3 2>&3
	fi
	sudo chown root:www-data /etc/mupibox/mupiboxconfig.json >&3 2>&3
	sudo chmod 777 /etc/mupibox/mupiboxconfig.json >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n22\nInstall mplayer-wrapper... \nXXX"	
	# Sources
	cd ~/.mupibox >&3 2>&3
	git clone https://github.com/derhuerst/mplayer-wrapper >&3 2>&3
	wget ${SRC}/dev/customize/mplayer-wrapper/index.js -O ~/.mupibox/mplayer-wrapper/index.js >&3 2>&3
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

	wget ${SRC}/bin/nodejs/deploy.zip -O ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip >&3 2>&3
	unzip ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip -d ~/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	rm ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip >&3 2>&3
	wget ${SRC}/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
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
	wget ${SRC}/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json >&3 2>&3
	wget ${SRC}/bin/nodejs/spotify-control.js -O ~/.mupibox/spotifycontroller-main/spotify-control.js >&3 2>&3
	ln -s /etc/mupibox/mupiboxconfig.json ~/.mupibox/spotifycontroller-main/config/mupiboxconfig.json >&3 2>&3
	npm install >&3 2>&3 
	pm2 start spotify-control.js >&3 2>&3
	pm2 save >&3 2>&3

	###############################################################################################

	echo -e "XXX\n63\nDownload binaries... \nXXX"	

	# Binaries
	sudo wget ${SRC}/bin/fbv/fbv -O /usr/bin/fbv >&3 2>&3
	sudo wget ${SRC}/bin/spotifyd/0.3.3/spotifyd -O /usr/bin/spotifyd >&3 2>&3
	sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n68\nDownload DietPi-Config... \nXXX"	

	# DietPi-Configs
	#sudo wget ${SRC}/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf
	sudo wget ${SRC}/config/templates/asound.conf -O /etc/asound.conf >&3 2>&3
	sudo wget ${SRC}/config/templates/smb.conf -O /etc/samba/smb.conf >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n69\nDownload spotifyd-Config... \nXXX"	


	# spotifyd-Config
	sudo wget ${SRC}/config/templates/spotifyd.conf -O /etc/spotifyd/spotifyd.conf >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n70\nDownload some media files... \nXXX"	
	# Splash and Media
	sudo wget ${SRC}/config/templates/splash.txt -O /boot/splash.txt >&3 2>&3
	sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img >&3 2>&3
	wget ${SRC}/media/images/goodbye.png -O ~/MuPiBox/sysmedia/images/goodbye.png >&3 2>&3
	sudo wget ${SRC}/media/images/splash.png -O /boot/splash.png >&3 2>&3
	wget ${SRC}/media/images/MuPiLogo.jpg -O ~/MuPiBox/sysmedia/images/MuPiLogo.jpg >&3 2>&3
	wget ${SRC}/media/sound/shutdown.wav -O ~/MuPiBox/sysmedia/sound/shutdown.wav >&3 2>&3
	wget ${SRC}/media/sound/startup.wav -O ~/MuPiBox/sysmedia/sound/startup.wav >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n75\nDownload MuPiBox-Files... \nXXX"	

	# MuPiBox
	sudo wget ${SRC}/themes/dark.css -O ~/MuPiBox/themes/dark.css >&3 2>&3
	sudo wget ${SRC}/themes/blue.css -O ~/MuPiBox/themes/blue.css >&3 2>&3
	sudo wget ${SRC}/themes/purple.css -O ~/MuPiBox/themes/purple.css >&3 2>&3
	sudo wget ${SRC}/themes/darkred.css -O ~/MuPiBox/themes/darkred.css >&3 2>&3
	sudo wget ${SRC}/themes/red.css -O ~/MuPiBox/themes/red.css >&3 2>&3
	sudo wget ${SRC}/themes/chocolate.css -O ~/MuPiBox/themes/chocolate.css >&3 2>&3
	sudo wget ${SRC}/themes/vintage.css -O ~/MuPiBox/themes/vintage.css >&3 2>&3
	sudo wget ${SRC}/themes/orange.css -O ~/MuPiBox/themes/orange.css >&3 2>&3
	sudo wget ${SRC}/themes/green.css -O ~/MuPiBox/themes/green.css >&3 2>&3
	sudo wget ${SRC}/themes/light.css -O ~/MuPiBox/themes/light.css >&3 2>&3
	sudo wget ${SRC}/themes/deepblue.css -O ~/MuPiBox/themes/deepblue.css >&3 2>&3
	sudo wget ${SRC}/themes/pink.css -O ~/MuPiBox/themes/pink.css >&3 2>&3
	sudo wget ${SRC}/themes/xmas.css -O /home/dietpi/MuPiBox/themes/xmas.css >&3 2>&3
	sudo wget ${SRC}/themes/wood.css -O /home/dietpi/MuPiBox/themes/wood.css >&3 2>&3
	sudo wget ${SRC}/themes/matrix.css -O /home/dietpi/MuPiBox/themes/matrix.css >&3 2>&3
	sudo wget ${SRC}/themes/ironman.css -O /home/dietpi/MuPiBox/themes/ironman.css >&3 2>&3
	sudo wget ${SRC}/themes/captainamerica.css -O /home/dietpi/MuPiBox/themes/captainamerica.css >&3 2>&3
	sudo wget ${SRC}/themes/xmas.css -O /home/dietpi/MuPiBox/themes/xmas.css >&3 2>&3
	sudo wget ${SRC}/themes/danger.css -O /home/dietpi/MuPiBox/themes/danger.css >&3 2>&3
	sudo wget ${SRC}/themes/mint.css -O /home/dietpi/MuPiBox/themes/mint.css >&3 2>&3
	sudo wget ${SRC}/themes/cinema.css -O /home/dietpi/MuPiBox/themes/cinema.css >&3 2>&3

	sudo wget ${SRC}/scripts/mupibox/mupi_shutdown.sh -O /usr/local/bin/mupibox/mupi_shutdown.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/mupi_startup.sh -O /usr/local/bin/mupibox/mupi_startup.sh >&3 2>&3

	sudo wget ${SRC}/scripts/mupibox/shutdown.sh -O /usr/local/bin/mupibox/shutdown.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/restart.sh -O /usr/local/bin/mupibox/restart.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh >&3 2>&3
	#sudo wget ${SRC}/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/add_wifi.sh -O /usr/local/bin/mupibox/add_wifi.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/save_rrd.sh -O /usr/local/bin/mupibox/save_rrd.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/get_network.sh -O /usr/local/bin/mupibox/get_network.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/check_network.sh -O /usr/local/bin/mupibox/check_network.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/check_network.py -O /usr/local/bin/mupibox/check_network.py >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/add_index.sh -O /usr/local/bin/mupibox/add_index.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/id3tag_converter.sh -O /usr/local/bin/mupibox/id3tag_converter.sh  >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/set_hostname.sh -O /usr/local/bin/mupibox/set_hostname.sh  >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/repair_config.sh -O /usr/local/bin/mupibox/repair_config.sh  >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/mupi_start_led.sh -O /usr/local/bin/mupibox/mupi_start_led.sh  >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/mupi_stop_led.sh -O /usr/local/bin/mupibox/mupi_stop_led.sh  >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/sleep_timer.sh -O /usr/local/bin/mupibox/sleep_timer.sh  >&3 2>&3

	sudo wget ${SRC}/scripts/bluetooth/start_bt.sh -O /usr/local/bin/mupibox/start_bt.sh >&3 2>&3
	sudo wget ${SRC}/scripts/bluetooth/stop_bt.sh -O /usr/local/bin/mupibox/stop_bt.sh >&3 2>&3
	sudo wget ${SRC}/scripts/bluetooth/scan_bt.sh -O /usr/local/bin/mupibox/scan_bt.sh >&3 2>&3
	sudo wget ${SRC}/scripts/bluetooth/pair_bt.sh -O /usr/local/bin/mupibox/pair_bt.sh >&3 2>&3
	sudo wget ${SRC}/scripts/bluetooth/remove_bt.sh -O /usr/local/bin/mupibox/remove_bt.sh >&3 2>&3
	sudo wget ${SRC}/scripts/bluetooth/autoconnect_bt.sh -O /usr/local/bin/mupibox/autoconnect_bt.sh >&3 2>&3
		
	sudo wget ${SRC}/scripts/mupibox/restart_kiosk.sh -O /usr/local/bin/mupibox/restart_kiosk.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/set_deviceid.sh -O /usr/local/bin/mupibox/set_deviceid.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/spotify_restart.sh -O /usr/local/bin/mupibox/spotify_restart.sh >&3 2>&3
	
	sudo wget ${SRC}/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh >&3 2>&3
	sudo chmod 755 /usr/local/bin/mupibox/* >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n77\nInstall Hifiberry-MiniAmp and Bluetooth support... \nXXX"	

	sudo /boot/dietpi/dietpi-software install 5 >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware bluetooth enable >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware soundcard "hifiberry-dac"  >&3 2>&3
	sudo wget ${SRC}/config/templates/asound.conf -O /etc/asound.conf  >&3 2>&3
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
	sudo wget ${SRC}/AdminInterface/release/www.zip -O /var/www/www.zip >&3 2>&3
	sudo unzip /var/www/www.zip -d /var/www/ >&3 2>&3
	sudo rm /var/www/www.zip >&3 2>&3
	sudo ln -s /home/dietpi/MuPiBox/media/cover /var/www/cover >&3 2>&3
	sudo chown -R www-data:www-data /var/www/ >&3 2>&3
	sudo chmod -R 755 /var/www/ >&3 2>&3
	sudo chown -R dietpi:www-data /home/dietpi/MuPiBox/media/cover >&3 2>&3
	
	###############################################################################################

	echo -e "XXX\n87\nSet environment... \nXXX"	

	# ENV
	(echo "mupibox"; echo "mupibox") | sudo smbpasswd -s -a dietpi >&3 2>&3
	sudo env PATH=$PATH:/usr/local/bin/mupibox >&3 2>&3
	THEME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css" >&3 2>&3
	ln -s /home/dietpi/MuPiBox/themes/blue.css ${THEME_FILE} >&3 2>&3
	sudo echo "www-data ALL=(ALL:ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/www-data  >&3 2>&3
	sudo usermod -a -G gpio dietpi >&3 2>&3
	sudo usermod -a -G gpio root >&3 2>&3
	sudo wget ${SRC}/config/templates/crontab.template -O /tmp/crontab.template >&3 2>&3
	sudo /usr/bin/chmod 755 /tmp/crontab.template >&3 2>&3
	sudo /usr/bin/chown dietpi:dietpi /tmp/crontab.template >&3 2>&3
	sudo /bin/su dietpi -c "/usr/bin/crontab /tmp/crontab.template"  >&3 2>&3
	sudo rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json
	ln -s /tmp/network.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json	
	#sudo /boot/dietpi/func/dietpi-set_swapfile 1 zram >&3 2>&3
	#sudo /boot/dietpi/func/dietpi-set_software boot_wait_for_network 0 >&3 2>&3
	VERSION=$(curl -sL ${SRC}/version.json | /usr/bin/jq -r .version) >&3 2>&3
	sudo /usr/bin/sed -i 's/\"version\": \"\"/\"version\": \"'${VERSION}'\"/g' ${MUPIBOX_CONFIG} >&3 2>&3
	#sudo /usr/bin/cat <<< $(/usr/bin/jq --arg v "${VERSION}" '.mupibox.version = $v' ${MUPIBOX_CONFIG}) > ${MUPIBOX_CONFIG} >&3 2>&3
	sudo chmod 775 /etc/mupibox/mupiboxconfig.json >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n88\nDownload OnOffShim-Scripts... \nXXX"	

	# OnOffShim
	sudo wget ${SRC}/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	sudo wget ${SRC}/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh >&3 2>&3
	sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	sleep 1

	###############################################################################################

	echo -e "XXX\n90\nInstall Chromium-Kiosk... \nXXX"	

	echo -ne '\n' | sudo /boot/dietpi/dietpi-software install 113 >&3 2>&3
	sudo /boot/dietpi/dietpi-autostart 11 >&3 2>&3
	sudo wget ${SRC}/scripts/chromium-autostart.sh -O /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	sudo chmod +x /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	sudo usermod -a -G tty dietpi >&3 2>&3
	#xinit chromium-browser xserver-xorg-legacy xorg
	sudo apt-get install xserver-xorg-legacy >&3 2>&3
	sudo /usr/bin/sed -i 's/allowed_users\=console/allowed_users\=anybody/g' /etc/X11/Xwrapper.config >&3 2>&3
	sudo wget ${SRC}/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf >&3 2>&3
	sudo /usr/bin/sed -i 's/tty1/tty3 vt.global_cursor_default\=0 fastboot noatime nodiratime noram splash silent loglevel\=0 vt.default_red\=68,68,68,68,68,68,68,68 vt.default_grn\=175,175,175,175,175,175,175,175 vt.default_blu\=226,226,226,226,226,226,226,226/g' /boot/cmdline.txt >&3 2>&3
	sudo /usr/bin/sed -i 's/session    optional   pam_motd.so motd\=\/run\/motd.dynamic/#session    optional   pam_motd.so motd\=\/run\/motd.dynamic/g' /etc/pam.d/login >&3 2>&3
	sudo /usr/bin/sed -i 's/session    optional   pam_motd.so noupdate/#session    optional   pam_motd.so noupdate/g' /etc/pam.d/login >&3 2>&3
	sudo /usr/bin/sed -i 's/session    optional   pam_lastlog.so/session    optional   pam_lastlog.so/g' /etc/pam.d/login >&3 2>&3
	sudo /usr/bin/sed -i 's/ExecStart\=-\/sbin\/agetty -a dietpi -J \%I \$TERM/ExecStart\=-\/sbin\/agetty --skip-login --noclear --noissue --login-options \"-f dietpi\" \%I \$TERM/g' /etc/systemd/system/getty@tty1.service.d/dietpi-autologin.conf >&3 2>&3
	#suggest_gpu_mem=76 >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware gpumemsplit 128 >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware headless 0 >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware rpi-opengl disable >&3 2>&3
	sudo su - -c ". /boot/dietpi/func/dietpi-globals && G_CHECK_ROOT_USER && G_CHECK_ROOTFS_RW && G_INIT && G_CONFIG_INJECT 'framebuffer_width=' \"framebuffer_width=800\" /boot/config.txt" >&3 2>&3
	sudo su - -c ". /boot/dietpi/func/dietpi-globals && G_CHECK_ROOT_USER && G_CHECK_ROOTFS_RW && G_INIT && G_CONFIG_INJECT 'framebuffer_height=' \"framebuffer_height=480\" /boot/config.txt" >&3 2>&3

	if grep -q '^initramfs initramfs.img' /boot/config.txt; then
	  echo -e "initramfs initramfs.img already set"
	  
	  echo '' | sudo tee -a /boot/config.txt >&3 2>&3
	  echo 'initramfs initramfs.img' | sudo tee -a /boot/config.txt >&3 2>&3
	fi

	###############################################################################################

	echo -e "XXX\n95\nEnable and start services... \nXXX"	

	# Enable Services
	#sudo wget ${SRC}/config/services/mupi_change_checker.service -O /etc/systemd/system/mupi_change_checker.service >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_idle_shutdown.service -O /etc/systemd/system/mupi_idle_shutdown.service >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_splash.service -O /etc/systemd/system/mupi_splash.service >&3 2>&3
	sudo wget ${SRC}/config/services/spotifyd.service -O /etc/systemd/system/spotifyd.service >&3 2>&3
	sudo wget ${SRC}/config/services/pulseaudio.service -O /etc/systemd/system/pulseaudio.service >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_startstop.service -O /etc/systemd/system/mupi_startstop.service >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_wifi.service -O /etc/systemd/system/mupi_wifi.service  >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_check_internet.service -O /etc/systemd/system/mupi_check_internet.service  >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_autoconnect_bt.service -O /etc/systemd/system/mupi_autoconnect_bt.service  >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_vnc.service -O /etc/systemd/system/mupi_vnc.service  >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_novnc.service -O /etc/systemd/system/mupi_novnc.service  >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_powerled.service -O /etc/systemd/system/mupi_powerled.service  >&3 2>&3

	sudo systemctl daemon-reload >&3 2>&3
	sudo systemctl enable mupi_wifi.service >&3 2>&3
	sudo systemctl start mupi_wifi.service >&3 2>&3
	sudo systemctl enable mupi_check_internet.service >&3 2>&3
	sudo systemctl start mupi_check_internet.service >&3 2>&3
	#sudo systemctl enable mupi_change_checker.service >&3 2>&3
	#sudo systemctl start mupi_change_checker.service >&3 2>&3
	sudo systemctl enable mupi_idle_shutdown.service >&3 2>&3
	sudo systemctl start mupi_idle_shutdown.service >&3 2>&3
	sudo systemctl enable spotifyd.service >&3 2>&3
	sudo systemctl start spotifyd.service >&3 2>&3
	sudo systemctl enable smbd.service >&3 2>&3
	sudo systemctl start smbd.service >&3 2>&3
	sudo systemctl enable mupi_startstop.service >&3 2>&3
	sudo systemctl start mupi_startstop.service >&3 2>&3
	sudo systemctl enable pulseaudio.service >&3 2>&3
	sudo systemctl start pulseaudio.service >&3 2>&3
	sudo systemctl enable mupi_splash.service >&3 2>&3
	sudo systemctl start mupi_splash.service >&3 2>&3
	sudo systemctl enable mupi_powerled.service >&3 2>&3
	sudo systemctl start mupi_powerled.service >&3 2>&3

	###############################################################################################

	echo -e "XXX\n100\nInstallation complete, please reboot the system... \nXXX"	
	sudo mv ${LOG} /boot/autosetup.log

} | whiptail --title "MuPiBox Autosetup" --gauge "Please wait while installing" 6 60 0

sudo reboot

