<?php
	/*
	'https://gist.github.com/yejun/2c1a070a839b3a7b146ede8a998b5495    !!!!!
	discoverable on
	pairable on
	agent on
	default-agent
	scan on
	*/
	// AR5-15: bluetooth.php was missed by the Phase-5 CSRF sweep. Every
	// POST handler below runs `sudo systemctl` or `sudo /usr/local/bin/
	// mupibox/*_bt.sh` — a cross-site request from another admin tab
	// (or a logged-in admin opening a hostile page) could toggle
	// Bluetooth, pair an attacker MAC, or remove a paired device. Gate
	// all writes behind csrf_check() before any other code runs.
	require_once __DIR__ . '/includes/csrf.php';
	csrf_check();
	include ('includes/header.php');

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

	// Both BT-handlers feed a MAC address into a shell exec. The receiving
	// scripts (pair_bt.sh / remove_bt.sh) already validate the MAC via
	// regex since CRIT-7, but the shell command line itself is built here
	// — if we don't validate, an attacker (admin-authenticated, but still)
	// could squeeze backticks or `; rm -rf` into the parameter and the
	// shell would expand it before pair_bt.sh ever runs. Defence in depth:
	// reject anything that isn't a canonical AA:BB:CC:DD:EE:FF MAC, then
	// escapeshellarg() the value as well.
	$btMacRegex = '/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/';
	if( $_POST['remove_selected'] )
		{
		$mac = $_POST['remove_mac'] ?? '';
		if (!preg_match($btMacRegex, $mac)) {
			$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: invalid MAC, refused</li>"; $change=1;
		} else {
			$command = "sudo -u dietpi /usr/local/bin/mupibox/./remove_bt.sh " . escapeshellarg($mac);
			exec($command, $output, $result );
			$CHANGE_TXT=$CHANGE_TXT."<li>Pairing removed [" . htmlspecialchars($mac) . "]</li>";
			$command = "sudo -u dietpi /usr/local/bin/mupibox/./stop_bt.sh";
			exec($command, $output, $result );
			$command = "sudo -u dietpi /usr/local/bin/mupibox/./start_bt.sh";
			exec($command, $output, $result );
			$change=1;
		}
		}

	if( $_POST['pair_selected'] )
		{
		$mac = $_POST['bt_device'] ?? '';
		if (!preg_match($btMacRegex, $mac)) {
			$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: invalid MAC, refused</li>"; $change=1;
		} else {
			$command = "sudo -u dietpi /usr/local/bin/mupibox/./pair_bt.sh " . escapeshellarg($mac);
			exec($command, $output, $result );
			$CHANGE_TXT=$CHANGE_TXT."<li>Device is paired [" . htmlspecialchars($mac) . "]</li>";
			$change=1;
		}
		}


	if( $_POST['scan_new'] )
		{
		/*$command = "sudo hcitool scan > /tmp/bt_scan";*/
		$command = "sudo -u dietpi /usr/local/bin/mupibox/./scan_bt.sh";
		exec($command, $output, $result );
		$change=1;
		}

	if( $_POST['change_bt'] == "turn on" )
		{
		$command = "sudo -u dietpi /usr/local/bin/mupibox/./start_bt.sh";
		exec($command, $output, $result );
		$CHANGE_TXT=$CHANGE_TXT."<li>Bluetooth is ready now</li>";
		$change=1;
		}
	if( $_POST['change_bt'] == "turn off" )
		{
		$command = "sudo -u dietpi /usr/local/bin/mupibox/./stop_bt.sh";
		exec($command, $output, $result );
		$CHANGE_TXT=$CHANGE_TXT."<li>Bluetooth is deactivated [just Software for connecting, Service and Hardware continue runnung]</li>";
		$change=1;
		}

	$command = "sudo -u dietpi bluetoothctl show | grep 'Powered: yes'";
	exec($command, $btoutput, $btresult );
	if( $btoutput[0] )
		{
		$bt_state = "ON";
		$change_bt = "turn off";
		$command = "sudo -u dietpi bluetoothctl devices";
		exec($command, $pairoutput, $pairresult );
		$command = "sudo -u dietpi bluetoothctl list";
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
        if( $_POST['scan_new'] )
        {
                                                $string = fopen('/tmp/bt_scan','r' );
                                                $bt=1;
                                                while (($line = fgetcsv($string, 0, "\t")) !== false) {
                                                        if($bt > 1)
                                                                {
                                                                print "<option value='".$line[1]."'>".$line[2]."</option>";
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
                                        // AR5-15: the MAC comes from `bluetoothctl devices` so it's normally
                                        // a safe AA:BB:CC:DD:EE:FF value, but a paired device with a
                                        // hostile-name BT stack could in theory emit a forged second
                                        // column. escapeshellarg for the shell side, htmlspecialchars
                                        // for the form/HTML side.
                                        $mac = $split_device[1] ?? '';
                                        $name = $split_device[2] ?? '';
                                        $macHtml = htmlspecialchars($mac, ENT_QUOTES);
                                        $nameHtml = htmlspecialchars($name, ENT_QUOTES);
                                        print "<form class='appnitro'  method='post' action='bluetooth.php' id='remform'>";
                                        print "<input type='hidden' name='remove_mac' value='".$macHtml."'>";
                                        print "<input id='saveForm' class='button_text' type='submit' name='remove_selected' value='Remove' />&ensp;";
                                        print $nameHtml." [".$macHtml."]";
                                        $command = "sudo -u dietpi bluetoothctl info ".escapeshellarg($mac)." | grep 'Connected: yes'";
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