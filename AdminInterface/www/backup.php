<?php
require __DIR__ . '/includes/auth_check.php';
require __DIR__ . '/includes/zip_download.php';

// The backup zip exposes the bcrypt password hash from interfacelogin and
// every Spotify/Telegram credential in mupiboxconfig.json. auth_check.php
// (NOT header.php — header.php would render the admin chrome HTML before
// we get a chance to set Content-Type: application/octet-stream below)
// short-circuits with 401 for unauthenticated callers. The archive is built
// outside the web root and deleted after sending (see zip_download.php).
mupibox_send_zip(
	'config_backup.zip',
	'-r',
	'/home/dietpi/MuPiBox/media/cover/* /etc/mupibox/mupiboxconfig.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json'
);
