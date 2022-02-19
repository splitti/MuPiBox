#!/bin/bash
#
# Script for MuPiBox preperation
# Start with: cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/development_prepare/prepare-env.sh | bash

percentBar ()  { 
    local prct totlen=$((8*$2)) lastchar barstring blankstring;
    printf -v prct %.2f "$1"
    ((prct=10#${prct/.}*totlen/10000, prct%8)) &&
        printf -v lastchar '\\U258%X' $(( 16 - prct%8 )) ||
            lastchar=''
    printf -v barstring '%*s' $((prct/8)) ''
    printf -v barstring '%b' "${barstring// /\\U2588}$lastchar"
    printf -v blankstring '%*s' $(((totlen-prct)/8)) ''
    printf -v "$3" '%s%s' "$barstring" "$blankstring"
}

Y=15
X=10
ORIENTATION="\n          "
LOG="/tmp/prepare.log"

FORMAT="\e[48;5;23;38;5;41m%s\e[0m"

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Copy Services" &>> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Copy Services                                        "
printf "$ORIENTATION"
percentBar 0 59 bar
printf ${FORMAT} "$bar"

# Services
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_change_checker.service -O /etc/systemd/system/mupi_change_checker.service &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_idle_shutdown.service -O /etc/systemd/system/mupi_idle_shutdown.service &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_splash.service -O /etc/systemd/system/mupi_splash.service &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/spotifyd.service -O /etc/systemd/system/spotifyd.service &>> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Copy dietpi-config" &>> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Copy dietpi-configs                                        "
printf "$ORIENTATION"
percentBar 20 59 bar
printf ${FORMAT} "$bar"

# DietPi-Configs
#sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf &>> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Copy OnOffShim-scripts" &>> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Copy onoffshim-scripts                                        "
printf "$ORIENTATION"
percentBar 25 59 bar
printf ${FORMAT} "$bar"

# OnOffShim & hifiberry
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh &>> ${LOG} 2>>${LOG}
sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh &>> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Enable services" &>> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Enable services                                        "
printf "$ORIENTATION"
percentBar 50 59 bar
printf ${FORMAT} "$bar"

# Enable Services
sudo systemctl daemon-reload &>> ${LOG} 2>>${LOG}
sudo systemctl enable mupi_change_checker.service &>> ${LOG} 2>>${LOG}
sudo systemctl start mupi_change_checker.service &>> ${LOG} 2>>${LOG}
sudo systemctl enable mupi_idle_shutdown.service &>> ${LOG} 2>>${LOG}
sudo systemctl start mupi_idle_shutdown.service &>> ${LOG} 2>>${LOG}
sudo systemctl enable mupi_splash.service &>> ${LOG} 2>>${LOG}
sudo systemctl start mupi_splash.service &>> ${LOG} 2>>${LOG}
sudo systemctl enable spotifyd.service &>> ${LOG} 2>>${LOG}
sudo systemctl start spotifyd.service &>> ${LOG} 2>>${LOG}
sudo systemctl enable smbd.service &>> ${LOG} 2>>${LOG}
sudo systemctl start smbd.service &>> ${LOG} 2>>${LOG}
sudo systemctl disable nmbd.service &>> ${LOG} 2>>${LOG}

###############################################################################################

tput cup $Y $X
printf "SYSTEM IS PREPARED                                        "
printf "$ORIENTATION"
percentBar 100 59 bar
printf ${FORMAT} "$bar"
printf "\n${ORIENTATION}Logfile: ${LOG}\n${ORIENTATION}Please reboot and have a nice day!\n\n"