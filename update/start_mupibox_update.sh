#!/bin/bash
#

VERSION="0.0.1"
CONFIG="/etc/mupibox/mupiboxconfig.json"
TMPCONFIG="/tmp/mupiboxconfig.json"
LOG="/tmp/mupibox_update.log"
exec 3>${LOG}


{
	echo -e "XXX\n0\nBackup Userdata... \nXXX"	 >&3 2>&3
	sudo cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json /tmp/data.json >&3 2>&3

	echo -e "XXX\n2\nUpdate Kids-Controller... \nXXX"	
	sudo su - dietpi -c "pm2 stop server.js" >&3 2>&3
	sudo su - dietpi -c "pm2 save" >&3 2>&3
	sudo rm -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/ >&3 2>&3
	sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/nodejs/sonos-kids-controller.zip -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip >&3 2>&3
	sudo unzip /home/dietpi/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip -d /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	sudo rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip >&3 2>&3
	sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	sudo chown -R dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master

	echo -e "XXX\n10\nRestore Userdata... \nXXX"	
	sudo cp /tmp/data.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json  >&3 2>&3
	sudo chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json >&3 2>&3

	echo -e "XXX\n15\nRestarting Services... \nXXX"	

	sudo su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && npm install" >&3 2>&3
	sudo su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && pm2 -f start server.js" >&3 2>&3
	sudo su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && pm2 -f save" >&3 2>&3



	echo -e "XXX\n90\nUpdate Admin-Interface... \nXXX"	
	sudo rm -R /var/www/* >&3 2>&3 
	sudo wget https://github.com/splitti/MuPiBox/raw/main/AdminInterface/release/www.zip -O /var/www/www.zip >&3 2>&3
	sudo unzip /var/www/www.zip -d /var/www/ >&3 2>&3
	sudo rm /var/www/www.zip >&3 2>&3
	sudo chown -R www-data:www-data /var/www/ >&3 2>&3
	sudo chmod -R 755 /var/www/ >&3 2>&3
	
	echo -e "XXX\n100\nInstallation complete, please reboot the system... \nXXX"	
	mv ${LOG} /home/dietpi/.mupibox/last_update.log >&3 2>&3

} | whiptail --title "MuPiBox Autosetup" --gauge "Please wait while installing" 6 60 0

sudo cp ${CONFIG} ${CONFIG}_backup  >&3 2>&3

#sudo cp ${CONFIG} ${TMPCONFIG}  >&3 2>&3
#sudo chown www-data:www-data ${TMPCONFIG} >&3 2>&3
sudo chmod 777 ${CONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${VERSION}" '.mupibox.version = $v' ${CONFIG}) >  ${CONFIG}
sudo chmod 775 ${CONFIG}
#sudo mv ${CONFIG} ${CONFIG}_backup  >&3 2>&3
#mv ${TMPCONFIG} ${CONFIG} >&3 2>&3

echo "Update finished"