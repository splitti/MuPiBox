#!/bin/bash
#

VERSION="0.0.1"
CONFIG="/etc/mupibox/mupiboxconfig.json"
TMPCONFIG="/tmp/mupiboxconfig.json"
LOG="/tmp/autosetup.log"
sudo exec 3>${LOG}


{
	echo -e "XXX\n0\nBackup Userdata... \nXXX"	 >&3 2>&3
	cp ~/.mupibox/Sonos-Kids-Controller-master/server/config/data.json /tmp/data.json >&3 2>&3

	echo -e "XXX\n2\nUpdate Kids-Controller... \nXXX"	
	sudo sh -c 'su - dietpi -s "pm2 stop server.js"' >&3 2>&3
	sudo sh -c 'su - dietpi -s "pm2 save"' >&3 2>&3
	sudo rm -R ~/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	sudo sh -c 'su - dietpi -s "mkdir ~/.mupibox/Sonos-Kids-Controller-master/"' >&3 2>&3
	sudo sh -c 'wget https://github.com/splitti/MuPiBox/raw/main/bin/nodejs/sonos-kids-controller.zip -O ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip' >&3 2>&3
	sudo sh -c 'unzip ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip -d ~/.mupibox/Sonos-Kids-Controller-master/' >&3 2>&3
	sudo rm ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip >&3 2>&3
	sudo sh -c 'wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json' >&3 2>&3
	cd ~/.mupibox/Sonos-Kids-Controller-master >&3 2>&3
	sudo chown -R dietpi:dietpi ~/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	sudo sh -c 'su - dietpi -s "cd ~/.mupibox/Sonos-Kids-Controller-master && npm install"' >&3 2>&3
	sudo sh -c 'su - dietpi -s "cd ~/.mupibox/Sonos-Kids-Controller-master && pm2 -f start server.js"' >&3 2>&3
	sudo sh -c 'su - dietpi -s "cd ~/.mupibox/Sonos-Kids-Controller-master && pm2 -f save"' >&3 2>&3

	echo -e "XXX\n10\nRestore Userdata... \nXXX"	
	cp /tmp/data.json ~/.mupibox/Sonos-Kids-Controller-master/server/config/data.json  >&3 2>&3
	sudo chown dietpi:dietpi ~/.mupibox/Sonos-Kids-Controller-master/server/config/data.json >&3 2>&3

	echo -e "XXX\n90\nUpdate Admin-Interface... \nXXX"	
	sudo rm -R /var/www/* >&3 2>&3 
	sudo wget https://github.com/splitti/MuPiBox/raw/main/AdminInterface/release/www.zip -O /var/www/www.zip >&3 2>&3
	sudo unzip /var/www/www.zip -d /var/www/ >&3 2>&3
	sudo rm /var/www/www.zip >&3 2>&3
	sudo chown -R www-data:www-data /var/www/ >&3 2>&3
	sudo chmod -R 755 /var/www/ >&3 2>&3
	
	echo -e "XXX\n100\nInstallation complete, please reboot the system... \nXXX"	
} | whiptail --title "MuPiBox Autosetup" --gauge "Please wait while installing" 6 60 0

sudo cp ${CONFIG} ${CONFIG}_backup  >&3 2>&3

#sudo cp ${CONFIG} ${TMPCONFIG}  >&3 2>&3
#sudo chown www-data:www-data ${TMPCONFIG} >&3 2>&3
sudo chmod 777 ${CONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${VERSION}" '.mupibox.version = $v' ${CONFIG}) >  ${CONFIG}
sudo chmod 775 ${CONFIG}
#sudo mv ${CONFIG} ${CONFIG}_backup  >&3 2>&3
#mv ${TMPCONFIG} ${CONFIG} >&3 2>&3
mv ${LOG} ~/.mupibox/last_update.log >&3 2>&3

echo "Update finished"