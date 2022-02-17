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
X=2
LOG="/tmp/prepage.log"

FORMAT="\e[48;5;23;38;5;41m%s\e[0m"
 
# Make it nice
sudo apt-get install figlet lolcat -y >> ${LOG} 2>>${LOG}

###############################################################################################
echo "###################################################" >> ${LOG} 2>>${LOG}
echo "MuPiBox Preperation" >> ${LOG} 2>>${LOG}

clear
figlet -f standard -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X
printf "Get missing packages \n  "
#tput cup $PY $X
percentBar 0 59 bar
printf ${FORMAT} "$bar"

# Get missing packages
sudo apt-get update >> ${LOG} 2>>${LOG}
sudo apt-get install git libasound2 jq samba mplayer -y >> ${LOG} 2>>${LOG}

###############################################################################################
echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Set user permissons" >> ${LOG} 2>>${LOG}
tput cup $Y $X
printf "Set user permissons                                                      \n          "

percentBar 8 59 bar
printf ${FORMAT} "$bar"

 2>>${LOG}

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Install nodeJS" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Install nodeJS 16                             \n          "

percentBar 10 59 bar
printf ${FORMAT} "$bar"

curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash - >> ${LOG} 2>>${LOG}
sudo apt-get install -y nodejs >> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Install ionic" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Install ionic                           \n          "

percentBar 10 59 bar
printf ${FORMAT} "$bar"

sudo npm install -g @ionic/cli >> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Install pm2" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Install pm2                             \n          "
percentBar 10 59 bar
printf ${FORMAT} "$bar"

cd ~
sudo npm install pm2 -g  >> ${LOG} 2>>${LOG}
#pm2 startup >> ${LOG} 2>>${LOG}
PM2_ENV=$(sudo cat /tmp/prepage.log | sudo grep "sudo env")  >> ${LOG} 2>>${LOG}
${PM2_ENV}  >> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Clean and create Directorys" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Clean and create Directorys                                        \n          "

percentBar 40 59 bar
printf ${FORMAT} "$bar"


# Clean and create Directorys
sudo rm -R ~/.mupibox >> ${LOG} 2>>${LOG}
sudo rm -R ~/MuPiBox/  >> ${LOG} 2>>${LOG}

mkdir -p ~/.mupibox >> ${LOG} 2>>${LOG}
mkdir -p ~/MuPiBox/media >> ${LOG} 2>>${LOG}
mkdir ~/MuPiBox/tts_files >> ${LOG} 2>>${LOG}
mkdir -p ~/MuPiBox/sysmedia/sound >> ${LOG} 2>>${LOG}
mkdir ~/MuPiBox/sysmedia/images >> ${LOG} 2>>${LOG}
mkdir ~/MuPiBox/media >> ${LOG} 2>>${LOG} ${LOG} 2>>${LOG}
mkdir ~/.mupibox/Sonos-Kids-Controller-master
sudo mkdir /usr/local/bin/mupibox >> ${LOG} 2>>${LOG}
sudo mkdir /etc/spotifyd >> ${LOG} 2>>${LOG}
sudo mkdir /etc/mupibox >> ${LOG} 2>>${LOG}
sudo mkdir /var/log/mupibox/ >> ${LOG} 2>>${LOG}v
sleep 1

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Create hushlogin" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Create hushlogin                                        \n          "

percentBar 43 59 bar
printf ${FORMAT} "$bar"
# Boot
touch ~/.hushlogin
sleep 1

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Install mplayer-wrapper" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Install mplayer-wrapper                                        \n          "

percentBar 45 59 bar
printf ${FORMAT} "$bar"

# Sources
cd ~/.mupibox >> /tmp/prepare.log
git clone https://github.com/derhuerst/mplayer-wrapper >> ${LOG} 2>>${LOG}
cd mplayer-wrapper >> ${LOG} 2>>${LOG}
npm install >> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Install google-tts" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Install google-tts                                        \n          "

percentBar 50 59 bar
printf ${FORMAT} "$bar"

cd ~/.mupibox >> ${LOG} 2>>${LOG}
git clone https://github.com/zlargon/google-tts >> ${LOG} 2>>${LOG}
cd google-tts/ >> ${LOG} 2>>${LOG}
npm install --save >> ${LOG} 2>>${LOG}
npm audit fix >> ${LOG} 2>>${LOG}
npm test >> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Install Sonos-Kids-Controller-master" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Install Sonos-Kids-Controller-master                                        \n          "

percentBar 55 59 bar
printf ${FORMAT} "$bar"

cd ~/.mupibox/Sonos-Kids-Controller-master >> ${LOG} 2>>${LOG}
wget https://github.com/Thyraz/Sonos-Kids-Controller/releases/download/V1.6/sonos-kids-controller.zip  >> ${LOG} 2>>${LOG}
unzip sonos-kids-controller.zip  >> ${LOG} 2>>${LOG}
rm sonos-kids-controller.zip  >> ${LOG} 2>>${LOG}
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >> ${LOG} 2>>${LOG}
npm install  >> ${LOG} 2>>${LOG}
npm start & >> ${LOG} 2>>${LOG}
sleep 5  >> ${LOG} 2>>${LOG}
npm stop  >> ${LOG} 2>>${LOG}
sleep 1  >> ${LOG} 2>>${LOG}
pm2 start server.js  >> ${LOG} 2>>${LOG}
pm2 save  >> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Install Spotify Controller" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Install Spotify Controller                                        \n          "

percentBar 60 59 bar
printf ${FORMAT} "$bar"

cd ~/.mupibox  >> ${LOG} 2>>${LOG}
wget https://github.com/amueller-tech/spotifycontroller/archive/main.zip  >> ${LOG} 2>>${LOG}
unzip main.zip  >> ${LOG} 2>>${LOG}
rm main.zip  >> ${LOG} 2>>${LOG}
cd spotifycontroller-main  >> ${LOG} 2>>${LOG}
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json >> ${LOG} 2>>${LOG}
npm install  >> ${LOG} 2>>${LOG}
npm start & >> ${LOG} 2>>${LOG}
sleep 5  >> ${LOG} 2>>${LOG}
npm stop  >> ${LOG} 2>>${LOG}
sleep 1  >> ${LOG} 2>>${LOG}
pm2 start spotify-control.js  >> ${LOG} 2>>${LOG}
pm2 save  >> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Copy binaries" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Copy binaries                                        \n          "
percentBar 65 59 bar
printf ${FORMAT} "$bar"

# Binaries
sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/fbv/fbv -O /usr/bin/fbv  >> ${LOG} 2>>${LOG}
sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/spotifyd/0.3.3/dietpi8_64bit/spotifyd -O /usr/bin/spotifyd  >> ${LOG} 2>>${LOG}
sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd >> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Copy Services" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Copy Services                                        \n          "
percentBar 70 59 bar
printf ${FORMAT} "$bar"

# Services
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_change_checker.service -O /etc/systemd/system/mupi_change_checker.service >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_idle_shutdown.service -O /etc/systemd/system/mupi_idle_shutdown.service >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_splash.service -O /etc/systemd/system/mupi_splash.service >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/spotifyd.service -O /etc/systemd/system/spotifyd.service >> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Copy dietpi-config" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Copy dietpi-configs                                        \n          "
percentBar 73 59 bar
printf ${FORMAT} "$bar"

# DietPi-Configs
#sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf >> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Copy spotify-configs" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Copy spotify-configs                                        \n          "
percentBar 76 59 bar
printf ${FORMAT} "$bar"

# Spotify-Configs
#wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json >> ${LOG} 2>>${LOG}
#wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifyd.conf -O /etc/spotifyd/spotifyd.conf >> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Copy media-files" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Copy media-files                                        \n          "
percentBar 80 59 bar
printf ${FORMAT} "$bar"

# Splash and Media
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/splash.txt -O /boot/splash.txt >> ${LOG} 2>>${LOG}
sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img >> ${LOG} 2>>${LOG}
wget https://github.com/splitti/MuPiBox/raw/main/media/images/goodbye.png -O ~/MuPiBox/sysmedia/images/goodbye.png >> ${LOG} 2>>${LOG}
sudo wget https://github.com/splitti/MuPiBox/raw/main/media/images/splash.png -O /boot/splash.png >> ${LOG} 2>>${LOG}
wget https://github.com/splitti/MuPiBox/raw/main/media/sound/shutdown.wav -O ~/MuPiBox/sysmedia/sound/shutdown.wav >> ${LOG} 2>>${LOG}
wget https://github.com/splitti/MuPiBox/raw/main/media/sound/startup.wav -O ~/MuPiBox/sysmedia/sound/startup.wav >> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Copy mupibox-files" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Copy mupibox-files                                        \n          "
percentBar 83 59 bar
printf ${FORMAT} "$bar"

# MuPiBox
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh >> ${LOG} 2>>${LOG}
sudo chmod 755 /usr/local/bin/mupibox/change_checker.sh /usr/local/bin/mupibox/idle_shutdown.sh /usr/local/bin/mupibox/m3u_generator.sh /usr/local/bin/mupibox/setting_update.sh /usr/local/bin/mupibox/software_shutdown.sh /usr/local/bin/mupibox/splash_screen.sh >> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Copy OnOffShim-scripts" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Copy onoffshim-scripts                                        \n          "
percentBar 86 59 bar
printf ${FORMAT} "$bar"

# OnOffShim & hifiberry
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh >> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh >> ${LOG} 2>>${LOG}
sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh >> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Enable services" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Enable services                                        \n          "
percentBar 90 59 bar
printf ${FORMAT} "$bar"

# Enable Services
sudo systemctl daemon-reload >> ${LOG} 2>>${LOG}
sudo systemctl enable mupi_change_checker.service >> ${LOG} 2>>${LOG}
sudo systemctl start mupi_change_checker.service >> ${LOG} 2>>${LOG}
sudo systemctl enable mupi_idle_shutdown.service >> ${LOG} 2>>${LOG}
sudo systemctl start mupi_idle_shutdown.service >> ${LOG} 2>>${LOG}
sudo systemctl enable mupi_splash.service >> ${LOG} 2>>${LOG}
sudo systemctl start mupi_splash.service >> ${LOG} 2>>${LOG}
sudo systemctl enable spotifyd.service >> ${LOG} 2>>${LOG}
sudo systemctl start spotifyd.service >> ${LOG} 2>>${LOG}
sudo systemctl enable smbd.service >> ${LOG} 2>>${LOG}
sudo systemctl start smbd.service >> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" >> ${LOG} 2>>${LOG}
echo "Set environment" >> ${LOG} 2>>${LOG}

tput cup $Y $X
printf "Set environment                                        \n          "
percentBar 98 59 bar
printf ${FORMAT} "$bar"
# ENV
(echo "mupibox"; echo "mupibox") | sudo smbpasswd -s -a dietpi >> ${LOG} 2>>${LOG}
sudo env PATH=$PATH:/usr/local/bin/mupibox >> ${LOG} 2>>${LOG}
sleep 1

sudo usermod -a -G bluetooth dietpi
sudo usermod -a -G tty dietpi
#sudo usermod -a -G bluetooth dietpi

tput cup $Y $X
printf "SYSTEM IS PREPARED                                        \n          "
percentBar 100 59 bar
printf ${FORMAT} "$bar"
printf "\n\n  Logfile: ${LOG}\n\n  Have a nice day!\n\n"


#/boot/dietpi/func/dietpi-set_hardware bluetooth on
#rm /etc/modprobe.d/dietpi-disable_bluetooth.conf
#sed -i /^[[:blank:]]*dtoverlay=disable-bt/d /boot/config.txt
#apt install pi-bluetooth
#[ INFO ] DietPi-Set_hardware | APT update, please wait...


#sudo nano /etc/bluetooth/main.conf
#sudo apt-get install pulseaudio pulseaudio-module-bluetooth

#adduser root pulse-access
#adduser dietpi pulse-access
#sudo usermod -a -G bluetooth pi