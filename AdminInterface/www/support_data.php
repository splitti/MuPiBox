<?php
$command = "sudo rm /var/www/support_data.zip";
exec( $command );
$command = "sudo rm -R /tmp/support";
exec( $command );
$command = "sudo mkdir /tmp/support";
exec( $command );
$command = "sudo chmod -R 777 /tmp/support";
exec( $command );
$command = "cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json /tmp/support/";
exec( $command );
$command = "sudo cat /etc/mupibox/mupiboxconfig.json | jq -r | grep -v username | grep -v password | grep -v deviceId | grep -v clientId | grep -v clientSecret | grep -v accessToken | grep -v refreshToken | grep -v token | grep -v chatId > /tmp/support/mupiboxconfig.json";
exec( $command );
$command = "sudo cat /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json > /tmp/support/monitor.json";
exec( $command );
$command = "sudo cat /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json | grep -v mac > /tmp/support/network.json";
exec( $command );
$command = "cat /etc/os-release | grep PRETTY_NAME >> /tmp/support/mupi.info";
exec( $command );
$command = "cat /sys/firmware/devicetree/base/model >> /tmp/support/mupi.info";
exec( $command );
$command = "echo $(hostname) >> /tmp/support/mupi.info";
exec( $command );
$command = "echo $(hostname -I) >> /tmp/support/mupi.info";
exec( $command );
$command = "echo $(uname -m) >> /tmp/support/mupi.info";
exec( $command );
$command = "echo $(librespot --version) >> /tmp/support/mupi.info";
exec( $command );
$command = "echo $(jq --version) >> /tmp/support/mupi.info";
exec( $command );
$command = "sudo chmod -R 777 /tmp/support/support";
exec( $command );
$command = "sudo zip -r /var/www/support_data.zip /tmp/support/*";
exec( $command );
$command = "sudo chmod 777 /var/www/support_data.zip; sudo chown www-data:www-data /var/www/support_data.zip";
exec( $command );

//Define header information
header('Content-Description: File Transfer');
//header("Content-Encoding: gzip");
//header('Vary: Accept-Encoding');
header('Content-Type: application/octet-stream');
header("Cache-Control: no-cache, must-revalidate");
header("Expires: 0");
header("Content-Transfer-Encoding: binary");
header('Content-Disposition: attachment; filename="support_data.zip"');
header("Content-Length: ".filesize('support_data.zip'));
header("Content-Transfer-Encoding: binary");
header('Pragma: public');

//Clear system output buffer
flush();

ob_clean();
ob_end_flush();

//Read the size of the file
//print_r($output,true);
readfile("support_data.zip");
//Terminate from the script
?>
