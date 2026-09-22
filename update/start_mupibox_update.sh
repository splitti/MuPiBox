#!/bin/bash
#

#https://raw.githubusercontent.com/splitti/MuPiBox/main

if [ "$1" = "dev" ] || [ "$1" = "beta" ] || [ "$1" = "stable" ]; then
	RELEASE="$1"
elif [ "$1" = "branch" ]; then
  RELEASE="dev"
  BRANCH="$2"
  if [ -z "$BRANCH" ]; then
    echo "Error: Branch name is required when using branch install"
    exit 1
  fi
  # Optional 3rd/4th args let this install from a fork instead of splitti/MuPiBox,
  # and give the resulting install a custom version label (e.g. "DEV 5.0.0")
  # instead of the auto-generated "DEV <branch> <date>" string.
  REPO="${3:-splitti/MuPiBox}"
  VERSION_LABEL="$4"
  BRANCH_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/${REPO}/branches/${BRANCH})
  if [ "$BRANCH_EXISTS" != "200" ]; then
    echo "Error: Branch '${BRANCH}' does not exist on GitHub repo '${REPO}'"
    exit 1
  fi
else
	RELEASE="stable"
fi

# Preflight: this update replaces jq with a freshly downloaded binary and rewrites the
# configuration with jq. Download it FIRST, so a network problem (e.g. a
# DNS failure) stops the update before anything on the box has been changed. Before,
# a failed download left an empty /usr/bin/jq behind, which then wiped the config files.
PREFLIGHT_DIR=$(mktemp -d /tmp/mupibox-preflight.XXXXXX)
if [ `getconf LONG_BIT` == 32 ]; then
  JQ_ARCH="armhf"
else
  JQ_ARCH="arm64"
fi
if ! curl -fsSL --retry 3 --retry-delay 3 -m 180 -o ${PREFLIGHT_DIR}/jq https://github.com/jqlang/jq/releases/download/jq-1.8.1/jq-linux-${JQ_ARCH} \
   || ! chmod 755 ${PREFLIGHT_DIR}/jq || ! ${PREFLIGHT_DIR}/jq --version > /dev/null 2>&1; then
  echo "Error: could not download jq (no internet / DNS problem?). Nothing was changed - please try again."
  rm -rf ${PREFLIGHT_DIR}
  exit 1
fi

killall -s 9 -w -q -r chromium

CONFIG="/etc/mupibox/mupiboxconfig.json"

# Keep a copy of the current settings and media list (only if they are intact), so a
# failed update can never leave the box without a way back.
if ${PREFLIGHT_DIR}/jq . ${CONFIG} > /dev/null 2>&1; then
  cp ${CONFIG} /home/dietpi/mupiboxconfig.json.pre-update
fi
if ${PREFLIGHT_DIR}/jq . /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json > /dev/null 2>&1; then
  cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json /home/dietpi/data.json.pre-update
fi
LOG="/boot/mupibox_update.log"
exec 3>${LOG}
service mupi_idle_shutdown stop
# 2026-09-20: no longer installed (nothing in MuPiBox uses them any more):
#   id3tool - only the ID3 converter used it; that converter was removed from the admin
#   python3-gpiozero - no script imports gpiozero (GPIO is done with RPi.GPIO / pigpio / gpiod)
#   mesa-utils - only diagnostic tools (glxinfo); nothing calls them
#   libsdl2-dev - no SDL code is built or used (fbv ships as a prebuilt binary)
#   python3-smbus - unused; the mupihat scripts use python3-smbus2
#   i2c-tools - no script calls i2cdetect/i2cget/i2cset (I2C is used through python3-smbus2)
#   libwidevinecdm0 - Widevine is only needed for DRM playback in the browser; the code has no Spotify web player (Spotify plays through librespot)
#   autoconf - only needed to compile fbv (dev/compile_scripts/fbv.sh); fbv ships prebuilt in bin/fbv
#   automake - only needed to compile fbv (dev/compile_scripts/fbv.sh); fbv ships prebuilt in bin/fbv
# The changes of this list apply to DEV installs only; stable and beta keep the list they always had.
if [ "$RELEASE" != "dev" ]; then
  packages2install="lighttpd-mod-openssl gpiod git libasound2 mplayer pulseaudio-module-bluetooth pip id3tool bluez zip rrdtool scrot net-tools wireless-tools autoconf automake bc build-essential python3-gpiozero python3-rpi.gpio python3-lgpio python3-serial python3-requests python3-paho-mqtt libgles2-mesa mesa-utils libsdl2-dev preload python3-smbus2 pigpio libjson-c-dev i2c-tools libi2c-dev python3-smbus python3-alsaaudio python3-netifaces libwidevinecdm0 python3-flask"
else
  packages2install="lighttpd-mod-openssl gpiod git libasound2 mplayer pulseaudio-module-bluetooth pip bluez zip rrdtool scrot net-tools wireless-tools bc build-essential python3-rpi.gpio python3-lgpio python3-serial python3-requests python3-paho-mqtt libgles2-mesa preload python3-smbus2 pigpio libjson-c-dev libi2c-dev python3-alsaaudio python3-netifaces python3-flask python3-pil"
fi
packages2remove="jq"
STEP=0
VER_JSON="/tmp/version.json"
OS=$(grep -E '^(VERSION_CODENAME)=' /etc/os-release)  >&3 2>&3
OS=${OS:17}  >&3 2>&3
ARCH=$(uname -m) >&3 2>&3	

wget -O /tmp/installation.jpg https://raw.githubusercontent.com/splitti/MuPiBox/main/media/images/installation.jpg >&3 2>&3
/usr/bin/fbv /tmp/installation.jpg & >&3 2>&3

if [ -z "$BRANCH" ]; then
  wget -q -O ${VER_JSON} https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json >&3 2>&3
  VERSION=$(/usr/bin/jq -r .release.${RELEASE}[-1].version ${VER_JSON})  >&3 2>&3
  MUPIBOX_URL=$(/usr/bin/jq -r .release.${RELEASE}[-1].url ${VER_JSON})  >&3 2>&3
else
  MUPIBOX_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip"
fi

USER=$(/usr/bin/whoami) >&3 2>&3
RASPPI=$(/usr/bin/cat /sys/firmware/devicetree/base/model | tr -d '\0' ) >&3 2>&3

if [ -n "$BRANCH" ]; then
	# GitHub names the archive folder "<repo name>-<branch>", so a fork that is
	# not called "MuPiBox" (e.g. "MuPiBox-custom") unpacks somewhere else.
	MUPI_SRC="/home/dietpi/${REPO##*/}-${BRANCH}" >&3 2>&3
elif [ "$RELEASE" = "dev" ]; then
	MUPI_SRC="/home/dietpi/MuPiBox-main" >&3 2>&3
else
	MUPI_SRC="/home/dietpi/MuPiBox-${VERSION}" >&3 2>&3
fi

if [ -n "$BRANCH" ]; then
  if [ -n "$VERSION_LABEL" ]; then
    VERSION_LONG="${VERSION_LABEL}"
  else
    VERSION_LONG="DEV ${BRANCH} $(curl -s 'https://api.github.com/repos/'"$REPO"'/branches/'"$BRANCH" | jq -r '.commit.commit.committer.date' | cut -d'T' -f1)" >&3 2>&3
  fi
elif [ "$RELEASE" = "dev" ]; then
	VERSION_LONG="DEV ${VERSION} $(curl -s "https://api.github.com/repos/splitti/MuPiBox" | jq -r '.pushed_at' | cut -d'T' -f1)"  >&3 2>&3
else
	VERSION_LONG="${VERSION} ${RELEASE}"
fi
NODEJS=$(nodejs --version) >&3 2>&3

echo "==========================================================================================" >&3 2>&3
echo "= OS:               ${OS}" >&3 2>&3
echo "= RasPi:            ${RASPPI}" >&3 2>&3
echo "= Architecture:     ${ARCH}" >&3 2>&3
echo "= Node.js:          ${NODEJS}" >&3 2>&3
echo "= User:             ${USER}" >&3 2>&3
echo "= Parameter:        $1" >&3 2>&3
echo "= Release:          ${RELEASE}" >&3 2>&3
echo "= Version:          ${VERSION_LONG}" >&3 2>&3
echo "= Update-URL:       ${MUPIBOX_URL}" >&3 2>&3
echo "= Unzip-Directory:  ${MUPI_SRC}" >&3 2>&3
echo "==========================================================================================" >&3 2>&3

rm -f /tmp/mupibox-update-failed
{
	###############################################################################################


	echo -e "XXX\n0\nPrepare Update... \nXXX"	 >&3 2>&3
	systemctl stop mupi_idle_shutdown.service >&3 2>&3
	mkdir /home/dietpi/.mupibox/chromium_cache >&3 2>&3	
	mkdir /home/dietpi/MuPiBox/media/audiobook >&3 2>&3	
	mkdir /home/dietpi/MuPiBox/media/music >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/other >&3 2>&3
	if [ "$RELEASE" = "dev" ]; then
		mkdir /home/dietpi/MuPiBox/media/NAS >&3 2>&3
	fi
	mkdir /home/dietpi/MuPiBox/media/cover >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/youtube-dl >&3 2>&3
	chown dietpi:dietpi /home/dietpi/MuPiBox/media/audiobook >&3 2>&3
	chown dietpi:dietpi /home/dietpi/MuPiBox/media/music >&3 2>&3

	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nUpdate package-list\nXXX"
	before=$(date +%s)
	apt-get update >&3 2>&3
	after=$(date +%s)

	echo -e "## apt-get update ##  finished after $((after - $before)) seconds" >&3 2>&3

	###############################################################################################

	echo -e "XXX\n${STEP}\nUpdate Node.js\nXXX"
	before=$(date +%s)
	if [[ "$NODEJS" == "v22."* ]]; then
		echo "Node.js already at v22.*" >&3 2>&3
	else
		apt-get --yes remove nodejs >&3 2>&3
		curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - >&3 2>&3
		apt-get install -y nodejs >&3 2>&3
	fi
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
	
	for package in ${packages2remove}
	do
		before=$(date +%s)
		STEP=$(($STEP + 1))
		echo -e "XXX\n${STEP}\Remove ${package}\nXXX"
		PKG_OK=$(dpkg -l ${package} 2>/dev/null | egrep '^ii' | wc -l) >&3 2>&3
		if [ ${PKG_OK} -eq 0 ]; then
		  apt-get --yes remove ${package} >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## apt-get remove ${package}  ##  finished after $((after - $before)) seconds" >&3 2>&3
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

#	echo -e "XXX\n${STEP}\nSetup docker and container... \nXXX"	
#	before=$(date +%s)
#	if [ ! -f /usr/bin/docker ]; then
#		sudo bash < <(curl -fsSL https://get.Docker.com) >&3 2>&3
#	fi
#	sudo docker rm youtube-dl >&3 2>&3
#	sudo docker run --name youtube-dl -d --restart unless-stopped -p 8081:8081 -v /home/dietpi/MuPiBox/media/youtube-dl:/downloads ghcr.io/alexta69/metube >&3 2>&3
#	sudo docker image prune -a -f  >&3 2>&3
#	sudo apt-get --yes remove docker   >&3 2>&3
#	after=$(date +%s)
#	echo -e "## Setup docker and container  ##  finished after $((after - $before)) seconds" >&3 2>&3
#	STEP=$(($STEP + 1))
	
	###############################################################################################

	echo -e "XXX\n${STEP}\nSetup DietPi-Dashboard... \nXXX"	
	before=$(date +%s)
	mkdir -p /opt/dietpi-dashboard >&3 2>&3
	# Download to a temporary file first and replace the installed program only if that worked
	# (before, a failed download - e.g. a DNS problem - left the dashboard without its program).
	DD_TMP=$(mktemp /tmp/dietpi-dashboard.XXXXXX)
	DD_URL="$(curl -sSf --retry 3 --retry-delay 2 -m 30 'https://api.github.com/repos/nonnorm/DietPi-Dashboard/releases/latest' 2>&3 | mawk -F\" "/\"browser_download_url\": \".*dietpi-dashboard-$(uname -m)\"/{print \$4}")"
	[ -z "${DD_URL}" ] && DD_URL="https://github.com/nonnorm/DietPi-Dashboard/releases/download/v0.6.2/dietpi-dashboard-$(uname -m)"
	if curl -fL --retry 3 --retry-delay 3 -m 180 -o "${DD_TMP}" "${DD_URL}" >&3 2>&3 && [ "$(head -c 4 "${DD_TMP}" | od -An -c | tr -d ' ')" = "177ELF" ]; then
		install -m 755 "${DD_TMP}" /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	else
		echo "DietPi-Dashboard download failed - keeping the installed version" >&3 2>&3
	fi
	rm -f "${DD_TMP}"
	DD_CONF_TMP=$(mktemp /tmp/dietpi-dashboard-conf.XXXXXX)
	if curl -sSfL --retry 3 --retry-delay 3 -m 60 https://raw.githubusercontent.com/nonnorm/DietPi-Dashboard/v0.6.2/config.toml -o "${DD_CONF_TMP}" >&3 2>&3 && [ -s "${DD_CONF_TMP}" ]; then
		cp -f "${DD_CONF_TMP}" /opt/dietpi-dashboard/config.toml >&3 2>&3
	fi
	rm -f "${DD_CONF_TMP}"
	#bash -c 'su dietpi -c "yes \"\" | sudo /boot/dietpi/dietpi-software install 200"' >&3 2>&3
	/usr/bin/sed -i 's/#terminal_user = "root"/terminal_user = "dietpi"/g' /opt/dietpi-dashboard/config.toml >&3 2>&3
	#sudo /usr/bin/sed -i 's/pass = true/pass = false/g' /opt/dietpi-dashboard/config.toml >&3 2>&3
	after=$(date +%s)
	echo -e "## Setup DietPi-Dashboard  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nDownload MuPiBox Version ${VERSION_LONG}... \nXXX"	
	before=$(date +%s)
	# The source archive is large and a dropped connection leaves a truncated file, which
	# used to be unpacked anyway (nothing) while the update went on emptying the install.
	# Check the archive, retry, and stop BEFORE anything gets replaced if it stays broken.
	DOWNLOAD_OK=0
	for attempt in 1 2 3 4 5
	do
		rm -f /home/dietpi/mupibox.zip
		wget -q -O /home/dietpi/mupibox.zip ${MUPIBOX_URL} >&3 2>&3
		if unzip -tq /home/dietpi/mupibox.zip >&3 2>&3; then
			DOWNLOAD_OK=1
			break
		fi
		echo "Download attempt ${attempt} failed or is incomplete, retrying..." >&3 2>&3
		sleep 5
	done
	if [ ${DOWNLOAD_OK} -ne 1 ]; then
		echo "Error: could not download a complete MuPiBox archive - the update was stopped before anything was replaced." >&3 2>&3
		cp ${PREFLIGHT_DIR}/jq /usr/bin/jq >&3 2>&3
		chmod 755 /usr/bin/jq >&3 2>&3
		rm -f /home/dietpi/mupibox.zip
		systemctl start mupi_idle_shutdown.service >&3 2>&3
		touch /tmp/mupibox-update-failed
		exit 1
	fi
	after=$(date +%s)
	echo -e "## MuPiBox Download  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nUnzip MuPiBox Version ${VERSION_LONG}... \nXXX"	
	before=$(date +%s)
	# -o: overwrite without prompting, in case a previous run left the source folder behind
	# The folder the archive unpacks to depends on where it comes from (a branch archive is
	# "MuPiBox-<branch>", a tag archive "MuPiBox-<tag>", ...). Read it from the archive instead of
	# guessing it: a wrong guess sent every following step (scripts, services, admin interface,
	# after /var/www had been emptied) to a folder that does not exist.
	UNPACKED_DIR=$(unzip -Z1 /home/dietpi/mupibox.zip 2>/dev/null | head -n 1 | cut -d/ -f1)
	unzip -q -o -d /home/dietpi /home/dietpi/mupibox.zip >&3 2>&3
	rm /home/dietpi/mupibox.zip >&3 2>&3
	if [ -n "${UNPACKED_DIR}" ]; then
		MUPI_SRC="/home/dietpi/${UNPACKED_DIR}"
	fi

	# Everything the update copies must be there before anything is replaced. If not, stop here:
	# a half update (admin interface removed, scripts missing) is worse than no update.
	SOURCE_OK=1
	for required in scripts/mupibox config/services config/templates update/conf_update.sh AdminInterface/release/www.zip bin/nodejs/deploy.zip
	do
		if [ ! -e "${MUPI_SRC}/${required}" ]; then
			echo "Error: ${MUPI_SRC}/${required} is missing in the downloaded MuPiBox archive." >&3 2>&3
			SOURCE_OK=0
		fi
	done
	if [ ${SOURCE_OK} -ne 1 ]; then
		echo "Error: the downloaded MuPiBox archive is incomplete or has an unexpected layout - the update was stopped before anything was replaced." >&3 2>&3
		cp ${PREFLIGHT_DIR}/jq /usr/bin/jq >&3 2>&3
		chmod 755 /usr/bin/jq >&3 2>&3
		[ -n "${UNPACKED_DIR}" ] && rm -rf "/home/dietpi/${UNPACKED_DIR}"
		systemctl start mupi_idle_shutdown.service >&3 2>&3
		touch /tmp/mupibox-update-failed
		exit 1
	fi
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


	echo -e "XXX\n${STEP}\nUpdate frontend, backend-api, and backend-player ... \nXXX"	
	before=$(date +%s)
	sudo -H -u dietpi bash -c "pm2 stop server" >&3 2>&3
	#su - dietpi -c "pm2 save" >&3 2>&3
	rm -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/ >&3 2>&3
	unzip ${MUPI_SRC}/bin/nodejs/deploy.zip -d /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	mv ${MUPI_SRC}/config/templates/monitor.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json >&3 2>&3
	mv ${MUPI_SRC}/config/templates/www.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	chown dietpi:dietpi -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www >&3 2>&3
	cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/spotify-control.js /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js >&3 2>&3
	ln -s /var/www/images/mupif.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/mupi.png >&3 2>&3
	after=$(date +%s)
	echo -e "## Update Kids-Controller  ##  finished after $((after - $before)) seconds" >&3 2>&3
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
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/clone-wars >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/enterprise >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/spiderman >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/supermario >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/pikachu >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/dinosaur >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/unicorn >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/axolotl >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/custom >&3 2>&3
	
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

	#CLONE-WARS
	mv ${MUPI_SRC}/themes/clone-wars/Starjedi.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/clone-wars/Starjedi.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/clone-wars/clone-wars-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/clone-wars/clone-wars-bg.jpg >&3 2>&3

	#ENTERPRISE
	mv ${MUPI_SRC}/themes/enterprise/Nasa21.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/enterprise/Nasa21.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/enterprise/enterprise-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/enterprise/enterprise-bg.jpg >&3 2>&3
	
	#SPIDERMAN
	mv ${MUPI_SRC}/themes/spiderman/IntensaFuente.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/spiderman/IntensaFuente.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/spiderman/spiderman-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/spiderman/spiderman-bg.jpg >&3 2>&3

	#PIKACHU
	mv ${MUPI_SRC}/themes/pikachu/PokemonXandY.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/pikachu/PokemonXandY.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/pikachu/pikachu-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/pikachu/pikachu-bg.jpg >&3 2>&3

	#MARIO
	mv ${MUPI_SRC}/themes/supermario/NewSuperMarioFontU.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/supermario/NewSuperMarioFontU.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/supermario/supermario-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/supermario/supermario-bg.jpg >&3 2>&3
	
	#DINOSAUR
	mv ${MUPI_SRC}/themes/dinosaur/BerlinSmallCaps.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/dinosaur/BerlinSmallCaps.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/dinosaur/dinosaur-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/dinosaur/dinosaur-bg.jpg >&3 2>&3
	
	#UNICORN
	mv ${MUPI_SRC}/themes/unicorn/MagnoliaScript.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/unicorn/MagnoliaScript.otf >&3 2>&3
	mv ${MUPI_SRC}/themes/unicorn/unicorn-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/unicorn/unicorn-bg.jpg >&3 2>&3

	#AXOLOTOL
	mv ${MUPI_SRC}/themes/axolotl/MagnoliaScript.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/axolotl/MagnoliaScript.otf >&3 2>&3
	mv ${MUPI_SRC}/themes/axolotl/axolotl-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/axolotl/axolotl-bg.jpg >&3 2>&3

	#EARTH
	mv ${MUPI_SRC}/themes/earth/earth-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth/earth-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/earth/Nasa21.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/earth/Nasa21.ttf >&3 2>&3

	#STEAMPUNK
	mv ${MUPI_SRC}/themes/steampunk/steampunk-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/steampunk/akaPosse.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/akaPosse.ttf >&3 2>&3
	mv ${MUPI_SRC}/themes/steampunk/steampunk-gear.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-gear.png >&3 2>&3
	mv ${MUPI_SRC}/themes/steampunk/steampunk-header.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/steampunk/steampunk-header.jpg >&3 2>&3

	#CUSTOM
	ln -s /home/dietpi/MuPiBox/themes/custom-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/custom/custom-bg.jpg


	chown dietpi:dietpi -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/

	mv ${MUPI_SRC}/themes/*.css /home/dietpi/MuPiBox/themes/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/chromium-autostart.sh /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	mv ${MUPI_SRC}/scripts/mupibox/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/bluetooth/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/wled/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/telegram/* /usr/local/bin/mupibox/ >&3 2>&3
	#mv ${MUPI_SRC}/config/templates/www.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
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
	rm /usr/bin/jq >&3 2>&3
	
	service spotifyd stop >&3 2>&3
	systemctl disable spotifyd >&3 2>&3
	if systemctl cat librespot.service > /dev/null 2>&1; then
		systemctl disable --now librespot.service >&3 2>&3
	fi

	# Binaries
	cp ${PREFLIGHT_DIR}/jq /usr/bin/jq >&3 2>&3
	if [ `getconf LONG_BIT` == 32 ]; then
		mv ${MUPI_SRC}/bin/fbv/fbv /usr/bin/fbv >&3 2>&3
	else
		mv ${MUPI_SRC}/bin/fbv/fbv_64 /usr/bin/fbv >&3 2>&3
	fi
	chmod 755 /usr/bin/fbv /usr/bin/jq >&3 2>&3
	#mv ${MUPI_SRC}/config/templates/librespot.conf /etc/spotifyd/spotifyd.conf >&3 2>&3
	
	mkdir /etc/librespot/ >&3 2>&3
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
	cp ${MUPI_SRC}/media/sound/low.wav /home/dietpiMuPiBox/sysmedia/sound/low.wav >&3 2>&3
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
	mv -f ${MUPI_SRC}/config/services/librespot.service /etc/systemd/system/librespot.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/templates/env-librespot /etc/librespot/env-librespot >&3 2>&3
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

	# Tolerant replacement for DietPi's WiFi monitor (see scripts/mupibox/wifi_monitor.sh): only versions that ship it
	if [ "$RELEASE" = "dev" ] && [ -f ${MUPI_SRC}/config/services/dietpi-wifi-monitor-override.conf ]; then
		mkdir -p /etc/systemd/system/dietpi-wifi-monitor.service.d >&3 2>&3
		cp -f ${MUPI_SRC}/config/services/dietpi-wifi-monitor-override.conf /etc/systemd/system/dietpi-wifi-monitor.service.d/override.conf >&3 2>&3
	fi

	systemctl daemon-reload >&3 2>&3
	if systemctl list-unit-files dietpi-wifi-monitor.service 2>/dev/null | grep -q dietpi-wifi-monitor; then
		systemctl restart dietpi-wifi-monitor.service >&3 2>&3
	fi
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

	if grep -q '^dtparam=gpio=on' /boot/config.txt; then
	  echo -e "dtparam=gpio=on already set" >&3 2>&3
	else
	  echo '' | tee -a /boot/config.txt >&3 2>&3
	  echo 'dtparam=gpio=on' | tee -a /boot/config.txt >&3 2>&3
	fi

	if grep -q '^dtoverlay=gpio-poweroff,gpiopin=4,active_low=1' /boot/config.txt; then
	  echo -e "dtparam=gpio=on already set" >&3 2>&3
	else
	  echo '' | tee -a /boot/config.txt >&3 2>&3
	  echo 'dtoverlay=gpio-poweroff,gpiopin=4,active_low=1' | tee -a /boot/config.txt >&3 2>&3
	fi

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
	before=$(date +%s)
	rm -R /var/www/* >&3 2>&3 
	mv ${MUPI_SRC}/AdminInterface/release/www.zip /var/www/www.zip >&3 2>&3
	unzip /var/www/www.zip -d /var/www/ >&3 2>&3
	rm /var/www/www.zip >&3 2>&3
	ln -s /home/dietpi/MuPiBox/media/cover /var/www/cover >&3 2>&3
	chown -R www-data:www-data /var/www/ >&3 2>&3
	chmod -R 755 /var/www/ >&3 2>&3
	chown -R dietpi:www-data /home/dietpi/MuPiBox/media/cover >&3 2>&3
	echo -e "## Admin-Interface	##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nUpdate Config-File... \nXXX"	
	before=$(date +%s)
	cd ${MUPI_SRC}/update/	>&3 2>&3
	chmod 755 conf_update.sh >&3 2>&3
	./conf_update.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## Config-File	##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))
	
	
	###############################################################################################

	echo -e "XXX\n{STEP}\nNetwork optimization... \nXXX"	
	before=$(date +%s)

	cd /usr/local/bin/mupibox/	>&3 2>&3
	./optimize_wifi.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## Network optimization ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n{STEP}\nActivate SSL... \nXXX"	
	before=$(date +%s)
	
	openssl req -new -x509 -keyout /etc/lighttpd/server.pem -out /etc/lighttpd/server.pem -days 3650 -nodes -subj "/C=DE/CN=mupibox" >/dev/null >&3 2>&3
	lighty-enable-mod ssl  >&3 2>&3
	service lighttpd force-reload  >&3 2>&3
	after=$(date +%s)
	echo -e "## Network optimization ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nRestore Userdata... \nXXX"
	before=$(date +%s)
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
	rm -f /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json >&3 2>&3
	ln -s /tmp/network.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json >&3 2>&3
	systemctl stop mupi_change_checker.service >&3 2>&3
	systemctl disable mupi_change_checker.service >&3 2>&3
	rm /etc/systemd/system/mupi_change_checker.service >&3 2>&3
	/usr/local/bin/mupibox/./m3u_generator.sh >&3 2>&3
	/usr/local/bin/mupibox/./setting_update.sh >&3 2>&3
	
	mv ${LOG} /boot/$(date +%F)_update_${VERSION}.log >&3 2>&3
	chown dietpi:dietpi ${CONFIG} >&3 2>&3
	
	sudo -H -u dietpi bash -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && npm install" >&3 2>&3
	sudo -H -u dietpi bash -c "pm2 start server" >&3 2>&3

	CPU=$(cat /proc/cpuinfo | grep Serial | cut -d ":" -f2 | sed 's/^ //') >&3 2>&3
	curl -X POST https://mupibox.de/mupi/ct.php -H "Content-Type: application/x-www-form-urlencoded" -d key1=${CPU} -d key2=Update -d key3="${VERSION_LONG}" -d key4="${ARCH}" -d key5="${OS}" >&3 2>&3

	###############################################################################################
	echo -e "XXX\n100\nInstallation complete, please reboot the system... \nXXX"	
	rm -R ${MUPI_SRC} >&3 2>&3
	rm -rf ${PREFLIGHT_DIR} >&3 2>&3
	sleep 5


} | whiptail --title "MuPiBox Update ${VERSION_LONG}" --gauge "Please wait while installing" 6 60 0

if [ -f /tmp/mupibox-update-failed ]; then
	rm -f /tmp/mupibox-update-failed
	rm -rf ${PREFLIGHT_DIR}
	echo "Update FAILED: the MuPiBox archive could not be downloaded completely (see ${LOG})."
	echo "Nothing was replaced. Please check the network connection and run the update again."
	exit 1
fi

echo "Update finished - please reboot system now!"
