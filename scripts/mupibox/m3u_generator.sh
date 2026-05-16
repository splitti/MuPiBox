#!/bin/bash
#
# Generate M3U Playlist and Covers

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
DATA_LOCK="/tmp/.data.lock"
HN=`hostname`

if [ "$EUID" -ne 0 ]
  then echo "Please run as root"
  exit
fi

if [ -f "${DATA_LOCK}" ]; then
	echo "Data-file locked."
    exit
else
	touch ${DATA_LOCK}

	if [ ! -f "$DATA" ]; then
		echo "[]" > ${DATA}
	fi

	bash /usr/local/bin/mupibox/data_clean.sh	

	for topFolder in "/home/dietpi/MuPiBox/media/audiobook/"* ; do
		artist=$(/usr/bin/basename "${topFolder}")
		setArtistCover=0
		test4images=$(ls -1v "${topFolder}" | grep .jp*g)
		if [ ${#test4images} != 0 ]
		then
			/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/" > /dev/null
			for i in "${topFolder}"/*.jp*g; do cp "$i" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/cover.jpg"; break; done
			#/usr/bin/cp --update "${topFolder}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/cover.jpg"
			setArtistCover=1
		fi	

		for i in "${topFolder}/"* ; do
			if [[ -d ${i} ]]
			then
				searchStrTitleCover=""
				title=$(/usr/bin/basename "${i}")
				ls -1v "${i}" | grep '.mp3\|.flac\|.wav\|.wma\|.ogg\|.m4a' > /tmp/playlist.m3u
				mv /tmp/playlist.m3u "${i}"
				test4images=$(ls -1v "${i}" | grep .jp*g)
				if [ ${#test4images} != 0 ]
				then
					/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${title}/" > /dev/null
					for j in "${i}"/*.jp*g; do cp "$j" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${title}/cover.jpg"; break; done
					#/usr/bin/cp --update "${i}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${title}/cover.jpg"
					searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'audiobook/'"${artist}"'/'"${title}"'/cover.jpg'`
				else
					# B2: previous test was `if [$setArtistCover == 1 ]` —
					# missing space after `[`. Bash interprets that as a
					# command named `[$setArtistCover`, which doesn't exist,
					# so the test is always false and we always fell to the
					# else-branch (MuPiLogo fallback). Audiobook artists
					# with their own cover image but no per-title cover
					# never got their cover used.
					if [ $setArtistCover == 1 ]
					then
						/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${title}/" > /dev/null
						for i in "${topFolder}"/*.jp*g; do cp "$i" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${title}/cover.jpg"; break; done
						searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'audiobook/'"${artist}"'/'"${title}"'/cover.jpg'`
					else
						/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${title}/" > /dev/null
						/usr/bin/cp /home/dietpi/MuPiBox/sysmedia/images/MuPiLogo.jpg "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/${artist}/${title}/cover.jpg"
						searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'audiobook/'"${artist}"'/'"${title}"'/cover.jpg'`
					fi
				fi


				if [ -z "${searchStrTitleCover}" ]
				then
					# Atomic-update (HIGH-8). m3u_generator runs after every
					# media-tree change; previously a jq error or partial
					# write while appending an entry truncated data.json
					# to empty — wiping every album's metadata. Tempfile
					# + rename preserves the original on failure.
					# B2: previous code spliced ${artist} and ${title} into a
					# JSON literal via shell concatenation — any artist
					# title containing `"` (e.g. an audiobook called
					# `Foo "Bar" Baz`) produced syntactically-broken JSON
					# that jq rejected, taking down the m3u-generator pass
					# and leaving data.json untouched (or, before HIGH-8,
					# truncated to empty). Use --arg so jq itself does
					# the JSON encoding — `"` in values is escaped to
					# `\"`, no breakage.
					_TMP="${DATA}.tmp.$$"
					if [ $setArtistCover == 1 ]
					then
						/usr/bin/jq \
							--arg artist "${artist}" \
							--arg title "${title}" \
							--arg cover "http://${HN}:8200/cover/audiobook/${artist}/${title}/cover.jpg" \
							--arg artistcover "http://${HN}:8200/cover/audiobook/${artist}/cover.jpg" \
							'. += [{type: "library", category: "audiobook", artist: $artist, title: $title, cover: $cover, artistcover: $artistcover}]' \
							"${DATA}" > "${_TMP}" && mv "${_TMP}" "${DATA}" || rm -f "${_TMP}"
					else
						/usr/bin/jq \
							--arg artist "${artist}" \
							--arg title "${title}" \
							--arg cover "http://${HN}:8200/cover/audiobook/${artist}/${title}/cover.jpg" \
							'. += [{type: "library", category: "audiobook", artist: $artist, title: $title, cover: $cover}]' \
							"${DATA}" > "${_TMP}" && mv "${_TMP}" "${DATA}" || rm -f "${_TMP}"
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
				ls -1v "${i}" | grep '.mp3\|.flac\|.wav\|.wma\|.ogg\|.m4a' > /tmp/playlist.m3u
				mv /tmp/playlist.m3u "${i}"
				test4images=$(ls -1v "${i}" | grep .jp*g)
				if [ ${#test4images} != 0 ]
				then
					/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${title}/" > /dev/null
					for j in "${i}"/*.jp*g; do cp "$j" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${title}/cover.jpg"; break; done
					#/usr/bin/cp --update "${i}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${title}/cover.jpg"
					searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'music/'"${artist}"'/'"${title}"'/cover.jpg'`
				else
					if [ $setArtistCover == 1 ]
					then
						/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${title}/" > /dev/null
						for i in "${topFolder}"/*.jp*g; do cp "$i" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${title}/cover.jpg"; break; done
						searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'music/'"${artist}"'/'"${title}"'/cover.jpg'`
					else
						/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${title}/" > /dev/null
						/usr/bin/cp /home/dietpi/MuPiBox/sysmedia/images/MuPiLogo.jpg "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/${artist}/${title}/cover.jpg"
						searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'music/'"${artist}"'/'"${title}"'/cover.jpg'`
					fi
				fi


				if [ -z "${searchStrTitleCover}" ]
				then
					# Atomic-update (HIGH-8) — same as the audiobook block above.
					# B2: same fix as the audiobook branch above — --arg
					# instead of shell-spliced JSON.
					_TMP="${DATA}.tmp.$$"
					if [ $setArtistCover == 1 ]
					then
						/usr/bin/jq \
							--arg artist "${artist}" \
							--arg title "${title}" \
							--arg cover "http://${HN}:8200/cover/music/${artist}/${title}/cover.jpg" \
							--arg artistcover "http://${HN}:8200/cover/music/${artist}/cover.jpg" \
							'. += [{type: "library", category: "music", artist: $artist, title: $title, cover: $cover, artistcover: $artistcover}]' \
							"${DATA}" > "${_TMP}" && mv "${_TMP}" "${DATA}" || rm -f "${_TMP}"
					else
						/usr/bin/jq \
							--arg artist "${artist}" \
							--arg title "${title}" \
							--arg cover "http://${HN}:8200/cover/music/${artist}/${title}/cover.jpg" \
							'. += [{type: "library", category: "music", artist: $artist, title: $title, cover: $cover}]' \
							"${DATA}" > "${_TMP}" && mv "${_TMP}" "${DATA}" || rm -f "${_TMP}"
					fi
				fi
			fi
		done
	done

	for topFolder in "/home/dietpi/MuPiBox/media/other/"* ; do
		artist=$(/usr/bin/basename "${topFolder}")
		setArtistCover=0
		test4images=$(ls -1v "${topFolder}" | grep .jp*g)
		if [ ${#test4images} != 0 ]
		then
			/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/other/${artist}/" > /dev/null
			for i in "${topFolder}"/*.jp*g; do cp "$i" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/other/${artist}/cover.jpg"; break; done
			#/usr/bin/cp --update "${topFolder}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/other/${artist}/cover.jpg"
			setArtistCover=1
		fi	

		for i in "${topFolder}/"* ; do
			if [[ -d ${i} ]]
			then
				searchStrTitleCover=""
				title=$(/usr/bin/basename "${i}")
				ls -1v "${i}" | grep '.mp3\|.flac\|.wav\|.wma\|.ogg\|.m4a' > /tmp/playlist.m3u
				mv /tmp/playlist.m3u "${i}"
				test4images=$(ls -1v "${i}" | grep .jp*g)
				if [ ${#test4images} != 0 ]
				then
					/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/other/${artist}/${title}/" > /dev/null
					for j in "${i}"/*.jp*g; do cp "$j" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/other/${artist}/${title}/cover.jpg"; break; done
					#/usr/bin/cp --update "${i}"/*.jp*g "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/other/${artist}/${title}/cover.jpg"
					searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'other/'"${artist}"'/'"${title}"'/cover.jpg'`
				else
					if [ $setArtistCover == 1 ]
					then
						/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/other/${artist}/${title}/" > /dev/null
						for i in "${topFolder}"/*.jp*g; do cp "$i" "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/other/${artist}/${title}/cover.jpg"; break; done
						searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'other/'"${artist}"'/'"${title}"'/cover.jpg'`
					else
						/usr/bin/mkdir -p "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/other/${artist}/${title}/" > /dev/null
						/usr/bin/cp /home/dietpi/MuPiBox/sysmedia/images/MuPiLogo.jpg "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/other/${artist}/${title}/cover.jpg"
						searchStrTitleCover=`/usr/bin/cat ${DATA} | grep 'other/'"${artist}"'/'"${title}"'/cover.jpg'`
					fi
				fi


				if [ -z "${searchStrTitleCover}" ]
				then
					# Atomic-update (HIGH-8) — same as the audiobook/music blocks above.
					# B2: same fix as the audiobook/music branches above.
					_TMP="${DATA}.tmp.$$"
					if [ $setArtistCover == 1 ]
					then
						/usr/bin/jq \
							--arg artist "${artist}" \
							--arg title "${title}" \
							--arg cover "http://${HN}:8200/cover/other/${artist}/${title}/cover.jpg" \
							--arg artistcover "http://${HN}:8200/cover/other/${artist}/cover.jpg" \
							'. += [{type: "library", category: "other", artist: $artist, title: $title, cover: $cover, artistcover: $artistcover}]' \
							"${DATA}" > "${_TMP}" && mv "${_TMP}" "${DATA}" || rm -f "${_TMP}"
					else
						/usr/bin/jq \
							--arg artist "${artist}" \
							--arg title "${title}" \
							--arg cover "http://${HN}:8200/cover/other/${artist}/${title}/cover.jpg" \
							'. += [{type: "library", category: "other", artist: $artist, title: $title, cover: $cover}]' \
							"${DATA}" > "${_TMP}" && mv "${_TMP}" "${DATA}" || rm -f "${_TMP}"
					fi
				fi
			fi
		done
	done

	/usr/bin/chown -R dietpi:dietpi /home/dietpi/MuPiBox/media/
	/usr/bin/chown -R dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/
	/usr/bin/chown dietpi:dietpi ${DATA}
	rm ${DATA_LOCK}

	bash /usr/local/bin/mupibox/add_index.sh

	echo "Cover & Playlists generated"
fi