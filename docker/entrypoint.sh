#!/bin/bash

# Create some files we need.
# echo '{
# 	"ip": "",
#         "host": "",
#         "wifi": "",
#         "wifisignal": "",
#         "wifilink": ""
# }' > /tmp/network.json

# services="mupi_check_internet mupi_change_checker librespot smbd mupi_startstop pulseaudio"

# for service_file in ${services}; do
#   full_service_file=/etc/systemd/system/${service_file}.service
#   if [ -f "$service_file" ]; then
#     # Extract the ExecStart command from the service file
#     exec_start=$(grep -E '^ExecStart=' "$service_file" | cut -d'=' -f2)

#     if [ -n "$exec_start" ]; then
#       echo "Starting service defined in $service_file: $exec_start"
#       bash -c "$exec_start"
#     else
#       echo "No ExecStart command found in $service_file"
#     fi
#   fi
# done

# bash -c /usr/local/bin/mupibox/startup.sh

# # Start js servers (and box frontend served by them).
# pm2 resurrect



# service mupi_wifi start
# service mupi_check_internet start
# service mupi_check_monitor start
# service mupi_change_checker start
# service mupi_idle_shutdown start
# service librespot start

# service smbd start
# service mupi_startstop start
# service pulseaudio start
# service mupi_splash start
# service mupi_powerled start
# service dietpi-dashboard start

cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master 
pm2 start server.js
cd /home/dietpi/.mupibox/spotifycontroller-main
pm2 start spotify-control.js

/etc/init.d/lighttpd start

# Run cmd with forwarded args.
exec "$@"
