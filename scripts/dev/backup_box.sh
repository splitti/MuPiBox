#!/bin/bash
#
# Pre-deploy backup of MuPiBox state. Run ON THE BOX (DietPi):
#
#   ssh dietpi@<box-ip> 'bash -s' < scripts/dev/backup_box.sh
#
# Creates /home/dietpi/mupibox-backup-<timestamp>/ containing every file the
# deploy will replace plus the user-state JSONs (resume.json, data.json,
# mupiboxconfig.json) so a full rollback is possible. The backup directory
# is on the SD card and survives reboots — clean up with `rm -rf` once a
# new release has proven itself.

set -euo pipefail

TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/home/dietpi/mupibox-backup-${TS}"
mkdir -p "${BACKUP_DIR}"

echo "==> Backup-Ziel: ${BACKUP_DIR}"

# Code that the deploy will replace.
echo "--> backend-api (server.js + www/)"
cp -a /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server.js "${BACKUP_DIR}/"
cp -a /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www "${BACKUP_DIR}/www"

echo "--> backend-player (spotify-control.js)"
cp -a /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js "${BACKUP_DIR}/"

echo "--> on-box Trim-Skripte"
sudo cp -a /usr/local/bin/mupibox/remove_max_resume.sh "${BACKUP_DIR}/" 2>/dev/null \
  || echo "   (remove_max_resume.sh nicht vorhanden)"
sudo cp -a /usr/local/bin/mupibox/clearresume.sh "${BACKUP_DIR}/" 2>/dev/null \
  || echo "   (clearresume.sh nicht vorhanden)"

# User state — not touched by deploy, but back up anyway in case something
# goes sideways (e.g. self-heal misclassifies a working resume.json).
echo "--> User-State (resume.json, data.json, mupiboxconfig.json)"
cp -a /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/resume.json "${BACKUP_DIR}/" 2>/dev/null \
  || echo "   (resume.json fehlt — frische Box?)"
cp -a /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json "${BACKUP_DIR}/"
sudo cp -a /etc/mupibox/mupiboxconfig.json "${BACKUP_DIR}/"

# pm2-Snapshot for rollback reproducibility.
echo "--> pm2-Status-Snapshot"
pm2 ls > "${BACKUP_DIR}/pm2-status.txt" 2>&1 || true

sudo chown -R dietpi:dietpi "${BACKUP_DIR}"

echo
echo "==> Inhalt:"
ls -lah "${BACKUP_DIR}"
echo
echo "==> Größe:"
du -sh "${BACKUP_DIR}"
echo
echo "==> Backup-Pfad (für rollback_box.sh notieren):"
echo "   ${BACKUP_DIR}"
