#!/bin/bash
#
# Generate M3U Playlist and Covers

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
TYPE="library"
element=0

for topFolder in /home/dietpi/MuPiBox/media/audiobook/* ; do
	artist=$(/usr/bin/basename "${topFolder}")
	for i in ${topFolder}/* ; do
		setCover=0
		ls -1v "${i}" | grep '.mp3\|.flac\|.wav\|.wma' > /tmp/playlist.m3u && mv /tmp/playlist.m3u "${i}"
		if [ -f "${i}"/*.jp*g ]
		then
			dirname=$(/usr/bin/basename "${i}")
			/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${dirname}/" > /dev/null
			/usr/bin/cp --update "${i}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${dirname}/cover.jpg"
			setCover=1
		fi
		searchStr=`/usr/bin/cat "${DATA}" | grep 'audiobook/'"${artist}"'/'"${dirname}"'/cover.jpg'`
		if [ -z "${searchStr}" ]
		then
			if [ $setCover == 1 ]
			then
				/usr/bin/cat <<< $(cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "audiobook", "artist": "'"${artist}"'", "title": "'"${dirname}"'", "cover": "http://127.0.0.1:8200/cover/audiobook/'"${artist}"'/'"${dirname}"'/cover.jpg"}]') > ${DATA}
				echo "HIT"
			else
				/usr/bin/cat <<< $(cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "audiobook", "artist": "'"${artist}"'", "title": "'"${dirname}"'"}]') > ${DATA}
			fi
		fi
	done
done

for topFolder in /home/dietpi/MuPiBox/media/music/* ; do
	artist=$(/usr/bin/basename "${topFolder}")
	for i in ${topFolder}/* ; do
		setCover=0
		ls -1v "${i}" | grep '.mp3\|.flac\|.wav\|.wma' > /tmp/playlist.m3u && mv /tmp/playlist.m3u "${i}"
		if [ -f "${i}"/*.jp*g ]
		then
			dirname=$(/usr/bin/basename "${i}")
			/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${dirname}/" > /dev/null
			/usr/bin/cp --update "${i}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${dirname}/cover.jpg"
			setCover=1
		fi
		searchStr=`/usr/bin/cat "${DATA}" | grep 'music/'"${artist}"'/'"${dirname}"'/cover.jpg'`
		if [ -z "${searchStr}" ]
		then
			if [ $setCover == 1 ]
			then
				/usr/bin/cat <<< $(cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "music", "artist": "'"${artist}"'", "title": "'"${dirname}"'", "cover": "http://127.0.0.1:8200/cover/music/'"${artist}"'/'"${dirname}"'/cover.jpg"}]') > ${DATA}
				echo "HIT"
			else
				/usr/bin/cat <<< $(cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "music", "artist": "'"${artist}"'", "title": "'"${dirname}"'"}]') > ${DATA}
			fi
		fi
	done
done

/usr/bin/chown -R dietpi:dietpi /home/dietpi/MuPiBox/media/
/usr/bin/chown -R dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/
echo "Cover & Playlists generated"