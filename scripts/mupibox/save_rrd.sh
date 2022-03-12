#!/bin/bash
#

sudo rrdtool update /tmp/.rrd/cputemp.rrd N:$(echo $(sudo vcgencmd measure_temp) | sed 's/temp=//g' | sed  "s/[\']C//g")
sudo rrdtool update /tmp/.rrd/cpuusage.rrd N:$(awk '{print $1":"$2":"$3}' < /proc/loadavg)