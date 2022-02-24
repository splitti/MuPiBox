#!/bin/bash
#

export NODE_OPTIONS=--max_old_space_size=800

LOG=$(pwd)"/compile.log"
COMPPATH=$(pwd)"/COMPILEIT/"
VERSION="https://github.com/Thyraz/Sonos-Kids-Controller/archive/refs/tags/V1.6.zip"

sudo rm -R ${COMPPATH} ${LOG} &>> ${LOG} 2>>${LOG}
mkdir ${COMPPATH} &>> ${LOG} 2>>${LOG}

cd ${COMPPATH} &>> ${LOG} 2>>${LOG}
wget ${VERSION} -O ${COMPPATH}sonos.zip &>> ${LOG} 2>>${LOG}
unzip sonos.zip &>> ${LOG} 2>>${LOG}
rm sonos.zip &>> ${LOG} 2>>${LOG}
mv Sonos-Kids-* Sonos-Kids-Controller-master &>> ${LOG} 2>>${LOG}
cd ${COMPPATH}Sonos-Kids-Controller-master &>> ${LOG} 2>>${LOG}
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/www.json -O ${COMPPATH}Sonos-Kids-Controller-master/server/config/config.json &>> ${LOG} 2>>${LOG}
wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/server.js -O ${COMPPATH}Sonos-Kids-Controller-master/server.js  &>> ${LOG} 2>>${LOG}
wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/angular.json -O ${COMPPATH}Sonos-Kids-Controller-master/angular.json &>> ${LOG} 2>>${LOG}
wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/src/app/player.service.ts -O ${COMPPATH}Sonos-Kids-Controller-master/src/app/player.service.ts &>> ${LOG} 2>>${LOG}
wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/src/app/player/player.page.html -O ${COMPPATH}Sonos-Kids-Controller-master/src/app/player/player.page.html &>> ${LOG} 2>>${LOG}
wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/src/app/player/player.page.scss -O ${COMPPATH}Sonos-Kids-Controller-master/src/app/player/player.page.scss &>> ${LOG} 2>>${LOG}
wget https://github.com/splitti/MuPiBox/raw/main/development_prepare/customize/Sonos-Kids-Controller-master/src/app/player/player.page.ts -O ${COMPPATH}Sonos-Kids-Controller-master/src/app/player/player.page.ts &>> ${LOG} 2>>${LOG}
wget https://raw.githubusercontent.com/splitti/MuPiBox/main/development_prepare/customize/Sonos-Kids-Controller-master/src/app/add/add.page.html -O ${COMPPATH}Sonos-Kids-Controller-master/src/app/add/add.page.html &>> ${LOG} 2>>${LOG}
#npm i -D -E @angular/cli
npm install @angular/cli
sudo ionic build --prod &>> ${LOG} 2>>${LOG}
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
