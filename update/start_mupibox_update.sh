#!/bin/bash
#

VERSION=$(curl https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json | /usr/bin/jq -r .version)
CONFIG="/etc/mupibox/mupiboxconfig.json"
LOG="/tmp/mupibox_update.log"
exec 3>${LOG}


{
	echo -e "XXX\n0\nPrepare Update... \nXXX"	 >&3 2>&3
	sudo systemctl stop mupi_idle_shutdown.service >&3 2>&3
	sleep 1 >&3 2>&3

	echo -e "XXX\n5\nBackup Userdata... \nXXX"	 >&3 2>&3
	sudo cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json /tmp/data.json >&3 2>&3
	sudo cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json /tmp/config.json >&3 2>&3
	sudo cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/styles.242c97d50a9a860d.css /tmp/styles.242c97d50a9a860d.css >&3 2>&3
	sleep 1 >&3 2>&3

	echo -e "XXX\n7\nUpdate Kids-Controller... \nXXX"	
	sudo su - dietpi -c "pm2 stop server" >&3 2>&3
	#sudo su - dietpi -c "pm2 save" >&3 2>&3
	sudo rm -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/ >&3 2>&3
	sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/nodejs/deploy.zip -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip >&3 2>&3
	sudo unzip /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip -d /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	sudo rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	sudo chown -R dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master

	echo -e "XXX\n20\nRestore Userdata... \nXXX"
	sudo mv /tmp/data.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json  >&3 2>&3
	sudo mv /tmp/config.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json  >&3 2>&3
	sudo mv /tmp/styles.242c97d50a9a860d.css /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/styles.242c97d50a9a860d.css >&3 2>&3
	sudo chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json >&3 2>&3
	sudo chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	sudo chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/styles.242c97d50a9a860d.css >&3 2>&3
	sleep 1 >&3 2>&3


	echo -e "XXX\n22\nDownload MuPiBox-Files... \nXXX"	

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

	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/mupi_shutdown.sh -O /usr/local/bin/mupibox/mupi_shutdown.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/mupi_startup.sh -O /usr/local/bin/mupibox/mupi_startup.sh >&3 2>&3

	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/add_wifi.sh -O /usr/local/bin/mupibox/add_wifi.sh >&3 2>&3
		
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/restart_kiosk.sh -O /usr/local/bin/mupibox/restart_kiosk.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/set_deviceid.sh -O /usr/local/bin/mupibox/set_deviceid.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/spotify_restart.sh -O /usr/local/bin/mupibox/spotify_restart.sh >&3 2>&3
	
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh >&3 2>&3
	sudo chmod 755 /usr/local/bin/mupibox/* >&3 2>&3


	echo -e "XXX\n30\nRestarting Services... \nXXX"	

	sudo su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && npm install" >&3 2>&3
	#sudo su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && pm2 -f start server.js" >&3 2>&3
	#sudo su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && pm2 -f save" >&3 2>&3
	sudo su - dietpi -c "pm2 start server"

	echo -e "XXX\n85\nDownload OnOffShim-Scripts... \nXXX"	
	# OnOffShim
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh >&3 2>&3
	sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3


	echo -e "XXX\n90\nUpdate Admin-Interface... \nXXX"	
	sudo rm -R /var/www/* >&3 2>&3 
	sudo wget https://github.com/splitti/MuPiBox/raw/main/AdminInterface/release/www.zip -O /var/www/www.zip >&3 2>&3
	sudo unzip /var/www/www.zip -d /var/www/ >&3 2>&3
	sudo rm /var/www/www.zip >&3 2>&3
	sudo chown -R www-data:www-data /var/www/ >&3 2>&3
	sudo chmod -R 755 /var/www/ >&3 2>&3
	
	echo -e "XXX\n100\nFinalizing setup... \nXXX"
	sudo cp ${CONFIG} ${CONFIG}_backup  >&3 2>&3
	sudo chmod 777 ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "${VERSION}" '.mupibox.version = $v' ${CONFIG}) >  ${CONFIG}
	sudo chmod 775 ${CONFIG}
	sudo systemctl start mupi_idle_shutdown.service >&3 2>&3

	sudo mv ${LOG} /home/dietpi/.mupibox/last_update.log >&3 2>&3
	sudo chown -R dietpi:dietpi /home/dietpi/.mupibox/last_update.log >&3 2>&3

} | whiptail --title "MuPiBox Autosetup" --gauge "Please wait while installing" 6 60 0

echo "Update finished - please reboot system now!"