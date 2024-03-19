#!/bin/bash
#
# Script for MuPiBox preperation
# Start with: cd; curl https://raw.githubusercontent.com/friebi/MuPiBox/main/development_prepare/prepare-env.sh | bash

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

BARLENGTH=59
Y=15
X=10
ORIENTATION="\n          "
LOG="/tmp/prepare.log"

FORMAT="\e[48;5;23;38;5;41m%s\e[0m"
sleep 2
printf "\n\nPlease wait, this takes a while... \n\n"
# Make it nice
sudo apt-get install figlet lolcat -y >> ${LOG} 2>>${LOG}



###############################################################################################
echo "###################################################" >> ${LOG} 2>>${LOG}
echo "MuPiBox Preperation" >> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Get missing packages"
printf "$ORIENTATION"
percentBar 0 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

# Get missing packages
sudo apt-get update &>> ${LOG} 2>>${LOG}
sudo apt-get install git libasound2 jq samba mplayer pulseaudio-module-bluetooth bluez zip -y &>> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Install nodeJS" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Install nodeJS 16                             "
printf "$ORIENTATION"
percentBar 5 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash - &>> ${LOG} 2>>${LOG}
sudo apt-get install -y nodejs &>> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Install ionic" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Install ionic                           "
printf "$ORIENTATION"
percentBar 10 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

sudo npm install -g @ionic/cli &>> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Install pm2" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Install pm2                             "
printf "$ORIENTATION"
percentBar 15 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

cd ~
sudo npm install pm2 -g  &>> ${LOG} 2>>${LOG}
pm2 startup &>> ${LOG} 2>>${LOG}
PM2_ENV=$(sudo cat ${LOG} | sudo grep "sudo env")  &>> ${LOG} 2>>${LOG}
echo ${PM2} &>> ${LOG} 2>>${LOG}
${PM2_ENV} &>> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Clean and create Directorys" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Clean and create Directorys                                        "
printf "$ORIENTATION"
percentBar 20 ${BARLENGTH} bar
printf ${FORMAT} "$bar"


# Clean and create Directorys
sudo rm -R ~/.mupibox &>> ${LOG} 2>>${LOG}
sudo rm -R ~/MuPiBox/  &>> ${LOG} 2>>${LOG}

mkdir -p ~/.mupibox &>> ${LOG} 2>>${LOG}
mkdir -p ~/MuPiBox/media &>> ${LOG} 2>>${LOG}
mkdir ~/MuPiBox/tts_files &>> ${LOG} 2>>${LOG}
mkdir -p ~/MuPiBox/sysmedia/sound &>> ${LOG} 2>>${LOG}
mkdir ~/MuPiBox/sysmedia/images &>> ${LOG} 2>>${LOG}
mkdir ~/MuPiBox/media &>> ${LOG} 2>>${LOG} ${LOG} 2>>${LOG}
sudo mkdir /usr/local/bin/mupibox &>> ${LOG} 2>>${LOG}
sudo mkdir /etc/spotifyd &>> ${LOG} 2>>${LOG}
sudo mkdir /etc/mupibox &>> ${LOG} 2>>${LOG}
sudo mkdir /var/log/mupibox/ &>> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Create hushlogin" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Create hushlogin                                        "
printf "$ORIENTATION"
percentBar 21 ${BARLENGTH} bar
printf ${FORMAT} "$bar"
# Boot
touch ~/.hushlogin
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Install mplayer-wrapper" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Install mplayer-wrapper                                        "
printf "$ORIENTATION"
percentBar 22 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

# Sources
cd ~/.mupibox >> ${LOG}
git clone https://github.com/derhuerst/mplayer-wrapper &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/development_prepare/customize/mplayer-wrapper/index.js -O ~/.mupibox/mplayer-wrapper/index.js &>> ${LOG} 2>>${LOG}
cd ~/.mupibox/mplayer-wrapper &>> ${LOG} 2>>${LOG}
npm install &>> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Install google-tts" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Install google-tts                                        "
printf "$ORIENTATION"
percentBar 27 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

cd ~/.mupibox &>> ${LOG} 2>>${LOG}
git clone https://github.com/zlargon/google-tts &>> ${LOG} 2>>${LOG}
cd google-tts/ &>> ${LOG} 2>>${LOG}
npm install --save &>> ${LOG} 2>>${LOG}
npm audit fix &>> ${LOG} 2>>${LOG}
npm test &>> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Install Sonos-Kids-Controller-master" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Install Sonos-Kids-Controller-master                                        "
printf "$ORIENTATION"
percentBar 32 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

cd ~/.mupibox/ &>> ${LOG} 2>>${LOG}
wget https://github.com/Thyraz/Sonos-Kids-Controller/archive/refs/tags/V1.6.zip &>> ${LOG} 2>>${LOG}
unzip V1.6.zip &>> ${LOG} 2>>${LOG}
rm V1.6.zip &>> ${LOG} 2>>${LOG}
mv Sonos-Kids-Controller-1.6 Sonos-Kids-Controller-master &>> ${LOG} 2>>${LOG}
cd ~/.mupibox/Sonos-Kids-Controller-master &>> ${LOG} 2>>${LOG}
wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/server.js -O ~/.mupibox/Sonos-Kids-Controller-master/server.js  &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/angular.json -O ~/.mupibox/Sonos-Kids-Controller-master/angular.json &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/src/app/player.service.ts -O ~/.mupibox/Sonos-Kids-Controller-master/src/app/player.service.ts &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/src/app/player/player.page.html -O ~/.mupibox/Sonos-Kids-Controller-master/src/app/player/player.page.html &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/src/app/player/player.page.scss -O ~/.mupibox/Sonos-Kids-Controller-master/src/app/player/player.page.scss &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/src/app/player/player.page.ts -O ~/.mupibox/Sonos-Kids-Controller-master/src/app/player/player.page.ts &>> ${LOG} 2>>${LOG}
ionic build --prod &>> ${LOG} 2>>${LOG}
rm -rf deploy &>> ${LOG} 2>>${LOG}
mkdir deploy &>> ${LOG} 2>>${LOG}
cp -Rp www deploy/ &>> ${LOG} 2>>${LOG}
mkdir deploy/server &>> ${LOG} 2>>${LOG}
mkdir deploy/server/config &>> ${LOG} 2>>${LOG}
cp -p server/config/config-example.json  deploy/server/config/ &>> ${LOG} 2>>${LOG}
cp -p server.js deploy/ &>> ${LOG} 2>>${LOG}
cp -p package-deploy.json deploy/package.json &>> ${LOG} 2>>${LOG}
cp -p README.md deploy/ &>> ${LOG} 2>>${LOG}
cd deploy &>> ${LOG} 2>>${LOG}
zip -r sonos-kids-controller.zip . &>> ${LOG} 2>>${LOG}
mv sonos-kids-controller.zip ~/ &>> ${LOG} 2>>${LOG}
cd ~/.mupibox/Sonos-Kids-Controller-master &>> ${LOG} 2>>${LOG}
npm install  &>> ${LOG} 2>>${LOG}
npm start & &>> ${LOG} 2>>${LOG}
sleep 10  &>> ${LOG} 2>>${LOG}
pm2 start server.js  &>> ${LOG} 2>>${LOG}
pm2 save  &>> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Install Spotify Controller" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Install Spotify Controller                                        "
printf "$ORIENTATION"
percentBar 53 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

cd ~/.mupibox  &>> ${LOG} 2>>${LOG}
wget https://github.com/amueller-tech/spotifycontroller/archive/main.zip  &>> ${LOG} 2>>${LOG}
unzip main.zip  &>> ${LOG} 2>>${LOG}
rm main.zip  &>> ${LOG} 2>>${LOG}
cd ~/.mupibox/spotifycontroller-main  &>> ${LOG} 2>>${LOG}
wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/development_prepare/customize/spotiycontroller-main/spotify-control.js -O ~/.mupibox/spotifycontroller-main/spotify-control.js  &>> ${LOG} 2>>${LOG}
npm install  &>> ${LOG} 2>>${LOG}
npm start & &>> ${LOG} 2>>${LOG}
sleep 10  &>> ${LOG} 2>>${LOG}
pm2 start spotify-control.js  &>> ${LOG} 2>>${LOG}
pm2 save  &>> ${LOG} 2>>${LOG}

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Copy binaries" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Copy binaries                                        "
printf "$ORIENTATION"
percentBar 63 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

# Binaries
sudo wget https://github.com/friebi/MuPiBox/raw/main/bin/fbv/fbv -O /usr/bin/fbv  &>> ${LOG} 2>>${LOG}
sudo wget https://github.com/friebi/MuPiBox/raw/main/bin/spotifyd/0.3.3/dietpi8_64bit/spotifyd -O /usr/bin/spotifyd  &>> ${LOG} 2>>${LOG}
sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd &>> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Copy dietpi-config" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Copy dietpi-configs                                        "
printf "$ORIENTATION"
percentBar 68 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

# DietPi-Configs
#sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf &>> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Copy spotify-configs" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Copy spotify-configs                                        "
printf "$ORIENTATION"
percentBar 69 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

# Spotify-Configs
#wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json &>> ${LOG} 2>>${LOG}
#wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/spotifycontroller.json -O ~/.mupibox/spotifycontroller-main/config/config.json &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/spotifyd.conf -O /etc/spotifyd/spotifyd.conf &>> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Copy media-files" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Copy media-files                                        "
printf "$ORIENTATION"
percentBar 70 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

# Splash and Media
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/splash.txt -O /boot/splash.txt &>> ${LOG} 2>>${LOG}
sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/media/images/goodbye.png -O ~/MuPiBox/sysmedia/images/goodbye.png &>> ${LOG} 2>>${LOG}
sudo wget https://github.com/friebi/MuPiBox/raw/main/media/images/splash.png -O /boot/splash.png &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/media/sound/shutdown.wav -O ~/MuPiBox/sysmedia/sound/shutdown.wav &>> ${LOG} 2>>${LOG}
wget https://github.com/friebi/MuPiBox/raw/main/media/sound/startup.wav -O ~/MuPiBox/sysmedia/sound/startup.wav &>> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Copy mupibox-files" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Copy mupibox-files                                        "
printf "$ORIENTATION"
percentBar 75 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

# MuPiBox
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh &>> ${LOG} 2>>${LOG}
sudo chmod 755 /usr/local/bin/mupibox/change_checker.sh /usr/local/bin/mupibox/idle_shutdown.sh /usr/local/bin/mupibox/m3u_generator.sh /usr/local/bin/mupibox/setting_update.sh /usr/local/bin/mupibox/software_shutdown.sh /usr/local/bin/mupibox/splash_screen.sh &>> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Install Hifiberry-MiniAmp and Bluetooth support" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Install Hifiberry-MiniAmp and Bluetooth support                                        "
printf "$ORIENTATION"
percentBar 77 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

sudo /boot/dietpi/func/dietpi-set_hardware bluetooth enable &>> ${LOG} 2>>${LOG}
sudo /boot/dietpi/func/dietpi-set_hardware soundcard "hifiberry-dac"  &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf  &>> ${LOG} 2>>${LOG}
sudo usermod -g pulse -G audio,lp --home /var/run/pulse pulse &>> ${LOG} 2>>${LOG}
sudo usermod -a -G audio dietpi &>> ${LOG} 2>>${LOG}
sudo usermod -a -G bluetooth dietpi &>> ${LOG} 2>>${LOG}
sudo usermod -a -G pulse dietpi &>> ${LOG} 2>>${LOG}
sudo usermod -a -G pulse-access dietpi &>> ${LOG} 2>>${LOG}
sudo usermod -a -G pulse root &>> ${LOG} 2>>${LOG}
sudo usermod -a -G pulse-access root &>> ${LOG} 2>>${LOG}
sudo /usr/bin/sed -i 's/; system-instance = no/system-instance = yes/g' /etc/pulse/daemon.conf &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/services/pulseaudio.service -O /etc/systemd/system/pulseaudio.service  &>> ${LOG} 2>>${LOG}

if grep -q '^load-module module-bluetooth-discover' /etc/pulse/system.pa; then
  echo -e "load-module module-bluetooth-discover already set" &>> ${LOG} 2>>${LOG}
else
  echo '' | sudo tee -a /etc/pulse/system.pa &>> ${LOG} 2>>${LOG}
  echo 'load-module module-bluetooth-discover' | sudo tee -a /etc/pulse/system.pa &>> ${LOG} 2>>${LOG}
fi
if grep -q '^load-module module-bluetooth-policy' /etc/pulse/system.pa; then
  echo -e "load-module module-bluetooth-policy already set" &>> ${LOG} 2>>${LOG}
else
  echo '' | sudo tee -a /etc/pulse/system.pa &>> ${LOG} 2>>${LOG}
  echo 'load-module module-bluetooth-policy' | sudo tee -a /etc/pulse/system.pa &>> ${LOG} 2>>${LOG}
fi

sudo /usr/bin/sed -i 's/; default-server =/default-server = \/var\/run\/pulse\/native/g' /etc/pulse/client.conf &>> ${LOG} 2>>${LOG}
sudo /usr/bin/sed -i 's/; autospawn = yes/autospawn = no/g' /etc/pulse/client.conf &>> ${LOG} 2>>${LOG}
sudo systemctl daemon-reload &>> ${LOG} 2>>${LOG}
sudo systemctl enable pulseaudio &>> ${LOG} 2>>${LOG}
sudo systemctl start pulseaudio &>> ${LOG} 2>>${LOG}
###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Set environment" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Set environment                                        "
printf "$ORIENTATION"
percentBar 82 ${BARLENGTH} bar
printf ${FORMAT} "$bar"
# ENV
(echo "mupibox"; echo "mupibox") | sudo smbpasswd -s -a dietpi &>> ${LOG} 2>>${LOG}
sudo env PATH=$PATH:/usr/local/bin/mupibox &>> ${LOG} 2>>${LOG}
sleep 1


echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Copy OnOffShim-scripts" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Copy onoffshim-scripts                                        "
printf "$ORIENTATION"
percentBar 83 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

# OnOffShim & hifiberry
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh &>> ${LOG} 2>>${LOG}
sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh &>> ${LOG} 2>>${LOG}
sleep 1

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Configure Chromium" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Configure Chromium                                        "
printf "$ORIENTATION"
percentBar 85 ${BARLENGTH} bar
printf ${FORMAT} "$bar"

suggest_gpu_mem=76 &>> ${LOG} 2>>${LOG}
sudo /boot/dietpi/func/dietpi-set_hardware gpumemsplit $suggest_gpu_mem &>> ${LOG} 2>>${LOG}
sudo /boot/dietpi/dietpi-autostart 11 &>> ${LOG} 2>>${LOG}
echo -ne '\n' | sudo dietpi-software install 113 &>> ${LOG} 2>>${LOG}
sudo /boot/dietpi/dietpi-autostart 11 &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/scripts/chromium-autostart.sh -O /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh &>> ${LOG} 2>>${LOG}
sudo chmod +x /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh &>> ${LOG} 2>>${LOG}
sudo usermod -a -G tty dietpi &>> ${LOG} 2>>${LOG}
sudo apt install xserver-xorg-legacy -y &>> ${LOG} 2>>${LOG}
sudo /usr/bin/sed -i 's/allowed_users\=console/allowed_users\=anybody/g' /etc/X11/Xwrapper.config &>> ${LOG} 2>>${LOG}
sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf &>> ${LOG} 2>>${LOG}
sudo /usr/bin/sed -i 's/tty1/tty3 vt.global_cursor_default\=0 fastboot noatime nodiratime noram splash silent loglevel\=0 vt.default_red\=68,68,68,68,68,68,68,68 vt.default_grn\=175,175,175,175,175,175,175,175 vt.default_blu\=226,226,226,226,226,226,226,226/g' /boot/cmdline.txt &>> ${LOG} 2>>${LOG}

sudo /usr/bin/sed -i 's/session    optional   pam_motd.so motd\=\/run\/motd.dynamic/#session    optional   pam_motd.so motd\=\/run\/motd.dynamic/g' /etc/pam.d/login &>> ${LOG} 2>>${LOG}
sudo /usr/bin/sed -i 's/session    optional   pam_motd.so noupdate/#session    optional   pam_motd.so noupdate/g' /etc/pam.d/login &>> ${LOG} 2>>${LOG}
sudo /usr/bin/sed -i 's/session    optional   pam_lastlog.so/session    optional   pam_lastlog.so/g' /etc/pam.d/login &>> ${LOG} 2>>${LOG}

sudo /usr/bin/sed -i 's/ExecStart\=-\/sbin\/agetty -a dietpi -J \%I \$TERM/ExecStart\=-\/sbin\/agetty --skip-login --noclear --noissue --login-options \"-f dietpi\" \%I \$TERM/g' /etc/systemd/system/getty@tty1.service.d/dietpi-autologin.conf &>> ${LOG} 2>>${LOG}

if grep -q '^initramfs initramfs.img' /boot/config.txt; then
  echo -e "initramfs initramfs.img already set" &>> ${LOG} 2>>${LOG}
else
  echo '' | sudo tee -a /boot/config.txt &>> ${LOG} 2>>${LOG}
  echo 'initramfs initramfs.img' | sudo tee -a /boot/config.txt &>> ${LOG} 2>>${LOG}
fi

###############################################################################################

echo "###################################################" &>> ${LOG} 2>>${LOG}
echo "Enable services" &>> ${LOG} 2>>${LOG}

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "Enable services                                        "
printf "$ORIENTATION"
percentBar 95 ${BARLENGTH} bar
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

clear
figlet -f standard -w 80 -c -m 1 "  MuPiBox Preperation" | lolcat
tput cup $Y $X

printf "SYSTEM IS PREPARED                                        "
printf "$ORIENTATION"
percentBar 100 ${BARLENGTH} bar
printf ${FORMAT} "$bar"
printf "\n${ORIENTATION}Logfile: ${LOG}\n${ORIENTATION}Please reboot and have a nice day!\n\n"


#https://gist.github.com/yejun/2c1a070a839b3a7b146ede8a998b5495    !!!!!
#discoverable on
#pairable on
#agent on
#default-agent
#scan on
