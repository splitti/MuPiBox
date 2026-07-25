#!/bin/bash
#
# Script for MuPiBox Autosetup
# Start with: cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/autosetup/autosetup-stable.sh | bash

RELEASE="stable"
LOG="/tmp/autosetup.log"
BOOT_DIR="/boot"
BOOT_CONFIG="/boot/config.txt"
BOOT_CMDLINE="/boot/cmdline.txt"

if [ -f "/boot/firmware/config.txt" ]; then
  BOOT_DIR="/boot/firmware"
  BOOT_CONFIG="/boot/firmware/config.txt"
fi

if [ -f "/boot/firmware/cmdline.txt" ]; then
  BOOT_CMDLINE="/boot/firmware/cmdline.txt"
fi
VER_JSON="/tmp/version.json"
CONFIG="/etc/mupibox/mupiboxconfig.json"
STEP=0

exec 3>${LOG}

OS=$(grep -E '^(VERSION_CODENAME)=' /etc/os-release)
OS=${OS:17}
ARCH=$(uname -m)
USER=$(/usr/bin/whoami)
RASPPI=$(/usr/bin/cat /sys/firmware/devicetree/base/model 2>/dev/null | tr -d '\0')

autosetup="$(grep autosetup /home/dietpi/.bashrc 2>/dev/null)"
if (( ${#autosetup} > 0 )); then
  head -n -2 /home/dietpi/.bashrc > /tmp/.bashrc && mv /tmp/.bashrc /home/dietpi/.bashrc
fi

rm -Rf /home/dietpi/mupibox.zip /home/dietpi/MuPiBox-* >&3 2>&3

{
	packages2install="lighttpd-mod-openssl gpiod git libasound2 mplayer pulseaudio-module-bluetooth pip id3tool bluez zip rrdtool scrot net-tools wireless-tools autoconf automake bc build-essential python3-gpiozero python3-rpi.gpio python3-lgpio python3-serial python3-requests python3-paho-mqtt libgles2-mesa mesa-utils libsdl2-dev preload python3-smbus2 pigpio libjson-c-dev i2c-tools libi2c-dev python3-smbus python3-alsaaudio python3-netifaces libwidevinecdm0 python3-flask"

	###############################################################################################

	echo -e "XXX\n${STEP}\nUpdate package-list\nXXX"
	before=$(date +%s)
	apt-get update >&3 2>&3
	after=$(date +%s)
	echo -e "## apt-get update ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall jq 1.8.1 ... \nXXX"
	before=$(date +%s)
	rm -f /usr/bin/jq >&3 2>&3
	if [ "$(getconf LONG_BIT)" = "32" ]; then
		wget -q -O /usr/bin/jq https://github.com/jqlang/jq/releases/latest/download/jq-linux-armhf >&3 2>&3
	else
		wget -q -O /usr/bin/jq https://github.com/jqlang/jq/releases/latest/download/jq-linux-arm64 >&3 2>&3
	fi
	chmod 755 /usr/bin/jq >&3 2>&3
	after=$(date +%s)
	echo -e "## Install jq 1.8.1 ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	for package in ${packages2install}; do
		before=$(date +%s)
		echo -e "XXX\n${STEP}\nInstall ${package}\nXXX"
		PKG_OK=$(dpkg -l ${package} 2>/dev/null | egrep '^ii' | wc -l)
		if [ ${PKG_OK} -eq 0 ]; then
			apt-get --yes install ${package} >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## apt-get install ${package} ## finished after $((after - before)) seconds" >&3 2>&3
		STEP=$((STEP + 1))
	done

	###############################################################################################

	if [ "$OS" = "bullseye" ]; then
		echo -e "XXX\n${STEP}\nInstall package mutagen\nXXX"
		before=$(date +%s)
		pip install mutagen >&3 2>&3
		after=$(date +%s)
		echo -e "## pip install mutagen ## finished after $((after - before)) seconds" >&3 2>&3
		STEP=$((STEP + 1))

		echo -e "XXX\n${STEP}\nInstall package pip requests\nXXX"
		before=$(date +%s)
		installed=$(pip list | grep requests)
		if [ ${#installed} = 0 ]; then
			pip install requests --break-system-packages >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## pip install requests ## finished after $((after - before)) seconds" >&3 2>&3
		STEP=$((STEP + 1))

		echo -e "XXX\n${STEP}\nInstall package pip pyserial\nXXX"
		before=$(date +%s)
		installed=$(pip list | grep pyserial)
		if [ ${#installed} = 0 ]; then
			pip install pyserial --break-system-packages >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## pip install pyserial ## finished after $((after - before)) seconds" >&3 2>&3
		STEP=$((STEP + 1))
	else
		echo -e "XXX\n${STEP}\nInstall package python3-mutagen/python3-dev\nXXX"
		for package in python3-mutagen python3-dev; do
			before=$(date +%s)
			echo -e "XXX\n${STEP}\nInstall ${package}\nXXX"
			PKG_OK=$(dpkg -l ${package} 2>/dev/null | egrep '^ii' | wc -l)
			if [ ${PKG_OK} -eq 0 ]; then
				apt-get --yes install ${package} >&3 2>&3
			fi
			after=$(date +%s)
			echo -e "## apt-get install ${package} ## finished after $((after - before)) seconds" >&3 2>&3
			STEP=$((STEP + 1))
		done

		echo -e "XXX\n${STEP}\nInstall package pip telepot\nXXX"
		before=$(date +%s)
		installed=$(pip list | grep telepot)
		if [ ${#installed} = 0 ]; then
			pip install telepot --break-system-packages >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## pip install telepot ## finished after $((after - before)) seconds" >&3 2>&3
		STEP=$((STEP + 1))
	fi

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall DietPi software dependencies ...\nXXX"
	before=$(date +%s)
	su - -c "yes '' | /boot/dietpi/dietpi-software install 200" >&3 2>&3
	after=$(date +%s)
	echo -e "## DietPi software dependencies ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nPrepare MuPiBox Download ... \nXXX"
	before=$(date +%s)
	wget -q -O ${VER_JSON} https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json >&3 2>&3
	VERSION=$(/usr/bin/jq -r .release.${RELEASE}[-1].version ${VER_JSON})
	MUPIBOX_URL=$(/usr/bin/jq -r .release.${RELEASE}[-1].url ${VER_JSON})
	VERSION_LONG="${VERSION} ${RELEASE}"
	MUPI_SRC="/home/dietpi/MuPiBox-${VERSION}"
	after=$(date +%s)
	echo -e "## Prepare MuPiBox Download ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	echo "==========================================================================================" >&3 2>&3
	echo "= OS:               ${OS}" >&3 2>&3
	echo "= RasPi:            ${RASPPI}" >&3 2>&3
	echo "= Architecture:     ${ARCH}" >&3 2>&3
	echo "= User:             ${USER}" >&3 2>&3
	echo "= Release:          ${RELEASE}" >&3 2>&3
	echo "= Version:          ${VERSION_LONG}" >&3 2>&3
	echo "= Update-URL:       ${MUPIBOX_URL}" >&3 2>&3
	echo "= Unzip-Directory:  ${MUPI_SRC}" >&3 2>&3
	echo "==========================================================================================" >&3 2>&3

	###############################################################################################

	echo -e "XXX\n${STEP}\nDownload MuPiBox Version ${VERSION_LONG}... \nXXX"
	before=$(date +%s)
	wget -q -O /home/dietpi/mupibox.zip ${MUPIBOX_URL} >&3 2>&3
	after=$(date +%s)
	echo -e "## MuPiBox Download ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	echo -e "XXX\n${STEP}\nUnzip MuPiBox Version ${VERSION_LONG}... \nXXX"
	before=$(date +%s)
	unzip -q -d /home/dietpi/ /home/dietpi/mupibox.zip >&3 2>&3
	rm /home/dietpi/mupibox.zip >&3 2>&3
	after=$(date +%s)
	echo -e "## Unzip MuPiBox Sources ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall/Update Node.js 22 ... \nXXX"
	before=$(date +%s)
	NODEJS=$(nodejs --version 2>/dev/null)
	if [[ "$NODEJS" == "v22."* ]]; then
		echo "Node.js already at v22.*" >&3 2>&3
	else
		apt-get --yes remove nodejs >&3 2>&3
		curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >&3 2>&3
		apt-get install -y nodejs >&3 2>&3
	fi
	after=$(date +%s)
	echo -e "## Install/Update Node.js 22 ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall ionic... \nXXX"
	before=$(date +%s)
	npm install -g @ionic/cli >&3 2>&3
	after=$(date +%s)
	echo -e "## Install ionic ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	echo -e "XXX\n${STEP}\nInstall pm2... \nXXX"
	before=$(date +%s)
	npm install pm2 -g >&3 2>&3
	after=$(date +%s)
	echo -e "## Install pm2 ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	echo -e "XXX\n${STEP}\nConfigure pm2 startup... \nXXX"
	before=$(date +%s)
	pm2 startup >&3 2>&3
	PM2_ENV=$(grep "sudo env" ${LOG} | tail -n 1)
	echo ${PM2_ENV} >&3 2>&3
	${PM2_ENV} >&3 2>&3
	after=$(date +%s)
	echo -e "## Configure pm2 ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nClean and create directories... \nXXX"
	before=$(date +%s)
	rm -Rf /home/dietpi/.mupibox /home/dietpi/MuPiBox >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/chromium_cache >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/tts_files >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/sysmedia/sound >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/sysmedia/images >&3 2>&3
	mkdir -p /home/dietpi/.cache/spotify >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/media/audiobook >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/media/music >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/media/other >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/media/cover >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/media/youtube-dl >&3 2>&3
	mkdir -p /home/dietpi/MuPiBox/themes >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/spotifycontroller-main/config >&3 2>&3
	mkdir -p /usr/local/bin/mupibox >&3 2>&3
	mkdir -p /etc/mupibox >&3 2>&3
	mkdir -p /etc/librespot >&3 2>&3
	mkdir -p /var/log/mupibox/ >&3 2>&3
	chown -R dietpi:dietpi /home/dietpi/.mupibox /home/dietpi/MuPiBox >&3 2>&3
	after=$(date +%s)
	echo -e "## Clean and create directories ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCreate hushlogin and MuPiBox config... \nXXX"
	before=$(date +%s)
	touch /home/dietpi/.hushlogin >&3 2>&3
	mv -f ${MUPI_SRC}/config/templates/mupiboxconfig.json ${CONFIG} >&3 2>&3
	chown root:www-data ${CONFIG} >&3 2>&3
	chmod 775 ${CONFIG} >&3 2>&3
	after=$(date +%s)
	echo -e "## Create hushlogin and MuPiBox config ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall frontend, backend-api, and backend-player... \nXXX"
	before=$(date +%s)
	unzip ${MUPI_SRC}/bin/nodejs/deploy.zip -d /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	cp ${MUPI_SRC}/config/templates/www.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	cp ${MUPI_SRC}/config/templates/monitor.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json >&3 2>&3
	cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/spotify-control.js /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js >&3 2>&3
	cp ${MUPI_SRC}/config/templates/spotifycontroller.json /home/dietpi/.mupibox/spotifycontroller-main/config/config.json >&3 2>&3
	ln -sf /etc/mupibox/mupiboxconfig.json /home/dietpi/.mupibox/spotifycontroller-main/config/mupiboxconfig.json >&3 2>&3
	ln -sf /var/www/images/mupif.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/mupi.png >&3 2>&3
	chown -R dietpi:dietpi /home/dietpi/.mupibox >&3 2>&3
	after=$(date +%s)
	echo -e "## Install frontend, backend-api, and backend-player ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy binaries... \nXXX"
	before=$(date +%s)
	rm -f /usr/bin/librespot >&3 2>&3
	if [ "$(getconf LONG_BIT)" = "32" ]; then
		wget -O /usr/bin/librespot https://github.com/splitti/MuPiBox/raw/refs/heads/main/bin/librespot/dev_0.6_20250806/librespot-32bit >&3 2>&3
		mv ${MUPI_SRC}/bin/fbv/fbv /usr/bin/fbv >&3 2>&3
	else
		wget -O /usr/bin/librespot https://github.com/splitti/MuPiBox/raw/refs/heads/main/bin/librespot/dev_0.6_20250806/librespot-64bit >&3 2>&3
		mv ${MUPI_SRC}/bin/fbv/fbv_64 /usr/bin/fbv >&3 2>&3
	fi
	chmod 755 /usr/bin/fbv /usr/bin/jq /usr/bin/librespot >&3 2>&3
	mkdir -p $(cat ${CONFIG} | jq -r .spotify.cachepath) >&3 2>&3
	chown dietpi:dietpi $(cat ${CONFIG} | jq -r .spotify.cachepath) >&3 2>&3
	after=$(date +%s)
	echo -e "## Copy binaries ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nSetup DietPi-Dashboard... \nXXX"
	before=$(date +%s)
	mkdir -p /opt/dietpi-dashboard >&3 2>&3
	rm -f /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	curl -fL "$(curl -sSf 'https://api.github.com/repos/nonnorm/DietPi-Dashboard/releases/latest' | mawk -F\" "/\"browser_download_url\": \".*dietpi-dashboard-$(uname -m)\"/{print \$4}")" -o /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	chmod +x /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	curl -sSfL https://raw.githubusercontent.com/nonnorm/DietPi-Dashboard/v0.6.2/config.toml -o /opt/dietpi-dashboard/config.toml >&3 2>&3
	sed -i 's/#terminal_user = "root"/terminal_user = "dietpi"/g' /opt/dietpi-dashboard/config.toml >&3 2>&3
	after=$(date +%s)
	echo -e "## Setup DietPi-Dashboard ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy DietPi config... \nXXX"
	before=$(date +%s)
	mv -f ${MUPI_SRC}/config/templates/asound.conf /etc/asound.conf >&3 2>&3
	mv -f ${MUPI_SRC}/config/templates/smb.conf /etc/samba/smb.conf >&3 2>&3
	after=$(date +%s)
	echo -e "## Copy DietPi config ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy media files... \nXXX"
	before=$(date +%s)
	mv -f ${MUPI_SRC}/config/templates/splash.txt /boot/splash.txt >&3 2>&3
	wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O "${BOOT_DIR}/initramfs.img" >&3 2>&3
	cp ${MUPI_SRC}/media/images/goodbye.png /home/dietpi/MuPiBox/sysmedia/images/goodbye.png >&3 2>&3
	mv -f ${MUPI_SRC}/media/images/splash.png /boot/splash.png >&3 2>&3
	cp ${MUPI_SRC}/media/images/MuPiLogo.jpg /home/dietpi/MuPiBox/sysmedia/images/MuPiLogo.jpg >&3 2>&3
	cp ${MUPI_SRC}/media/sound/shutdown.wav /home/dietpi/MuPiBox/sysmedia/sound/shutdown.wav >&3 2>&3
	cp ${MUPI_SRC}/media/sound/startup.wav /home/dietpi/MuPiBox/sysmedia/sound/startup.wav >&3 2>&3
	cp ${MUPI_SRC}/media/sound/button_shutdown.wav /home/dietpi/MuPiBox/sysmedia/sound/button_shutdown.wav >&3 2>&3
	cp ${MUPI_SRC}/media/sound/low.wav /home/dietpi/MuPiBox/sysmedia/sound/low.wav >&3 2>&3
	cp ${MUPI_SRC}/media/images/installation.jpg /home/dietpi/MuPiBox/sysmedia/images/installation.jpg >&3 2>&3
	cp ${MUPI_SRC}/media/images/battery_low.jpg /home/dietpi/MuPiBox/sysmedia/images/battery_low.jpg >&3 2>&3
	after=$(date +%s)
	echo -e "## Copy media files ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy MuPiBox files and themes... \nXXX"
	before=$(date +%s)
	for theme in earth steampunk fantasybutterflies matrix lines forms comic mystic clone-wars enterprise spiderman supermario pikachu dinosaur unicorn axolotl custom; do
		mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/${theme} >&3 2>&3
	done

	mv ${MUPI_SRC}/themes/fantasybutterflies/odstemplikBold.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/odstemplikBold.otf >&3 2>&3
	mv ${MUPI_SRC}/themes/fantasybutterflies/fantasy-butterflies-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/fantasy-butterflies-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/fantasybutterflies/fantasy-circle-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/fantasy-circle-bg.png >&3 2>&3
	mv ${MUPI_SRC}/themes/lines/lines-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/lines/lines-bg.png >&3 2>&3
	mv ${MUPI_SRC}/themes/lines/KOMIKND_.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/lines/KOMIKND_.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/forms/forms-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/forms/forms-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/forms/LT_Crafted.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/forms/LT_Crafted.otf >&3 2>&3
	mv ${MUPI_SRC}/themes/comic/comic-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/comic/comic-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/comic/snaphand-v1-free.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/comic/snaphand-v1-free.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/mystic/mystic-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/mystic/mystic-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/mystic/ylee_Mortal_Heart.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/mystic/ylee_Mortal_Heart.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/matrix/matrix-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/matrix/matrix-bg.png >&3 2>&3
	mv ${MUPI_SRC}/themes/matrix/Pixolletta8px.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/matrix/Pixolletta8px.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/clone-wars/Starjedi.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/clone-wars/Starjedi.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/clone-wars/clone-wars-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/clone-wars/clone-wars-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/enterprise/Nasa21.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/enterprise/Nasa21.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/enterprise/enterprise-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/enterprise/enterprise-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/spiderman/IntensaFuente.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/spiderman/IntensaFuente.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/spiderman/spiderman-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/spiderman/spiderman-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/pikachu/PokemonXandY.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/pikachu/PokemonXandY.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/pikachu/pikachu-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/pikachu/pikachu-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/supermario/NewSuperMarioFontU.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/supermario/NewSuperMarioFontU.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/supermario/supermario-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/supermario/supermario-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/dinosaur/BerlinSmallCaps.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/dinosaur/BerlinSmallCaps.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/dinosaur/dinosaur-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/dinosaur/dinosaur-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/unicorn/MagnoliaScript.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/unicorn/MagnoliaScript.otf >&3 2>&3
	mv ${MUPI_SRC}/themes/unicorn/unicorn-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/unicorn/unicorn-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/axolotl/MagnoliaScript.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/axolotl/MagnoliaScript.otf >&3 2>&3
	mv ${MUPI_SRC}/themes/axolotl/axolotl-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/axolotl/axolotl-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/earth/earth-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth/earth-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/earth/Nasa21.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth/Nasa21.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/steampunk/steampunk-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/steampunk/akaPosse.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/akaPosse.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/steampunk/steampunk-gear.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-gear.png >&3 2>&3
	mv ${MUPI_SRC}/themes/steampunk/steampunk-header.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-header.jpg >&3 2>&3
	ln -sf /home/dietpi/MuPiBox/themes/custom-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/custom/custom-bg.jpg >&3 2>&3

	mv ${MUPI_SRC}/themes/*.css /home/dietpi/MuPiBox/themes/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/chromium-autostart.sh /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	mv ${MUPI_SRC}/scripts/mupibox/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/bluetooth/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/wled/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/telegram/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/mupihat/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/fan/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/wifi/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/mqtt/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/config/templates/add_wifi.json /boot/add_wifi.json >&3 2>&3
	mv ${MUPI_SRC}/config/templates/.bashrc /home/dietpi/.bashrc >&3 2>&3
	chown -R dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ /home/dietpi/MuPiBox /home/dietpi/.bashrc >&3 2>&3
	chmod 755 /usr/local/bin/mupibox/* /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## Copy MuPiBox files and themes ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall Hifiberry-MiniAmp and Bluetooth support... \nXXX"
	before=$(date +%s)
	/boot/dietpi/dietpi-software install 5 >&3 2>&3
	/boot/dietpi/func/dietpi-set_hardware bluetooth enable >&3 2>&3
	/boot/dietpi/func/dietpi-set_hardware soundcard "hifiberry-dac" >&3 2>&3
	usermod -g pulse -G audio --home /var/run/pulse pulse >&3 2>&3
	usermod -a -G audio,bluetooth,pulse,pulse-access,gpio,dialout,tty dietpi >&3 2>&3
	usermod -a -G pulse,pulse-access,gpio root >&3 2>&3
	sed -i 's/; system-instance = no/system-instance = yes/g' /etc/pulse/daemon.conf >&3 2>&3
	sed -i 's/; default-server =/default-server = \/var\/run\/pulse\/native/g' /etc/pulse/client.conf >&3 2>&3
	sed -i 's/; autospawn = yes/autospawn = no/g' /etc/pulse/client.conf >&3 2>&3
	sed -i 's/ExecStart=\/usr\/libexec\/bluetooth\/bluetoothd/ExecStart=\/usr\/libexec\/bluetooth\/bluetoothd --noplugin=sap/g' /lib/systemd/system/bluetooth.service >&3 2>&3
	after=$(date +%s)
	echo -e "## Bluetooth support ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nEnable Admin-Webservice... \nXXX"
	before=$(date +%s)
	/boot/dietpi/dietpi-software install 5 84 89 >&3 2>&3
	rm -Rf /var/www/* >&3 2>&3
	unzip ${MUPI_SRC}/AdminInterface/release/www.zip -d /var/www/ >&3 2>&3
	ln -sf /home/dietpi/MuPiBox/media/cover /var/www/cover >&3 2>&3
	chown -R www-data:www-data /var/www/ >&3 2>&3
	chmod -R 755 /var/www/ >&3 2>&3
	chown -R dietpi:www-data /home/dietpi/MuPiBox/media/cover >&3 2>&3
	after=$(date +%s)
	echo -e "## Admin-Webinterface ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall LED Control... \nXXX"
	before=$(date +%s)
	rm -f /usr/local/bin/mupibox/led_control >&3 2>&3
	gcc -o ${MUPI_SRC}/scripts/led/led_control ${MUPI_SRC}/scripts/led/led_control.c -lpigpio -ljson-c >&3 2>&3
	mv -f ${MUPI_SRC}/scripts/led/led_control /usr/local/bin/mupibox/led_control >&3 2>&3
	chmod 755 /usr/local/bin/mupibox/led_control >&3 2>&3
	after=$(date +%s)
	echo -e "## LED-Control ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nSet environment... \nXXX"
	before=$(date +%s)
	(echo "mupibox"; echo "mupibox") | smbpasswd -s -a dietpi >&3 2>&3
	THEME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css"
	ln -sf /home/dietpi/MuPiBox/themes/blue.css ${THEME_FILE} >&3 2>&3
	echo "www-data ALL=(ALL:ALL) NOPASSWD: ALL" | tee /etc/sudoers.d/www-data >&3 2>&3
	mv -f ${MUPI_SRC}/config/templates/crontab.template /tmp/crontab.template >&3 2>&3
	chmod 755 /tmp/crontab.template >&3 2>&3
	chown dietpi:dietpi /tmp/crontab.template >&3 2>&3
	su dietpi -c "/usr/bin/crontab /tmp/crontab.template" >&3 2>&3
	ln -sf /tmp/network.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json >&3 2>&3
	cat <<< $(jq --arg v "${VERSION_LONG}" '.mupibox.version = $v' ${CONFIG}) > ${CONFIG}
	chown root:www-data ${CONFIG} >&3 2>&3
	chmod 775 ${CONFIG} >&3 2>&3

	if grep -q '^dtparam=gpio=on' "${BOOT_CONFIG}"; then
	  echo -e "dtparam=gpio=on already set" >&3 2>&3
	else
	  echo '' | tee -a "${BOOT_CONFIG}" >&3 2>&3
	  echo 'dtparam=gpio=on' | tee -a "${BOOT_CONFIG}" >&3 2>&3
	fi

	if grep -q '^dtoverlay=gpio-poweroff,gpiopin=4,active_low=1' "${BOOT_CONFIG}"; then
	  echo -e "dtoverlay=gpio-poweroff already set" >&3 2>&3
	else
	  echo '' | tee -a "${BOOT_CONFIG}" >&3 2>&3
	  echo 'dtoverlay=gpio-poweroff,gpiopin=4,active_low=1' | tee -a "${BOOT_CONFIG}" >&3 2>&3
	fi

	curl https://raw.githubusercontent.com/scopatz/nanorc/master/install.sh | sh >&3 2>&3
	touch /home/dietpi/.mupi.install >&3 2>&3
	after=$(date +%s)
	echo -e "## Set environment ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy OnOffShim scripts... \nXXX"
	before=$(date +%s)
	mv -f ${MUPI_SRC}/scripts/OnOffShim/off_trigger.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	mv -f ${MUPI_SRC}/scripts/OnOffShim/poweroff.sh /usr/lib/systemd/system-shutdown/poweroff.sh >&3 2>&3
	chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## Copy OnOffShim scripts ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall Chromium-Kiosk... \nXXX"
	before=$(date +%s)
	echo -ne '\n' | /boot/dietpi/dietpi-software install 113 >&3 2>&3
	/boot/dietpi/dietpi-autostart 11 >&3 2>&3
	chmod +x /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	apt-get install xserver-xorg-legacy -y >&3 2>&3
	sed -i 's/allowed_users\=console/allowed_users\=anybody/g' /etc/X11/Xwrapper.config >&3 2>&3
	mv -f ${MUPI_SRC}/config/templates/98-dietpi-disable_dpms.conf /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf >&3 2>&3
	sed -i 's/tty1/tty3 vt.global_cursor_default\=0 fastboot noatime nodiratime noram splash silent loglevel\=0 vt.default_red\=68,68,68,68,68,68,68,68 vt.default_grn\=175,175,175,175,175,175,175,175 vt.default_blu\=226,226,226,226,226,226,226,226/g' /boot/cmdline.txt >&3 2>&3
	sed -i 's/session    optional   pam_motd.so motd\=\/run\/motd.dynamic/#session    optional   pam_motd.so motd\=\/run\/motd.dynamic/g' /etc/pam.d/login >&3 2>&3
	sed -i 's/session    optional   pam_motd.so noupdate/#session    optional   pam_motd.so noupdate/g' /etc/pam.d/login >&3 2>&3
	sed -i 's/ExecStart\=-\/sbin\/agetty -a dietpi -J \%I \$TERM/ExecStart\=-\/sbin\/agetty --skip-login --noclear --noissue --login-options "-f dietpi" \%I \$TERM/g' /etc/systemd/system/getty@tty1.service.d/dietpi-autologin.conf >&3 2>&3
	/boot/dietpi/func/dietpi-set_hardware gpumemsplit 128 >&3 2>&3
	/boot/dietpi/func/dietpi-set_hardware headless 0 >&3 2>&3
	/boot/dietpi/func/dietpi-set_hardware rpi-opengl disable >&3 2>&3
	su - -c ". /boot/dietpi/func/dietpi-globals && G_CHECK_ROOT_USER && G_CHECK_ROOTFS_RW && G_INIT && G_CONFIG_INJECT 'framebuffer_width=' \"framebuffer_width=800\" /boot/config.txt" >&3 2>&3
	su - -c ". /boot/dietpi/func/dietpi-globals && G_CHECK_ROOT_USER && G_CHECK_ROOTFS_RW && G_INIT && G_CONFIG_INJECT 'framebuffer_height=' \"framebuffer_height=480\" /boot/config.txt" >&3 2>&3
	after=$(date +%s)
	echo -e "## Install Chromium ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nEnable and start services... \nXXX"
	before=$(date +%s)
	mv -f ${MUPI_SRC}/config/services/mupi_idle_shutdown.service /etc/systemd/system/mupi_idle_shutdown.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_splash.service /etc/systemd/system/mupi_splash.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/librespot.service /etc/systemd/system/librespot.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/templates/env-librespot /etc/librespot/env-librespot >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/pulseaudio.service /etc/systemd/system/pulseaudio.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_startstop.service /etc/systemd/system/mupi_startstop.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_wifi.service /etc/systemd/system/mupi_wifi.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_check_internet.service /etc/systemd/system/mupi_check_internet.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_check_monitor.service /etc/systemd/system/mupi_check_monitor.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_autoconnect_bt.service /etc/systemd/system/mupi_autoconnect_bt.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_vnc.service /etc/systemd/system/mupi_vnc.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_novnc.service /etc/systemd/system/mupi_novnc.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_powerled.service /etc/systemd/system/mupi_powerled.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_telegram.service /etc/systemd/system/mupi_telegram.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/dietpi-dashboard.service /etc/systemd/system/dietpi-dashboard.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_hat.service /etc/systemd/system/mupi_hat.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_hat_control.service /etc/systemd/system/mupi_hat_control.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_autoconnect-wifi.service /etc/systemd/system/mupi_autoconnect-wifi.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_mqtt.service /etc/systemd/system/mupi_mqtt.service >&3 2>&3
	systemctl daemon-reload >&3 2>&3
	for service in mupi_wifi mupi_check_internet mupi_check_monitor mupi_idle_shutdown librespot smbd mupi_startstop pulseaudio mupi_splash mupi_powerled dietpi-dashboard; do
		systemctl enable ${service}.service >&3 2>&3
		systemctl start ${service}.service >&3 2>&3
	done
	after=$(date +%s)
	echo -e "## Enable and start services ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nNetwork optimization... \nXXX"
	before=$(date +%s)
	cd /usr/local/bin/mupibox/ >&3 2>&3
	./optimize_wifi.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## Network optimization ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nActivate SSL... \nXXX"
	before=$(date +%s)
	openssl req -new -x509 -keyout /etc/lighttpd/server.pem -out /etc/lighttpd/server.pem -days 3650 -nodes -subj "/C=DE/CN=mupibox" >/dev/null >&3 2>&3
	lighty-enable-mod ssl >&3 2>&3
	service lighttpd force-reload >&3 2>&3
	after=$(date +%s)
	echo -e "## Activate SSL ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nFinalizing setup... \nXXX"
	before=$(date +%s)
	/usr/local/bin/mupibox/./m3u_generator.sh >&3 2>&3
	/usr/local/bin/mupibox/./setting_update.sh >&3 2>&3
	service librespot restart >&3 2>&3
	sudo -H -u dietpi bash -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && npm install" >&3 2>&3
	sudo -H -u dietpi bash -c "pm2 start server" >&3 2>&3
	sudo -H -u dietpi bash -c "pm2 save" >&3 2>&3
	chown -R dietpi:dietpi /home/dietpi/.mupibox /home/dietpi/MuPiBox >&3 2>&3
	chown dietpi:dietpi ${CONFIG} >&3 2>&3
	after=$(date +%s)
	echo -e "## Finalizing setup ## finished after $((after - before)) seconds" >&3 2>&3
	STEP=$((STEP + 1))

	###############################################################################################

	echo -e "XXX\n100\nInstallation complete, please reboot the system... \nXXX"
	OS=$(grep -E '^(VERSION_CODENAME)=' /etc/os-release)
	OS=${OS:17}
	CPU=$(cat /proc/cpuinfo | grep Serial | cut -d ":" -f2 | sed 's/^ //')
	ARCH=$(uname -m)
	curl -X POST https://mupibox.de/mupi/ct.php -H "Content-Type: application/x-www-form-urlencoded" -d key1=${CPU} -d key2="Classic Installation" -d key3="${VERSION_LONG}" -d key4="${ARCH}" -d key5="${OS}" >&3 2>&3
	rm -Rf ${MUPI_SRC} >&3 2>&3
	mv ${LOG} /boot/autosetup.log > /dev/null 2>&3
	sleep 5

} | whiptail --title "MuPiBox Autosetup ${VERSION_LONG}" --gauge "Please wait while installing" 6 60 0

reboot
