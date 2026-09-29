#!/bin/bash
#

coproc bluetoothctl
echo -e "power on\n" >&${COPROC[1]}
echo -e "agent on\n" >&${COPROC[1]}
echo -e "default-agent\n" >&${COPROC[1]}
echo -e 'exit' >&${COPROC[1]}
output=$(cat <&${COPROC[0]})
echo $output
