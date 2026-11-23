#!/bin/bash

# The server's own config files (config.json, monitor.json; the folders of 5.1, see scripts/mupibox/mupi_paths.sh): taken
# from the templates when missing, never over a file that is there - without config.json the server answered
# /api/sonos with "Could not load server config." and Spotify never started (the Spotify client id and secret go into
# config.json by hand, see README). docker:start mounts the host's src/backend-api/config as the library.
TEMPLATES=/home/dietpi/MuPiBoxSource/config/templates
SERVER_CONFIG=/home/dietpi/.mupibox/server/config
LIBRARY=/home/dietpi/.mupibox/data/library
mkdir -p "${SERVER_CONFIG}"
[ -f "${SERVER_CONFIG}/config.json" ] || cp "${TEMPLATES}/www.json" "${SERVER_CONFIG}/config.json"
[ -f "${SERVER_CONFIG}/monitor.json" ] || cp "${TEMPLATES}/monitor.json" "${SERVER_CONFIG}/monitor.json"

# The API serves the library from active_data.json (and the resume list from active_resume.json), symlinks that the
# box's network check (scripts/mupibox/check_network.sh) points at data.json or offline_data.json. No such service
# runs here, so they are set once, to the online files - without them the library stays empty.
cd "${LIBRARY}"
[ -f data.json ] || echo -n "[]" > data.json
[ -f resume.json ] || echo -n "[]" > resume.json
ln -sfn data.json active_data.json
ln -sfn resume.json active_resume.json

# The display takes the box for offline until /api/network says onlinestate "online" (then no radio, and the Spotify
# player is not even started). On a box the network check (check_network.sh, get_network.sh) writes /tmp/network.json;
# here it is written once with what the container has.
# (a file in server/config, not the box's symlink to /tmp)
ip=$(hostname -I | awk '{print $1}')
jq -n --arg host "$(hostname)" --arg ip "$ip" \
  '{onlinestate: "online", host: $host, ip: $ip, mac: "", wifi: "", wifilink: "", wifisignal: "", gateway: "", dns: "", subnet: "", interface: "eth0"}' \
  > "${SERVER_CONFIG}/network.json.new" && mv -f "${SERVER_CONFIG}/network.json.new" "${SERVER_CONFIG}/network.json"
cp "${SERVER_CONFIG}/network.json" /tmp/network.json
chmod 666 /tmp/network.json

cd /home/dietpi/.mupibox/server
pm2 start server.js
cd /home/dietpi/.mupibox/player
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
