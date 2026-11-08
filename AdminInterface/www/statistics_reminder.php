<?php
// Local-only marker for the once-per-month voluntary statistics reminder.
// No hardware information is gathered and nothing is sent to the statistics service.
declare(strict_types=1);
require_once __DIR__ . '/includes/save_config.php';
require_once __DIR__ . '/includes/csrf.php';
header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    exit;
}
$config = mupibox_config();
$loginRequired = !empty($config['interfacelogin']['state']) || mupibox_config_unreadable();
if ($loginRequired && (
    empty($_SESSION['logged_in'])
    || $_SESSION['logged_in'] !== true
    || (string)($_SESSION['login_epoch'] ?? '') !== (string)($config['interfacelogin']['epoch'] ?? '')
)) {
    http_response_code(403);
    exit;
}
csrf_check();
$kind = (string)($_POST['kind'] ?? 'statistics');
if (!in_array($kind, ['statistics', 'donation'], true)) {
    http_response_code(400);
    exit;
}
$noticeSettings = is_array($config['adminNotices'] ?? null) ? $config['adminNotices'] : [];
$stats = is_array($config['installationStatistics'] ?? null) ? $config['installationStatistics'] : [];
if ($kind === 'statistics') {
    if (($noticeSettings['statistics_popup_enabled'] ?? true) === true && ($stats['enabled'] ?? false) !== true) {
        $stats['last_reminder_month'] = gmdate('Y-m');
        $config['installationStatistics'] = $stats;
    }
} elseif (($noticeSettings['donation_popup_enabled'] ?? true) === true) {
    $noticeSettings['last_donation_month'] = gmdate('Y-m');
    $config['adminNotices'] = $noticeSettings;
}
if (!save_mupiboxconfig($config)) {
    http_response_code(500);
    exit;
}
http_response_code(204);
