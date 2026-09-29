<?php
// Header-only authentication gate for binary / XHR endpoints.
//
// Use instead of `require 'includes/header.php'` whenever the calling
// page must NOT emit HTML (file downloads with Content-Type:
// application/octet-stream, JSON/text XHR endpoints, etc.). header.php
// renders the entire admin chrome, which would land in the browser
// alongside the binary payload — exactly what produced the "unreadable
// characters in the browser" report on backup.php after CRIT-2/3/5.
//
// This file emits zero output:
//   - reads mupiboxconfig.json (read-only)
//   - starts a session
//   - sends 401 + plain-text body and exit()s if not authenticated
//   - returns silently otherwise
//
// Auth logic mirrors header.php's gate at line ~100 verbatim.

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

$__cfgRaw = file_get_contents('/etc/mupibox/mupiboxconfig.json');
$__cfg    = json_decode($__cfgRaw, true);
$__loginRequired = !empty($__cfg['interfacelogin']['state']);
$__loggedIn      = isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true;

// Same idle timeout as header.php (60 min), checked BEFORE last_activity is bumped below: this
// gate used to accept an expired session and refresh it, so a session header.php had already
// timed out came back to life through any download or XHR endpoint.
// signed out elsewhere (interfacelogin.epoch changed, see header.php)
if ($__loggedIn && ($_SESSION['login_epoch'] ?? '') !== (string)($__cfg['interfacelogin']['epoch'] ?? '')) {
    session_unset();
    session_destroy();
    $__loggedIn = false;
}
if ($__loggedIn && isset($_SESSION['last_activity']) && time() - $_SESSION['last_activity'] > 60 * 60) {
    session_unset();
    session_destroy();
    $__loggedIn = false;
}

if ($__loginRequired && !$__loggedIn) {
    http_response_code(401);
    header('Content-Type: text/plain; charset=utf-8');
    // Hint to the browser that the admin UI's login form lives at /index.php
    // — useful when an XHR sees 401 and needs to redirect.
    header('X-Login-URL: /index.php');
    echo "Authentication required. Open /index.php first to sign in.\n";
    exit;
}

// Session is fresh — bump last_activity so the timeout in header.php
// stays in sync when the user navigates back into the HTML pages.
// Background polls (header icons every 5 s) set $AUTH_CHECK_NO_TOUCH: they must not
// count as activity, otherwise an open admin tab would never reach the idle timeout.
if (empty($AUTH_CHECK_NO_TOUCH)) {
    $_SESSION['last_activity'] = time();
}

// None of the endpoints behind this gate writes the session afterwards. Release the
// session lock now: PHP holds it for the whole request, and the icon polls would
// otherwise queue behind any slow page of the same browser (e.g. a hanging
// bluetoothctl) and pile up php-fpm workers until the admin interface stalls.
session_write_close();
