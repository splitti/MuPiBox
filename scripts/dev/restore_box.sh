#!/bin/bash
#
# Roll a MuPiBox back to a snapshot taken with backup_box.sh. Run ON THE BOX:
#
#   ssh dietpi@<box-ip> 'bash -s' /home/dietpi/mupibox-backup-<TS> < scripts/dev/restore_box.sh
#
# Or interactively after sshing in:
#
#   bash restore_box.sh /home/dietpi/mupibox-backup-<TS>
#
# Restores code (backend-api, backend-player, www/, on-box scripts).
# User-state JSONs (resume.json, data.json, mupiboxconfig.json) are listed
# at the end as suggested commands — restoring them is OPTIONAL because the
# deploy doesn't touch them. Only restore those if a release actually broke
# the data.

set -euo pipefail

if [ "${#}" -lt 1 ]; then
  echo "Usage: $0 /home/dietpi/mupibox-backup-<TS>"
  echo
  echo "Vorhandene Backups:"
  ls -dt /home/dietpi/mupibox-backup-* 2>/dev/null || echo "  (keine gefunden)"
  exit 1
fi

BACKUP_DIR="${1}"

if [ ! -d "${BACKUP_DIR}" ]; then
  echo "FEHLER: ${BACKUP_DIR} existiert nicht."
  exit 1
fi

echo "==> Quelle: ${BACKUP_DIR}"

echo "==> Stoppe Services"
pm2 stop server spotify-control || true

echo "==> Restore backend-api"
cp -a "${BACKUP_DIR}/server.js" /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server.js
rm -rf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www
cp -a "${BACKUP_DIR}/www" /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www

echo "==> Restore backend-player"
cp -a "${BACKUP_DIR}/spotify-control.js" /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js

echo "==> Restore Trim-Skripte"
[ -f "${BACKUP_DIR}/remove_max_resume.sh" ] && \
  sudo install -m 755 -o root -g root "${BACKUP_DIR}/remove_max_resume.sh" /usr/local/bin/mupibox/ \
  && echo "   remove_max_resume.sh wiederhergestellt" \
  || echo "   (kein remove_max_resume.sh im Backup)"
[ -f "${BACKUP_DIR}/clearresume.sh" ] && \
  sudo install -m 755 -o root -g root "${BACKUP_DIR}/clearresume.sh" /usr/local/bin/mupibox/ \
  && echo "   clearresume.sh wiederhergestellt" \
  || echo "   (kein clearresume.sh im Backup)"

echo "==> Starte Services"
pm2 start server spotify-control
pm2 status

echo
echo "==> Code-Rollback fertig."
echo "==> User-State wurde NICHT zurückgespielt. Falls nötig:"
echo "   cp ${BACKUP_DIR}/resume.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/"
echo "   cp ${BACKUP_DIR}/data.json   /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/"
echo "   sudo cp ${BACKUP_DIR}/mupiboxconfig.json /etc/mupibox/"
