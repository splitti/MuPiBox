#!/bin/bash

cd /home/dietpi/.mupibox/Sonos-Kids-Controller-master 
pm2 start server.js
cd /home/dietpi/.mupibox/spotifycontroller-main
pm2 start spotify-control.js

/etc/init.d/lighttpd start

# Run cmd with forwarded args.
exec "$@"
