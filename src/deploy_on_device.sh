#!/bin/bash

rm -rf ./deploy
npm run build

# Pause execution to see if the build process worked
read -p "Press Enter to resume ..."

# Fix folder structure and add readme.
mv ./deploy/www/browser/* ./deploy/www
cp ./backend-player/README.md ./deploy/

# Backup user data.
mv /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/*.json /tmp/user_data_backup/
mv /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover /tmp/user_data_backup/cover
mv /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css /tmp/user_data_backup/active_theme.css

# Remove old page and copy new one.
rm -rf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www
mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www
cp -a ./deploy/www/ /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/
# TODO: Deploy server and restart them.

# Restore user data.
mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/
mv  /tmp/user_data_backup/*.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/
mv /tmp/user_data_backup/cover /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover
mv /tmp/user_data_backup/active_theme.css /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css

# Restart browser.
sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh
