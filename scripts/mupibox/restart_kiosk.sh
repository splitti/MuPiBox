#!/bin/bash
#
sudo killall chromium
sleep 2
/var/lib/dietpi/dietpi-software/installed/./chromium-autostart.sh >/dev/null 2>/dev/null &
echo "Chromium-Browser Kiosk restartet"
