<?php
$logfiles = [
    'server-error' => '/home/dietpi/.pm2/logs/server-error.log',
    'server-out' => '/home/dietpi/.pm2/logs/server-out.log',
    'spotify-control-error' => '/home/dietpi/.pm2/logs/spotify-control-error.log',
    'spotify-control-out' => '/home/dietpi/.pm2/logs/spotify-control-out.log',
    'shutdown_control' => '/tmp/shutdown_control.log',
    'idle_shutdown' => '/tmp/idle_shutdown.log'
];

$services = ['mupi_autoconnect_bt.service', 'mupi_autoconnect-wifi.service', 'mupi_check_internet.service', 'mupi_check_monitor.service', 'mupi_fan.service', 'mupi_hat_control.service', 'mupi_hat.service', 'mupi_idle_shutdown.service', 'mupi_mqtt.service', 'mupi_novnc.service', 'mupi_powerled.service', 'mupi_splash.service', 'mupi_startstop.service', 'mupi_telegram.service', 'mupi_vnc.service', 'mupi_wifi.service', 'pm2-dietpi.service', 'samba-ad-dc.service', 'wpa_supplicant.service', 'proftpd.service'];

$mode = $_GET['mode'] ?? '';
$key = $_GET['key'] ?? '';
$grep = $_GET['grep'] ?? '';

switch ($mode) {
    case 'log':
        if (!isset($logfiles[$key])) {
            http_response_code(400);
            echo "❌ Unkown Log.";
            exit;
        }
        $cmd = "tail -n 100 " . escapeshellarg($logfiles[$key]);
        if ($grep) $cmd .= " | grep -i " . escapeshellarg($grep);
        echo shell_exec($cmd);
        break;

    case 'status':
        if (!in_array($key, $services)) {
            http_response_code(400);
            echo "❌ Unkown Service.";
            exit;
        }
        echo shell_exec("sudo systemctl status " . escapeshellarg($key) . " --no-pager");
        break;

    case 'download':
        if (!isset($logfiles[$key])) {
            http_response_code(400);
            echo "❌ Unkown Log.";
            exit;
        }
        $cmd = "tail -n 500 " . escapeshellarg($logfiles[$key]);
        if ($grep) $cmd .= " | grep -i " . escapeshellarg($grep);
        header('Content-Type: text/plain');
        header('Content-Disposition: attachment; filename="' . basename($logfiles[$key]) . '"');
        echo shell_exec($cmd);
        break;

    default:
        http_response_code(400);
        echo "❌ Invalid Mode.";
}
