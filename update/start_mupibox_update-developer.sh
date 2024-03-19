#!/bin/bash
#

#https://raw.githubusercontent.com/friebi/MuPiBox/develop

RELEASE="dev"
CONFIG="/etc/mupibox/mupiboxconfig.json"
LOG="/tmp/mupibox_update.log"
exec 3>${LOG}
service mupi_idle_shutdown stop
packages2install="git libasound2 jq samba mplayer pulseaudio-module-bluetooth pip id3tool bluez zip rrdtool scrot net-tools wireless-tools autoconf automake bc build-essential"
STEP=0
VER_JSON="/tmp/version.json"
OS=$(grep -E '^(VERSION_CODENAME)=' /etc/os-release)  >&3 2>&3
OS=${OS:17}  >&3 2>&3

{
	###############################################################################################

	echo -e "XXX\n0\nPrepare Update... \nXXX"	 >&3 2>&3
	systemctl stop mupi_idle_shutdown.service >&3 2>&3
	mkdir /home/dietpi/.mupibox/chromium_cache >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/audiobook >&3 2>&3
	mkdir /home/dietpi/MuPiBox/media/music >&3 2>&3
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
	else
		echo -e "XXX\n${STEP}\nInstall package python3-mutagen\nXXX"
		packages2install="python3-mutagen mutagen python3-dev"
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
	fi

	###############################################################################################

	echo -e "XXX\n${STEP}\nPrepare MuPiBox Download ... \nXXX"
	before=$(date +%s)
	wget -q -O ${VER_JSON} https://raw.githubusercontent.com/friebi/MuPiBox/develop/version.json  >&3 2>&3

	VERSION=$(/usr/bin/jq -r .release.${RELEASE}[-1].version ${VER_JSON})  >&3 2>&3
	MUPIBOX_URL=$(/usr/bin/jq -r .release.${RELEASE}[-1].url ${VER_JSON})  >&3 2>&3
	after=$(date +%s)
	echo -e "## Prepare MuPiBox Download  ##  finished after $((after - $before)) seconds" >&3 2>&3

	###############################################################################################

	echo -e "XXX\n${STEP}\nDownload MuPiBox Version ${VERSION}... \nXXX"
	before=$(date +%s)
	wget -q -O /home/dietpi/mupibox.zip ${MUPIBOX_URL} >&3 2>&3
	after=$(date +%s)
	echo -e "## MuPiBox Download  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nUnzip MuPiBox Version ${VERSION}... \nXXX"
	before=$(date +%s)
	unzip -q -d /home/dietpi /home/dietpi/mupibox.zip >&3 2>&3
	rm /home/dietpi/mupibox.zip >&3 2>&3
	MUPI_SRC="/home/dietpi/MuPiBox-main"
	after=$(date +%s)
	echo -e "## Unzip Mupibox Download  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nBackup Userdata... \nXXX" >&3 2>&3
	before=$(date +%s)
	mv /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json /tmp/data.json >&3 2>&3
	mv -r /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover /tmp/cover >&3 2>&3
	mv /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json /tmp/config.json >&3 2>&3
	mv /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css /tmp/active_theme.css >&3 2>&3
	after=$(date +%s)
	echo -e "## Backup Data  ##  finished after $((after - $before)) seconds" >&3 2>&3

	STEP=$(($STEP + 1))

	###############################################################################################


	echo -e "XXX\n${STEP}\nUpdate Kids-Controller... \nXXX"
	before=$(date +%s)
	su - dietpi -c "pm2 stop server" >&3 2>&3
	#su - dietpi -c "pm2 save" >&3 2>&3
	rm -R /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/ >&3 2>&3
	mv ${MUPI_SRC}/bin/nodejs/deploy.zip /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip >&3 2>&3
	unzip /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip -d /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ >&3 2>&3
	rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/deploy.zip >&3 2>&3
	mv ${MUPI_SRC}/config/templates/www.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	mv ${MUPI_SRC}/config/templates/monitor.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json >&3 2>&3
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

	#FANTASY-BUTTERFLIES
	mv ${MUPI_SRC}/themes/fantasybutterflies/odstemplikBold.otf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/odstemplikBold.otf >&3 2>&3
	mv ${MUPI_SRC}/themes/fantasybutterflies/fantasy-butterflies-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/fantasy-butterflies-bg.jpg >&3 2>&3
	mv ${MUPI_SRC}/themes/fantasybutterflies/fantasy-circle-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/fantasybutterflies/fantasy-circle-bg.png >&3 2>&3

	#LINES
	mv ${MUPI_SRC}/themes/lines/lines-bg.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/lines/lines-bg.png >&3 2>&3
	mv ${MUPI_SRC}/themes/lines/KOMIKND_.ttf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/lines/KOMIKND_.ttf >&3 2>&3

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
	mv ${MUPI_SRC}/scripts/mupibox/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/bluetooth/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/wled/* /usr/local/bin/mupibox/ >&3 2>&3

	chmod 755 /usr/local/bin/mupibox/* >&3 2>&3

	after=$(date +%s)
	echo -e "## Copy MuPiBox-Files  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))



	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy binaries... \nXXX"
	before=$(date +%s)

	# Binaries
	if [ `getconf LONG_BIT` == 32 ]; then
		mv ${MUPI_SRC}/bin/spotifyd/0.3.3/spotifyd /usr/bin/spotifyd >&3 2>&3
		mv ${MUPI_SRC}/bin/fbv/fbv /usr/bin/fbv >&3 2>&3
	else
		mv ${MUPI_SRC}/bin/spotifyd/0.3.3/spotifyd_64bit /usr/bin/spotifyd >&3 2>&3
		mv ${MUPI_SRC}/bin/fbv/fbv_64 /usr/bin/fbv >&3 2>&3

	fi
	chmod 755 /usr/bin/fbv /usr/bin/spotifyd >&3 2>&3
	sleep 1
	after=$(date +%s)
	echo -e "## Copy binaries  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy some media files... \nXXX"
	# Splash and Media
	before=$(date +%s)
	#mv ${MUPI_SRC}/config/templates/splash.txt /boot/splash.txt >&3 2>&3
	wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img >&3 2>&3
	#cp ${MUPI_SRC}/media/images/goodbye.png /home/dietpiMuPiBox/sysmedia/images/goodbye.png >&3 2>&3
	#mv ${MUPI_SRC}/media/images/splash.png /boot/splash.png >&3 2>&3
	#cp ${MUPI_SRC}/media/images/MuPiLogo.jpg /home/dietpiMuPiBox/sysmedia/images/MuPiLogo.jpg >&3 2>&3
	#cp ${MUPI_SRC}/media/sound/shutdown.wav /home/dietpiMuPiBox/sysmedia/sound/shutdown.wav >&3 2>&3
	#cp ${MUPI_SRC}/media/sound/startup.wav /home/dietpiMuPiBox/sysmedia/sound/startup.wav >&3 2>&3
	after=$(date +%s)
	echo -e "## Copy media files  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################


	echo -e "XXX\n${STEP}\nRestarting Services... \nXXX"
	before=$(date +%s)
	mv ${MUPI_SRC}/config/services/mupi_check_internet.service /etc/systemd/system/mupi_check_internet.service  >&3 2>&3
	mv ${MUPI_SRC}/config/services/mupi_check_monitor.service /etc/systemd/system/mupi_check_monitor.service  >&3 2>&3
	mv ${MUPI_SRC}/config/services/mupi_powerled.service /etc/systemd/system/mupi_powerled.service  >&3 2>&3
	su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && npm install" >&3 2>&3
	#su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && pm2 -f start server.js" >&3 2>&3
	#su - dietpi -c "cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master && pm2 -f save" >&3 2>&3
	su - dietpi -c "pm2 start server"
	systemctl daemon-reload >&3 2>&3
	systemctl enable mupi_check_internet.service >&3 2>&3
	systemctl start mupi_check_internet.service >&3 2>&3
	systemctl enable mupi_check_monitor.service >&3 2>&3
	systemctl start mupi_check_monitor.service >&3 2>&3
	systemctl enable mupi_powerled.service >&3 2>&3
	systemctl start mupi_powerled.service >&3 2>&3
	after=$(date +%s)
	echo -e "## Restarting services  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################


	echo -e "XXX\n${STEP}\nInstall Pi-Blaster... \nXXX"
	before=$(date +%s)
	rm -R /home/dietpi/pi-blaster >&3 2>&3
	su dietpi -c 'cd /home/dietpi/; git clone https://github.com/sarfata/pi-blaster.git' >&3 2>&3
	su - -c 'cd /home/dietpi/pi-blaster; ./autogen.sh; ./configure; make; make install' >&3 2>&3
	LEDPIN=`cat ${CONFIG} | jq -r '.shim.ledPin'`
	DAEMON_ARGS='DAEMON_ARGS="--gpio '${LEDPIN}'"'
	/usr/bin/sed -i 's|DAEMON_ARGS=".*"|'"${DAEMON_ARGS}"'|g' /etc/init.d/pi-blaster.boot.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## Pi-Blaster  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################


	echo -e "XXX\n${STEP}\nSet environment...  \nXXX"
	before=$(date +%s)
	/usr/bin/chmod 755 ${MUPI_SRC}/config/templates/crontab.template >&3 2>&3
	/usr/bin/chown dietpi:dietpi ${MUPI_SRC}/config/templates/crontab.template >&3 2>&3
	/bin/su dietpi -c "/usr/bin/crontab ${MUPI_SRC}/config/templates/crontab.template"  >&3 2>&3
	#if grep -q '^initramfs initramfs.img' /boot/config.txt; then
	#  echo -e "initramfs initramfs.img already set"
	#else
	#  echo '' | tee -a /boot/config.txt >&3 2>&3
	#  echo 'initramfs initramfs.img' | tee -a /boot/config.txt >&3 2>&3
	#fi

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
	mv /tmp/config.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json  >&3 2>&3
	mv /tmp/active_theme.css /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css >&3 2>&3
	chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json >&3 2>&3
	chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >&3 2>&3
	sleep 1 >&3 2>&3
	after=$(date +%s)
	echo -e "## Restore Userdata  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################
#	if [ -d "/home/dietpi/.driver/network/src/88x2bu-20210702" ]; then
#		echo -e "Network driver RTL88X2BU already installed"  >&3 2>&3
#	else
#		echo -e "XXX\n${STEP}\nDownload network-driver [RTL88X2BU]... \nXXX"
#		before=$(date +%s)
#		mkdir -p /home/dietpi/.driver/network/src >&3 2>&3
#		cd /home/dietpi/.driver/network/src >&3 2>&3
#		git clone https://github.com/morrownr/88x2bu-20210702.git >&3 2>&3
#		after=$(date +%s)
#		echo -e "## Download Network Driver  ##  finished after $((after - $before)) seconds" >&3 2>&3
#		STEP=$(($STEP + 1))
#		echo -e "XXX\n${STEP}\nInstall network-driver [RTL88X2BU]... \nXXX"
#		before=$(date +%s)
#		cd /home/dietpi/.driver/network/src/88x2bu-20210702 >&3 2>&3
#		chmod u+x install-driver.sh >&3 2>&3
#		./install-driver.sh NoPrompt >&3 2>&3
#		after=$(date +%s)
#		echo -e "## Install Network Driver  ##  finished after $((after - $before)) seconds" >&3 2>&3
#		STEP=$(($STEP + 1))
#	fi

	###############################################################################################

	echo -e "XXX\n${STEP}\nFinalizing setup... \nXXX"
	#cp ${CONFIG} ${CONFIG}_backup  >&3 2>&3
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "${VERSION}" '.mupibox.version = $v' ${CONFIG}) >  ${CONFIG}
	chmod 775 ${CONFIG}
	systemctl start mupi_idle_shutdown.service >&3 2>&3
	rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json >&3 2>&3
	ln -s /tmp/network.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json >&3 2>&3
	systemctl stop mupi_change_checker.service >&3 2>&3
	systemctl disable mupi_change_checker.service >&3 2>&3
	rm /etc/systemd/system/mupi_change_checker.service >&3 2>&3
	/usr/local/bin/mupibox/./m3u_generator.sh >&3 2>&3
	DATE=$(date '+%Y-%m-%d')
	mv ${LOG} /boot/${DATE}_update_${VERSION}.log >&3 2>&3
	chown dietpi:dietpi ${CONFIG} >&3 2>&3

	CPU=$(cat /proc/cpuinfo | grep Serial | cut -d ":" -f2 | sed 's/^ //') >&3 2>&3

	curl -X POST https://mupibox.de/mupi/ct.php -H "Content-Type: application/x-www-form-urlencoded" -d key1=${CPU} -d key2=Update -d key3="${VERSION} ${RELEASE}" >&3 2>&3

	###############################################################################################
	echo -e "XXX\n100\nInstallation complete, please reboot the system... \nXXX"
	rm -R ${MUPI_SRC} >&3 2>&3
	sleep 5


} | whiptail --title "MuPiBox Update" --gauge "Please wait while installing" 6 60 0

echo "Update finished - please reboot system now!"
