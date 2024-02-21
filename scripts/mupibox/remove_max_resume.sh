#!/bin/bash
#
# lösche alle Einträge mit Category resume.

RESUME="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/resume.json"
TMP_RESUME="/tmp/.resume.json"
TMP_RESUME_INDEX="/tmp/.resumeindex.json"
RESUME_LOCK="/tmp/.resume.lock"

if [ "$EUID" -ne 0 ]
  then echo "Please run as root"
  exit
fi

if [ -f "${RESUME_LOCK}" ]; then
	echo "Resume-file locked."
    exit
else
	touch ${RESUME_LOCK}

	/usr/bin/cat ${RESUME} | grep -v '"index":' > ${TMP_RESUME}
    /usr/bin/perl -pe 'BEGIN{$k=-1};s/{/$& . "\n        \"index\": " .  ++$k . ","/e' ${TMP_RESUME} > ${TMP_RESUME_INDEX}
    /usr/bin/rm ${TMP_RESUME}
    /usr/bin/echo $(/usr/bin/jq -c . ${TMP_RESUME_INDEX}) | /usr/bin/jq . > ${TMP_RESUME}
    /usr/bin/mv ${TMP_RESUME} ${RESUME}

	# Anzahl der Einträge mit der Kategorie "resume" zählen
	json_output=$(jq '[.[] | select(.category == "resume")] | length' "$RESUME")

	if [ -n "$json_output" ]; then
	    # Versuchen Sie, den Wert in eine ganze Zahl umzuwandeln
	    count=$(echo "$json_output" | awk '{print int($0)}')
	fi

	# Überprüfen, ob die Anzahl größer als 9 ist
	if [ $count -gt 9 ]; then
	    echo "Die Anzahl der Einträge mit der Kategorie 'resume' ist größer als 9. Lösche Einträge, bis nur noch 9 übrig sind."
		echo $count

	    # Berechne die Anzahl der Einträge, die gelöscht werden müssen
	    num_to_delete=$((count - 9))

	    # Lösche die ersten 'num_to_delete' Einträge mit der Kategorie "resume"
		jq --argjson num_to_delete "$num_to_delete" 'sort_by(.index) | .[$num_to_delete:]' "$RESUME" > "$TMP_RESUME"
		/usr/bin/mv ${TMP_RESUME} ${RESUME}
		/usr/bin/cat ${RESUME} | grep -v '"index":' > ${TMP_RESUME}
    	/usr/bin/perl -pe 'BEGIN{$k=-1};s/{/$& . "\n        \"index\": " .  ++$k . ","/e' ${TMP_RESUME} > ${TMP_RESUME_INDEX}
    	/usr/bin/rm ${TMP_RESUME}
    	/usr/bin/echo $(/usr/bin/jq -c . ${TMP_RESUME_INDEX}) | /usr/bin/jq . > ${TMP_RESUME}
    	/usr/bin/mv ${TMP_RESUME} ${RESUME}

	    echo "$num_to_delete Einträge mit der Kategorie 'resume' wurden gelöscht."
	else
	    echo "Die Anzahl der Einträge mit der Kategorie 'resume' ist nicht größer als 9."
		echo $count
	fi

	/usr/bin/chown dietpi:dietpi ${RESUME}
	echo "Resume.json cleaned, not more than 9"
	rm ${RESUME_LOCK}
fi