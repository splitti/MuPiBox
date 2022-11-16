#!/bin/bash
#
# Generate M3U Playlist and Covers

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
M3ULOCK="/tmp/.m3u.lock"

if [ -f "${M3ULOCK}" ]; then
	echo "Process already running."
    exit
else
	touch ${M3ULOCK}

	if [ ! -f "$DATA" ]; then
		echo "[]" > ${DATA}
	fi

	for topFolder in "/home/dietpi/MuPiBox/media/audiobook/"* ; do
		artist=$(/usr/bin/basename "${topFolder}")
		setArtistCover=0
		test4images=$(ls -1v "${topFolder}" | grep .jp*g)
		if [ ${#test4images} != 0 ]
		then
			/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/" > /dev/null
			for i in "${topFolder}"/*.jp*g; do cp "$i" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/cover.jpg"; break; done
#			/usr/bin/cp --update "${topFolder}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/cover.jpg"
			setArtistCover=1
		fi	

		for i in "${topFolder}/"* ; do
			if [[ -d ${i} ]]
			then
				searchStrTitleCover=""
				title=$(/usr/bin/basename "${i}")
				setTitleCover=0
				ls -1v "${i}" | grep '.mp3\|.flac\|.wav\|.wma\|.m4a' > /tmp/playlist.m3u
				mv /tmp/playlist.m3u "${i}"
				test4images=$(ls -1v "${i}" | grep .jp*g)
				if [ ${#test4images} != 0 ]
				then
					/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${title}/" > /dev/null
					for j in "${i}"/*.jp*g; do cp "$j" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${title}/cover.jpg"; break; done
					#/usr/bin/cp --update "${i}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${title}/cover.jpg"
					setTitleCover=1
					searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'audiobook/'"${artist}"'/'"${title}"'/cover.jpg'`
				fi


				if [ -z "${searchStrTitleCover}" ]
				then
					if [ $setTitleCover == 1 ]
					then
						if [ $setArtistCover == 1 ]
						then
							/usr/bin/cat <<< $(/usr/bin/cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "audiobook", "artist": "'"${artist}"'", "title": "'"${title}"'", "cover": "http://127.0.0.1:8200/cover/audiobook/'"${artist}"'/'"${title}"'/cover.jpg", "artistcover": "http://127.0.0.1:8200/cover/audiobook/'"${artist}"'/cover.jpg"}]') > ${DATA}
						else
							/usr/bin/cat <<< $(/usr/bin/cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "audiobook", "artist": "'"${artist}"'", "title": "'"${title}"'", "cover": "http://127.0.0.1:8200/cover/audiobook/'"${artist}"'/'"${title}"'/cover.jpg"}]') > ${DATA}
						fi
					else
						if [ $setArtistCover == 1 ]
						then
							/usr/bin/cat <<< $(/usr/bin/cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "audiobook", "artist": "'"${artist}"'", "title": "'"${title}"'", "cover": "http://127.0.0.1:8200/cover/audiobook/'"${artist}"'/cover.jpg", "artistcover": "http://127.0.0.1:8200/cover/audiobook/'"${artist}"'/cover.jpg"}]') > ${DATA}
						else
							/usr/bin/cat <<< $(/usr/bin/cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "audiobook", "artist": "'"${artist}"'", "title": "'"${title}"'"}]') > ${DATA}
						fi
					fi
				fi
			fi
		done
	done

	for topFolder in "/home/dietpi/MuPiBox/media/music/"* ; do
		artist=$(/usr/bin/basename "${topFolder}")
		setArtistCover=0
		
		test4images=$(ls -1v "${topFolder}" | grep .jp*g)
		if [ ${#test4images} != 0 ]
		then
			/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/" > /dev/null
			for i in "${topFolder}"/*.jp*g; do cp "$i" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/cover.jpg"; break; done

			#/usr/bin/cp --update "${topFolder}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/cover.jpg"
			setArtistCover=1
		fi	

		for i in "${topFolder}/"* ; do
			if [[ -d ${i} ]]
			then
				searchStrTitleCover=""
				title=$(/usr/bin/basename "${i}")
				setTitleCover=0
				ls -1v "${i}" | grep '.mp3\|.flac\|.wav\|.wma\|.m4a' > /tmp/playlist.m3u && mv /tmp/playlist.m3u "${i}"
			
				test4images=$(ls -1v "${i}" | grep .jp*g)
				if [ ${#test4images} != 0 ]
				then
					/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${title}/" > /dev/null
					for j in "${i}"/*.jp*g; do cp "$j" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${title}/cover.jpg"; break; done

					#/usr/bin/cp --update "${i}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${title}/cover.jpg"
					setTitleCover=1
					searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'music/'"${artist}"'/'"${title}"'/cover.jpg'`
				fi


				if [ -z "${searchStrTitleCover}" ]
				then
					if [ $setTitleCover == 1 ]
					then
						if [ $setArtistCover == 1 ]
						then
							/usr/bin/cat <<< $(/usr/bin/cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "music", "artist": "'"${artist}"'", "title": "'"${title}"'", "cover": "http://127.0.0.1:8200/cover/music/'"${artist}"'/'"${title}"'/cover.jpg", "artistcover": "http://127.0.0.1:8200/cover/music/'"${artist}"'/cover.jpg"}]') > ${DATA}
						else
							/usr/bin/cat <<< $(/usr/bin/cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "music", "artist": "'"${artist}"'", "title": "'"${title}"'", "cover": "http://127.0.0.1:8200/cover/music/'"${artist}"'/'"${title}"'/cover.jpg"}]') > ${DATA}
						fi
					else
						if [ $setArtistCover == 1 ]
						then
							/usr/bin/cat <<< $(/usr/bin/cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "music", "artist": "'"${artist}"'", "title": "'"${title}"'", "cover": "http://127.0.0.1:8200/cover/music/'"${artist}"'/cover.jpg", "artistcover": "http://127.0.0.1:8200/cover/music/'"${artist}"'/cover.jpg"}]') > ${DATA}
						else
							/usr/bin/cat <<< $(/usr/bin/cat ${DATA} | /usr/bin/jq '. += [{"type": "library", "category": "music", "artist": "'"${artist}"'", "title": "'"${title}"'"}]') > ${DATA}
						fi
					fi
				fi
			fi
		done
	done

	/usr/bin/chown -R dietpi:dietpi /home/dietpi/MuPiBox/media/
	/usr/bin/chown -R dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/
	/usr/bin/chown dietpi:dietpi ${DATA}

	bash /usr/local/bin/mupibox/add_index.sh

	echo "Cover & Playlists generated"
	rm ${M3ULOCK}
fi