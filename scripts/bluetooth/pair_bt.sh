#!/bin/bash
#

coproc bluetoothctl
echo -e "power on\n" >&${COPROC[1]}
echo -e "agent on\n" >&${COPROC[1]}
echo -e "defaut-agent\n" >&${COPROC[1]}
echo -e "scan on\n" >&${COPROC[1]}
sleep 10
echo -e "scan off\n" >&${COPROC[1]}
echo -e "trust $1\n" >&${COPROC[1]}
sleep 2
echo -e "pair $1\nyes\n" >&${COPROC[1]}
sleep 2
echo -e "connect $1\n" >&${COPROC[1]}
sleep 2
echo -e 'exit' >&${COPROC[1]}
ouput=$(cat <&${COPROC[0]})
echo $output
