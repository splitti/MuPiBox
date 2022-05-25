#!/bin/bash
#

#https://raw.githubusercontent.com/splitti/MuPiBox/main
SRC="https://mupibox.de/version/latest"
CONFIG="/etc/mupibox/mupiboxconfig.json"
LOG="/tmp/mupibox-conf_update.log"
exec 3>${LOG}


{
	echo -e "XXX\n0\nRemove old values... \nXXX"	 >&3 2>&3

	/usr/bin/cat <<< $(/usr/bin/jq 'del(.mupibox.googlettslanguages)' ${CONFIG}) > ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "${VERSION}" '.mupibox.version = $v' ${CONFIG}) >  ${CONFIG}
	
	echo -e "XXX\n5\nAdd languages for google tts... \nXXX"	 >&3 2>&3
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "ar" --arg w "Arabic" '.mupibox.googlettslanguages.iso639-1 = $v'  ${SPOTIFYCONTROLLER_CONFIG}) >  ${SPOTIFYCONTROLLER_CONFIG}
	
	
	
	mv ${LOG} /home/dietpi/.mupibox/last_update.log >&3 2>&3
	chown -R dietpi:dietpi /home/dietpi/.mupibox/last_update.log >&3 2>&3

} | whiptail --title "MuPiBox-Conf Update" --gauge "Please wait while installing" 6 60 0