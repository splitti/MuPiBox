<?php
	// USB WiFi drivers offered on the Network page: which chipset, where it lands once
	// installed (used to show install state), and where the install/remove scripts live.
	$usb_wifi_drivers = array(
		'RTL88X2BU' => array(
			'label' => 'RTL88X2BU',
			'module' => '88x2bu',
			'path' => '/home/dietpi/.driver/network/88x2bu-20210702',
			'install_url' => 'https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/online/install_rtl88x2bu.sh',
			'remove_url' => 'https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/online/remove_rtl88x2bu.sh',
			),
		'RTL8821AU' => array(
			'label' => 'RTL8821AU',
			'module' => '8821au',
			'path' => '/home/dietpi/.driver/network/8821au-20210708',
			'install_url' => 'https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/online/install_rtl8821au.sh',
			'remove_url' => 'https://raw.githubusercontent.com/splitti/MuPiBox/main/scripts/online/remove_rtl8821au.sh',
			),
		);

	// Asked by the driver dropdown's onchange (fetch, not a form submit) so picking a
	// different driver updates "State: ..." and the button label without reloading the
	// whole page (that used to also re-scan the embedded WiFi iframe and jump the scroll).
	if (isset($_GET['check_usb_wifi_driver'])) {
		// comes before header.php, so it needs the login gate of its own (sends 401 and exits without a login)
		require __DIR__ . '/includes/auth_check.php';
		$checked_driver = (string)$_GET['check_usb_wifi_driver'];
		$installed = isset($usb_wifi_drivers[$checked_driver]) && is_dir($usb_wifi_drivers[$checked_driver]['path']);
		header('Content-Type: application/json');
		echo json_encode(array('installed' => $installed));
		exit;
	}

	include ('includes/header.php');
	// the WiFi adapter in use (a USB adapter if there is one, else the onboard one)
	$WIFI_IF = trim((string) shell_exec('/usr/local/bin/mupibox/mupi_wifi_iface.sh'));
	if ($WIFI_IF === '') { $WIFI_IF = 'wlan0'; }
	$commandM0="cat /sys/class/net/".$WIFI_IF."/address";
	$MAC0=exec($commandM0);
	$commandS0="/sbin/ifconfig ".$WIFI_IF." | awk '/netmask/{split($4,a,\":\"); print a[1]}'";
	$SUBNET0=exec($commandS0);
	$commandG0="sudo route -n | grep 'UG[ \t]' | awk '{print $2}'";
	$GATEWAY0=exec($commandG0);
	$commandD="echo $(sudo cat /etc/resolv.conf | grep 'nameserver ') | sed 's/nameserver //g'";
	$DNS=exec($commandD);
	/*$commandW="sudo iwgetid -r";
	$WIFI=exec($commandW);
	$commandL="sudo iwconfig ".$WIFI_IF." | awk '/Link Quality/{split($2,a,\"=|/\");print int((a[2]/a[3])*100)\"%\"}'";
	$LINKQ=exec($commandL);*/
	$commandS="sudo iwconfig ".$WIFI_IF." | awk '/Signal level/{split($4,a,\"=|/\");print a[2]\" dBm\"}'";
	$SIGNAL=exec($commandS);
	$commandB="sudo iwconfig ".$WIFI_IF." | awk '/Bit Rate/{split($2,a,\"=|/\");print a[2]\" Mb/s\"}'";
	$BITRATE=exec($commandB);

	$usb_wifi_driver = isset($_POST['usb_wifi_driver']) && isset($usb_wifi_drivers[$_POST['usb_wifi_driver']]) ? $_POST['usb_wifi_driver'] : 'RTL88X2BU';

	if( $_POST['USB_WIFI_DRIVER'] == "Install driver" )
		{
		$command = "cd; curl -L ".$usb_wifi_drivers[$usb_wifi_driver]['install_url']." | sudo su dietpi -c bash";
		exec($command, $output, $result );

		$change=1;
		if (file_exists("/tmp/driver-install.txt"))
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>Kernel-headers not installed. Please check correct arm_64bit-setting in /boot/config.txt (in V7, the setting must be 0).</li>";
			}
		else
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>Driver installed</li>";
			}
		}
	if( $_POST['USB_WIFI_DRIVER'] == "Remove driver" )
		{
		$command = "cd; curl -L ".$usb_wifi_drivers[$usb_wifi_driver]['remove_url']." | sudo su dietpi -c bash";
		exec($command, $output, $result );

		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Driver removed</li>";
		}
	// Power saving of an installed USB WiFi adapter: the rtw_power_mgnt option of its driver (RTL88X2BU or
	// RTL8821AU) in /etc/modprobe.d/<module>.conf (0 = off, 1 = minimal, 2 = maximum). The driver reads it
	// when it is loaded, so a change is active after the next boot.
	$usb_power_labels = array('0' => 'Off', '1' => 'Minimal', '2' => 'Maximum');
	$usb_power_key = isset($_POST['save_usb_wifi_power']) ? (string) $_POST['save_usb_wifi_power'] : '';
	if( isset($usb_wifi_drivers[$usb_power_key]) && isset($_POST['usb_wifi_power_' . $usb_power_key]) && is_string($_POST['usb_wifi_power_' . $usb_power_key]) && isset($usb_power_labels[$_POST['usb_wifi_power_' . $usb_power_key]]) )
		{
		$usb_power_module = $usb_wifi_drivers[$usb_power_key]['module'];
		$usb_power_conf = '/etc/modprobe.d/' . $usb_power_module . '.conf';
		$usb_power_new = (string) $_POST['usb_wifi_power_' . $usb_power_key];
		$usb_power_text = is_file($usb_power_conf) ? (string) file_get_contents($usb_power_conf) : '';
		if( $usb_power_text === '' )
			{
			$command = 'echo ' . escapeshellarg('options ' . $usb_power_module . ' rtw_power_mgnt=' . $usb_power_new) . ' | sudo tee ' . escapeshellarg($usb_power_conf) . ' > /dev/null';
			}
		elseif( preg_match('/^options\s+' . $usb_power_module . '\b[^\n]*\brtw_power_mgnt=/m', $usb_power_text) )
			{
			$command = "sudo /usr/bin/sed -i -E '/^options[[:space:]]+" . $usb_power_module . "/ s/rtw_power_mgnt=[0-9]+/rtw_power_mgnt=" . $usb_power_new . "/' " . escapeshellarg($usb_power_conf);
			}
		elseif( preg_match('/^options\s+' . $usb_power_module . '\b/m', $usb_power_text) )
			{
			$command = "sudo /usr/bin/sed -i -E '/^options[[:space:]]+" . $usb_power_module . "/ s/\$/ rtw_power_mgnt=" . $usb_power_new . "/' " . escapeshellarg($usb_power_conf);
			}
		else
			{
			$command = 'echo ' . escapeshellarg('options ' . $usb_power_module . ' rtw_power_mgnt=' . $usb_power_new) . ' | sudo tee -a ' . escapeshellarg($usb_power_conf) . ' > /dev/null';
			}
		exec($command, $output, $result );
		$change=1; // shows the notice box
		if( $result == 0 )
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>Power management of the ".$usb_wifi_drivers[$usb_power_key]['label']." driver set to: ".$usb_power_labels[$usb_power_new].". Active after the next reboot.</li>";
			}
		else
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>Power management of the ".$usb_wifi_drivers[$usb_power_key]['label']." driver could not be saved.</li>";
			}
		}

	if( $_POST['change_vnc'] == "stop & disable" )
		{
		exec("sudo systemctl stop mupi_vnc.service");
		exec("sudo systemctl stop mupi_novnc.service");
		exec("sudo systemctl disable mupi_vnc.service");
		exec("sudo systemctl disable mupi_novnc.service");
		exec("sudo apt-get remove x11vnc websockify -y");
		exec("sudo pkill websockify");		
		exec("sudo rm -R /usr/share/novnc");
		exec("sudo su - -c \"/usr/bin/cat <<< $(/usr/bin/jq --arg v \"0\" '.tweaks.vnc = $v' /etc/mupibox/mupiboxconfig.json) >  /etc/mupibox/mupiboxconfig.json\"");
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>VNC-Services disabled</li>";
		}
	else if( $_POST['change_vnc'] == "enable & start" )
		{
		exec("sudo apt-get install x11vnc websockify -y");
		exec("sudo git clone https://github.com/novnc/noVNC.git /usr/share/novnc");
		exec("sudo chown -R dietpi:dietpi /usr/share/novnc");
		exec("sudo systemctl enable mupi_vnc.service");
		exec("sudo systemctl enable mupi_novnc.service");
		exec("sudo systemctl start mupi_vnc.service");
		exec("sudo systemctl start mupi_novnc.service");		
		exec("sudo su - -c \"/usr/bin/cat <<< $(/usr/bin/jq --arg v \"1\" '.tweaks.vnc = $v' /etc/mupibox/mupiboxconfig.json) >  /etc/mupibox/mupiboxconfig.json\"");
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>VNC-Services enabled and started</li>";
		}

	if( $_POST['change_dhcp_timeout'] == "enable" )
		{
		$command = "sudo /usr/bin/sed -i 's/#timeout 60;/timeout 10;/g' /etc/dhcp/dhclient.conf";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>DHCP-Timeout set to 10 seconds</li>";
		}
	else if( $_POST['change_dhcp_timeout'] == "disable" )
		{
		$command = "sudo /usr/bin/sed -i 's/timeout 10;/#timeout 60;/g' /etc/dhcp/dhclient.conf";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>DHCP-Timeout set to default</li>";
		}
		
	if( $_POST['change_samba'] == "enable & start" )
		{
		$command = "sudo apt-get install samba wsdd -y && sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf && sudo systemctl enable smbd.service && sudo systemctl start smbd.service && (echo 'mupibox'; echo 'mupibox') | sudo smbpasswd -s -a 'dietpi'";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Samba enabled</li>";
		}
	else if( $_POST['change_samba'] == "stop & disable" )
		{
		$command = "sudo systemctl stop smbd.service && sudo systemctl disable smbd.service && sudo apt-get remove samba wsdd -y";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Samba disabled</li>";
		}

	if( $_POST['change_wifi_monitor'] == "enable & start" )
		{
		$command = "sudo systemctl enable --now dietpi-wifi-monitor";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>DietPi-WiFi-Monitor enabled</li>";
		}
	else if( $_POST['change_wifi_monitor'] == "stop & disable" )
		{
		$command = "sudo systemctl disable --now dietpi-wifi-monitor";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>DietPi-WiFi-Monitor disabled</li>";
		}

	if( $_POST['change_wifi_autoconnect'] == "enable & start" )
		{
		$command = "sudo systemctl enable --now mupi_autoconnect-wifi";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Autoconnect-WiFi-Service enabled</li>";
		}
	else if( $_POST['change_wifi_autoconnect'] == "stop & disable" )
		{
		$command = "sudo systemctl disable --now mupi_autoconnect-wifi";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Autoconnect-WiFi-Service disabled</li>";
		}


	if( $_POST['change_ftp'] == "enable & start" )
		{
		$command = " sudo apt-get install proftpd -y && sudo apt-get install samba -y && sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/proftpd.conf -O /etc/proftpd/proftpd.conf && sudo systemctl restart proftpd";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>FTP enabled</li>";
		}
	else if( $_POST['change_ftp'] == "stop & disable" )
		{
		$command = "sudo systemctl stop proftpd.service && sudo systemctl disable proftpd.service && sudo apt-get remove proftpd -y";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>FTP disabled</li>";
		}

	// No password = open network, else WPA's 8..63 characters (a wrong length used to break
	// wpa_supplicant.conf and take the box offline).
	$wifi_pwd_len = strlen((string)($_POST['wifi_pwd'] ?? ''));
	if( $_POST['save_wifi'] && $wifi_pwd_len > 0 && ($wifi_pwd_len < 8 || $wifi_pwd_len > 63) )
		{
		$CHANGE_TXT=$CHANGE_TXT."<li>Wifi not added: the password must have 8 to 63 characters</li>";
		}
	else if( $_POST['save_wifi'] )
		{
		$wifi_data[0]['category']="WLAN";
		$wifi_data[0]['ssid']=$_POST['wifi_name'];
		$wifi_data[0]['pw']=$_POST['wifi_pwd'];
		$json_object = json_encode($wifi_data, JSON_PRETTY_PRINT);
		// Random name, readable by nobody else: the file holds the WiFi password in plain text
		// (it used to be a fixed /tmp/.add-wifi.json with mode 755).
		$wifi_tmp = tempnam('/tmp', '.add-wifi.');
		chmod($wifi_tmp, 0600);
		$save_rc = file_put_contents($wifi_tmp, $json_object);
		exec("sudo chown dietpi:dietpi " . escapeshellarg($wifi_tmp));
		exec("sudo mv " . escapeshellarg($wifi_tmp) . " /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/wlan.json");
		sleep(2);
		#exec("sudo wpa_cli -i wlan0 reconfigure");
		$CHANGE_TXT=$CHANGE_TXT."<li>Wifi ".htmlspecialchars((string)$_POST['wifi_name'], ENT_QUOTES)." added</li>";
		$change=1;

		}

	if( $_POST['scan_wifi'] )
		{
		$command = "sudo bash -c 'wpa_cli scan > /dev/null && sleep 10 && wpa_cli scan_results | tail -n +3'";
		exec($command, $wifi_networks, $result );
		$wifiarray = array();
		foreach($wifi_networks as $wifiname) {
			$wifidetails = explode("\t", $wifiname);
			$wifiarray[] = $wifidetails[4];
		}
		$wifi_cleaned = array_unique($wifiarray);
		}

	if( $_POST['delete_wifi'] )
		{
		// wpa_cli wifinr is always a small non-negative integer; intval()
		// strips anything that isn't a digit, so a POST with
		// wifinr="0; rm -rf /" becomes 0 and the chained-command injection
		// is gone. -1 is invalid for wpa_cli but harmless.
		$wifinr = isset($_POST['wifinr']) ? intval($_POST['wifinr']) : -1;
		if ($wifinr >= 0)
			{
			$command = "sudo wpa_cli remove_network " . $wifinr . " && sudo wpa_cli save_config";
			exec($command, $output, $result );
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>Wifi deleted</li>";
			}
		}
	if( $_POST['change_wifi'] == "disable" )
		{
		$command = "sudo /usr/local/bin/mupibox/set_onboard_wifi.sh off";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>OnBoard Wifi disabled [restart necessary]</li>";
		}
	else if( $_POST['change_wifi'] == "enable" )
		{
		$command = "sudo /usr/local/bin/mupibox/set_onboard_wifi.sh on";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>OnBoard Wifi enabled [restart necessary]</li>";
		}
	if( $_POST['restart_wifi'] )
		{
		$command = "sudo service ifup@".$WIFI_IF." stop && sudo service ifup@".$WIFI_IF." start";
		exec($command);
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Wifi-Device was restarted</li>";
		}
	if( $_POST['renew_dhcp'] )
		{
		$command = "sudo dhclient -r && sudo service ifup@".$WIFI_IF." stop && sudo service ifup@".$WIFI_IF." start && sudo dhclient";
		exec($command);
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>DHCP-Lease is released. Try to renew the Lease...</li>";
		}

	$CHANGE_TXT=$CHANGE_TXT."</ul>";

	$command = "sudo service smbd status | grep running";
	exec($command, $smboutput, $smbresult );
	if( $smboutput[0] )
		{
		$command="/usr/bin/hostname -I | awk '{print $1}'";
		$IP=exec($command);
		$samba_state = "started&nbsp;&nbsp;&nbsp;&nbsp;[&nbsp;&nbsp;UNC-Path: \\\\".$IP."\\mupibox\\&nbsp;&nbsp;]";
		$change_samba = "stop & disable";
		}
	else
		{
		$samba_state = "disabled";
		$change_samba = "enable & start";
		}

	$command = "sudo service dietpi-wifi-monitor status | grep running";
	exec($command, $wifi_monitor_output, $wifi_monitor_result );
	if( $wifi_monitor_output[0] )
		{
		$wifi_monitor_state = "started";
		$change_wifi_monitor = "stop & disable";
		}
	else
		{
		$wifi_monitor_state = "disabled";
		$change_wifi_monitor = "enable & start";
		}

	$command = "sudo service mupi_autoconnect-wifi status | grep running";
	exec($command, $wifi_autoconnect_output, $wifi_autoconnect_result );
	if( $wifi_autoconnect_output[0] )
		{
		$wifi_autoconnect_state = "started";
		$change_wifi_autoconnect = "stop & disable";
		}
	else
		{
		$wifi_autoconnect_state = "disabled";
		$change_wifi_autoconnect = "enable & start";
		}



	$command = "sudo service proftpd status | grep running";
	exec($command, $ftpoutput, $ftpresult );
	if( $ftpoutput[0] )
		{
		$ftp_state = "started";
		$change_ftp = "stop & disable";
		}
	else
		{
		$ftp_state = "disabled";
		$change_ftp = "enable & start";
		}

	$command = "ps -ef | grep websockify | grep -v grep";
	exec($command, $vncoutput, $vncresult );
	if( $vncoutput[0] )
		{
		$vnc_state = "started";
		$change_vnc = "stop & disable";
		}
	else
		{
		$vnc_state = "disabled";
		$change_vnc = "enable & start";
		}

?>
<form class="appnitro" name="network" method="post" action="network.php" id="form">
<div class="description">
	<h2>Network</h2>
	<p>Network informations, options and so on...</p>
</div>

	<details id="wifisettingsdisplay" open>
		<summary><i class="fa-solid fa-wifi"></i> WiFi Settings</summary>
		<ul>
			<li class="li_norm">
			<p>The same WiFi settings page as on the display: networks in range, signal, band, connect/change/delete.</p>
			<iframe src="http://<?php print $_SERVER['SERVER_ADDR']; ?>:8200/wifi" width="800" height="480" style="border:0;"></iframe>
			<p><a href="http://<?php print $_SERVER['SERVER_ADDR']; ?>:8200/wifi" target="_blank">If it doesn't display properly, try this Link and click me...</a></p>
			</li>
		</ul>
	</details>


	<details id="miscwifioptions">
		<summary><i class="fa-solid fa-toggle-off"></i> Misc Options</summary>

	<ul>
		<li class="li_1"><h2>Enable/Disable OnBoard Wifi</h2>
			<p>
			Enables or disables OnBoard Wifi! Please be sure what you do!
			</p>
			<p>
			<?php
			/*
			einfügen!!!
			 echo "#disable ipv6" >> /etc/sysctl.conf
 echo "net.ipv6.conf.all.disable_ipv6 = 1" >> /etc/sysctl.conf
 echo "net.ipv6.conf.default.disable_ipv6 = 1" >> /etc/sysctl.conf
 echo "net.ipv6.conf.lo.disable_ipv6 = 1" >> /etc/sysctl.conf
			*/
			$command = "grep '^dtoverlay=disable-wifi' /boot/config.txt";
			$wifionoff = exec($command, $output);
			if($wifionoff == "")
				{
				$change_wifi="disable";
				$onboard_wifi="enabled";
				}
			else
				{
				$change_wifi="enable";
				$onboard_wifi="disabled";
				}
			print "Onboard-Wifi: <b>".$onboard_wifi;
			?>
			</b></p>
			<input id="saveForm" class="button_text" type="submit" name="change_wifi" value="<?php print $change_wifi; ?>" />
		</li>

		<li class="li_1"><h2>DHCP-Timeout</h2>
			<p>
			Set timeout to 10 seconds (Default 60 seconds)! This setting shortens the boot time in offline mode.
			</p>
			<p>
			<?php
			$command = "cat /etc/dhcp/dhclient.conf | grep 'timeout 10;'";
			$dhcp_timeout = exec($command, $output);
			if($dhcp_timeout == "")
				{
				$change_dhcp_timeout="enable";
				$dhcp_timeout="Default or manual set";
				}
			else
				{
				$change_dhcp_timeout="disable";
				$dhcp_timeout="10 seconds";
				}
			print "DHCP-Timeout: <b>".$dhcp_timeout;
			?>
			</b></p>
			<input id="saveForm" class="button_text" type="submit" name="change_dhcp_timeout" value="<?php print $change_dhcp_timeout; ?>" />
		</li>

		<li class="li_1"><h2>Restart Wifi-Device</h2>
			<p>
			Restarts the WiFi device in use.
			</p>
			<input id="saveForm" class="button_text" type="submit" name="restart_wifi" value="Restart Wifi-Device" />
		</li>
		<li class="li_1"><h2>Renew DHCP-Lease</h2>
			<p>
			Releases the DHCP-Lease and also restarting the Wifi-Device. Important: A new IP address may be assigned!
			</p>
			<input id="saveForm" class="button_text" type="submit" name="renew_dhcp" value="Renew DHCP-Lease" />
		</li>
		<li class="li_1"><h2>Install USB-Wlan drivers</h2>
			<p>
			These drivers are for several network cards like these:
			<ul style="list-style-type:'• '; margin-left:20px;"><li>			<a href="https://amzn.to/3vj2Ubn" target="_blank">Referal link to Amazon.com (US) (→ amzn.to)</a></li>
			<li><a href="https://amzn.to/3U4ID3Z" target="_blank">Referal link to Amazon.de (GER) (→ amzn.to)</a></li>
			<li><a href="https://www.tp-link.com/uk/home-networking/adapter/archer-t2u-plus/" target="_blank">Archer T2U Plus</a></li></ul>
			</p>
			<p>
			<select id="usb_wifi_driver" name="usb_wifi_driver" onchange="updateUsbWifiDriverState(this)">
				<?php foreach ($usb_wifi_drivers as $key => $driver) { ?>
				<option value="<?php print $key; ?>" <?php if ($usb_wifi_driver === $key) print 'selected'; ?>><?php print $driver['label']; ?></option>
				<?php } ?>
			</select>
			</p>
			<p>

			<?php
			$path=$usb_wifi_drivers[$usb_wifi_driver]['path'];
		    if($path !== false AND is_dir($path))
				{
				$change_usb_wifi_driver="Remove driver";
				$state_usb_wifi_driver="installed";
				}
			else
				{
				$change_usb_wifi_driver="Install driver";
				$state_usb_wifi_driver="not installed";
				}
			print("<b>State: <span id=\"usb_wifi_driver_state\">".$state_usb_wifi_driver."</span>");
			?>
			</b></p><p>Please notice: Installation takes a long long time! If you want to install manually and see the installation status, check out this blog post: <a href="https://mupibox.de/pimp-die-mupibox-mit-schneller-netzwerkkarte/" target="_blank">Blog Post</a></p>
			<input id="usb_wifi_driver_button" class="button_text" type="submit" name="USB_WIFI_DRIVER" value="<?php print $change_usb_wifi_driver; ?>" />
		</li>
		<li class="li_1"><h2>Power management USB-driver</h2>
			<p>
			Power saving of the USB WiFi adapter. With power saving the adapter dozes between data packets: with a weak signal packets can get lost or delayed and the connection is set up again. <b>Off</b> keeps the adapter awake, it uses a little more power and gets slightly warmer. Takes effect after the next reboot.
			</p>
			<?php
			$usb_power_shown = 0;
			foreach ($usb_wifi_drivers as $usb_power_key => $usb_power_driver)
				{
				if( !is_dir($usb_power_driver['path']) )
					{
					continue;
					}
				$usb_power_shown++;
				$usb_power_conf = '/etc/modprobe.d/' . $usb_power_driver['module'] . '.conf';
				$usb_power_set = null;
				if( is_file($usb_power_conf) && preg_match('/^options\s+' . $usb_power_driver['module'] . '\b[^\n]*\brtw_power_mgnt=(\d)/m', (string) file_get_contents($usb_power_conf), $usb_power_match) )
					{
					$usb_power_set = $usb_power_match[1];
					}
				$usb_power_param = '/sys/module/' . $usb_power_driver['module'] . '/parameters/rtw_power_mgnt';
				$usb_power_running = is_readable($usb_power_param) ? trim((string) file_get_contents($usb_power_param)) : null;
				if( $usb_power_set === null )
					{
					$usb_power_set = $usb_power_running !== null ? $usb_power_running : '2';
					}
			?>
			<p><b><?php print $usb_power_driver['label']; ?></b></p>
			<p>
			<select id="usb_wifi_power_<?php print $usb_power_key; ?>" name="usb_wifi_power_<?php print $usb_power_key; ?>">
				<?php foreach ($usb_power_labels as $usb_power_value => $usb_power_label) { ?>
				<option value="<?php print $usb_power_value; ?>" <?php if ((string) $usb_power_set === (string) $usb_power_value) print 'selected'; ?>><?php print $usb_power_label; ?></option>
				<?php } ?>
			</select>
			</p>
			<p>
			<?php
				print "Running now: <b>".(isset($usb_power_labels[$usb_power_running]) ? $usb_power_labels[$usb_power_running] : 'driver not loaded')."</b>";
				if( $usb_power_running !== null && (string) $usb_power_running !== (string) $usb_power_set )
					{
					print " (changed setting is active after the next reboot)";
					}
			?>
			</p>
			<button class="button_text" type="submit" name="save_usb_wifi_power" value="<?php print $usb_power_key; ?>">Save</button>
			<?php
				}
			if( $usb_power_shown == 0 )
				{
				print "<p><b>No USB WiFi driver (RTL88X2BU / RTL8821AU) is installed.</b></p>";
				}
			?>
		</li>
		<script>
		function updateUsbWifiDriverState(select) {
			fetch('network.php?check_usb_wifi_driver=' + encodeURIComponent(select.value))
				.then(function (response) { return response.json(); })
				.then(function (data) {
					document.getElementById('usb_wifi_driver_state').textContent = data.installed ? 'installed' : 'not installed';
					document.getElementById('usb_wifi_driver_button').value = data.installed ? 'Remove driver' : 'Install driver';
				});
		}
		</script>


	</ul>
	</details>

	<details id="wifisettings">
		<summary><i class="fa-solid fa-gear"></i> Services</summary>
	<ul>
		<li class="li_1"><h2>DietPi-WiFi-Monitor</h2>
			<p>Automatic reconnection to wifi, if signal is lost.</p>
			<p>
			<?php 
			echo "DietPi-WiFi-Monitor Status: <b>".$wifi_monitor_state."</b>";
			?>
			</p>
			<input id="saveForm" class="button_text" type="submit" name="change_wifi_monitor" value="<?php print $change_wifi_monitor; ?>" />
		</li>
		<li class="li_1"><h2>Check for best wifi connection</h2>
			<p>Checks the WiFi SSIDs in the area every 10 seconds and connects to the strongest SSID if this is stored in the configuration. May cause connection dropouts, but allows for quick switching in a multi-Wifi environment.</p>
			<p>
			<?php 
			echo "Autoconnect-wifi: <b>".$wifi_autoconnect_state."</b>";
			?>
			</p>
			<input id="saveForm" class="button_text" type="submit" name="change_wifi_autoconnect" value="<?php print $change_wifi_autoconnect; ?>" />
		</li>

		<li class="li_1"><h2>Samba</h2>
			<p>Disabling this service will result in faster boot time.</p>
			<p>New: The package wsdd (Web-Service-Discovery-Daemon) will be also installed. </p>
			<p>
			<?php 
			echo "Samba-Service Status: <b>".$samba_state."</b>";
			?>
			</p>
			<input id="saveForm" class="button_text" type="submit" name="change_samba" value="<?php print $change_samba; ?>" />
		</li>
		<li class="li_1"><h2>FTP-Server</h2>
			<p>
			<?php 
			echo "FTP-Service Status: <b>".$ftp_state."</b>";
			?>
			</p>
			<input id="saveForm" class="button_text" type="submit" name="change_ftp" value="<?php print $change_ftp; ?>" />
		</li>
		<li class="li_1"><h2>Enable/Disable VNC</h2>
			<p>
			Enables or disables VNC-Service! The service allows remote access to the browser (Display). Usage recommended for Pi version 3 and up. Usually doesn't work with onboard WiFi.
			</p>
			<p>
			<?php 
			echo "VNC-Service Status: <b>".$vnc_state."</b>";
			?>
			</p>
			<input id="saveForm" class="button_text" type="submit" name="change_vnc" value="<?php print $change_vnc; ?>" />
		</li>
	</ul>
	</details>
</form>

<?php
        include ('includes/footer.php');
?>
