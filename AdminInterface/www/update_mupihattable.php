<?php
	$mupihat_file = '/tmp/mupihat.json';
    $string = file_get_contents($mupihat_file);
    $mupihat_data = json_decode($string, true);

    // Hier sollten die Daten im JSON-Format zurückgegeben werden
    header('Content-Type: application/json');
    echo json_encode($mupihat_data);
?>