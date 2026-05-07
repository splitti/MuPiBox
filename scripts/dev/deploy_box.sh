#!/bin/bash
#
# Atomic-ish deploy of a freshly built deploy.zip to the box. Run ON THE BOX:
#
#   bash deploy_box.sh /home/dietpi/mupibox-backup-<TS>
#
# Or pipe via SSH from the dev machine:
#
#   cmd /c "ssh dietpi@<box-ip> bash -s -- <backup-dir> < scripts\dev\deploy_box.sh"
#
# Prerequisites (uploaded by the dev machine before this runs):
#   /tmp/deploy.zip
#   /tmp/remove_max_resume.sh   (optional — only if changed)
#   /tmp/clearresume.sh         (optional — only if changed)
#
# Behaviour:
#   - Verifies the backup exists (so rollback is possible)
#   - Verifies deploy.zip contains the expected files (server.js,
#     spotify-control.js, www/index.html) before touching anything
#   - Restores the user-customised www/ files (active_theme.css, cover/,
#     theme-data/) from the backup INTO the new www/ before swapping —
#     theme + cover artwork + custom background survive the deploy
#   - Restarts pm2 services
#   - Cleans up its staging dir
#
# Does NOT touch user-state JSONs (resume.json, data.json,
# mupiboxconfig.json) — those persist across deploys by design.

set -euo pipefail

if [ "${#}" -lt 1 ]; then
  echo "Usage: $0 /home/dietpi/mupibox-backup-<TS>"
  echo
  echo "Verfügbare Backups:"
  ls -dt /home/dietpi/mupibox-backup-* 2>/dev/null || echo "  (keine — erst backup_box.sh laufen lassen)"
  exit 1
fi

BACKUP_DIR="${1}"
DEPLOY_ZIP="/tmp/deploy.zip"
TRIM_SCRIPTS_DIR="/tmp"

if [ ! -d "${BACKUP_DIR}" ]; then
  echo "FEHLER: Backup ${BACKUP_DIR} nicht gefunden. Erst backup_box.sh laufen lassen."
  exit 1
fi
if [ ! -f "${DEPLOY_ZIP}" ]; then
  echo "FEHLER: ${DEPLOY_ZIP} fehlt. Erst per scp hochladen:"
  echo "   scp src/deploy.zip dietpi@<box>:/tmp/"
  exit 1
fi

WORK_DIR="/tmp/mupibox-deploy-staging-$(date +%s)"
mkdir -p "${WORK_DIR}"
trap 'rm -rf "${WORK_DIR}"' EXIT

echo "==> Entpacke ${DEPLOY_ZIP} nach ${WORK_DIR}"
# PowerShell's Compress-Archive writes backslash separators which trips
# unzip's exit-1 "warning" — files still extract correctly, but set -e
# would otherwise abort the deploy. Treat exit codes 0 and 1 as success;
# 2+ are real failures (CRC, missing files, etc.).
set +e
unzip -q "${DEPLOY_ZIP}" -d "${WORK_DIR}"
unzip_rc=$?
set -e
if [ "${unzip_rc}" -ge 2 ]; then
  echo "FEHLER: unzip fehlgeschlagen mit Exit-Code ${unzip_rc}"
  exit 1
fi

for f in "${WORK_DIR}/server.js" "${WORK_DIR}/spotify-control.js" "${WORK_DIR}/www/index.html"; do
  if [ ! -f "${f}" ]; then
    echo "FEHLER: ${f} fehlt nach dem Entpacken — Build kaputt oder ZIP-Pfade falsch?"
    echo "   Inhalt von ${WORK_DIR}:"
    ls -la "${WORK_DIR}"
    exit 1
  fi
done
echo "   server.js, spotify-control.js, www/index.html vorhanden ✓"

echo "==> Stoppe Services"
pm2 stop server spotify-control || true

echo "==> Übernehme User-Anpassungen aus dem Backup ins neue www/"
# active_theme.css: vom Admin-UI generiertes Theme
# cover/ : Cover lokaler Hörbücher (oder Symlink auf MuPiBox/media)
# theme-data/ : Hintergrund-Bilder für Custom-Themes
for item in active_theme.css cover theme-data; do
  if [ -e "${BACKUP_DIR}/www/${item}" ]; then
    cp -a "${BACKUP_DIR}/www/${item}" "${WORK_DIR}/www/"
    echo "   ${item} aus Backup übernommen"
  else
    echo "   (${item} nicht im Backup, überspringe)"
  fi
done

echo "==> Backend-API: server.js + www/"
cp -f "${WORK_DIR}/server.js" /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server.js
rm -rf /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www
cp -a "${WORK_DIR}/www" /home/dietpi/.mupibox/Sonos-Kids-Controller-master/

echo "==> Backend-Player: spotify-control.js"
cp -f "${WORK_DIR}/spotify-control.js" /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js

echo "==> Trim-Skripte (falls in ${TRIM_SCRIPTS_DIR})"
for s in remove_max_resume.sh clearresume.sh; do
  if [ -f "${TRIM_SCRIPTS_DIR}/${s}" ]; then
    sudo install -m 755 -o root -g root "${TRIM_SCRIPTS_DIR}/${s}" /usr/local/bin/mupibox/
    echo "   ${s} installiert"
  else
    echo "   (${s} nicht in ${TRIM_SCRIPTS_DIR} — überspringe)"
  fi
done

echo "==> Admin-Interface PHP (falls smart.php in ${TRIM_SCRIPTS_DIR})"
if [ -f "${TRIM_SCRIPTS_DIR}/smart.php" ]; then
  sudo install -m 644 -o dietpi -g dietpi "${TRIM_SCRIPTS_DIR}/smart.php" /var/www/smart.php
  echo "   smart.php installiert"
else
  echo "   (smart.php nicht in ${TRIM_SCRIPTS_DIR} — überspringe)"
fi

echo "==> Telegram-Skripte (falls in ${TRIM_SCRIPTS_DIR}/telegram_*.py)"
shopt -s nullglob
telegram_files=("${TRIM_SCRIPTS_DIR}"/telegram_*.py)
shopt -u nullglob
if [ "${#telegram_files[@]}" -gt 0 ]; then
  for s in "${telegram_files[@]}"; do
    sudo install -m 755 -o root -g root "${s}" /usr/local/bin/mupibox/
    echo "   $(basename "${s}") installiert"
  done
  # Restart the receiver so the new code (multi-chat-auth, /limit set) takes effect.
  if systemctl list-unit-files mupi_telegram.service >/dev/null 2>&1; then
    sudo systemctl restart mupi_telegram.service \
      && echo "   mupi_telegram.service neu gestartet" \
      || echo "   WARN: mupi_telegram.service-Restart fehlgeschlagen"
  fi
else
  echo "   (keine telegram_*.py in ${TRIM_SCRIPTS_DIR} — überspringe)"
fi

echo "==> Starte Services"
pm2 start server spotify-control
pm2 status

echo
echo "==> Deploy fertig. Jetzt:"
echo "   1. Browser/Kiosk auf der Box neu laden (Touchscreen Reload-Geste oder Reboot)"
echo "   2. Live-Verifikation:"
echo "      - Spotify-Resume-Karte → Position?"
echo "      - Library-Resume bei Track 10+ → kein Tick-Tick?"
echo "      - Cap-Transition während Home-Page → Resume-Karte danach da?"
echo "      - Hörbuch durchgelaufen → Resume-Karte weg?"
echo "      - Alte Resume-Einträge → klickbar?"
echo
echo "==> Bei Problemen Rollback:"
echo "   bash restore_box.sh ${BACKUP_DIR}"
