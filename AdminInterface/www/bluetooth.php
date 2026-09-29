<?php
	/*
	'https://gist.github.com/yejun/2c1a070a839b3a7b146ede8a998b5495    !!!!!
	discoverable on
	pairable on
	agent on
	default-agent
	scan on
	*/
	include ('includes/header.php');
	// The Bluetooth commands below can take a while (scan, pairing). Release the session lock
	// so other admin pages and the header icon polls of the same browser don't wait for them.
	// csrf_token() first: the form filter needs the token, and it can't be stored afterwards.
	csrf_token();
	session_write_close();

	// Without a Bluetooth controller (e.g. the chip is switched off) bluetoothctl, and the scripts built on it,
	// wait for one forever - every call is time-limited (timeout -k), and nothing is started at all in that case.
	$bt_present = count(glob('/sys/class/bluetooth/hci*')) > 0;
	if( !$bt_present && ($_POST['remove_selected'] || $_POST['pair_selected'] || $_POST['scan_new'] || $_POST['change_bt']) )
		{
		$CHANGE_TXT=$CHANGE_TXT."<li>No Bluetooth controller found - is the Bluetooth chip switched off?</li>";
		$change=1;
		}

	if( $_POST['change_btac'] == "enable & start" )
		{
		$command = "sudo systemctl enable mupi_autoconnect_bt; sudo systemctl start mupi_autoconnect_bt";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>BT-Autoconnect-Service enabled</li>";
		}
	else if( $_POST['change_btac'] == "stop & disable" )
		{
		$command = "sudo systemctl stop mupi_autoconnect_bt; sudo systemctl disable mupi_autoconnect_bt";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>BT-Autoconnect-Service disabled</li>";
		}

	// Both handlers pass a MAC address to a shell command: accept only a canonical
	// AA:BB:CC:DD:EE:FF address and quote it, so nothing else ever reaches the shell.
	$btMacRegex = '/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/';
	if( $bt_present && $_POST['remove_selected'] )
		{
		$mac = $_POST['remove_mac'] ?? '';
		if (!preg_match($btMacRegex, $mac)) {
			$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: invalid MAC, refused</li>"; $change=1;
		} else {
			$command = "timeout -k 1 60 sudo -u dietpi /usr/local/bin/mupibox/./remove_bt.sh " . escapeshellarg($mac);
			exec($command, $output, $result );
			$CHANGE_TXT=$CHANGE_TXT."<li>Pairing removed [" . htmlspecialchars($mac) . "]</li>";
			$command = "timeout -k 1 60 sudo -u dietpi /usr/local/bin/mupibox/./stop_bt.sh";
			exec($command, $output, $result );
			$command = "timeout -k 1 60 sudo -u dietpi /usr/local/bin/mupibox/./start_bt.sh";
			exec($command, $output, $result );
			$change=1;
		}
		}

	if( $bt_present && $_POST['pair_selected'] )
		{
		$mac = $_POST['bt_device'] ?? '';
		if (!preg_match($btMacRegex, $mac)) {
			$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: invalid MAC, refused</li>"; $change=1;
		} else {
			$command = "timeout -k 1 60 sudo -u dietpi /usr/local/bin/mupibox/./pair_bt.sh " . escapeshellarg($mac);
			exec($command, $output, $result );
			$CHANGE_TXT=$CHANGE_TXT."<li>Device is paired [" . htmlspecialchars($mac) . "]</li>";
			$change=1;
		}
		}


	if( $bt_present && $_POST['scan_new'] )
		{
		/*$command = "sudo hcitool scan > /tmp/bt_scan";*/
		$command = "timeout -k 1 60 sudo -u dietpi /usr/local/bin/mupibox/./scan_bt.sh";
		exec($command, $output, $result );
		$change=1;
		}

	if( $bt_present && $_POST['change_bt'] == "turn on" )
		{
		$command = "timeout -k 1 60 sudo -u dietpi /usr/local/bin/mupibox/./start_bt.sh";
		exec($command, $output, $result );
		// The controller switches on a moment after bluetoothctl returned: wait for it (at most 5 s), else the
		// page below still showed "OFF" until it was reloaded.
		for( $i = 0; $i < 10; $i++ )
			{
			$powered = array();
			exec("timeout -k 1 3 sudo -u dietpi bluetoothctl show | grep 'Powered: yes'", $powered);
			if( !empty($powered) ) { break; }
			usleep(500000);
			}
		$CHANGE_TXT=$CHANGE_TXT."<li>Bluetooth is ready now</li>";
		$change=1;
		}
	if( $bt_present && $_POST['change_bt'] == "turn off" )
		{
		$command = "timeout -k 1 60 sudo -u dietpi /usr/local/bin/mupibox/./stop_bt.sh";
		exec($command, $output, $result );
		$CHANGE_TXT=$CHANGE_TXT."<li>Bluetooth is deactivated [just Software for connecting, Service and Hardware continue runnung]</li>";
		$change=1;
		}
	if( $_POST['change_bt_chip'] == "Deactivate Bluetooth-Chip" )
		{
		$command = "sudo /usr/local/bin/mupibox/set_bluetooth_chip.sh off";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Bluetooth-Chip disabled [restart necessary]</li>";
		}
	else if( $_POST['change_bt_chip'] == "Activate Bluetooth-Chip" )
		{
		$command = "sudo /usr/local/bin/mupibox/set_bluetooth_chip.sh on";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Bluetooth-Chip enabled [restart necessary]</li>";
		}

	$btoutput = array();
	if( $bt_present )
		{
		$command = "timeout -k 1 5 sudo -u dietpi bluetoothctl show | grep 'Powered: yes'";
		exec($command, $btoutput, $btresult );
		}
	if( $btoutput[0] )
		{
		$bt_state = "ON";
		$change_bt = "turn off";
		$command = "timeout -k 1 5 sudo -u dietpi bluetoothctl devices";
		exec($command, $pairoutput, $pairresult );
		$command = "timeout -k 1 5 sudo -u dietpi bluetoothctl list";
		exec($command, $listoutput, $listresult );
		}
	else
		{
		$bt_state = "OFF";
		$change_bt = "turn on";
		}
	$CHANGE_TXT=$CHANGE_TXT."</ul>";


	$command = "sudo service mupi_autoconnect_bt status | grep running";
	exec($command, $btacoutput, $btacresult );
	if( $btacoutput[0] )
		{
		$btac_state = "started";
		$change_btac = "stop & disable";
		}
	else
		{
		$btac_state = "disabled";
		$change_btac = "enable & start";
		}
?>

                <form class="appnitro"  method="post" action="bluetooth.php" id="form">
                                        <div class="description">
                        <h2>MupiBox bluetooth settings</h2>
                        <p> Set up bluetooth connections...</p>
                </div>
                        <ul >                                        
                                                <li class="li_1"><h2>Bluetooth power state</h2>
                                                <p>
                                                <?php 
                                                echo "Bluetooth power state: <b>".$bt_state."</b>";
                                                echo "<br/>";
                                                $split_controller=explode(" ", $listoutput[0]);
                                                echo "Bluetooth Controller: <b>".$split_controller[2]." [".$split_controller[1]."]</b>";
                                                ?>
                                                </p>
                                                <input id="saveForm" class="button_text" type="submit" name="change_bt" value="<?php print $change_bt; ?>" /></li>



                 <li id="li_1" >
                <div>
                     </p><input id="saveForm" class="button_text" type="submit" name="scan_new" value="Scan new devices" /></p>
                        <select id="bt_device" name="bt_device" class="element text medium">
<?php
        if( $bt_present && $_POST['scan_new'] && is_readable('/tmp/bt_scan') )
        {
                                                $string = fopen('/tmp/bt_scan','r' );
                                                $bt=1;
                                                while (($line = fgetcsv($string, 0, "\t")) !== false) {
                                                        if($bt > 1)
                                                                {
                                                                // names come from any device in radio range: escape them
                                                                print "<option value='".htmlspecialchars($line[1] ?? '', ENT_QUOTES)."'>".htmlspecialchars($line[2] ?? '', ENT_QUOTES)."</option>";
                                                                }
                                                        $bt++;
                                                }
        }
?>
</select>
               
                                <input id="saveForm" class="button_text" type="submit" name="pair_selected" value="Pair selected device" />
</div></form>
                </li>
                                <li>
                                <div class="description">
                        <h2>Paired Devices</h2>
                        <p><?php 
                                foreach($pairoutput as $device)
                                {
                                        $split_device=explode(" ", $device);
                                        // escapeshellarg for the shell, htmlspecialchars for the page: device names come from the radio
                                        $mac = $split_device[1] ?? '';
                                        $macHtml = htmlspecialchars($mac, ENT_QUOTES);
                                        $nameHtml = htmlspecialchars($split_device[2] ?? '', ENT_QUOTES);
                                        print "<form class='appnitro'  method='post' action='bluetooth.php' id='remform'>";
                                        print "<input type='hidden' name='remove_mac' value='".$macHtml."'>";
                                        print "<input id='saveForm' class='button_text' type='submit' name='remove_selected' value='Remove' />&ensp;";
                                        print $nameHtml." [".$macHtml."]";
                                        $command = "timeout -k 1 5 sudo -u dietpi bluetoothctl info ".escapeshellarg($mac)." | grep 'Connected: yes'";
                                        unset($connoutput);
                                        exec($command, $connoutput, $connresult );
                                        if( $connoutput[0] )
                                                {
                                                print " <b>CONNECTED</b>";
                                                }
                                        print "</form>";
                                }
                                ?></p>
                </div>
                                </li>
                        </ul>
	<form class='appnitro'  method='post' action='bluetooth.php' id='remform'>
	<details id="bluetoothservice">
		<summary><i class="fa-brands fa-bluetooth"></i> Bluetooth-Service</summary>
	<ul>
		<li class="li_1"><h2>Enable/Disable Bluetooth-Chip</h2>
			<p>
			Disables the onboard Bluetooth chip completely (its firmware is not loaded at boot). Please be sure what you do!
			</p>
			<p>
			<?php
			$command = "systemctl is-enabled hciuart.service 2>/dev/null";
			$bt_chip_state = exec($command, $output);
			if($bt_chip_state == "masked")
				{
				$change_bt_chip="Activate Bluetooth-Chip";
				$bt_chip="disabled";
				}
			else
				{
				$change_bt_chip="Deactivate Bluetooth-Chip";
				$bt_chip="enabled";
				}
			print "Bluetooth-Chip: <b>".$bt_chip;
			?>
			</b></p>
			<input id="saveForm" class="button_text" type="submit" name="change_bt_chip" value="<?php print $change_bt_chip; ?>" />
		</li>
		<li class="li_1"><h2>Bluetooth-Autoconnect-Helper (Just if automatic reconnect won't work)</h2>
			<p>
			<?php
			echo "BT-Autoconnect-Service Status: <b>".$btac_state."</b>";
			?>
			</p>
			<input id="saveForm" class="button_text" type="submit" name="change_btac" value="<?php print $change_btac; ?>" />
		</li>
	</ul>
	</details>
	</form>

<?php
        include ('includes/footer.php');
?>