<?php
$command = "sudo rm /var/www/pm2_logs.zip; sudo zip /var/www/pm2_logs.zip /home/dietpi/.pm2/logs/*;sudo chmod 777 /var/www/pm2_logs.zip; sudo chown www-data:www-data /var/www/pm2_logs.zip";
exec($command );

//Define header information
header('Content-Description: File Transfer');
//header("Content-Encoding: gzip");
//header('Vary: Accept-Encoding');
header('Content-Type: application/octet-stream');
header("Cache-Control: no-cache, must-revalidate");
header("Expires: 0");
header("Content-Transfer-Encoding: binary");
header('Content-Disposition: attachment; filename="pm2_logs.zip"');
header("Content-Length: ".filesize('pm2_logs.zip'));
header("Content-Transfer-Encoding: binary");
header('Pragma: public');

//Clear system output buffer
flush();

ob_clean();
ob_end_flush();

//Read the size of the file
//print_r($output,true);
readfile("pm2_logs.zip");
//Terminate from the script
?>
