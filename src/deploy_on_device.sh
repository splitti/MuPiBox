#!/bin/bash

rm -rf ./deploy
npm run build

# Pause execution to see if the build process worked
read -p "Press Enter to resume ..."

# Fix folder structure and add readme.
mv ./deploy/www/browser/* ./deploy/www
cp ./backend-player/README.md ./deploy/

# The display's files in the program's folder (since 5.1 ~/.mupibox/server - the library, the covers and the cache lie
# in data/ and cache/ and stay as they are): what the box keeps there - the theme link, the links of the covers and of
# the podcasts' pictures, the theme pictures - is kept.
WWW=/home/dietpi/.mupibox/server/www
mkdir -p /tmp/www_keep
for item in active_theme.css cover rss-covers theme-data mupi.png; do
	[ -e "${WWW}/${item}" ] || [ -L "${WWW}/${item}" ] && mv "${WWW}/${item}" /tmp/www_keep/
done

# Remove old page and copy new one.
rm -rf "${WWW}"
mkdir -p "${WWW}"
cp -a ./deploy/www/. "${WWW}/"
# TODO: Deploy server and restart them.

mv /tmp/www_keep/* /tmp/www_keep/.[!.]* "${WWW}/" 2>/dev/null
rmdir /tmp/www_keep

# Restart browser.
sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh
