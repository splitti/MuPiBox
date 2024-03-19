#!/bin/bash
#
# Script for MuPiBox Autosetup
# Start with: cd; curl https://raw.githubusercontent.com/friebi/MuPiBox/main/autosetup/autosetup-stable.sh | bash

#exec {tracefd}>/home/dietpi/.mupibox/autosetup.log; BASH_XTRACEFD=$tracefd; PS4=':$LINENO+'; set -x

RELEASE="stable"
LOG="/tmp/autosetup.log"
VER_JSON="/tmp/version.json"
OS=$(grep -E '^(VERSION_CODENAME)=' /etc/os-release)  >&3 2>&3
OS=${OS:17}  >&3 2>&3
ARCH=$(uname -m) >&3 2>&3

autosetup="$(cat /home/dietpi/.bashrc | grep autosetup)"

if(( ${#autosetup} > 0 ))
then
  head -n -2 /home/dietpi/.bashrc > /tmp/.bashrc && mv /tmp/.bashrc /home/dietpi/.bashrc
fi
rm -R /home/dietpi/mupibox.zip /home/dietpi/MuPiBox-*
exec 3>${LOG}

{
	#packages2install="git libasound2 jq samba mplayer pulseaudio-module-bluetooth pip id3tool bluez zip rrdtool scrot net-tools wireless-tools autoconf automake bc build-essential raspberrypi-kernel-headers dkms"
	packages2install="git libasound2 jq mplayer pulseaudio-module-bluetooth pip id3tool bluez zip rrdtool scrot net-tools wireless-tools autoconf automake bc build-essential python3-gpiozero python3-rpi.gpio python3-lgpio python3-serial python3-requests python3-paho-mqtt libgles2-mesa mesa-utils libsdl2-dev preload python3-smbus2 pigpio libjson-c-dev i2c-tools libi2c-dev python3-smbus python3-alsaaudio python3-netifaces"
	STEP=0

	###############################################################################################

	echo -e "XXX\n${STEP}\nUpdate package-list\nXXX"
	before=$(date +%s)
	sudo apt-get update >&3 2>&3
	after=$(date +%s)

	echo -e "## apt-get update ##  finished after $((after - $before)) seconds" >&3 2>&3

	for package in ${packages2install}
	do
		before=$(date +%s)
		STEP=$(($STEP + 1))
		echo -e "XXX\n${STEP}\nInstall ${package}\nXXX"
		#sudo apt-get install ${package} -y >&3 2>&3
		PKG_OK=$(dpkg -l ${package} 2>/dev/null | egrep '^ii' | wc -l) >&3 2>&3
		if [ ${PKG_OK} -eq 0 ]; then
		  sudo apt-get --yes install ${package} >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## apt-get install ${package}  ##  finished after $((after - $before)) seconds" >&3 2>&3
	done

	STEP=$(($STEP + 1))
	if [ $OS == "bullseye" ]; then
		echo -e "XXX\n${STEP}\nInstall package mutagen\nXXX"
		before=$(date +%s)
		sudo pip install mutagen >&3 2>&3
		STEP=$(($STEP + 4))
		after=$(date +%s)
		echo -e "## pip install mutagen  ##  finished after $((after - $before)) seconds" >&3 2>&3
	else
		echo -e "XXX\n${STEP}\nInstall package python3-mutagen\nXXX"
		packages2install="python3-mutagen mutagen python3-dev"
		for package in ${packages2install}
		do
			before=$(date +%s)
			echo -e "XXX\n${STEP}\nInstall ${package}\nXXX"
			PKG_OK=$(dpkg -l ${package} 2>/dev/null | egrep '^ii' | wc -l) >&3 2>&3
			if [ ${PKG_OK} -eq 0 ]; then
			  sudo apt-get --yes install ${package} >&3 2>&3
			fi
			after=$(date +%s)
			STEP=$(($STEP + 1))
			echo -e "## apt-get install ${package}  ##  finished after $((after - $before)) seconds" >&3 2>&3
		done
		echo -e "XXX\n${STEP}\nInstall package pip telepot\nXXX"
		before=$(date +%s)
		installed=$(pip list | grep telepot)
		if [ ${#installed} = 0 ]; then
			sudo pip install telepot --break-system-packages >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## pip install telepot  ##  finished after $((after - $before)) seconds" >&3 2>&3
		STEP=$(($STEP + 1))
		echo -e "XXX\n${STEP}\nInstall package pip requests\nXXX"
		before=$(date +%s)
		installed=$(pip list | grep requests)
		if [ ${#installed} = 0 ]; then
			sudo pip install requests --break-system-packages >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## pip install requests  ##  finished after $((after - $before)) seconds" >&3 2>&3
		before=$(date +%s)
		installed=$(pip list | grep pyserial)
		if [ ${#installed} = 0 ]; then
			sudo pip install pyserial --break-system-packages >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## pip install pyserial  ##  finished after $((after - $before)) seconds" >&3 2>&3
		STEP=$(($STEP + 1))
	fi

	sudo su - -c "yes '' | /boot/dietpi/dietpi-software install 200" >&3 2>&3

	###############################################################################################

	echo -e "XXX\n${STEP}\nPrepare MuPiBox Download ... \nXXX"
	before=$(date +%s)
	wget -q -O ${VER_JSON} https://raw.githubusercontent.com/friebi/MuPiBox/main/version.json  >&3 2>&3

	VERSION=$(/usr/bin/jq -r .release.${RELEASE}[-1].version ${VER_JSON})  >&3 2>&3
	MUPIBOX_URL=$(/usr/bin/jq -r .release.${RELEASE}[-1].url ${VER_JSON})  >&3 2>&3
	after=$(date +%s)
	echo -e "## Prepare MuPiBox Download  ##  finished after $((after - $before)) seconds" >&3 2>&3

	echo -e "XXX\n${STEP}\nDownload MuPiBox Version ${VERSION}... \nXXX"
	before=$(date +%s)
	wget -q -O /home/dietpi/mupibox.zip ${MUPIBOX_URL} >&3 2>&3
	after=$(date +%s)
	echo -e "## MuPiBox Download  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))
	echo -e "XXX\n${STEP}\nUnzip MuPiBox Version ${VERSION}... \nXXX"
	before=$(date +%s)
	unzip -q -d /home/dietpi/ /home/dietpi/mupibox.zip >&3 2>&3
	rm /home/dietpi/mupibox.zip >&3 2>&3
	MUPI_SRC="/home/dietpi/MuPiBox-${VERSION}"
	after=$(date +%s)
	echo -e "## Unzip MuPiBox Sources  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall nodeJS 16 (Online-Setup 16)... \nXXX"
	before=$(date +%s)
	curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash - >&3 2>&3
	after=$(date +%s)
	echo -e "## Install nodeJS 16  ##  finished after $((after - $before)) seconds" >&3 2>&3

	STEP=$(($STEP + 1))
	echo -e "XXX\n${STEP}\nInstall package nodejs\nXXX"
	before=$(date +%s)
	sudo apt-get install -y nodejs >&3 2>&3
	after=$(date +%s)
	echo -e "## Install package nodejs  ##  finished after $((after - $before)) seconds" >&3 2>&3

	STEP=$(($STEP + 1))
	if [ $OS != "bullseye" ]; then
	echo -e "XXX\n${STEP}\nInstall package npm\nXXX"
		before=$(date +%s)
		sudo apt-get install -y npm >&3 2>&3
		after=$(date +%s)
		echo -e "## Install package npm  ##  finished after $((after - $before)) seconds" >&3 2>&3
	fi
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall ionic... \nXXX"
	before=$(date +%s)
	sudo npm install -g @ionic/cli >&3 2>&3
	after=$(date +%s)
	echo -e "## Install ionic  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 5))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall pm2... \nXXX"
	before=$(date +%s)
	sudo npm install pm2 -g  >&3 2>&3
	after=$(date +%s)
	echo -e "## Install pm2  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 3))

	echo -e "XXX\n${STEP}\Configure pm2 startup... \nXXX"
	before=$(date +%s)
	pm2 startup >&3 2>&3
	PM2_ENV=$(sudo cat ${LOG} | sudo grep "sudo env") >&3 2>&3
	echo ${PM2_ENV} >&3 2>&3
	${PM2_ENV} >&3 2>&3
	after=$(date +%s)
	echo -e "## Configure pm2  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	#echo -e "XXX\n${STEP}\nInstall Pi-Blaster... \nXXX"
	#before=$(date +%s)
	#sudo rm -R /home/dietpi/pi-blaster >&3 2>&3
	#sudo su dietpi -c 'cd /home/dietpi/; git clone https://github.com/splitti/pi-blaster.git' >&3 2>&3
	#after=$(date +%s)
	#echo -e "## Install Pi-Blaster  ##  finished after $((after - $before)) seconds" >&3 2>&3
	#STEP=$(($STEP + 1))

	#echo -e "XXX\n${STEP}\nConfigure Pi-Blaster... \nXXX"
	#before=$(date +%s)
	#sudo su - -c 'cd /home/dietpi/pi-blaster; ./autogen.sh; ./configure; make; make install' >&3 2>&3
	#sudo /usr/bin/sed -i 's/DAEMON_ARGS=""/DAEMON_ARGS="--gpio 25"/g' /etc/init.d/pi-blaster.boot.sh >&3 2>&3
	#after=$(date +%s)
	#echo -e "## Configure Pi-Blaster  ##  finished after $((after - $before)) seconds" >&3 2>&3
	#STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nClean and create directories... \nXXX"
	before=$(date +%s)
	# Clean and create Directorys
	sudo rm -R /home/dietpi/.mupibox >&3 2>&3
	sudo rm -R /home/dietpi/MuPiBox >&3 2>&3
	mkdir -p /home/dietpi/.mupibox >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/chromium_cache >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/tts_files >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/sysmedia/sound >&3 2>&3
	mkdir -p /home/dietpi/.cache/spotifyd >&3 2>&3
	mkdir /home/dietpi/MuPiBox/sysmedia/images >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/audiobook >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/music >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/other >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/cover >&3 2>&3
	mkdir /home/dietpi/MuPiBox/themes >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	sudo mkdir /usr/local/bin/mupibox >&3 2>&3
	sudo mkdir /etc/spotifyd >&3 2>&3
	sudo mkdir /etc/mupibox >&3 2>&3
	sudo mkdir /var/log/mupibox/ >&3 2>&3
	after=$(date +%s)
	echo -e "## Clean and create directories  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCreate hushlogin... \nXXX"
	# Boot
	before=$(date +%s)
	touch /home/dietpi/.hushlogin >&3 2>&3
	after=$(date +%s)
	echo -e "## Create hushlogin  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	echo -e "XXX\n${STEP}\nCreate MuPiBox-Config... \nXXX"
	before=$(date +%s)
	MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json" >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/templates/mupiboxconfig.json ${MUPIBOX_CONFIG} >&3 2>&3
	sudo chown root:www-data /etc/mupibox/mupiboxconfig.json >&3 2>&3
	sudo chmod 775 /etc/mupibox/mupiboxconfig.json >&3 2>&3
	after=$(date +%s)
	echo -e "## Create MuPiBox-Config  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall mplayer-wrapper... \nXXX"
	before=$(date +%s)
	# Sources
	cd /home/dietpi/.mupibox >&3 2>&3
	git clone https://github.com/derhuerst/mplayer-wrapper >&3 2>&3
	cp ${MUPI_SRC}/dev/customize/mplayer-wrapper/index.js /home/dietpi/.mupibox/mplayer-wrapper/index.js >&3 2>&3
	cd /home/dietpi/.mupibox/mplayer-wrapper >&3 2>&3
	npm install >&3 2>&3
	after=$(date +%s)
	echo -e "## Install mplayer-wrapper  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall google-tts... \nXXX"
	before=$(date +%s)

	cd /home/dietpi/.mupibox >&3 2>&3
	git clone https://github.com/zlargon/google-tts >&3 2>&3
	cd google-tts/ >&3 2>&3
	npm install --save >&3 2>&3
	npm audit fix >&3 2>&3
	npm test >&3 2>&3
	after=$(date +%s)
	echo -e "## Install google-tts  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 5))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall Kids-Controller-master... \nXXX"
	before=$(date +%s)

	cp ${MUPI_SRC}/bin/nodejs/deploy.zip /home/dietpi/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip >&3 2>&3
	unzip /home/dietpi/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip -d /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip >&3 2>&3
	cp ${MUPI_SRC}/config/templates/www.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	cp ${MUPI_SRC}/config/templates/monitor.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json >&3 2>&3
	cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master  >&3 2>&3
	npm install >&3 2>&3
	pm2 start server.js >&3 2>&3
	pm2 save >&3 2>&3
	after=$(date +%s)
	echo -e "## Install Kids-Controller  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall Spotify Controller... \nXXX"
	before=$(date +%s)

	cd /home/dietpi/.mupibox >&3 2>&3
	wget https://github.com/amueller-tech/spotifycontroller/archive/main.zip >&3 2>&3
	unzip main.zip >&3 2>&3
	rm main.zip >&3 2>&3
	cd /home/dietpi/.mupibox/spotifycontroller-main >&3 2>&3
	cp ${MUPI_SRC}/config/templates/spotifycontroller.json /home/dietpi/.mupibox/spotifycontroller-main/config/config.json >&3 2>&3
	cp ${MUPI_SRC}/bin/nodejs/spotify-control.js /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js >&3 2>&3
	ln -s /etc/mupibox/mupiboxconfig.json /home/dietpi/.mupibox/spotifycontroller-main/config/mupiboxconfig.json >&3 2>&3
	npm install >&3 2>&3
	pm2 start spotify-control.js >&3 2>&3
	pm2 save >&3 2>&3
	after=$(date +%s)
	echo -e "## Install Spotify-Controller  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy binaries... \nXXX"
	before=$(date +%s)

	# Binaries
	if [ `getconf LONG_BIT` == 32 ]; then
		sudo mv -f ${MUPI_SRC}/bin/spotifyd/0.3.3/spotifyd /usr/bin/spotifyd >&3 2>&3
		sudo mv -f ${MUPI_SRC}/bin/fbv/fbv /usr/bin/fbv >&3 2>&3
	else
		sudo mv -f ${MUPI_SRC}/bin/spotifyd/0.3.3/spotifyd_64bit /usr/bin/spotifyd >&3 2>&3
		sudo mv -f ${MUPI_SRC}/bin/fbv/fbv_64 /usr/bin/fbv >&3 2>&3

	fi
	sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd >&3 2>&3
	after=$(date +%s)
	echo -e "## Copy binaries  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nSetup DietPi-Dashboard... \nXXX"
	before=$(date +%s)
	mkdir /opt/dietpi-dashboard >&3 2>&3
	rm /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	curl -fL "$(curl -sSf 'https://api.github.com/repos/ravenclaw900/DietPi-Dashboard/releases/latest' | mawk -F\" "/\"browser_download_url\": \".*dietpi-dashboard-$(uname -m)\"/{print \$4}")" -o /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	chmod +x /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	curl -sSfL https://raw.githubusercontent.com/ravenclaw900/DietPi-Dashboard/main/config.toml -o /opt/dietpi-dashboard/config.toml  >&3 2>&3
	#bash -c 'su dietpi -c "yes \"\" | sudo /boot/dietpi/dietpi-software install 200"' >&3 2>&3
	sudo /usr/bin/sed -i 's/#terminal_user = "root"/terminal_user = "dietpi"/g' /opt/dietpi-dashboard/config.toml >&3 2>&3
	sudo /usr/bin/sed -i 's/pass = true/pass = false/g' /opt/dietpi-dashboard/config.toml >&3 2>&3
	after=$(date +%s)
	echo -e "## Setup DietPi-Dashboard  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy DietPi-Config... \nXXX"
	before=$(date +%s)

	# DietPi-Configs
	#sudo mv -f ${MUPI_SRC}/config/templates/98-dietpi-disable_dpms.conf /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf
	sudo mv -f ${MUPI_SRC}/config/templates/asound.conf /etc/asound.conf >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/templates/smb.conf /etc/samba/smb.conf >&3 2>&3
	after=$(date +%s)
	echo -e "## Copy DietPi-Config  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nConfigure spotifyd... \nXXX"
	before=$(date +%s)

	# spotifyd-Config
	sudo mv -f ${MUPI_SRC}/config/templates/spotifyd.conf /etc/spotifyd/spotifyd.conf >&3 2>&3
	after=$(date +%s)
	echo -e "## Configure spotifyd  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy some media files... \nXXX"
	# Splash and Media
	before=$(date +%s)
	sudo mv -f ${MUPI_SRC}/config/templates/splash.txt /boot/splash.txt >&3 2>&3
	sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img >&3 2>&3
	cp ${MUPI_SRC}/media/images/goodbye.png /home/dietpi/MuPiBox/sysmedia/images/goodbye.png >&3 2>&3
	sudo mv -f ${MUPI_SRC}/media/images/splash.png /boot/splash.png >&3 2>&3
	cp ${MUPI_SRC}/media/images/MuPiLogo.jpg /home/dietpi/MuPiBox/sysmedia/images/MuPiLogo.jpg >&3 2>&3
	cp ${MUPI_SRC}/media/sound/shutdown.wav /home/dietpi/MuPiBox/sysmedia/sound/shutdown.wav >&3 2>&3
	cp ${MUPI_SRC}/media/sound/startup.wav /home/dietpi/MuPiBox/sysmedia/sound/startup.wav >&3 2>&3
	cp ${MUPI_SRC}/media/sound/low.wav /home/dietpi/MuPiBox/sysmedia/sound/low.wav >&3 2>&3
	cp ${MUPI_SRC}/media/sound/button_shutdown.wav /home/dietpi/MuPiBox/sysmedia/sound/button_shutdown.wav >&3 2>&3
	cp ${MUPI_SRC}/media/images/installation.jpg /home/dietpiMuPiBox/sysmedia/images/installation.jpg >&3 2>&3
	cp ${MUPI_SRC}/media/images/battery_low.jpg /home/dietpi/MuPiBox/sysmedia/images/battery_low.jpg >&3 2>&3

	after=$(date +%s)
	echo -e "## Copy media files  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy MuPiBox-Files... \nXXX"
	# MuPiBox
	before=$(date +%s)
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth >&3 2>&3
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk >&3 2>&3
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies >&3 2>&3
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/matrix >&3 2>&3
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/lines >&3 2>&3
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/forms >&3 2>&3
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/comic >&3 2>&3
	sudo mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/mystic >&3 2>&3

	#FANTASY-BUTTERFLIES
	sudo mv -f ${MUPI_SRC}/themes/fantasybutterflies/odstemplikBold.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/odstemplikBold.otf >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/fantasybutterflies/fantasy-butterflies-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/fantasy-butterflies-bg.jpg >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/fantasybutterflies/fantasy-circle-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/fantasy-circle-bg.png >&3 2>&3

	#LINES
	sudo mv -f ${MUPI_SRC}/themes/lines/lines-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/lines/lines-bg.png >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/lines/KOMIKND_.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/lines/KOMIKND_.ttf >&3 2>&3

	#FORMS
	sudo mv -f ${MUPI_SRC}/themes/forms/forms-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/forms/forms-bg.jpg >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/forms/LT_Crafted.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/forms/LT_Crafted.otf >&3 2>&3

	#COMIC
	sudo mv -f ${MUPI_SRC}/themes/comic/comic-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/comic/comic-bg.jpg >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/comic/snaphand-v1-free.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/comic/snaphand-v1-free.ttf >&3 2>&3

	#MYSTIC
	sudo mv -f ${MUPI_SRC}/themes/mystic/mystic-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/mystic/mystic-bg.jpg >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/mystic/ylee_Mortal_Heart.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/mystic/ylee_Mortal_Heart.ttf >&3 2>&3

	#MATRIX
	sudo mv -f ${MUPI_SRC}/themes/matrix/matrix-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/matrix/matrix-bg.png >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/matrix/Pixolletta8px.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/matrix/Pixolletta8px.ttf >&3 2>&3

	#EARTH
	sudo mv -f ${MUPI_SRC}/themes/earth/earth-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth/earth-bg.jpg >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/earth/Nasa21.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth/Nasa21.ttf >&3 2>&3

	#STEAMPUNK
	sudo mv -f ${MUPI_SRC}/themes/steampunk/steampunk-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-bg.jpg >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/steampunk/akaPosse.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/akaPosse.ttf >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/steampunk/steampunk-gear.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-gear.png >&3 2>&3
	sudo mv -f ${MUPI_SRC}/themes/steampunk/steampunk-header.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-header.jpg >&3 2>&3

	sudo chown dietpi:dietpi -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/

	sudo mv -f ${MUPI_SRC}/themes/*.css /home/dietpi/MuPiBox/themes/ >&3 2>&3
	sudo mv -f ${MUPI_SRC}/scripts/mupibox/* /usr/local/bin/mupibox/ >&3 2>&3
	sudo mv -f ${MUPI_SRC}/scripts/bluetooth/* /usr/local/bin/mupibox/ >&3 2>&3
	sudo mv -f ${MUPI_SRC}/scripts/wled/* /usr/local/bin/mupibox/ >&3 2>&3
	sudo mv -f ${MUPI_SRC}/scripts/telegram/* /usr/local/bin/mupibox/ >&3 2>&3
	sudo mv -f ${MUPI_SRC}/scripts/mupihat/* /usr/local/bin/mupibox/ >&3 2>&3
	sudo mv -f ${MUPI_SRC}/scripts/fan/* /usr/local/bin/mupibox/ >&3 2>&3
	sudo mv -f ${MUPI_SRC}/scripts/wifi/* /usr/local/bin/mupibox/ >&3 2>&3
	sudo mv -f ${MUPI_SRC}/scripts/mqtt/* /usr/local/bin/mupibox/ >&3 2>&3

	sudo mv -f ${MUPI_SRC}/config/templates/add_wifi.json /boot/add_wifi.json >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/templates/.bashrc /home/dietpi/.bashrc >&3 2>&3

	sudo chown dietpi:dietpi /home/dietpi/.bashrc >&3 2>&3

	sudo chmod 755 /usr/local/bin/mupibox/* >&3 2>&3

	after=$(date +%s)
	echo -e "## Copy MuPiBox-Files  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall Hifiberry-MiniAmp and Bluetooth support... \nXXX"
	before=$(date +%s)

	sudo /boot/dietpi/dietpi-software install 5 >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware bluetooth enable >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware soundcard "hifiberry-dac"  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/templates/asound.conf /etc/asound.conf  >&3 2>&3
	sudo usermod -g pulse -G audio --home /var/run/pulse pulse >&3 2>&3
	sudo usermod -a -G audio dietpi >&3 2>&3
	sudo usermod -a -G bluetooth dietpi >&3 2>&3
	sudo usermod -a -G pulse dietpi >&3 2>&3
	sudo usermod -a -G pulse-access dietpi >&3 2>&3
	sudo usermod -a -G pulse root >&3 2>&3
	sudo usermod -a -G pulse-access root >&3 2>&3
	sudo /usr/bin/sed -i 's/; system-instance = no/system-instance = yes/g' /etc/pulse/daemon.conf >&3 2>&3

# Deactivated because of errors
#	if grep -q '^load-module module-bluetooth-discover' /etc/pulse/system.pa >&3; then
#	  echo -e "load-module module-bluetooth-discover already set" >&3 2>&3
#	else
#	  echo '' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
#	  echo 'load-module module-bluetooth-discover' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
#	fi
#	if grep -q '^load-module module-bluetooth-policy' /etc/pulse/system.pa >&3; then
#	  echo -e "load-module module-bluetooth-policy already set" >&3 2>&3
#	else
#	  echo '' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
#	  echo 'load-module module-bluetooth-policy' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
#	fi

	sudo /usr/bin/sed -i 's/; default-server =/default-server = \/var\/run\/pulse\/native/g' /etc/pulse/client.conf >&3 2>&3
	sudo /usr/bin/sed -i 's/; autospawn = yes/autospawn = no/g' /etc/pulse/client.conf >&3 2>&3
	sudo /usr/bin/sed -i 's/ExecStart=\/usr\/libexec\/bluetooth\/bluetoothd/ExecStart=\/usr\/libexec\/bluetooth\/bluetoothd --noplugin=sap/g' /lib/systemd/system/bluetooth.service >&3 2>&3
	after=$(date +%s)
	echo -e "## Bluetooth-Support  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nEnable Admin-Webservice... \nXXX"
	before=$(date +%s)

	sudo /boot/dietpi/dietpi-software install 5 84 89 >&3 2>&3

	sudo rm -R /var/www/* >&3 2>&3
	sudo unzip ${MUPI_SRC}/AdminInterface/release/www.zip -d /var/www/ >&3 2>&3
	sudo ln -s /home/dietpi/MuPiBox/media/cover /var/www/cover >&3 2>&3
	sudo chown -R www-data:www-data /var/www/ >&3 2>&3
	sudo chmod -R 755 /var/www/ >&3 2>&3
	sudo chown -R dietpi:www-data /home/dietpi/MuPiBox/media/cover >&3 2>&3
	after=$(date +%s)
	echo -e "## Admin-Webinterface  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall LED Control... \nXXX"

	before=$(date +%s)
	if [ `getconf LONG_BIT` == 32 ]; then
		sudo mv -f ${MUPI_SRC}/bin/led_control/led_control_32 /usr/local/bin/mupibox/led_control >&3 2>&3
	else
		sudo mv -f ${MUPI_SRC}/bin/led_control/led_control_64 /usr/local/bin/mupibox/led_control >&3 2>&3
	fi
	sudo /usr/bin/chmod 755 /usr/local/bin/mupibox/led_control >&3 2>&3
	after=$(date +%s)
	echo -e "## LED-Control  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nSet environment... \nXXX"
	before=$(date +%s)

	# ENV
	(echo "mupibox"; echo "mupibox") | sudo smbpasswd -s -a dietpi >&3 2>&3
	sudo env PATH=$PATH:/usr/local/bin/mupibox >&3 2>&3
	THEME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css" >&3 2>&3
	ln -s /home/dietpi/MuPiBox/themes/blue.css ${THEME_FILE} >&3 2>&3
	sudo echo "www-data ALL=(ALL:ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/www-data  >&3 2>&3
	sudo usermod -a -G gpio dietpi >&3 2>&3
	sudo usermod -aG dialout dietpi >&3 2>&3
	sudo usermod -a -G gpio root >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/templates/crontab.template /tmp/crontab.template >&3 2>&3
	sudo /usr/bin/chmod 755 /tmp/crontab.template >&3 2>&3
	sudo /usr/bin/chown dietpi:dietpi /tmp/crontab.template >&3 2>&3
	sudo /bin/su dietpi -c "/usr/bin/crontab /tmp/crontab.template"  >&3 2>&3
	sudo rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json >&3 2>&3
	ln -s /tmp/network.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json >&3 2>&3
	#sudo /boot/dietpi/func/dietpi-set_swapfile 1 zram >&3 2>&3
	#sudo /boot/dietpi/func/dietpi-set_software boot_wait_for_network 0 >&3 2>&3
	#VERSION=$(curl -sL ${SRC}/version.json | /usr/bin/jq -r .version) >&3 2>&3
	#sudo /usr/bin/sed -i 's/\"version\": \"\"/\"version\": \"'${VERSION}'\"/g' ${MUPIBOX_CONFIG} >&3 2>&3
	sudo /usr/bin/cat <<< $(/usr/bin/jq --arg v "${VERSION}" '.mupibox.version = $v' ${MUPIBOX_CONFIG}) > ${MUPIBOX_CONFIG}
	sudo chmod 775 /etc/mupibox/mupiboxconfig.json >&3 2>&3
	if grep -q '^initramfs initramfs.img' /boot/config.txt; then
	  echo -e "initramfs initramfs.img already set"
	else
	  echo '' | sudo tee -a /boot/config.txt >&3 2>&3
	  echo '#initramfs initramfs.img' | sudo tee -a /boot/config.txt >&3 2>&3
	fi
	curl https://raw.githubusercontent.com/scopatz/nanorc/master/install.sh | sh >&3 2>&3
	touch /home/dietpi/.mupi.install >&3 2>&3

	after=$(date +%s)
	echo -e "## Set environment  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy OnOffShim-Scripts... \nXXX"
	before=$(date +%s)

	# OnOffShim
	sudo mv -f ${MUPI_SRC}/scripts/OnOffShim/off_trigger.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	sudo mv -f ${MUPI_SRC}/scripts/OnOffShim/poweroff.sh /usr/lib/systemd/system-shutdown/poweroff.sh >&3 2>&3
	sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3

	after=$(date +%s)
	echo -e "## Copy OnOffShim-Scripts  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall Chromium-Kiosk... \nXXX"
	before=$(date +%s)

	echo -ne '\n' | sudo /boot/dietpi/dietpi-software install 113 >&3 2>&3
	sudo /boot/dietpi/dietpi-autostart 11 >&3 2>&3
	sudo mv -f ${MUPI_SRC}/scripts/chromium-autostart.sh /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	sudo chmod +x /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	sudo usermod -a -G tty dietpi >&3 2>&3
	#xinit chromium-browser xserver-xorg-legacy xorg
	sudo apt-get install xserver-xorg-legacy -y >&3 2>&3
	sudo /usr/bin/sed -i 's/allowed_users\=console/allowed_users\=anybody/g' /etc/X11/Xwrapper.config >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/templates/98-dietpi-disable_dpms.conf /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf >&3 2>&3
	sudo /usr/bin/sed -i 's/tty1/tty3 vt.global_cursor_default\=0 fastboot noatime nodiratime noram splash silent loglevel\=0 vt.default_red\=68,68,68,68,68,68,68,68 vt.default_grn\=175,175,175,175,175,175,175,175 vt.default_blu\=226,226,226,226,226,226,226,226/g' /boot/cmdline.txt >&3 2>&3
	sudo /usr/bin/sed -i 's/session    optional   pam_motd.so motd\=\/run\/motd.dynamic/#session    optional   pam_motd.so motd\=\/run\/motd.dynamic/g' /etc/pam.d/login >&3 2>&3
	sudo /usr/bin/sed -i 's/session    optional   pam_motd.so noupdate/#session    optional   pam_motd.so noupdate/g' /etc/pam.d/login >&3 2>&3
	sudo /usr/bin/sed -i 's/session    optional   pam_lastlog.so/session    optional   pam_lastlog.so/g' /etc/pam.d/login >&3 2>&3
	sudo /usr/bin/sed -i 's/ExecStart\=-\/sbin\/agetty -a dietpi -J \%I \$TERM/ExecStart\=-\/sbin\/agetty --skip-login --noclear --noissue --login-options \"-f dietpi\" \%I \$TERM/g' /etc/systemd/system/getty@tty1.service.d/dietpi-autologin.conf >&3 2>&3
	#suggest_gpu_mem=76 >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware gpumemsplit 128 >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware headless 0 >&3 2>&3
	sudo /boot/dietpi/func/dietpi-set_hardware rpi-opengl disable #vc4-fkms-v3d >&3 2>&3
	sudo su - -c ". /boot/dietpi/func/dietpi-globals && G_CHECK_ROOT_USER && G_CHECK_ROOTFS_RW && G_INIT && G_CONFIG_INJECT 'framebuffer_width=' \"framebuffer_width=800\" /boot/config.txt" >&3 2>&3
	sudo su - -c ". /boot/dietpi/func/dietpi-globals && G_CHECK_ROOT_USER && G_CHECK_ROOTFS_RW && G_INIT && G_CONFIG_INJECT 'framebuffer_height=' \"framebuffer_height=480\" /boot/config.txt" >&3 2>&3

	after=$(date +%s)
	echo -e "## Install Chromium  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nEnable and start services... \nXXX"
	before=$(date +%s)

	# Enable Services
	#sudo mv -f ${MUPI_SRC}/config/services/mupi_change_checker.service /etc/systemd/system/mupi_change_checker.service >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_idle_shutdown.service /etc/systemd/system/mupi_idle_shutdown.service >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_splash.service /etc/systemd/system/mupi_splash.service >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/spotifyd.service /etc/systemd/system/spotifyd.service >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/pulseaudio.service /etc/systemd/system/pulseaudio.service >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_startstop.service /etc/systemd/system/mupi_startstop.service >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_wifi.service /etc/systemd/system/mupi_wifi.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_check_internet.service /etc/systemd/system/mupi_check_internet.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_check_monitor.service /etc/systemd/system/mupi_check_monitor.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_autoconnect_bt.service /etc/systemd/system/mupi_autoconnect_bt.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_vnc.service /etc/systemd/system/mupi_vnc.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_novnc.service /etc/systemd/system/mupi_novnc.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_powerled.service /etc/systemd/system/mupi_powerled.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_telegram.service /etc/systemd/system/mupi_telegram.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/dietpi-dashboard.service /etc/systemd/system/dietpi-dashboard.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_hat.service /etc/systemd/system/mupi_hat.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_hat_control.service /etc/systemd/system/mupi_hat_control.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_fan.service /etc/systemd/system/mupi_fan.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_autoconnect-wifi.service /etc/systemd/system/mupi_autoconnect-wifi.service  >&3 2>&3
	sudo mv -f ${MUPI_SRC}/config/services/mupi_mqtt.service /etc/systemd/system/mupi_mqtt.service  >&3 2>&3
	sudo systemctl daemon-reload >&3 2>&3
	sudo systemctl enable mupi_wifi.service >&3 2>&3
	sudo systemctl start mupi_wifi.service >&3 2>&3
	sudo systemctl enable mupi_check_internet.service >&3 2>&3
	sudo systemctl start mupi_check_internet.service >&3 2>&3
	sudo systemctl enable mupi_check_monitor.service >&3 2>&3
	sudo systemctl start mupi_check_monitor.service >&3 2>&3
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
	sudo systemctl enable dietpi-dashboard.service >&3 2>&3
	sudo systemctl start dietpi-dashboard.service >&3 2>&3

	after=$(date +%s)
	echo -e "## Enable and start services  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

#	echo -e "XXX\n${STEP}\nDownload network-driver [RTL88X2BU]... \nXXX"
#	before=$(date +%s)
#	if [ -d "/home/dietpi/.driver/network/src/88x2bu-20210702" ]; then
#		echo -e "Network driver RTL88X2BU already installed"  >&3 2>&3
#	else
#		mkdir -p /home/dietpi/.driver/network/src >&3 2>&3
#		cd /home/dietpi/.driver/network/src >&3 2>&3
#		git clone https://github.com/morrownr/88x2bu-20210702.git >&3 2>&3
#		after=$(date +%s)
#		echo -e "## Download Network Driver  ##  finished after $((after - $before)) seconds" >&3 2>&3
#		STEP=$(($STEP + 1))
#		echo -e "XXX\n${STEP}\nInstall network-driver [RTL88X2BU]... \nXXX"
#		before=$(date +%s)
#		cd /home/dietpi/.driver/network/src/88x2bu-20210702 >&3 2>&3
#		sudo chmod u+x install-driver.sh >&3 2>&3
#		sudo ./install-driver.sh NoPrompt >&3 2>&3
#		after=$(date +%s)
#		echo -e "## Install Network Driver  ##  finished after $((after - $before)) seconds" >&3 2>&3
#	fi
#	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n100\nInstallation complete, please reboot the system... \nXXX"
	OS="$(grep -E '^(VERSION_CODENAME)=' /etc/os-release)"  >&3 2>&3
	OS="${OS:17}"  >&3 2>&3
	CPU=$(cat /proc/cpuinfo | grep Serial | cut -d ":" -f2 | sed 's/^ //') >&3 2>&3
	ARCH="$(uname -m)" >&3 2>&3
	curl -X POST https://mupibox.de/mupi/ct.php -H "Content-Type: application/x-www-form-urlencoded" -d key1=${CPU} -d key2="Classic Installation" -d key3="${VERSION} ${RELEASE}" -d key4="${ARCH}" -d key5="${OS}" >&3 2>&3

	sudo rm -R ${MUPI_SRC} >&3 2>&3
	sudo mv ${LOG} /boot/autosetup.log > /dev/null 2>&3
	sleep 5

} | whiptail --title "MuPiBox Autosetup" --gauge "Please wait while installing" 6 60 0

sudo reboot
