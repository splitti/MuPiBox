#!/bin/bash
#

for f in /home/dietpi/MuPiBox/media/**/**/**/*.mp3 ; do
        title=$(mid3v2 -l "${f}" | grep "TIT2=")
        artist=$(mid3v2 -l "${f}" | grep "TALB=")
        title=${title:5}
        artist=${artist:5}
		id3tool -t "${title}" -r "${artist}" "${f}"
        #idv2 -t '${title}' -a '${artist}' '${f}' 
done
