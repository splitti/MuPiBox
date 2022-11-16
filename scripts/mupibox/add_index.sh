#!/bin/sh
#

CONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
CONFIG_TMP="/tmp/data_tmp.json"


/usr/bin/cat ${CONFIG} | grep -v '"index":' > ${CONFIG_TMP}
/usr/bin/perl -pe 'BEGIN{$k=-1};s/{/$& . "\n        \"index\": " .  ++$k . ","/e' ${CONFIG_TMP} > ${CONFIG}
/usr/bin/rm ${CONFIG_TMP}
/usr/bin/echo $(/usr/bin/jq -c . ${CONFIG}) | /usr/bin/jq . > ${CONFIG_TMP}
/usr/bin/mv ${CONFIG_TMP} ${CONFIG}