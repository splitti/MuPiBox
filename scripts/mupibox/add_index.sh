#!/bin/sh
#

CONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
CONFIG_TMP="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data_tmp.json"


/usr/bin/cat ${CONFIG} | grep -v '        "index":' > ${CONFIG_TMP}
/usr/bin/perl -pe 'BEGIN{$k=-1};s/{/$& . "\n        \"index\": " .  ++$k . ","/e' ${CONFIG_TMP} > ${CONFIG}
rm ${CONFIG_TMP}
