#/bin/bash

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"

VERSION=$(/usr/bin/jq -r .mupibox.version ${MUPIBOX_CONFIG})
CPU=$(cat /proc/cpuinfo | grep Serial | cut -d ":" -f2 | sed 's/^ //')

curl -X POST https://mupibox.de/mupi/ct.php -H "Content-Type: application/x-www-form-urlencoded" -d key1=${CPU}&key2=Installation&key3=${VERSION}"

