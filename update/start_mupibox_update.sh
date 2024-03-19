#!/bin/bash
#

#https://raw.githubusercontent.com/friebi/MuPiBox/develop

if [ "$1" = "dev" ] || [ "$1" = "beta" ] || [ "$1" = "stable" ]; then
	RELEASE="$1"
else
	RELEASE="stable"
fi
killall -s 9 -w -q chromium-browser

CONFIG="/etc/mupibox/mupiboxconfig.json"
LOG="/boot/mupibox_update.log"
exec 3>${LOG}
service mupi_idle_shutdown stop
packages2install="git libasound2 jq mplayer pulseaudio-module-bluetooth pip id3tool bluez zip rrdtool scrot net-tools\
 wireless-tools autoconf automake bc build-essential python3-gpiozero python3-rpi.gpio python3-lgpio python3-serial\
 python3-requests python3-paho-mqtt libgles2-mesa mesa-utils libsdl2-dev preload python3-smbus2 pigpio libjson-c-dev\
 i2c-tools libi2c-dev python3-smbus python3-alsaaudio python3-netifaces gpiod"
STEP=0
VER_JSON="/tmp/version.json"
OS=$(grep -E '^(VERSION_CODENAME)=' /etc/os-release)  >&3 2>&3
OS=${OS:17}  >&3 2>&3
ARCH=$(uname -m) >&3 2>&3

wget -O /tmp/installation.jpg https://raw.githubusercontent.com/friebi/MuPiBox/develop/media/images/installation.jpg >&3 2>&3
/usr/bin/fbv /tmp/installation.jpg & >&3 2>&3

wget -q -O ${VER_JSON} https://raw.githubusercontent.com/friebi/MuPiBox/develop/version.json  >&3 2>&3
VERSION=$(/usr/bin/jq -r .release.${RELEASE}[-1].version ${VER_JSON})  >&3 2>&3
MUPIBOX_URL=$(/usr/bin/jq -r .release.${RELEASE}[-1].url ${VER_JSON})  >&3 2>&3
USER=$(/usr/bin/whoami) >&3 2>&3
RASPPI=$(/usr/bin/cat /sys/firmware/devicetree/base/model | tr -d '\0' ) >&3 2>&3
if [ "$1" = "dev" ]; then
	MUPI_SRC="/home/dietpi/MuPiBox-main" >&3 2>&3
else
	MUPI_SRC="/home/dietpi/MuPiBox-${VERSION}" >&3 2>&3
fi
if [ "$1" = "dev" ]; then
	VERSION_LONG="DEV $(curl -s "https://api.github.com/repos/friebi/MuPiBox" | jq -r '.pushed_at' | cut -d'T' -f1)"  >&3 2>&3
else
	VERSION_LONG="${VERSION} ${RELEASE}"
fi

echo "==========================================================================================" >&3 2>&3
echo "= OS:               ${OS}" >&3 2>&3
echo "= RasPi:            ${RASPPI}" >&3 2>&3
echo "= Architecture:     ${ARCH}" >&3 2>&3
echo "= User:             ${USER}" >&3 2>&3
echo "= Parameter:        $1" >&3 2>&3
echo "= Release:          ${RELEASE}" >&3 2>&3
echo "= Version:          ${VERSION_LONG}" >&3 2>&3
echo "= Update-URL:       ${MUPIBOX_URL}" >&3 2>&3
echo "= Unzip-Directory:  ${MUPI_SRC}" >&3 2>&3
echo "==========================================================================================" >&3 2>&3

{
	###############################################################################################


	echo -e "XXX\n0\nPrepare Update... \nXXX"	 >&3 2>&3
	systemctl stop mupi_idle_shutdown.service >&3 2>&3
	mkdir /home/dietpi/.mupibox/chromium_cache >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/audiobook >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/music >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/other >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/cover >&3 2>&3
	chown dietpi:dietpi /home/dietpi/MuPiBox/media/audiobook >&3 2>&3
	chown dietpi:dietpi /home/dietpi/MuPiBox/media/music >&3 2>&3

	STEP=$(($STEP + 1))

	echo -e "XXX\n${STEP}\nUpdate package-list\nXXX"
	before=$(date +%s)
	apt-get update >&3 2>&3
	after=$(date +%s)

	echo -e "## apt-get update ##  finished after $((after - $before)) seconds" >&3 2>&3

	###############################################################################################


	for package in ${packages2install}
	do
		before=$(date +%s)
		STEP=$(($STEP + 1))
		echo -e "XXX\n${STEP}\nInstall ${package}\nXXX"
		#apt-get install ${package} -y >&3 2>&3
		PKG_OK=$(dpkg -l ${package} 2>/dev/null | egrep '^ii' | wc -l) >&3 2>&3
		if [ ${PKG_OK} -eq 0 ]; then
		  apt-get --yes install ${package} >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## apt-get install ${package}  ##  finished after $((after - $before)) seconds" >&3 2>&3
	done

	STEP=$(($STEP + 1))
	if [ $OS == "bullseye" ]; then
		echo -e "XXX\n${STEP}\nInstall package mutagen\nXXX"
		before=$(date +%s)
		pip install mutagen >&3 2>&3
		STEP=$(($STEP + 4))
		after=$(date +%s)
		echo -e "## pip install mutagen  ##  finished after $((after - $before)) seconds" >&3 2>&3
		echo -e "XXX\n${STEP}\nInstall package pip requests\nXXX"
		before=$(date +%s)
		installed=$(pip list | grep requests)
		if [ ${#installed} = 0 ]; then
			pip install requests --break-system-packages >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## pip install requests  ##  finished after $((after - $before)) seconds" >&3 2>&3
		before=$(date +%s)
		installed=$(pip list | grep pyserial)
		if [ ${#installed} = 0 ]; then
			pip install pyserial --break-system-packages >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## pip install pyserial  ##  finished after $((after - $before)) seconds" >&3 2>&3
		STEP=$(($STEP + 1))
	else
		echo -e "XXX\n${STEP}\nInstall package python3-mutagen\nXXX"
		packages2install="python3-mutagen  python3-dev"
		for package in ${packages2install}
		do
			before=$(date +%s)
			echo -e "XXX\n${STEP}\nInstall ${package}\nXXX"
			PKG_OK=$(dpkg -l ${package} 2>/dev/null | egrep '^ii' | wc -l) >&3 2>&3
			if [ ${PKG_OK} -eq 0 ]; then
			  apt-get --yes install ${package} >&3 2>&3
			fi
			after=$(date +%s)
			STEP=$(($STEP + 1))
			echo -e "## apt-get install ${package}  ##  finished after $((after - $before)) seconds" >&3 2>&3
		done
		echo -e "XXX\n${STEP}\nInstall package pip telepot\nXXX"
		before=$(date +%s)
		installed=$(pip list | grep telepot)
		if [ ${#installed} = 0 ]; then
			pip install telepot --break-system-packages >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## pip install telepot  ##  finished after $((after - $before)) seconds" >&3 2>&3
		STEP=$(($STEP + 1))
	fi

	###############################################################################################

	echo -e "XXX\n${STEP}\nSetup DietPi-Dashboard... \nXXX"
	before=$(date +%s)
	mkdir /opt/dietpi-dashboard >&3 2>&3
	rm /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	curl -fL "$(curl -sSf 'https://api.github.com/repos/ravenclaw900/DietPi-Dashboard/releases/latest' | mawk -F\" "/\"browser_download_url\": \".*dietpi-dashboard-$(uname -m)\"/{print \$4}")" -o /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	chmod +x /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	curl -sSfL https://raw.githubusercontent.com/ravenclaw900/DietPi-Dashboard/main/config.toml -o /opt/dietpi-dashboard/config.toml  >&3 2>&3
	#bash -c 'su dietpi -c "yes \"\" | sudo /boot/dietpi/dietpi-software install 200"' >&3 2>&3
	/usr/bin/sed -i 's/#terminal_user = "root"/terminal_user = "dietpi"/g' /opt/dietpi-dashboard/config.toml >&3 2>&3
	#sudo /usr/bin/sed -i 's/pass = true/pass = false/g' /opt/dietpi-dashboard/config.toml >&3 2>&3
	after=$(date +%s)
	echo -e "## Setup DietPi-Dashboard  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nDownload MuPiBox Version ${VERSION_LONG}... \nXXX"
	before=$(date +%s)
	wget -q -O /home/dietpi/mupibox.zip ${MUPIBOX_URL} >&3 2>&3
	after=$(date +%s)
	echo -e "## MuPiBox Download  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nUnzip MuPiBox Version ${VERSION_LONG}... \nXXX"
	before=$(date +%s)
	unzip -q -d /home/dietpi /home/dietpi/mupibox.zip >&3 2>&3
	rm /home/dietpi/mupibox.zip >&3 2>&3

	#MUPI_SRC="/home/dietpi/MuPiBox-${VERSION}"
	after=$(date +%s)
	echo -e "## Unzip Mupibox Download  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nBackup Userdata... \nXXX" >&3 2>&3
	before=$(date +%s)
	mv /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json /tmp/data.json >&3 2>&3
	mv /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover /tmp/cover >&3 2>&3
	#mv /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json /tmp/config.json >&3 2>&3
	mv /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css /tmp/active_theme.css >&3 2>&3
	after=$(date +%s)
	echo -e "## Backup Data  ##  finished after $((after - $before)) seconds" >&3 2>&3

	STEP=$(($STEP + 1))

	###############################################################################################


	echo -e "XXX\n${STEP}\nUpdate Kids-Controller... \nXXX"
	before=$(date +%s)
	sudo -H -u dietpi bash -c "pm2 stop server" >&3 2>&3
	#su - dietpi -c "pm2 save" >&3 2>&3
	rm -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/ >&3 2>&3
	mv ${MUPI_SRC}/bin/nodejs/deploy.zip /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip >&3 2>&3
	unzip /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip -d /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip >&3 2>&3
	mv ${MUPI_SRC}/config/templates/monitor.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json >&3 2>&3
	mv ${MUPI_SRC}/config/templates/www.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	chown dietpi:dietpi -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www >&3 2>&3
	after=$(date +%s)
	echo -e "## Update Kids-Controller  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nUpdate MPlayer Wrapper... \nXXX"
	mv ${MUPI_SRC}/dev/customize/mplayer-wrapper/index.js /home/dietpi/.mupibox/mplayer-wrapper/index.js >&3 2>&3
	after=$(date +%s)
	echo -e "## Update Mplayer ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nUpdate Spotify Control... \nXXX"
	cp ${MUPI_SRC}/bin/nodejs/spotify-control.js /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js >&3 2>&3
	after=$(date +%s)
	echo -e "## Update Spotify Control  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy MuPiBox-Files... \nXXX"
	# MuPiBox
	before=$(date +%s)
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/matrix >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/lines >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/forms >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/comic >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/mystic >&3 2>&3

	#FANTASY-BUTTERFLIES
	mv ${MUPI_SRC}/themes/fantasybutterflies/odstemplikBold.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/odstemplikBold.otf >&3 2>&3
	mv ${MUPI_SRC}/themes/fantasybutterflies/fantasy-butterflies-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/fantasy-butterflies-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/fantasybutterflies/fantasy-circle-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/fantasy-circle-bg.png >&3 2>&3

	#LINES
	mv ${MUPI_SRC}/themes/lines/lines-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/lines/lines-bg.png >&3 2>&3
	mv ${MUPI_SRC}/themes/lines/KOMIKND_.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/lines/KOMIKND_.ttf >&3 2>&3

	#FORMS
	mv ${MUPI_SRC}/themes/forms/forms-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/forms/forms-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/forms/LT_Crafted.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/forms/LT_Crafted.otf >&3 2>&3

	#COMIC
	mv ${MUPI_SRC}/themes/comic/comic-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/comic/comic-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/comic/snaphand-v1-free.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/comic/snaphand-v1-free.ttf >&3 2>&3

	#MYSTIC
	mv ${MUPI_SRC}/themes/mystic/mystic-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/mystic/mystic-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/mystic/ylee_Mortal_Heart.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/mystic/ylee_Mortal_Heart.ttf >&3 2>&3

	#MATRIX
	mv ${MUPI_SRC}/themes/matrix/matrix-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/matrix/matrix-bg.png >&3 2>&3
	mv ${MUPI_SRC}/themes/matrix/Pixolletta8px.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/matrix/Pixolletta8px.ttf >&3 2>&3

	#EARTH
	mv ${MUPI_SRC}/themes/earth/earth-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth/earth-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/earth/Nasa21.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth/Nasa21.ttf >&3 2>&3

	#STEAMPUNK
	mv ${MUPI_SRC}/themes/steampunk/steampunk-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/steampunk/akaPosse.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/akaPosse.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/steampunk/steampunk-gear.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-gear.png >&3 2>&3
	mv ${MUPI_SRC}/themes/steampunk/steampunk-header.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-header.jpg >&3 2>&3

	chown dietpi:dietpi -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/

	mv ${MUPI_SRC}/themes/*.css /home/dietpi/MuPiBox/themes/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/chromium-autostart.sh /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	mv ${MUPI_SRC}/scripts/mupibox/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/bluetooth/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/wled/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/telegram/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/config/templates/www.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	mv ${MUPI_SRC}/config/templates/.bashrc /home/dietpi/.bashrc >&3 2>&3
	mv ${MUPI_SRC}/scripts/mupihat/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/fan/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/wifi/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/mqtt/* /usr/local/bin/mupibox/ >&3 2>&3

	chown dietpi:dietpi /home/dietpi/.bashrc >&3 2>&3
	chmod 755 /usr/local/bin/mupibox/* >&3 2>&3
	chmod 755 /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## Copy MuPiBox-Files  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))



	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy binaries... \nXXX"
	before=$(date +%s)

	service spotifyd stop >&3 2>&3

	# Binaries
	if [ `getconf LONG_BIT` == 32 ]; then
		if [ $OS == "bullseye" ]; then
			mv ${MUPI_SRC}/bin/spotifyd/0.3.3/spotifyd /usr/bin/spotifyd >&3 2>&3
		else
			mv ${MUPI_SRC}/bin/spotifyd/0.3.5/spotifyd /usr/bin/spotifyd >&3 2>&3
		fi
			mv ${MUPI_SRC}/bin/fbv/fbv /usr/bin/fbv >&3 2>&3
	else
		mv ${MUPI_SRC}/bin/spotifyd/0.3.5/spotifyd_64bit /usr/bin/spotifyd >&3 2>&3
		mv ${MUPI_SRC}/bin/fbv/fbv_64 /usr/bin/fbv >&3 2>&3

	fi
	chmod 755 /usr/bin/fbv /usr/bin/spotifyd >&3 2>&3
	mv ${MUPI_SRC}/config/templates/spotifyd.conf /etc/spotifyd/spotifyd.conf >&3 2>&3

	mkdir -p $(cat /etc/mupibox/mupiboxconfig.json | jq -r .spotify.cachepath) >&3 2>&3
	chown dietpi:dietpi $(cat /etc/mupibox/mupiboxconfig.json | jq -r .spotify.cachepath) >&3 2>&3

	after=$(date +%s)
	echo -e "## Copy binaries  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy some media files... \nXXX"
	# Splash and Media
	before=$(date +%s)
	#mv ${MUPI_SRC}/config/templates/splash.txt /boot/splash.txt >&3 2>&3
	wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img >&3 2>&3
	cp ${MUPI_SRC}/media/images/goodbye.png /home/dietpiMuPiBox/sysmedia/images/goodbye.png >&3 2>&3
	#mv ${MUPI_SRC}/media/images/splash.png /boot/splash.png >&3 2>&3
	#cp ${MUPI_SRC}/media/images/MuPiLogo.jpg /home/dietpiMuPiBox/sysmedia/images/MuPiLogo.jpg >&3 2>&3
	#cp ${MUPI_SRC}/media/sound/shutdown.wav /home/dietpiMuPiBox/sysmedia/sound/shutdown.wav >&3 2>&3
	#cp ${MUPI_SRC}/media/sound/startup.wav /home/dietpiMuPiBox/sysmedia/sound/startup.wav >&3 2>&3
	cp ${MUPI_SRC}/media/sound/button_shutdown.wav /home/dietpi/MuPiBox/sysmedia/sound/button_shutdown.wav >&3 2>&3
	cp ${MUPI_SRC}/media/sound/low.mp3 /home/dietpiMuPiBox/sysmedia/sound/low.mp3 >&3 2>&3
	cp ${MUPI_SRC}/media/images/installation.jpg /home/dietpiMuPiBox/sysmedia/images/installation.jpg >&3 2>&3
	cp ${MUPI_SRC}/media/images/battery_low.jpg /home/dietpi/MuPiBox/sysmedia/images/battery_low.jpg >&3 2>&3

	after=$(date +%s)
	echo -e "## Copy media files  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall LED Control... \nXXX"

	before=$(date +%s)
	rm /usr/local/bin/mupibox/led_control >&3 2>&3
	gcc -o ${MUPI_SRC}/scripts/led/led_control ${MUPI_SRC}/scripts/led/led_control.c -lpigpio -ljson-c >&3 2>&3
	#if [ `getconf LONG_BIT` == 32 ]; then
	#	mv -f ${MUPI_SRC}/bin/led_control/led_control_32 /usr/local/bin/mupibox/led_control >&3 2>&3
	#else
	#	mv -f ${MUPI_SRC}/bin/led_control/led_control_64 /usr/local/bin/mupibox/led_control >&3 2>&3
	#fi
	mv -f ${MUPI_SRC}/scripts/led/led_control /usr/local/bin/mupibox/led_control >&3 2>&3
	#/usr/bin/chmod 755 /usr/local/bin/mupibox/led_control >&3 2>&3
	after=$(date +%s)
	echo -e "## LED-Control  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nRestarting Services... \nXXX"
	before=$(date +%s)
	mv -f ${MUPI_SRC}/config/services/mupi_idle_shutdown.service /etc/systemd/system/mupi_idle_shutdown.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_splash.service /etc/systemd/system/mupi_splash.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/spotifyd.service /etc/systemd/system/spotifyd.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/pulseaudio.service /etc/systemd/system/pulseaudio.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_startstop.service /etc/systemd/system/mupi_startstop.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_wifi.service /etc/systemd/system/mupi_wifi.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_check_internet.service /etc/systemd/system/mupi_check_internet.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_check_monitor.service /etc/systemd/system/mupi_check_monitor.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_autoconnect_bt.service /etc/systemd/system/mupi_autoconnect_bt.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_vnc.service /etc/systemd/system/mupi_vnc.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_novnc.service /etc/systemd/system/mupi_novnc.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_powerled.service /etc/systemd/system/mupi_powerled.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_telegram.service /etc/systemd/system/mupi_telegram.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/dietpi-dashboard.service /etc/systemd/system/dietpi-dashboard.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_hat.service /etc/systemd/system/mupi_hat.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_hat_control.service /etc/systemd/system/mupi_hat_control.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_autoconnect-wifi.service /etc/systemd/system/mupi_autoconnect-wifi.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_mqtt.service /etc/systemd/system/mupi_mqtt.service  >&3 2>&3

	systemctl daemon-reload >&3 2>&3
	systemctl enable mupi_check_internet.service >&3 2>&3
	systemctl start mupi_check_internet.service >&3 2>&3
	systemctl enable mupi_check_monitor.service >&3 2>&3
	systemctl start mupi_check_monitor.service >&3 2>&3
	systemctl enable mupi_powerled.service >&3 2>&3
	systemctl start mupi_powerled.service >&3 2>&3
	systemctl enable dietpi-dashboard.service >&3 2>&3
	systemctl start dietpi-dashboard.service >&3 2>&3
	after=$(date +%s)
	echo -e "## Restarting services  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################
	echo -e "XXX\n${STEP}\nUninstall Pi-Blaster... \nXXX"
	before=$(date +%s)
	sudo -H -u dietpi bash -c 'cd /home/dietpi/pi-blaster; make uninstall' >&3 2>&3
	rm -R /home/dietpi/pi-blaster >&3 2>&3
	after=$(date +%s)
	echo -e "## Pi-Blaster  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################


	echo -e "XXX\n${STEP}\nSet environment...  \nXXX"
	before=$(date +%s)
	/usr/bin/chmod 755 ${MUPI_SRC}/config/templates/crontab.template >&3 2>&3
	/usr/bin/chown dietpi:dietpi ${MUPI_SRC}/config/templates/crontab.template >&3 2>&3
	sudo -H -u dietpi bash -c "/usr/bin/crontab ${MUPI_SRC}/config/templates/crontab.template"  >&3 2>&3
	#if grep -q '^initramfs initramfs.img' /boot/config.txt; then
	#  echo -e "initramfs initramfs.img already set"
	#else
	#  echo '' | tee -a /boot/config.txt >&3 2>&3
	#  echo 'initramfs initramfs.img' | tee -a /boot/config.txt >&3 2>&3
	#fi
	usermod -aG dialout dietpi >&3 2>&3
	after=$(date +%s)
	echo -e "## Set environment	##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n{STEP}\nDownload OnOffShim-Scripts... \nXXX"
	before=$(date +%s)
	# OnOffShim
	mv ${MUPI_SRC}/scripts/OnOffShim/off_trigger.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	mv ${MUPI_SRC}/scripts/OnOffShim/poweroff.sh /usr/lib/systemd/system-shutdown/poweroff.sh >&3 2>&3
	chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## OnOff Shim	##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################


	echo -e "XXX\n{STEP}\nUpdate Admin-Interface... \nXXX"
	rm -R /var/www/* >&3 2>&3
	mv ${MUPI_SRC}/AdminInterface/release/www.zip /var/www/www.zip >&3 2>&3
	unzip /var/www/www.zip -d /var/www/ >&3 2>&3
	rm /var/www/www.zip >&3 2>&3
	ln -s /home/dietpi/MuPiBox/media/cover /var/www/cover >&3 2>&3
	chown -R www-data:www-data /var/www/ >&3 2>&3
	chmod -R 755 /var/www/ >&3 2>&3
	chown -R dietpi:www-data /home/dietpi/MuPiBox/media/cover >&3 2>&3

	echo -e "XXX\n${STEP}\nUpdate Config-File... \nXXX"
	cd ${MUPI_SRC}/update/	>&3 2>&3
	chmod 755 conf_update.sh >&3 2>&3
	./conf_update.sh >&3 2>&3

	###############################################################################################

	echo -e "XXX\n${STEP}\nRestore Userdata... \nXXX"
	mv /tmp/data.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json  >&3 2>&3
	mv /tmp/cover /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover  >&3 2>&3
	#mv /tmp/config.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json  >&3 2>&3
	mv /tmp/active_theme.css /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css >&3 2>&3
	chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json >&3 2>&3
	chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	sleep 1 >&3 2>&3
	after=$(date +%s)
	echo -e "## Restore Userdata  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nFinalizing setup... \nXXX"
	#cp ${CONFIG} ${CONFIG}_backup  >&3 2>&3
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "${VERSION_LONG}" '.mupibox.version = $v' ${CONFIG}) >  ${CONFIG}
	chown root:www-data ${CONFIG}
	chmod 775 ${CONFIG}
	#systemctl start mupi_idle_shutdown.service >&3 2>&3
	rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json >&3 2>&3
	ln -s /tmp/network.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json >&3 2>&3
	systemctl stop mupi_change_checker.service >&3 2>&3
	systemctl disable mupi_change_checker.service >&3 2>&3
	rm /etc/systemd/system/mupi_change_checker.service >&3 2>&3
	/usr/local/bin/mupibox/./m3u_generator.sh >&3 2>&3
	/usr/local/bin/mupibox/./setting_update.sh >&3 2>&3
	service spotifyd start >&3 2>&3

	mv ${LOG} /boot/$(date +%F)_update_${VERSION}.log >&3 2>&3
	chown dietpi:dietpi ${CONFIG} >&3 2>&3

	sudo -H -u dietpi bash -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && npm install" >&3 2>&3
	sudo -H -u dietpi bash -c "pm2 start server" >&3 2>&3

	CPU=$(cat /proc/cpuinfo | grep Serial | cut -d ":" -f2 | sed 's/^ //') >&3 2>&3
	curl -X POST https://mupibox.de/mupi/ct.php -H "Content-Type: application/x-www-form-urlencoded" -d key1=${CPU} -d key2=Update -d key3="${VERSION_LONG}" -d key4="${ARCH}" -d key5="${OS}" >&3 2>&3

	###############################################################################################
	echo -e "XXX\n100\nInstallation complete, please reboot the system... \nXXX"
	rm -R ${MUPI_SRC} >&3 2>&3
	sleep 5


} | whiptail --title "MuPiBox Update ${VERSION_LONG}" --gauge "Please wait while installing" 6 60 0

echo "Update finished - please reboot system now!"
