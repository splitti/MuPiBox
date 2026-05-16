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

session_start();

$__cfgRaw = file_get_contents('/etc/mupibox/mupiboxconfig.json');
$__cfg    = json_decode($__cfgRaw, true);
$__loginRequired = !empty($__cfg['interfacelogin']['state']);
$__loggedIn      = isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true;

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
$_SESSION['last_activity'] = time();
