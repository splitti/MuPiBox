<?php

// R3-B-4: previous code only called session_destroy(), which clears
// server-side session data — but the client still holds the PHPSESSID
// cookie. On next request the browser sends the old cookie, PHP
// re-creates a session under the same id (now without `logged_in`),
// and the user gets sent through the login flow as expected. Mostly
// works, but leaves a stale session id alive in the browser and
// produces inconsistent state across multi-tab use (one tab logs out,
// other tabs still hold the cookie until refreshed).
//
// Best practice: also expire the cookie client-side via setcookie()
// with an empty value and a past expiry, AND clear $_SESSION first so
// session_destroy doesn't leave any data behind even briefly.
session_start();
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'],
        $params['domain'],
        $params['secure'],
        $params['httponly']
    );
}
session_destroy();
header('Location: index.php');
exit;

?>
