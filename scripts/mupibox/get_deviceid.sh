#!/bin/bash
# DEPRECATED 2026-09-20: no script, service or admin page runs it any more (Spotify devices are read by the player backend itself).
# Kept for reference; nothing in MuPiBox calls it. Safe to delete.
#
# HOSTNAME

CONFIG="/etc/mupibox/mupiboxconfig.json"
HOSTNAME=$(sudo /usr/bin/jq -r .mupibox.host ${CONFIG})
DEVICES=$(curl --max-time 8 http://127.0.0.1:5005/getDevices 2>/dev/null)
sudo echo $DEVICES > /tmp/.spotify_devices