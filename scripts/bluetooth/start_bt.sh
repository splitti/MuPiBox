#!/bin/bash
#

if grep -q '^load-module module-bluetooth-discover' /etc/pulse/system.pa; then
  echo -e "load-module module-bluetooth-discover already set" >&3 2>&3
else
  echo '' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
  echo 'load-module module-bluetooth-discover' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
fi
if grep -q '^load-module module-bluetooth-policy' /etc/pulse/system.pa; then
  echo -e "load-module module-bluetooth-policy already set" >&3 2>&3
else
  echo '' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
  echo 'load-module module-bluetooth-policy' | sudo tee -a /etc/pulse/system.pa >&3 2>&3
fi

coproc bluetoothctl
echo -e "power on\n" >&${COPROC[1]}
echo -e "agent on\n" >&${COPROC[1]}
echo -e "defaut-agent\n" >&${COPROC[1]}
echo -e 'exit' >&${COPROC[1]}
ouput=$(cat <&${COPROC[0]})
echo $output
