<?php
// Per-session CSRF helpers. Kept separate from header.php because
// header.php emits HTML chrome (DOCTYPE / head / body / topnav) before
// returning to the calling page — by the time a handler at the top of
// e.g. service.php tries to call csrf_check(), output has already
// started and `http_response_code(403)` + `header('Content-Type:')`
// fail with "Cannot modify header information - headers already sent".
//
// To CSRF-protect a destructive POST handler, do this at the very top
// of the calling file (literal example, but with PHP open/close tags
// spelled out as words to avoid breaking PHP parsing of THIS file):
//
//   open-php-tag
//   require __DIR__ . '/includes/csrf.php';
//   csrf_check();   // 403 + exit() if POST without matching token
//   include('includes/header.php');   // safe to render chrome now
//   …handlers…
//
// And in the form, echo csrf_field() output after the form open tag
// using a short echo block (open with <?= and close with the standard
// PHP close marker).

// session_start is idempotent — header.php also calls it, but a second
// call when one is already active just emits a notice (silenceable
// by the @-prefix; we leave it noticeable so misuse stays visible).
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!function_exists('csrf_token')) {
    function csrf_token(): string {
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf_token'];
    }
    function csrf_field(): string {
        return '<input type="hidden" name="csrf_token" value="' . htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') . '">';
    }
    function csrf_check(): void {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
        $submitted = $_POST['csrf_token'] ?? '';
        if (!hash_equals(csrf_token(), $submitted)) {
            http_response_code(403);
            header('Content-Type: text/plain; charset=utf-8');
            echo "CSRF token mismatch — please reload the page and try again.\n";
            exit;
        }
    }
}
