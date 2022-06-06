#!/bin/sh
#

CONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"

/usr/bin/echo "$(/usr/bin/cat ${CONFIG} | grep -v '        "index":')" > ${CONFIG}
/usr/bin/echo "$(/usr/bin/perl -pe 'BEGIN{$k=-1};s/{/$& . "\n        \"index\": \"" .  ++$k . "\""/e' ${CONFIG})" > ${CONFIG}
