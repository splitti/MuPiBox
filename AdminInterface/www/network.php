<?php
	$change=0;
	$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";
	$wifiopen="";

	include ('includes/header.php');
	$commandM0="cat /sys/class/net/wlan0/address";
	$MAC0=exec($commandM0);
	$commandS0="/sbin/ifconfig wlan0 | awk '/netmask/{split($4,a,\":\"); print a[1]}'";
	$SUBNET0=exec($commandS0);
	$commandG0="sudo route -n | grep 'UG[ \t]' | awk '{print $2}'";
	$GATEWAY0=exec($commandG0);
	$commandD="echo $(sudo cat /etc/resolv.conf | grep 'nameserver ') | sed 's/nameserver //g'";
	$DNS=exec($commandD);
	$commandW="sudo iw dev wlan0 info | grep ssid | awk '{print $2}'";
	$WIFI=exec($commandW);
	$commandL="sudo iwconfig wlan0 | awk '/Link Quality/{split($2,a,\"=|/\");print int((a[2]/a[3])*100)\"%\"}'";
	$LINKQ=exec($commandL);
	$commandS="sudo iwconfig wlan0 | awk '/Signal level/{split($4,a,\"=|/\");print a[2]\" dBm\"}'";
	$SIGNAL=exec($commandS);
	$commandB="sudo iwconfig wlan0 | awk '/Bit Rate/{split($2,a,\"=|/\");print a[2]\" Mb/s\"}'";
	$BITRATE=exec($commandB);


	if( $_POST['save_wifi'] )
		{
		$wifi_data[0]['category']="WLAN";
		$wifi_data[0]['ssid']=$_POST['wifi_name'];
		$wifi_data[0]['pw']=$_POST['wifi_pwd'];
		$json_object = json_encode($wifi_data, JSON_PRETTY_PRINT);
		$save_rc = file_put_contents('/tmp/.add-wifi.json', $json_object);
		exec("sudo chmod 755 /tmp/.add-wifi.json");
		exec("sudo mv /tmp/.add-wifi.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/wlan.json");
		sleep(5);
		exec("sudo wpa_cli -i wlan0 reconfigure");
		$CHANGE_TXT=$CHANGE_TXT."<li>Wifi ".$_POST['wifi_name']." added</li>";
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

		$wifiopen=" open";
		}

	if( $_POST['delete_wifi'] )
		{
		if( $_POST['wifinr'] )
			{
			$command = "sudo wpa_cli remove_network ".$_POST['wifinr']." && sudo wpa_cli save_config";
			exec($command, $output, $result );
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>Wifi deleted</li>";
			}
		}
	if( $_POST['change_wifi'] == "disable" )
		{
		$command = "echo 'dtoverlay=disable-wifi' | sudo tee -a /boot/config.txt";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>OnBoard Wifi disabled [restart necessary]</li>";
		}
	else if( $_POST['change_wifi'] == "enable" )
		{
		$command = "sudo sed -i -e 's/dtoverlay=disable-wifi//g' /boot/config.txt && sudo head -n -1 /boot/config.txt > /tmp/config.txt && sudo mv /tmp/config.txt /boot/config.txt";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>OnBoard Wifi enabled [restart necessary]</li>";
		}
	if( $_POST['restart_wifi'] )
		{
		$command = "sudo service ifup@wlan0 stop && sudo service ifup@wlan0 start";
		exec($command);
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Wifi-Device was restarted</li>";
		}
	if( $_POST['renew_dhcp'] )
		{
		$command = "sudo dhclient -r && sudo service ifup@wlan0 stop && sudo service ifup@wlan0 start && sudo dhclient";
		exec($command);
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>DHCP-Lease is released. Try to renew the Lease...</li>";
		}

	$CHANGE_TXT=$CHANGE_TXT."</ul>";

?>
<form class="appnitro" name="network" method="post" action="network.php" id="form">
<div class="description">
	<h2>Network</h2>
	<p>Network informations, options and so on...</p>
</div>

	<details>
		<summary><i class="fa-solid fa-wifi"></i> Network Information</summary>
		<ul>
			<li class="li_norm">

        <h2>Network Information</h2>
        <table id="network">
        <tr><td id="netl">IP-Address:</td><td id="netr"><?php print $_SERVER['SERVER_ADDR']; ?></td></tr>
        <tr><td id="netl">MAC-Address:</td><td id="netr"><?php print $MAC0; ?></td></tr>
        <tr><td id="netl">Subnet-Adresss:</td><td id="netr"><?php print $SUBNET0; ?></td></tr>
        <tr><td id="netl">Gateway:</td><td id="netr"><?php print $GATEWAY0; ?></td></tr>
        <tr><td id="netl">Nameserver:</td><td id="netr"><?php print $DNS; ?></td></tr>
        <tr><td id="netl">Wifi SSID:</td><td id="netr"><?php print $WIFI; ?></td></tr>
        <tr><td id="netl">Wifi Link Quality:</td><td id="netr"><?php print $LINKQ; ?></td></tr>
        <tr><td id="netl">Wifi Signal Level:</td><td id="netr"><?php print $SIGNAL; ?></td></tr>
        <tr><td id="netl">Bitrate:</td><td id="netr"><?php print $BITRATE ?></td></tr>
        </table>
		</li></ul></details>
		
	<details>
		<summary><i class="fa-regular fa-trash-can"></i> Delete Wifi-Network</summary>

	<ul>
		<li class="li_1"><h2>Delete Wifi-Network</h2>
			<p>
			Delete the selected network:
			</p>
		</li>
		<li class="li_1">
  <fieldset>
<?php
	$command = "sudo wpa_cli list_networks | tail -n +3";
	exec($command, $wifis, $result );
	foreach ($wifis as $thiswifi) {
		$wifidetails = explode("\t", $thiswifi);
		if( $wifidetails[3] )
			{
				$connection=" [connected]";
			}
		else 
			{
				$connection="";
			}
		
		echo "<input type=\"radio\" id=\"".$wifidetails[0]."\" name=\"wifinr\" value=\"".$wifidetails[0]."\"> ";
		echo "<label for=\"".$wifidetails[0]."\"> ".$wifidetails[1].$connection."</label></input><br/>";
		}

?>
</fieldset>
</li>
		<li class="li_1">
				<input id="saveForm" class="button_text_red" type="submit" name="delete_wifi" value="Delete selected Wifi"  onclick="return confirm('Do really want to delete selected Wifi-Network?');" />
		</li>
	</ul>
	</details>
		
		
		
	<details <?php echo $wifiopen;  ?>>
	<summary><i class="fa-solid fa-tower-broadcast"></i> Add Wifi-Network</summary>
	<ul>
	<li class="li_1"><h2>Search and Add Wifi</h2>
		<p>You can search for WLAN or enter it manually</p>
	</li>

	<?php
	if ( $wifi_networks )
		{	
				?>
				<li class="li_1">
				<h2>SSID-Name</h2>

				<div><select id="wifi_name" name="wifi_name" class="element text small">
				
				<?php
				foreach($wifi_cleaned as $wifiname) {
					print "<option value=\"". $wifiname . "\">" . $wifiname . "</option>";
				}
				?>
				"</select></li>

	<?php	
		}
	else
		{
	?>
		<li class="li_1">
			<h2>SSID-Name</h2>
			<input id="wifi_name" name="wifi_name" class="element text medium" type="text" maxlength="255" value=""/>
        </li>
	<?php
		}
	?>
        <li class="li_1" >
			<h2>Wifi-Password</h2>
			<input id="wifi_pwd" name="wifi_pwd" class="element text medium" type="password" maxlength="255" value="" minlength="8">
		</li>
		<li class="li_1">
		<input id="saveForm" class="button_text" type="submit" name="save_wifi" value="Save Wifi" />
		<input id="saveForm" class="button_text" type="submit" name="scan_wifi" value="Scan Wifi-Networks" />
		</li>
	</ul>
	</details>


	<details>
		<summary><i class="fa-solid fa-toggle-off"></i> Misc Options</summary>

	<ul>
		<li class="li_1"><h2>Enable/Disable OnBoad Wifi</h2>
			<p>
			Enables or disables OnBoard Wifi! Please be sure what you do!
			</p>
			<p>
			<?php
			$command = "cat /boot/config.txt | grep 'dtoverlay=disable-wifi'";
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
		<li class="li_1"><h2>Restart Wifi-Device</h2>
			<p>
			Restarts the wlan0-Device.
			</p>
			<input id="saveForm" class="button_text" type="submit" name="restart_wifi" value="Restart Wifi-Device" />
		</li>
		<li class="li_1"><h2>Renew DHCP-Lease</h2>
			<p>
			Releases the DHCP-Lease and also restarting the Wifi-Device. Important: A new IP address may be assigned!
			</p>
			<input id="saveForm" class="button_text" type="submit" name="renew_dhcp" value="Renew DHCP-Lease" />
		</li>
	</ul>
	</details>
</form>

<?php
        include ('includes/footer.php');
?>
