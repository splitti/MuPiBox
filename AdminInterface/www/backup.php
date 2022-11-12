<?php
$command = "sudo rm /var/www/backup.zip; sudo zip /var/www/backup.zip /etc/mupibox/mupiboxconfig.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json;sudo chmod 777 /var/www/backup.zip; sudo chown www-data:www-data /var/www/backup.zip";
exec($command );

//Define header information
header('Content-Description: File Transfer');
//header("Content-Encoding: gzip");
//header('Vary: Accept-Encoding');
header('Content-Type: application/octet-stream');
header("Cache-Control: no-cache, must-revalidate");
header("Expires: 0");
header("Content-Transfer-Encoding: binary");
header('Content-Disposition: attachment; filename="backup.zip"');
header("Content-Length: ".filesize('backup.zip'));
header("Content-Transfer-Encoding: binary");
header('Pragma: public');

//Clear system output buffer
flush();

ob_clean();
ob_end_flush();

//Read the size of the file
//print_r($output,true);
readfile("backup.zip");
//Terminate from the script
?>
