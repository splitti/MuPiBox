#!/bin/bash
#
# lösche alle Einträge mit Category resume.

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
TMP_DATA="/tmp/.data.json"
TMP_RESUME_CLEANED="/tmp/.temp_resume_cleaned.json"
TMP_RESUME="/tmp/.temp_resume.json"
DATA_LOCK="/tmp/.data.lock"

if [ "$EUID" -ne 0 ]
  then echo "Please run as root"
  exit
fi

if [ -f "${DATA_LOCK}" ]; then
	echo "Data-file locked."
    exit
else
	touch ${DATA_LOCK}

	# Anzahl der Einträge mit der Kategorie "resume" zählen
	count=$(jq '[.[] | select(.category == "resume")] | length' "$DATA")
	declare -i count

	# Überprüfen, ob die Anzahl größer als 9 ist
	if [ $count -gt 9 ]; then
	    echo "Die Anzahl der Einträge mit der Kategorie 'resume' ist größer als 9. Lösche Einträge, bis nur noch 9 übrig sind."

	    # Berechne die Anzahl der Einträge, die gelöscht werden müssen
	    num_to_delete=$((count - 9))

	    # Lösche die ersten 'num_to_delete' Einträge mit der Kategorie "resume"
		jq '[.[] | select(.category == "resume")]' "$DATA" > "$TMP_RESUME"
		jq --argjson num_to_delete "$num_to_delete" 'sort_by(.index) | .[$num_to_delete:]' "$TMP_RESUME" > "$TMP_RESUME_CLEANED"
		jq 'map(select(.category != "resume"))' "$DATA" > "$TMP_DATA"
		jq -s '.[0] + .[1]' "$TMP_DATA" "$TMP_RESUME_CLEANED" > "$DATA"

		sleep 1

		bash /usr/local/bin/mupibox/add_index.sh

	    echo "$num_to_delete Einträge mit der Kategorie 'resume' wurden gelöscht."
	else
	    echo "Die Anzahl der Einträge mit der Kategorie 'resume' ist nicht größer als 9."
		echo $count
	fi

	/usr/bin/chown dietpi:dietpi ${DATA}
	echo "Data.json cleaned, not more than 9"
	rm ${DATA_LOCK}
fi