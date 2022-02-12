# Create Directorys
mkdir -p ~/.mupibox
mkdir -p ~/MuPiBox/media
mkdir ~/MuPiBox/tts_files
mkdir -p ~/MuPiBox/sysmedia/sound
mkdir ~/MuPiBox/sysmedia/images
mkdir ~/MuPiBox/media
sudo mkdir /usr/local/bin/mupibox
sudo mkdir /etc/spotifyd
sudo mkdir /etc/mupibox
sudo mkdir /var/log/mupibox/


# Get missing packages
sudo apt install libasound2 jq samba -y
curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g @ionic/cli


# Sources
cd ~/.mupibox
git clone https://github.com/derhuerst/mplayer-wrapper
git clone https://github.com/zlargon/google-tts
wget https://github.com/Thyraz/Sonos-Kids-Controller/archive/refs/tags/V1.6.zip
unzip V1.6.zip
rm V1.6.zip
mv Sonos-Kids-Controller-1.6/ Sonos-Kids-Controller-master
npm install
npm audit fix
ionic build --prod --verbose
mkdir ~/.mupibox/Sonos-Kids-Controller-master/www/cover
#sudo npm install pm2 -g 
#pm2 startup
# ENVIRONMENT VAR
#cd ~/.mupibox/Sonos-Kids-Controller-master/
#pm2 start server.js
#pm2 save


# Boot
touch ~/.hushlogin


# Binaries
sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/fbv/fbv -O /usr/bin/fbv
sudo wget https://github.com/splitti/MuPiBox/raw/main/bin/spotifyd/0.3.3/dietpi8_64bit/spotifyd -O /usr/bin/spotifyd
sudo chmod 755 /usr/bin/fbv /usr/bin/spotifyd


# Services
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_change_checker.service -O /etc/systemd/system/mupi_change_checker.service
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_idle_shutdown.service -O /etc/systemd/system/mupi_idle_shutdown.service
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/mupi_splash.service -O /etc/systemd/system/mupi_splash.service
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/services/spotifyd.service -O /etc/systemd/system/spotifyd.service


# DietPi-Configs
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/98-dietpi-disable_dpms.conf -O /etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/asound.conf -O /etc/asound.conf
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf


# Spotify-Configs
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifycontroller.json -O /home/dietpi/.mupibox/spotifycontroller-main/config/config.json
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/spotifyd.conf -O /etc/spotifyd/spotifyd.conf


# Splash and Media
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/splash.txt -O /boot/splash.txt
sudo wget https://gitlab.com/DarkElvenAngel/initramfs-splash/-/raw/master/boot/initramfs.img -O /boot/initramfs.img
wget https://github.com/splitti/MuPiBox/raw/main/media/images/goodbye.png -O /home/dietpi/MuPiBox/sysmedia/images/goodbye.png
sudo wget https://github.com/splitti/MuPiBox/raw/main/media/images/splash.png -O /boot/splash.png
wget https://github.com/splitti/MuPiBox/raw/main/media/sound/shutdown.wav -O /home/dietpi/MuPiBox/sysmedia/sound/shutdown.wav
wget https://github.com/splitti/MuPiBox/raw/main/media/sound/startup.wav -O /home/dietpi/MuPiBox/sysmedia/sound/startup.wav

# MuPiBox
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/change_checker.sh -O /usr/local/bin/mupibox/change_checker.sh
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/idle_shutdown.sh -O /usr/local/bin/mupibox/idle_shutdown.sh
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/m3u_generator.sh -O /usr/local/bin/mupibox/m3u_generator.sh
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/setting_update.sh -O /usr/local/bin/mupibox/setting_update.sh
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/software_shutdown.sh -O /usr/local/bin/mupibox/software_shutdown.sh
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/mupibox/splash_screen.sh -O /usr/local/bin/mupibox/splash_screen.sh
sudo chmod 755 /usr/local/bin/mupibox/change_checker.sh /usr/local/bin/mupibox/idle_shutdown.sh /usr/local/bin/mupibox/m3u_generator.sh /usr/local/bin/mupibox/setting_update.sh /usr/local/bin/mupibox/software_shutdown.sh /usr/local/bin/mupibox/splash_screen.sh


# OnOffShim
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/off_trigger.sh -O /var/lib/dietpi/postboot.d/off_trigger.sh
sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/OnOffShim/poweroff.sh -O /usr/lib/systemd/system-shutdown/poweroff.sh
sudo chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh


# Enable Services
sudo systemctl enable mupi_change_checker.service
sudo systemctl start mupi_change_checker.service
sudo systemctl enable mupi_idle_shutdown.service
sudo systemctl start mupi_idle_shutdown.service
sudo systemctl enable mupi_splash.service
sudo systemctl start mupi_splash.service
sudo systemctl enable spotifyd.service
sudo systemctl start spotifyd.service


# ENV
sudo env PATH=$PATH:/usr/local/bin/mupibox