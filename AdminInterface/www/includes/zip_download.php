<?php
// Builds a zip archive and sends it as a download, then deletes it.
//
// The download pages used to write fixed names into the web root (/var/www/config_backup.zip,
// full_backup.zip, pm2_logs.zip, support_data.zip) and left them there. Only the page that
// builds the archive checks the login - the file itself was then served by lighttpd as a static
// file to anyone in the LAN, and config_backup.zip holds the whole mupiboxconfig.json with all
// credentials. Now the archive is built outside the web root under a random name and removed
// right after sending (also when the browser aborts the download).
//
// /var/tmp, not /tmp: /tmp is a RAM disk of 1 GB and a full backup contains the whole media
// folder (many GB).
//
// $sources is a fixed, caller-supplied list of paths (may contain shell globs); it must never
// contain request data.

// The session's form token (the one header.php puts into every form), made if there is none yet. auth_check.php has
// closed the session already: opened again just for this and closed right after.
function mupibox_download_token(): string {
	if (empty($_SESSION['csrf_token'])) {
		if (session_status() === PHP_SESSION_NONE) {
			session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
			session_start();
		}
		if (empty($_SESSION['csrf_token'])) {
			$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
		}
		session_write_close();
	}
	return (string)$_SESSION['csrf_token'];
}

// An archive is only made for a form of the admin interface (POST with the session's token). A link on another site,
// clicked while signed in here, made the box pack one too - the full backup with the whole media folder, on in
// /var/tmp after the tab was closed (the session cookie is SameSite=Lax: such a click carries it, and over http://
// browsers send no Sec-Fetch-Site to tell it apart). Opened directly, the page only asks first. Pages that collect
// files before packing call this first themselves.
function mupibox_download_guard(string $downloadName): void {
	static $passed = false;
	if ($passed) return;
	$token = mupibox_download_token();
	if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
		header('Content-Type: text/html; charset=utf-8');
		header('Cache-Control: no-store');
		$name = htmlspecialchars($downloadName, ENT_QUOTES, 'UTF-8');
		echo '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' . $name . '</title></head>'
			. '<body style="font-family:sans-serif;max-width:32em;margin:3em auto;padding:0 1em">'
			. '<p>Create and download <b>' . $name . '</b>? A full backup can take a long time.</p>'
			. '<form method="post"><input type="hidden" name="csrf_token" value="' . htmlspecialchars($token, ENT_QUOTES, 'UTF-8') . '">'
			. '<button type="submit">Create and download</button></form></body></html>';
		exit;
	}
	$sent = $_POST['csrf_token'] ?? '';
	if (!is_string($sent) || !hash_equals($token, $sent)) {
		http_response_code(403);
		header('Content-Type: text/plain; charset=utf-8');
		echo "Downloads start from the admin interface itself - please reload it and try again.\n";
		exit;
	}
	$passed = true;
}

function mupibox_send_zip(string $downloadName, string $zipOptions, string $sources): void {
	mupibox_download_guard($downloadName);
	$path = '/var/tmp/mupibox-download-' . bin2hex(random_bytes(12)) . '.zip';
	ignore_user_abort(true);
	register_shutdown_function(function () use ($path) {
		exec('sudo rm -f ' . escapeshellarg($path));
	});

	exec('sudo zip -q ' . $zipOptions . ' ' . escapeshellarg($path) . ' ' . $sources);
	exec('sudo chown www-data:www-data ' . escapeshellarg($path) . ' && sudo chmod 600 ' . escapeshellarg($path));
	clearstatcache();
	if (!is_file($path)) {
		http_response_code(500);
		header('Content-Type: text/plain; charset=utf-8');
		echo "Could not create the archive.\n";
		exit;
	}

	while (ob_get_level() > 0) {
		ob_end_clean();
	}
	header('Content-Description: File Transfer');
	header('Content-Type: application/zip');
	header('Cache-Control: no-store');
	header('Expires: 0');
	header('Content-Disposition: attachment; filename="' . $downloadName . '"');
	header('Content-Length: ' . filesize($path));
	readfile($path);
	exit;
}
