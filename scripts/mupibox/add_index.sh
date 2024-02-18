#!/bin/sh
#

CONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
CONFIG_TMP="/tmp/data_tmp.json"

/usr/bin/cat ${CONFIG} | grep -v '"index":' > ${CONFIG_TMP}
/usr/bin/perl -pe 'BEGIN{$k=-1};s/{/$& . "\n        \"index\": " .  ++$k . ","/e' ${CONFIG_TMP} > ${CONFIG}
/usr/bin/rm ${CONFIG_TMP}
/usr/bin/echo $(/usr/bin/jq -c . ${CONFIG}) | /usr/bin/jq . > ${CONFIG_TMP}
/usr/bin/mv ${CONFIG_TMP} ${CONFIG}
/usr/bin/chown dietpi:dietpi ${CONFIG}

# Anzahl der Einträge mit der Kategorie "resume" zählen
count=$(jq '[.[] | select(.category == "resume")] | length' "$CONFIG")

# Überprüfen, ob die Anzahl größer als 9 ist
if [ $count -gt 9 ]; then
    echo "Die Anzahl der Einträge mit der Kategorie 'resume' ist größer als 9. Lösche Einträge, bis nur noch 9 übrig sind."

    # Temporäre Datei erstellen, um die Änderungen zu speichern
    cp "$CONFIG" "$CONFIG_TMP"

    # Berechne die Anzahl der Einträge, die gelöscht werden müssen
    num_to_delete=$((count - 9))

    # Lösche die ersten 'num_to_delete' Einträge mit der Kategorie "resume"
    jq --argjson num_to_delete "$num_to_delete" '(.[] | select(.category == "resume")) |= .[$num_to_delete:]' "$CONFIG_TMP" > "$CONFIG"
    
    echo "$num_to_delete Einträge mit der Kategorie 'resume' wurden gelöscht."
else
    echo "Die Anzahl der Einträge mit der Kategorie 'resume' ist nicht größer als 9."
fi