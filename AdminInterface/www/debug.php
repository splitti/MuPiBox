<?php
require __DIR__ . '/includes/auth_check.php';

// chrome_debug.log can contain Spotify OAuth redirect URLs (with the
// `code` parameter), Authorization headers, and console output from the
// frontend. auth_check.php gates without emitting HTML so the file
// download below still streams cleanly.
$command = "sudo cat /home/dietpi/.config/chromium/chrome_debug.log";
exec($command, $output, $result );
//Define header information
header('Content-Description: File Transfer');
header('Content-Type: application/octet-stream');
header("Cache-Control: no-cache, must-revalidate");
header("Expires: 0");
header('Content-Disposition: attachment; filename="chrome_debug.log"');
header('Pragma: public');

//Clear system output buffer
flush();

ob_clean();
ob_end_flush();

//Read the size of the file
//print_r($output,true);

foreach ($output as &$value) {
	printf( "$value".PHP_EOL );
}
//Terminate from the script
?>
