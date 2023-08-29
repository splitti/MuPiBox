#!/bin/bash
#
# Generate M3U Playlist and Covers

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
TMP_DATA="/tmp/cleaned_data.json"

echo "####    CHECKING COVER IMAGES    ####"
for i in "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/audiobook/"* ; do
	artist=$(/usr/bin/basename "${i}")
	if [[ -d "${i}" ]]
	then
		echo "[OK]    ${artist}"
		for j in "${i}/"* ; do
			album=$(/usr/bin/basename "${j}")
			if [[ ! -f ${j} ]]
			then
				if [[ -d "/home/dietpi/MuPiBox/media/audiobook/${artist}/${album}/" ]]
				then
					echo "[OK]    ${artist}/${album}/"
				else
					echo "[DEL]   ${artist}/${album}/"
					rm -R "${j}"
				fi
			fi
		done
	else
		echo "[DEL]   ${i}"
		rm -R "${i}" 
	fi
done
for i in "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/cover/music/"* ; do
	artist=$(/usr/bin/basename "${i}")
	if [[ -d "${i}" ]]
	then
		echo "[OK]    ${artist}"
		for j in "${i}/"* ; do
			album=$(/usr/bin/basename "${j}")
			if [[ ! -f ${j} ]]
			then
				if [[ -d "/home/dietpi/MuPiBox/media/music/${artist}/${album}/" ]]
				then
					echo "[OK]    ${artist}/${album}/"
				else
					echo "[DEL]   ${artist}/${album}/"
					rm -R "${j}"
				fi
			fi
		done
	else
		echo "[DEL]   ${i}"
		rm -R "${i}" 
	fi
done

readarray -t my_array < <(jq -c '.[]' ${DATA})
i=0
echo -e "\n####    CHECKING DATA.JSON    ####"
echo "[" > ${TMP_DATA}
for item in "${my_array[@]}"; do
	type=$(jq '.type' <<< "$item")
	category=$(jq '.category' <<< "$item")
	artist=$(jq '.artist' <<< "$item")
	title=$(jq '.title' <<< "$item")
	if [[ ${type:1:-1} == "library" ]]
	then
		#if [[ -d "/home/dietpi/MuPiBox/media/${category:1:-1}/${artist:1:-1}/${title:1:-1}" ]]
		#then
		#	add_item=1
		#else
			add_item=0
		#fi
	else
		add_item=1
	fi
			if [[ ${i} > 0 ]] && [[ ${add_item} > 0 ]]
			then
				echo $(sed '${s/$/,/}' ${TMP_DATA}) > ${TMP_DATA}
			fi
	i=1
	if [[ ${add_item} > 0 ]]
	then
		/usr/bin/cat <<< $(/usr/bin/jq '.' <<< $item) >> ${TMP_DATA}
		echo "[OK]    ${type:1:-1}    |    ${category:1:-1}"
	else
		echo "[DEL]   ${type:1:-1}    |    ${category:1:-1}    |    ${artist:1:-1}    |    ${title:1:-1}"		
	fi
done
echo "]" >> ${TMP_DATA}
/usr/bin/echo $(/usr/bin/jq -c . ${TMP_DATA}) | /usr/bin/jq . > ${DATA}
/usr/bin/chown dietpi:dietpi ${DATA}

bash /usr/local/bin/mupibox/add_index.sh
/usr/bin/chown dietpi:dietpi ${DATA}
