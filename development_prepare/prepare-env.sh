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

FORMAT="\e[48;5;23;38;5;41m%s\e[0m"

# Make it nice
sudo apt-get install figlet lolcat -y >> /tmp/prepage.log
clear
figlet -f standard -c -m 1  " MuPiBox Preperation" | lolcat
tput cup $Y $X
printf "Get missing packages \n    "
#tput cup $PY $X
percentBar 0 60 bar
printf ${FORMAT} "$bar"

# Get missing packages
sudo apt-get install libasound2 jq samba -y >> /tmp/prepage.log

tput cup $Y $X
printf "Install nodeJS 16 \n    "
#tput cup $PY $X
percentBar 10 60 bar
printf ${FORMAT} "$bar"


curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash - >> /tmp/prepage.log
sudo apt-get install -y nodejs >> /tmp/prepage.log
sudo npm install -g @ionic/cli >> /tmp/prepage.log


tput cup $Y $X
printf "Create directorys \n    "
#tput cup $PY $X
percentBar 20 60 bar
printf ${FORMAT} "$bar"


# Create Directorys
mkdir -p ~/.mupibox >> /tmp/prepage.log
mkdir -p ~/MuPiBox/media >> /tmp/prepage.log
mkdir ~/MuPiBox/tts_files >> /tmp/prepage.log
mkdir -p ~/MuPiBox/sysmedia/sound >> /tmp/prepage.log
mkdir ~/MuPiBox/sysmedia/images >> /tmp/prepage.log
mkdir ~/MuPiBox/media >> /tmp/prepage.log
sudo mkdir /usr/local/bin/mupibox >> /tmp/prepage.log
sudo mkdir /etc/spotifyd >> /tmp/prepage.log
sudo mkdir /etc/mupibox >> /tmp/prepage.log
sudo mkdir /var/log/mupibox/ >> /tmp/prepage.logv
sleep 1

# Boot
touch ~/.hushlogin

tput cup $Y $X
printf "Clone sources \n    "
#tput cup $PY $X
percentBar 30 60 bar
printf ${FORMAT} "$bar"

# Sources
cd ~/.mupibox >> /tmp/prepage.log
git clone https://github.com/derhuerst/mplayer-wrapper >> /tmp/prepage.log
git clone https://github.com/zlargon/google-tts >> /tmp/prepage.log
wget https://github.com/Thyraz/Sonos-Kids-Controller/archive/refs/tags/V1.6.zip >> /tmp/prepage.log
unzip V1.6.zip >> /tmp/prepage.log
rm V1.6.zip >> /tmp/prepage.log
mv Sonos-Kids-Controller-1.6/ Sonos-Kids-Controller-master >> /tmp/prepage.log
#npm install
#npm audit fix
#ionic build --prod --verbose
mkdir -p ~/.mupibox/Sonos-Kids-Controller-master/www/cover >> /tmp/prepage.log
#sudo npm install pm2 -g 
#pm2 startup
# ENVIRONMENT VAR
#cd ~/.mupibox/Sonos-Kids-Controller-master/
#pm2 start server.js
#pm2 save

tput cup $Y $X
printf "Copy binaries \n    "
percentBar 50 60 bar
printf ${FORMAT} "$bar"

# Binaries
sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/fbv/fbv -O /usr/bin/fbv  >> /tmp/prepage.log
sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/spotifyd/0.3.3/dietpi8_64bit/spotifyd -O /usr/bin/spotifyd  >> /tmp/prepage.log
sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd

tput cup $Y $X
printf "Copy Services \n    "
percentBar 55 60 bar
printf ${FORMAT} "$bar"

# Services
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_change_checker.service -O /etc/systemd/system/mupi_change_checker.service >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_idle_shutdown.service -O /etc/systemd/system/mupi_idle_shutdown.service >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_splash.service -O /etc/systemd/system/mupi_splash.service >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/spotifyd.service -O /etc/systemd/system/spotifyd.service >> /tmp/prepage.log

tput cup $Y $X
printf "Copy dietpi-configs \n    "
percentBar 60 60 bar
printf ${FORMAT} "$bar"

# DietPi-Configs
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf >> /tmp/prepage.log

tput cup $Y $X
printf "Copy spotify-configs \n    "
percentBar 65 60 bar
printf ${FORMAT} "$bar"

# Spotify-Configs
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >> /tmp/prepage.log
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O /home/dietpi/.mupibox/spotifycontroller-main/config/config.json >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifyd.conf -O /etc/spotifyd/spotifyd.conf >> /tmp/prepage.log

tput cup $Y $X
printf "Copy media-files \n    "
percentBar 70 60 bar
printf ${FORMAT} "$bar"

# Splash and Media
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/splash.txt -O /boot/splash.txt >> /tmp/prepage.log
sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img >> /tmp/prepage.log
wget https://github.com/splitti/MuPiBox/raw/main/media/images/goodbye.png -O /home/dietpi/MuPiBox/sysmedia/images/goodbye.png >> /tmp/prepage.log
sudo wget https://github.com/splitti/MuPiBox/raw/main/media/images/splash.png -O /boot/splash.png >> /tmp/prepage.log
wget https://github.com/splitti/MuPiBox/raw/main/media/sound/shutdown.wav -O /home/dietpi/MuPiBox/sysmedia/sound/shutdown.wav >> /tmp/prepage.log
wget https://github.com/splitti/MuPiBox/raw/main/media/sound/startup.wav -O /home/dietpi/MuPiBox/sysmedia/sound/startup.wav >> /tmp/prepage.log

tput cup $Y $X
printf "Copy mupibox-files \n    "
percentBar 75 60 bar
printf ${FORMAT} "$bar"

# MuPiBox
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh >> /tmp/prepage.log
sudo chmod 755 /usr/local/bin/mupibox/change_checker.sh /usr/local/bin/mupibox/idle_shutdown.sh /usr/local/bin/mupibox/m3u_generator.sh /usr/local/bin/mupibox/setting_update.sh /usr/local/bin/mupibox/software_shutdown.sh /usr/local/bin/mupibox/splash_screen.sh >> /tmp/prepage.log

tput cup $Y $X
printf "Copy onoffshim-scripts \n    "
percentBar 80 60 bar
printf ${FORMAT} "$bar"

# OnOffShim
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh >> /tmp/prepage.log
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh >> /tmp/prepage.log
sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh >> /tmp/prepage.log

tput cup $Y $X
printf "Enable services \n    "
percentBar 80 60 bar
printf ${FORMAT} "$bar"

# Enable Services
sudo systemctl daemon-reload >> /tmp/prepage.log
sudo systemctl enable mupi_change_checker.service >> /tmp/prepage.log
sudo systemctl start mupi_change_checker.service >> /tmp/prepage.log
sudo systemctl enable mupi_idle_shutdown.service >> /tmp/prepage.log
sudo systemctl start mupi_idle_shutdown.service >> /tmp/prepage.log
sudo systemctl enable mupi_splash.service >> /tmp/prepage.log
sudo systemctl start mupi_splash.service >> /tmp/prepage.log
sudo systemctl enable spotifyd.service >> /tmp/prepage.log
sudo systemctl start spotifyd.service >> /tmp/prepage.log
sudo systemctl enable smbd.service >> /tmp/prepage.log
sudo systemctl start smbd.service >> /tmp/prepage.log

tput cup $Y $X
printf "SYSTEM IS PREPARED \n    "
percentBar 95 60 bar
printf ${FORMAT} "$bar"
# ENV
sudo env PATH=$PATH:/usr/local/bin/mupibox >> /tmp/prepage.log
sleep 1

tput cup $Y $X
printf "Set environment-variable \n    "
percentBar 100 60 bar
printf ${FORMAT} "$bar"
echo " "