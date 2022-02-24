#!/bin/bash
#

cp ~/.mupibox/Sonos-Kids-Controller-master/server/config/data.json /tmp/data.json
sudo rm -R ~/.mupibox/Sonos-Kids-Controller-master/
mkdir ~/.mupibox/Sonos-Kids-Controller-master/
wget https://github.com/splitti/MuPiBox/raw/main/bin/nodejs/sonos-kids-controller.zip -O ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip
unzip ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip -d ~/.mupibox/Sonos-Kids-Controller-master/
rm ~/.mupibox/Sonos-Kids-Controller-master/sonos-kids-controller.zip
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json
cd ~/.mupibox/Sonos-Kids-Controller-master
npm install
pm2 start server.js
pm2 save
cp /tmp/data.json ~/.mupibox/Sonos-Kids-Controller-master/server/config/data.json 

