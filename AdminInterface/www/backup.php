<?php
//$command = "sudo rm /var/www/backup.zip; sudo zip /var/www/backup.zip /etc/mupibox/mupiboxconfig.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json;sudo chmod 777 /var/www/backup.zip; sudo chown www-data:www-data /var/www/backup.zip";
$command = "sudo rm /var/www/backup.tar.gz; sudo tar Pvczf /var/www/backup.tar.gz /etc/mupibox/mupiboxconfig.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json; sudo chown www-data:www-data /var/www/backup.tar.gz; sudo chmod 777 /var/www/backup.tar.gz";
exec($command);

//Define header information
header('Content-Description: File Transfer');
//header("Content-Encoding: gzip");
//header('Vary: Accept-Encoding');
header('Content-Type: application/octet-stream');
header("Cache-Control: no-cache, must-revalidate");
header("Expires: 0");
header("Content-Transfer-Encoding: binary");
header('Content-Disposition: attachment; filename="backup.tar.gz"');
header("Content-Length: ".filesize('backup.tar.gz'));
header("Content-Transfer-Encoding: binary");
header('Pragma: public');

//Clear system output buffer
flush();

ob_clean();
ob_end_flush();

//Read the size of the file
//print_r($output,true);
readfile("backup.tar.gz");
//Terminate from the script
?>
