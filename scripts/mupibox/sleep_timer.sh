#!/bin/bash
#
# Sleep timer script; sleeptimer in seconds

sleeptimer=$1
currtime=0
sec2sleep=1

echo ${sleeptimer} > /tmp/.time2sleep

CONFIG="/etc/mupibox/mupiboxconfig.json"
wled_active=$(/usr/bin/jq -r .wled.active ${CONFIG})
wled_baud_rate=$(/usr/bin/jq -r .wled.baud_rate ${CONFIG})
wled_com_port=$(/usr/bin/jq -r .wled.com_port ${CONFIG})
if [ "${wled_active}" = "true" ]; then
wled_data='{"nl":{"dur":'$((sleeptimer/60))'}},{"nl":{"on":true}},{"v":true}'
sudo python3 /usr/local/bin/mupibox/wled.py $wled_com_port $wled_baud_rate $wled_data
fi

while (( ${sleeptimer} >= ${currtime} )); do
	sleep ${sec2sleep}
	currtime=$((${currtime}+${sec2sleep}))
	resttime=$((${sleeptimer}-${currtime}))
	echo ${resttime} > /tmp/.time2sleep
done

poweroff
