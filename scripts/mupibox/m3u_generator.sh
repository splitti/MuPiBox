#!/bin/bash
#
# Generate M3U Playlist and Covers

for i in /home/dietpi/MuPiBox/media/* ; do
    ls -1v "${i}" | grep .mp3 > /tmp/playlist.m3u && mv /tmp/playlist.m3u "${i}"
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