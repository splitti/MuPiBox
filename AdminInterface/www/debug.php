<?php
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
