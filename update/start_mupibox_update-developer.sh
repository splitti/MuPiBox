#!/bin/bash
#

#https://raw.githubusercontent.com/splitti/MuPiBox/main
SRC="https://raw.githubusercontent.com/splitti/MuPiBox/main"
VERSION=$(curl -L ${SRC}/version.json | /usr/bin/jq -r .version)
CONFIG="/etc/mupibox/mupiboxconfig.json"
LOG="/tmp/mupibox_update.log"
exec 3>${LOG}
sudo service mupi_idle_shutdown stop

{
	echo -e "XXX\n0\nPrepare Update... \nXXX"	 >&3 2>&3
	sudo systemctl stop mupi_idle_shutdown.service >&3 2>&3
	sudo mkdir /home/dietpi/.mupibox/chromium_cache >&3 2>&3	
	sudo mkdir /home/dietpi/MuPiBox/media/audiobook >&3 2>&3	
	sudo mkdir /home/dietpi/MuPiBox/media/music >&3 2>&3
	sudo mkdir /home/dietpi/MuPiBox/media/cover >&3 2>&3
	sudo chown dietpi:dietpi /home/dietpi/MuPiBox/media/audiobook >&3 2>&3
	sudo chown dietpi:dietpi /home/dietpi/MuPiBox/media/music >&3 2>&3
	sleep 1 >&3 2>&3

	echo -e "XXX\n1\nInstall some packages... Please wait!\nXXX"
	# Get missing packages
	sudo apt-get update >&3 2>&3
	sudo apt-get -y --install-recommends -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" install x11vnc git libasound2 jq samba mplayer pulseaudio-module-bluetooth pip id3tool bluez zip rrdtool scrot net-tools wireless-tools autoconf automake bc build-essential >&3 2>&3
	sudo pip install mutagen  >&3 2>&3

	echo -e "XXX\n5\nBackup Userdata... \nXXX"	 >&3 2>&3
	sudo cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json /tmp/data.json >&3 2>&3
	sudo cp -r /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover /tmp/cover >&3 2>&3
	sudo cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json /tmp/config.json >&3 2>&3
	sudo cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css /tmp/active_theme.css >&3 2>&3
	sleep 1 >&3 2>&3

	echo -e "XXX\n7\nUpdate Kids-Controller... \nXXX"	
	sudo su - dietpi -c "pm2 stop server" >&3 2>&3
	#sudo su - dietpi -c "pm2 save" >&3 2>&3
	sudo rm -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/ >&3 2>&3
	sudo wget ${SRC}/bin/nodejs/deploy.zip -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip >&3 2>&3
	sudo unzip /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip -d /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	sudo rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip >&3 2>&3
	sudo wget ${SRC}/config/templates/www.json -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	sudo chown -R dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master

	echo -e "XXX\n18\nUpdate MPlayer Wrapper... \nXXX"	
	sudo wget ${SRC}/dev/customize/mplayer-wrapper/index.js -O /home/dietpi/.mupibox/mplayer-wrapper/index.js >&3 2>&3

	echo -e "XXX\n19\nUpdate Spotify Control... \nXXX"	
	wget ${SRC}/bin/nodejs/spotify-control.js -O /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js >&3 2>&3

	echo -e "XXX\n20\nRestore Userdata... \nXXX"
	sudo mv /tmp/data.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json  >&3 2>&3
	sudo mv /tmp/cover /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover  >&3 2>&3
	sudo mv /tmp/config.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json  >&3 2>&3
	sudo mv /tmp/active_theme.css /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css >&3 2>&3
	sudo chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json >&3 2>&3
	sudo chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	sleep 1 >&3 2>&3


	echo -e "XXX\n22\nDownload MuPiBox-Files... \nXXX"	

	# MuPiBox
	mkdir -p ~/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth >&3 2>&3
	mkdir -p ~/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk >&3 2>&3
	wget ${SRC}/themes/earth/earth-bg.jpg -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth/earth-bg.jpg >&3 2>&3
	wget ${SRC}/themes/earth/Nasa21.ttf -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth/Nasa21.ttf >&3 2>&3
	sudo chown dietpi:dietpi -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www >&3 2>&3
	sudo wget ${SRC}/themes/earth.css -O /home/dietpi/MuPiBox/themes/earth.css >&3 2>&3

	sudo wget ${SRC}/themes/dark.css -O /home/dietpi/MuPiBox/themes/dark.css >&3 2>&3
	sudo wget ${SRC}/themes/blue.css -O /home/dietpi/MuPiBox/themes/blue.css >&3 2>&3
	sudo wget ${SRC}/themes/purple.css -O /home/dietpi/MuPiBox/themes/purple.css >&3 2>&3
	sudo wget ${SRC}/themes/darkred.css -O /home/dietpi/MuPiBox/themes/darkred.css >&3 2>&3
	sudo wget ${SRC}/themes/red.css -O /home/dietpi/MuPiBox/themes/red.css >&3 2>&3
	sudo wget ${SRC}/themes/chocolate.css -O /home/dietpi/MuPiBox/themes/chocolate.css >&3 2>&3
	sudo wget ${SRC}/themes/vintage.css -O /home/dietpi/MuPiBox/themes/vintage.css >&3 2>&3
	sudo wget ${SRC}/themes/orange.css -O /home/dietpi/MuPiBox/themes/orange.css >&3 2>&3
	sudo wget ${SRC}/themes/green.css -O /home/dietpi/MuPiBox/themes/green.css >&3 2>&3
	sudo wget ${SRC}/themes/light.css -O /home/dietpi/MuPiBox/themes/light.css >&3 2>&3
	sudo wget ${SRC}/themes/deepblue.css -O /home/dietpi/MuPiBox/themes/deepblue.css >&3 2>&3
	sudo wget ${SRC}/themes/pink.css -O /home/dietpi/MuPiBox/themes/pink.css >&3 2>&3
	sudo wget ${SRC}/themes/xmas.css -O /home/dietpi/MuPiBox/themes/xmas.css >&3 2>&3
	sudo wget ${SRC}/themes/wood.css -O /home/dietpi/MuPiBox/themes/wood.css >&3 2>&3
	sudo wget ${SRC}/themes/matrix.css -O /home/dietpi/MuPiBox/themes/matrix.css >&3 2>&3
	sudo wget ${SRC}/themes/ironman.css -O /home/dietpi/MuPiBox/themes/ironman.css >&3 2>&3
	sudo wget ${SRC}/themes/captainamerica.css -O /home/dietpi/MuPiBox/themes/captainamerica.css >&3 2>&3
	sudo wget ${SRC}/themes/xmas.css -O /home/dietpi/MuPiBox/themes/xmas.css >&3 2>&3
	sudo wget ${SRC}/themes/danger.css -O /home/dietpi/MuPiBox/themes/danger.css >&3 2>&3
	sudo wget ${SRC}/themes/mint.css -O /home/dietpi/MuPiBox/themes/mint.css >&3 2>&3
	sudo wget ${SRC}/themes/cinema.css -O /home/dietpi/MuPiBox/themes/cinema.css >&3 2>&3
	
	sudo wget ${SRC}/media/images/goodbye.png -O /home/dietpi/MuPiBox/sysmedia/images/goodbye.png >&3 2>&3
	sudo chown dietpi:dietpi /home/dietpi/MuPiBox/sysmedia/images/goodbye.png >&3 2>&3
	sudo wget ${SRC}/media/images/MuPiLogo.jpg -O /home/dietpi/MuPiBox/sysmedia/images/MuPiLogo.jpg >&3 2>&3
	sudo chown dietpi:dietpi /home/dietpi/MuPiBox/sysmedia/images/MuPiLogo.jpg >&3 2>&3
	sudo wget ${SRC}/media/images/splash.png -O /boot/splash.png >&3 2>&3
	sudo wget ${SRC}/scripts/chromium-autostart.sh -O /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3

	sudo wget ${SRC}/scripts/mupibox/mupi_shutdown.sh -O /usr/local/bin/mupibox/mupi_shutdown.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/mupi_startup.sh -O /usr/local/bin/mupibox/mupi_startup.sh >&3 2>&3

	sudo wget ${SRC}/scripts/mupibox/shutdown.sh -O /usr/local/bin/mupibox/shutdown.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/restart.sh -O /usr/local/bin/mupibox/restart.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/add_wifi.sh -O /usr/local/bin/mupibox/add_wifi.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/save_rrd.sh -O /usr/local/bin/mupibox/save_rrd.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/get_network.sh -O /usr/local/bin/mupibox/get_network.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/check_network.sh -O /usr/local/bin/mupibox/check_network.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/check_network.py -O /usr/local/bin/mupibox/check_network.py >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/add_index.sh -O /usr/local/bin/mupibox/add_index.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/data_clean.sh -O /usr/local/bin/mupibox/data_clean.sh >&3 2>&3
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
	sudo wget ${SRC}/config/services/mupi_autoconnect_bt.service -O /etc/systemd/system/mupi_autoconnect_bt.service  >&3 2>&3

	sudo wget ${SRC}/scripts/mupibox/restart_kiosk.sh -O /usr/local/bin/mupibox/restart_kiosk.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/set_deviceid.sh -O /usr/local/bin/mupibox/set_deviceid.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/get_deviceid.sh -O /usr/local/bin/mupibox/get_deviceid.sh >&3 2>&3
	sudo wget ${SRC}/scripts/mupibox/spotify_restart.sh -O /usr/local/bin/mupibox/spotify_restart.sh >&3 2>&3

	sudo wget ${SRC}/config/services/mupi_vnc.service -O /etc/systemd/system/mupi_vnc.service  >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_novnc.service -O /etc/systemd/system/mupi_novnc.service  >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_check_internet.service -O /etc/systemd/system/mupi_check_internet.service  >&3 2>&3
	
	sudo wget ${SRC}/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh >&3 2>&3
	sudo chmod 755 /usr/local/bin/mupibox/* >&3 2>&3


	echo -e "XXX\n30\nRestarting Services... \nXXX"
	sudo wget ${SRC}/config/services/mupi_check_internet.service -O /etc/systemd/system/mupi_check_internet.service  >&3 2>&3
	sudo wget ${SRC}/config/services/mupi_powerled.service -O /etc/systemd/system/mupi_powerled.service  >&3 2>&3
	sudo su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && npm install" >&3 2>&3
	#sudo su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && pm2 -f start server.js" >&3 2>&3
	#sudo su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && pm2 -f save" >&3 2>&3
	sudo su - dietpi -c "pm2 start server"
	sudo systemctl daemon-reload >&3 2>&3
	sudo systemctl enable mupi_check_internet.service >&3 2>&3
	sudo systemctl start mupi_check_internet.service >&3 2>&3
	sudo systemctl enable mupi_powerled.service >&3 2>&3
	sudo systemctl start mupi_powerled.service >&3 2>&3

	echo -e "XXX\n78\nInstall Pi-Blaster... \nXXX"	
	sudo rm -R /home/dietpi/pi-blaster >&3 2>&3
	sudo su dietpi -c 'cd /home/dietpi/; git clone https://github.com/sarfata/pi-blaster.git' >&3 2>&3
	sudo su - -c 'cd /home/dietpi/pi-blaster; ./autogen.sh; ./configure; make; make install' >&3 2>&3
	LEDPIN=`cat ${CONFIG} | jq -r '.shim.ledPin'`
	DAEMON_ARGS='DAEMON_ARGS="--gpio '${LEDPIN}'"'
	sudo /usr/bin/sed -i 's|DAEMON_ARGS=".*"|'"${DAEMON_ARGS}"'|g' /etc/init.d/pi-blaster.boot.sh >&3 2>&3


	echo -e "XXX\n83\nSet environment...  \nXXX"	
	sudo wget ${SRC}/config/templates/crontab.template -O /tmp/crontab.template >&3 2>&3
	sudo /usr/bin/chmod 755 /tmp/crontab.template >&3 2>&3
	sudo /usr/bin/chown dietpi:dietpi /tmp/crontab.template >&3 2>&3
	sudo /bin/su dietpi -c "/usr/bin/crontab /tmp/crontab.template"  >&3 2>&3
	
	echo -e "XXX\n85\nDownload OnOffShim-Scripts... \nXXX"	
	# OnOffShim
	sudo wget ${SRC}/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	sudo wget ${SRC}/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh >&3 2>&3
	sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3


	echo -e "XXX\n90\nUpdate Admin-Interface... \nXXX"	
	sudo rm -R /var/www/* >&3 2>&3 
	sudo wget ${SRC}/AdminInterface/release/www.zip -O /var/www/www.zip >&3 2>&3
	sudo unzip /var/www/www.zip -d /var/www/ >&3 2>&3
	sudo rm /var/www/www.zip >&3 2>&3
	sudo ln -s /home/dietpi/MuPiBox/media/cover /var/www/cover >&3 2>&3
	sudo chown -R www-data:www-data /var/www/ >&3 2>&3
	sudo chmod -R 755 /var/www/ >&3 2>&3
	sudo chown -R dietpi:www-data /home/dietpi/MuPiBox/media/cover >&3 2>&3

	echo -e "XXX\n95\nUpdate Config-File... \nXXX"	
	sudo cd; curl -L ${SRC}/update/conf_update.sh | sudo bash >&3 2>&3
	
	echo -e "XXX\n98\nFinalizing setup... \nXXX"
	sudo cp ${CONFIG} ${CONFIG}_backup  >&3 2>&3
	sudo chmod 777 ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "${VERSION}" '.mupibox.version = $v' ${CONFIG}) >  ${CONFIG}
	sudo chmod 775 ${CONFIG}
	sudo systemctl start mupi_idle_shutdown.service >&3 2>&3
	sudo rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json
	ln -s /tmp/network.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json
	sudo systemctl stop mupi_change_checker.service >&3 2>&3
	sudo systemctl disable mupi_change_checker.service >&3 2>&3
	sudo rm /etc/systemd/system/mupi_change_checker.service >&3 2>&3
	sudo /usr/local/bin/mupibox/./m3u_generator.sh >&3 2>&3
	
	sudo mv ${LOG} /home/dietpi/.mupibox/last_update.log >&3 2>&3
	sudo chown -R dietpi:dietpi /home/dietpi/.mupibox/last_update.log >&3 2>&3
	sudo chown dietpi:dietpi ${CONFIG}

} | whiptail --title "MuPiBox Update" --gauge "Please wait while installing" 6 60 0

echo "Update finished - please reboot system now!"
