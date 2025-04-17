<?php
$logfiles = [
    'server-error' => '/home/dietpi/.pm2/logs/server-error.log',
    'server-out' => '/home/dietpi/.pm2/logs/server-out.log',
];

$services = ['pm2', 'mupibox', 'nginx'];

$mode = $_GET['mode'] ?? null;

switch ($mode) {
    case 'log':
        $logKey = $_GET['log'] ?? '';
        $grep = $_GET['grep'] ?? '';
        if (!isset($logfiles[$logKey])) {
            http_response_code(400);
            echo "❌ Unbekannte Logdatei.";
            exit;
        }

        $file = $logfiles[$logKey];
        $cmd = "tail -n 100 " . escapeshellarg($file);
        if (!empty($grep)) {
            $cmd .= " | grep -i " . escapeshellarg($grep);
        }
        echo shell_exec($cmd);
        break;

    case 'download':
        $logKey = $_GET['log'] ?? '';
        $grep = $_GET['grep'] ?? '';
        if (!isset($logfiles[$logKey])) {
            http_response_code(400);
            echo "❌ Unbekannte Logdatei.";
            exit;
        }

        $file = $logfiles[$logKey];
        $cmd = "tail -n 500 " . escapeshellarg($file);
        if (!empty($grep)) {
            $cmd .= " | grep -i " . escapeshellarg($grep);
        }

        header('Content-Type: text/plain');
        header('Content-Disposition: attachment; filename="' . basename($file) . '"');
        echo shell_exec($cmd);
        break;

    case 'status':
        $service = $_GET['service'] ?? '';
        if (!in_array($service, $services)) {
            http_response_code(400);
            echo "❌ Unbekannter Dienst.";
            exit;
        }

        echo shell_exec("systemctl status " . escapeshellarg($service) . " --no-pager");
        break;

    case 'control':
        $service = $_GET['service'] ?? '';
        $action = $_GET['action'] ?? '';

        if (!in_array($service, $services) || !in_array($action, ['start', 'stop', 'restart'])) {
            http_response_code(400);
            echo "❌ Ungültiger Befehl.";
            exit;
        }

        // Achtung: sudo-Rechte vorausgesetzt!
        $output = shell_exec("sudo systemctl $action " . escapeshellarg($service) . " 2>&1");
        echo "🔧 Befehl: systemctl $action $service\n\n" . $output;
        break;

    default:
        http_response_code(400);
        echo "❌ Ungültiger Modus.";
        break;
}
