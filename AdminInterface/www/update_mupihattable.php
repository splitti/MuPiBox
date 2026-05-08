<?php
require __DIR__ . '/includes/auth_check.php';

// MED-17: this is the chunkiest of the four — full mupihat.json dump
// (battery voltage, SOC, charge state, IBus, IBat, etc.). Auth-gate.
	$mupihat_file = '/tmp/mupihat.json';
    $string = file_get_contents($mupihat_file);
    $mupihat_data = json_decode($string, true);

    // Hier sollten die Daten im JSON-Format zurückgegeben werden
    header('Content-Type: application/json');
    echo json_encode($mupihat_data);
?>