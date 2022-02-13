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
X=4
LOG="/tmp/prepage.log"

FORMAT="\e[48;5;23;38;5;41m%s\e[0m"

# Make it nice
sudo apt-get install figlet lolcat -y >> ${LOG} 2>>&1
clear
figlet -f standard -c -m 1  " MuPiBox Preperation" | lolcat
tput cup $Y $X
printf "Get missing packages \n    "
#tput cup $PY $X
percentBar 0 60 bar
printf ${FORMAT} "$bar"

# Get missing packages
sudo apt-get install git libasound2 jq samba -y >> ${LOG} 2>>&1

tput cup $Y $X
printf "Install nodeJS 16 \n    "
#tput cup $PY $X
percentBar 10 60 bar
printf ${FORMAT} "$bar"


curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash - >> ${LOG} 2>>&1
sudo apt-get install -y nodejs >> ${LOG} 2>>&1
sudo npm install -g @ionic/cli >> ${LOG} 2>>&1


tput cup $Y $X
printf "Create directorys \n    "
#tput cup $PY $X
percentBar 20 60 bar
printf ${FORMAT} "$bar"


# Create Directorys
mkdir -p ~/.mupibox >> ${LOG} 2>>&1
mkdir -p ~/MuPiBox/media >> ${LOG} 2>>&1
mkdir ~/MuPiBox/tts_files >> ${LOG} 2>>&1
mkdir -p ~/MuPiBox/sysmedia/sound >> ${LOG} 2>>&1
mkdir ~/MuPiBox/sysmedia/images >> ${LOG} 2>>&1
mkdir ~/MuPiBox/media >> ${LOG} 2>>&1
sudo mkdir /usr/local/bin/mupibox >> ${LOG} 2>>&1
sudo mkdir /etc/spotifyd >> ${LOG} 2>>&1
sudo mkdir /etc/mupibox >> ${LOG} 2>>&1
sudo mkdir /var/log/mupibox/ >> ${LOG} 2>>&1v
sleep 1

# Boot
touch ~/.hushlogin

tput cup $Y $X
printf "Clone sources \n    "
#tput cup $PY $X
percentBar 30 60 bar
printf ${FORMAT} "$bar"

# Sources
cd ~/.mupibox >> /tmp/prepare.log
git clone https://github.com/derhuerst/mplayer-wrapper >> ${LOG} 2>>&1
cd mplayer-wrapper >> ${LOG} 2>>&1
npm install >> ${LOG} 2>>&1
cd ~ >> ${LOG} 2>>&1
git clone https://github.com/zlargon/google-tts >> ${LOG} 2>>&1
cd google-tts/ >> ${LOG} 2>>&1
npm install --save >> ${LOG} 2>>&1
npm audit fix >> ${LOG} 2>>&1
wget https://github.com/Thyraz/Sonos-Kids-Controller/archive/refs/tags/V1.6.zip >> ${LOG} 2>>&1
unzip V1.6.zip >> ${LOG} 2>>&1
rm V1.6.zip >> ${LOG} 2>>&1
mv Sonos-Kids-Controller-1.6/ Sonos-Kids-Controller-master >> ${LOG} 2>>&1
npm install  >> ${LOG} 2>>&1
npm audit fix  >> ${LOG} 2>>&1
ionic build --prod --verbose  >> ${LOG} 2>>&1
mkdir -p ~/.mupibox/Sonos-Kids-Controller-master/www/cover >> ${LOG} 2>>&1
sudo npm install pm2 -g  >> ${LOG} 2>>&1
sudo apt-get remove git  >> ${LOG} 2>>&1
#pm2 startup  >> ${LOG} 2>>&1
# ENVIRONMENT VAR
#cd ~/.mupibox/Sonos-Kids-Controller-master/
#pm2 start server.js
#pm2 save

tput cup $Y $X
printf "Copy binaries \n    "
percentBar 50 60 bar
printf ${FORMAT} "$bar"

# Binaries
sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/fbv/fbv -O /usr/bin/fbv  >> ${LOG} 2>>&1
sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/spotifyd/0.3.3/dietpi8_64bit/spotifyd -O /usr/bin/spotifyd  >> ${LOG} 2>>&1
sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd >> ${LOG} 2>>&1

tput cup $Y $X
printf "Copy Services \n    "
percentBar 55 60 bar
printf ${FORMAT} "$bar"

# Services
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_change_checker.service -O /etc/systemd/system/mupi_change_checker.service >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_idle_shutdown.service -O /etc/systemd/system/mupi_idle_shutdown.service >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_splash.service -O /etc/systemd/system/mupi_splash.service >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/spotifyd.service -O /etc/systemd/system/spotifyd.service >> ${LOG} 2>>&1

tput cup $Y $X
printf "Copy dietpi-configs \n    "
percentBar 60 60 bar
printf ${FORMAT} "$bar"

# DietPi-Configs
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf >> ${LOG} 2>>&1

tput cup $Y $X
printf "Copy spotify-configs \n    "
percentBar 65 60 bar
printf ${FORMAT} "$bar"

# Spotify-Configs
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >> ${LOG} 2>>&1
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O /home/dietpi/.mupibox/spotifycontroller-main/config/config.json >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifyd.conf -O /etc/spotifyd/spotifyd.conf >> ${LOG} 2>>&1

tput cup $Y $X
printf "Copy media-files \n    "
percentBar 70 60 bar
printf ${FORMAT} "$bar"

# Splash and Media
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/splash.txt -O /boot/splash.txt >> ${LOG} 2>>&1
sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img >> ${LOG} 2>>&1
wget https://github.com/splitti/MuPiBox/raw/main/media/images/goodbye.png -O /home/dietpi/MuPiBox/sysmedia/images/goodbye.png >> ${LOG} 2>>&1
sudo wget https://github.com/splitti/MuPiBox/raw/main/media/images/splash.png -O /boot/splash.png >> ${LOG} 2>>&1
wget https://github.com/splitti/MuPiBox/raw/main/media/sound/shutdown.wav -O /home/dietpi/MuPiBox/sysmedia/sound/shutdown.wav >> ${LOG} 2>>&1
wget https://github.com/splitti/MuPiBox/raw/main/media/sound/startup.wav -O /home/dietpi/MuPiBox/sysmedia/sound/startup.wav >> ${LOG} 2>>&1

tput cup $Y $X
printf "Copy mupibox-files \n    "
percentBar 75 60 bar
printf ${FORMAT} "$bar"

# MuPiBox
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh >> ${LOG} 2>>&1
sudo chmod 755 /usr/local/bin/mupibox/change_checker.sh /usr/local/bin/mupibox/idle_shutdown.sh /usr/local/bin/mupibox/m3u_generator.sh /usr/local/bin/mupibox/setting_update.sh /usr/local/bin/mupibox/software_shutdown.sh /usr/local/bin/mupibox/splash_screen.sh >> ${LOG} 2>>&1

tput cup $Y $X
printf "Copy onoffshim-scripts \n    "
percentBar 80 60 bar
printf ${FORMAT} "$bar"

# OnOffShim
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh >> ${LOG} 2>>&1
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh >> ${LOG} 2>>&1
sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh >> ${LOG} 2>>&1

tput cup $Y $X
printf "Enable services \n    "
percentBar 80 60 bar
printf ${FORMAT} "$bar"

# Enable Services
sudo systemctl daemon-reload >> ${LOG} 2>>&1
#sudo systemctl enable mupi_change_checker.service >> ${LOG} 2>>&1
#sudo systemctl start mupi_change_checker.service >> ${LOG} 2>>&1
#sudo systemctl enable mupi_idle_shutdown.service >> ${LOG} 2>>&1
#sudo systemctl start mupi_idle_shutdown.service >> ${LOG} 2>>&1
#sudo systemctl enable mupi_splash.service >> ${LOG} 2>>&1
#sudo systemctl start mupi_splash.service >> ${LOG} 2>>&1
#sudo systemctl enable spotifyd.service >> ${LOG} 2>>&1
#sudo systemctl start spotifyd.service >> ${LOG} 2>>&1
sudo systemctl enable smbd.service >> ${LOG} 2>>&1
sudo systemctl start smbd.service >> ${LOG} 2>>&1

tput cup $Y $X
printf "SYSTEM IS PREPARED \n    "
percentBar 95 60 bar
printf ${FORMAT} "$bar"
# ENV
sudo env PATH=$PATH:/usr/local/bin/mupibox >> ${LOG} 2>>&1
sleep 1

tput cup $Y $X
printf "Set environment-variable \n    "
percentBar 100 60 bar
printf ${FORMAT} "$bar"
echo " "
echo "    Logfile: ${LOG}"

