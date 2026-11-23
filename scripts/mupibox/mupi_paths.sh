#!/bin/bash
#
# Where the box keeps its program, its data and its cache - the one place for these paths in the shell scripts
# (sourced: . /usr/local/bin/mupibox/mupi_paths.sh). The same as the server's (src/backend-api/src/paths.ts).
#
# Since 5.1 everything lies below ~/.mupibox in four folders (migrate_layout.sh moves a box over; before, program, data
# and cache were mixed in Sonos-Kids-Controller-master and spotifycontroller-main, which stay as links to server/ and
# player/):
#   server/   the program - an update replaces it; its config/ holds what the box writes for it (config.json,
#             monitor.json, network.json, wlan.json)
#   player/   the player - an update replaces it
#   data/     what the box keeps - an update never touches it: library/ (data.json, resume.json, the offline lists,
#             the episode positions ...), covers/ (of the local albums), logs/, the app's sessions, the hidden covers,
#             the NAS folder index, the play time of the day
#   cache/    what can be fetched or made again - may be emptied at any time

# (a test of migrate_layout.sh sets MUPI_HOME to a copy)
MUPI_HOME="${MUPI_HOME:-/home/dietpi/.mupibox}"
MUPI_SERVER="${MUPI_HOME}/server"
MUPI_SERVER_CONFIG="${MUPI_SERVER}/config"
MUPI_WWW="${MUPI_SERVER}/www"
MUPI_PLAYER="${MUPI_HOME}/player"
MUPI_DATA="${MUPI_HOME}/data"
MUPI_LIBRARY="${MUPI_DATA}/library"
MUPI_COVERS="${MUPI_DATA}/covers"
MUPI_LOGS="${MUPI_DATA}/logs"
MUPI_CACHE="${MUPI_HOME}/cache"
