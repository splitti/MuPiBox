#!/bin/sh
#

CONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
CONFIG_TMP="/tmp/data_tmp.json"

# Kopiere die ursprüngliche Konfigurationsdatei in eine temporäre Datei
cp ${CONFIG} ${CONFIG_TMP}

# Zähle die Anzahl der Einträge mit "category" gleich "resume"
resume_count=$(jq '[.[] | select(.category == "resume")] | length' ${CONFIG_TMP})

# Überprüfe, ob die Anzahl der "resume"-Einträge größer als 9 ist
if [ $resume_count -gt 9 ]; then
    # Lösche den ersten Eintrag mit "category" gleich "resume"
    jq 'del(.[] | select(.category == "resume") | .index | select(. == 0))' ${CONFIG_TMP} > ${CONFIG_TMP}.tmp
    mv ${CONFIG_TMP}.tmp ${CONFIG_TMP}
fi

/usr/bin/cat ${CONFIG} | grep -v '"index":' > ${CONFIG_TMP}
/usr/bin/perl -pe 'BEGIN{$k=-1};s/{/$& . "\n        \"index\": " .  ++$k . ","/e' ${CONFIG_TMP} > ${CONFIG}
/usr/bin/rm ${CONFIG_TMP}
/usr/bin/echo $(/usr/bin/jq -c . ${CONFIG}) | /usr/bin/jq . > ${CONFIG_TMP}
/usr/bin/mv ${CONFIG_TMP} ${CONFIG}
/usr/bin/chown dietpi:dietpi ${CONFIG}
