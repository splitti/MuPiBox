#!/bin/bash
#
# lösche alle Einträge mit Category resume.

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
TMP_DATA="/tmp/.data.tmp"
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

	# Überprüfen, ob die Anzahl größer als 9 ist
	if [ $count -gt 9 ]; then
	    echo "Die Anzahl der Einträge mit der Kategorie 'resume' ist größer als 9. Lösche Einträge, bis nur noch 9 übrig sind."

	    # Temporäre Datei erstellen, um die Änderungen zu speichern
	    cp "$DATA" "$TMP_DATA"

	    # Berechne die Anzahl der Einträge, die gelöscht werden müssen
	    num_to_delete=$((count - 9))

	    # Lösche die ersten 'num_to_delete' Einträge mit der Kategorie "resume"
	    jq --argjson num_to_delete "$num_to_delete" '(.[] | select(.category == "resume")) |= .[$num_to_delete:]' "$TMP_DATA" > "$DATA"
	
	    echo "$num_to_delete Einträge mit der Kategorie 'resume' wurden gelöscht."
	else
	    echo "Die Anzahl der Einträge mit der Kategorie 'resume' ist nicht größer als 9."
	fi

	/usr/bin/chown dietpi:dietpi ${DATA}
	echo "Data.json cleaned, not more than 9"
	rm ${DATA_LOCK}
fi