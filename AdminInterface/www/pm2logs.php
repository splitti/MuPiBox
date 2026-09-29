<?php
require __DIR__ . '/includes/auth_check.php';
require __DIR__ . '/includes/zip_download.php';

// PM2 logs frequently contain stack traces with Spotify tokens / Telegram
// chatIds / etc. auth_check.php is the header-only gate (header.php would
// render HTML and corrupt the binary zip stream that follows). The archive
// is built outside the web root and deleted after sending.
mupibox_send_zip('pm2_logs.zip', '', '/home/dietpi/.pm2/logs/*');
