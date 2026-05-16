<?php
require __DIR__ . '/includes/auth_check.php';

// The backup zip exposes the bcrypt password hash from interfacelogin and
// every Spotify/Telegram credential in mupiboxconfig.json. auth_check.php
// (NOT header.php — header.php would render the admin chrome HTML before
// we get a chance to set Content-Type: application/octet-stream below)
// short-circuits with 401 for unauthenticated callers.
$command = "sudo rm /var/www/config_backup.zip; sudo zip -r /var/www/config_backup.zip /home/dietpi/MuPiBox/media/cover/* /etc/mupibox/mupiboxconfig.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json;sudo chmod 600 /var/www/config_backup.zip; sudo chown www-data:www-data /var/www/config_backup.zip";
exec($command );

//Define header information
header('Content-Description: File Transfer');
//header("Content-Encoding: gzip");
//header('Vary: Accept-Encoding');
header('Content-Type: application/octet-stream');
header("Cache-Control: no-cache, must-revalidate");
header("Expires: 0");
header("Content-Transfer-Encoding: binary");
header('Content-Disposition: attachment; filename="config_backup.zip"');
header("Content-Length: ".filesize('config_backup.zip'));
header("Content-Transfer-Encoding: binary");
header('Pragma: public');

//Clear system output buffer
flush();

ob_clean();
ob_end_flush();

//Read the size of the file
//print_r($output,true);
readfile("config_backup.zip");
//Terminate from the script
?>
