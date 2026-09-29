<?php
require __DIR__ . '/includes/auth_check.php';
require __DIR__ . '/includes/zip_download.php';

// Full backup contains every credential in mupiboxconfig.json plus the
// entire media tree. auth_check.php (header-only gate, no HTML output)
// keeps the binary download clean. The archive is built outside the web
// root and deleted after sending (see zip_download.php).
mupibox_send_zip(
	'full_backup.zip',
	'-r',
	'/home/dietpi/MuPiBox/media/* /etc/mupibox/mupiboxconfig.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json'
);
