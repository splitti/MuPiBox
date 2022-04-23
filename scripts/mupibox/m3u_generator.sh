#!/bin/bash
#
# Generate M3U Playlist and Covers

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
TYPE="library"
LENGTH=$(cat $DATA | jq '. | length')
element=0

for i in /home/dietpi/MuPiBox/media/* ; do
    ls -1v "${i}" | grep '.mp3\|.flac\|.wma' > /tmp/playlist.m3u && mv /tmp/playlist.m3u "${i}"
    if [ -f "${i}"/*.jp*g ]
    then
		dirname=$(/usr/bin/basename "${i}")
        /usr/bin/mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/"${dirname}" > /dev/null
        /usr/bin/cp --update "${i}"/*.jp*g /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/"${dirname}"/cover.jpg
	fi
done
/usr/bin/chown -R dietpi:dietpi /home/dietpi/MuPiBox/media/
/usr/bin/chown -R dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/
echo "Playlists generated"

while [ ${element} -lt ${LENGTH} ]
do
        eleType=$(cat ${DATA} | jq '.['${element}'].type')
        eleType=$(echo ${eleType} | sed 's/\"//g')
        eleCover=$(cat ${DATA} | jq '.['${element}'].cover')
        eleTitle=$(cat ${DATA} | jq '.['${element}'].title')
        eleTitle=$(echo ${eleTitle} | sed 's/\"//g' | sed 's/ /%20/g')
        if [[ "${eleType}" == "${TYPE}" ]];
        then
                if [[ ${eleCover} == null ]];
                then
                        newCover="http://127.0.0.1:8200/cover/"${eleTitle}"/cover.jpg"
                        /usr/bin/cat <<< $(/usr/bin/jq --arg v "${newCover}" '.['${element}'].cover = $v' ${DATA}) > ${DATA}

                fi
        fi
        let element+=1
done
echo "Cover links generated"