<?php
require __DIR__ . '/includes/auth_check.php';

// support_data bundles config + logs + state for support. Same exposure
// concerns as pm2logs.php / fullbackup.php — require auth via the
// header-only gate (header.php would print HTML and corrupt the zip).
$command = "sudo rm -f /var/www/support_data.zip"; // left over by older versions
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
// Built outside the web root and deleted after sending (it used to stay in /var/www with mode 777,
// downloadable by anyone in the LAN). The collected files in /tmp/support go right after.
register_shutdown_function(function () {
	exec("sudo rm -rf /tmp/support");
});
require __DIR__ . '/includes/zip_download.php';
mupibox_send_zip('support_data.zip', '-r', '/tmp/support/*');
