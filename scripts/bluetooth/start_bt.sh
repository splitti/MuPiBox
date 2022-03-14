#!/bin/bash
#

coproc bluetoothctl
echo -e "power on\n" >&${COPROC[1]}
echo -e "agent on\n" >&${COPROC[1]}
echo -e "defaut-agent\n" >&${COPROC[1]}
echo -e 'exit' >&${COPROC[1]}
ouput=$(cat <&${COPROC[0]})
echo $output
