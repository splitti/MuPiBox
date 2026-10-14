#!/bin/bash

# docker:start mounts the host's src/backend-api over server/: its config folder then lacks the server's own config
# files the image put there (config.json, monitor.json) - without config.json the server answered /api/sonos with
# "Could not load server config." and Spotify never started. Taken from the templates when missing, never over a file
# that is there (the Spotify client id and secret go into config.json by hand, see README).
TEMPLATES=/home/dietpi/MuPiBoxSource/config/templates
SERVER_CONFIG=/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config
mkdir -p "${SERVER_CONFIG}"
[ -f "${SERVER_CONFIG}/config.json" ] || cp "${TEMPLATES}/www.json" "${SERVER_CONFIG}/config.json"
[ -f "${SERVER_CONFIG}/monitor.json" ] || cp "${TEMPLATES}/monitor.json" "${SERVER_CONFIG}/monitor.json"

# The API serves the library from active_data.json (and the resume list from active_resume.json), symlinks that the
# box's network check (scripts/mupibox/check_network.sh) points at data.json or offline_data.json. No such service
# runs here, so they are set once, to the online files - without them the library stays empty.
cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config
[ -f data.json ] || echo -n "[]" > data.json
[ -f resume.json ] || echo -n "[]" > resume.json
ln -sfn data.json active_data.json
ln -sfn resume.json active_resume.json

# The display takes the box for offline until /api/network says onlinestate "online" (then no radio, and the Spotify
# player is not even started). On a box the network check (check_network.sh, get_network.sh) writes /tmp/network.json;
# here it is written once with what the container has.
# (a file in server/config, not the box's symlink to /tmp: with docker:start that folder is the host's
# src/backend-api/config, and a symlink into the container's /tmp would be dangling for a backend run on the host)
ip=$(hostname -I | awk '{print $1}')
jq -n --arg host "$(hostname)" --arg ip "$ip" \
  '{onlinestate: "online", host: $host, ip: $ip, mac: "", wifi: "", wifilink: "", wifisignal: "", gateway: "", dns: "", subnet: "", interface: "eth0"}' \
  > /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json
cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json /tmp/network.json
chmod 666 /tmp/network.json

cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master
pm2 start server.js
cd /home/dietpi/.mupibox/spotifycontroller-main
pm2 start spotify-control.js

# The player listens on the container's loopback only, as on a box. Docker's port mapping cannot reach that, so the
# display opened at http://localhost:8200 on the host (which talks to the player directly on localhost:5005, like
# the kiosk) would not find it. socat passes port 5005 of the container's own address (the one the port mapping
# reaches) on to the loopback listener - once the player is up, and on that address only: a wildcard listener on
# the port made the player's own bind to 127.0.0.1:5005 fail (EADDRINUSE).
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:5005/state && break; sleep 1; done
socat TCP-LISTEN:5005,bind=$(hostname -I | awk '{print $1}'),fork,reuseaddr TCP:127.0.0.1:5005 &

/etc/init.d/lighttpd start

# Run cmd with forwarded args.
exec "$@"
