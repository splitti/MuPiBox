#!/bin/bash
#

if [ -e "/usr/local/bin/pm2" ]; then
	sudo sh -c 'su - dietpi -s /usr/local/bin/pm2 restart server'
	sudo sh -c 'su - dietpi -s /usr/local/bin/pm2 restart spotify-control'
fi
if [ -e "/usr/bin/pm2" ]; then
	sudo sh -c 'su - dietpi -s /usr/bin/pm2 restart server'
	sudo sh -c 'su - dietpi -s /usr/bin/pm2 restart spotify-control'
fi
echo "Spotify Services restarted"
