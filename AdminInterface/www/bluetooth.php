<?php
	/*
	'https://gist.github.com/yejun/2c1a070a839b3a7b146ede8a998b5495    !!!!!
	discoverable on
	pairable on
	agent on
	default-agent
	scan on
	*/
	$change=0;
	$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";
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

	if( $_POST['remove_selected'] )
		{
		$command = "sudo -i -u dietpi /usr/local/bin/mupibox/./remove_bt.sh ".$_POST['remove_mac'];
		exec($command, $output, $result );
		$CHANGE_TXT=$CHANGE_TXT."<li>Pairing removed [".$_POST['remove_mac']."</li>";
		$command = "sudo -i -u dietpi /usr/local/bin/mupibox/./stop_bt.sh";
		exec($command, $output, $result );
		$command = "sudo -i -u dietpi /usr/local/bin/mupibox/./start_bt.sh";
		exec($command, $output, $result );

		$change=1;
		}

	if( $_POST['pair_selected'] )
		{
		$command = "sudo -i -u dietpi /usr/local/bin/mupibox/./pair_bt.sh ".$_POST['bt_device'];
		exec($command, $output, $result );
		$CHANGE_TXT=$CHANGE_TXT."<li>Device is paired [".$_POST['bt_device']."</li>";
		$change=1;
		}


	if( $_POST['scan_new'] )
		{
		/*$command = "sudo hcitool scan > /tmp/bt_scan";*/
		$command = "sudo -i -u dietpi /usr/local/bin/mupibox/./scan_bt.sh";
		exec($command, $output, $result );
		$change=1;
		}

	if( $_POST['change_bt'] == "turn on" )
		{
		$command = "sudo -i -u dietpi /usr/local/bin/mupibox/./start_bt.sh";
		exec($command, $output, $result );
		$CHANGE_TXT=$CHANGE_TXT."<li>Bluetooth is ready now</li>";
		$change=1;
		}
	if( $_POST['change_bt'] == "turn off" )
		{
		$command = "sudo -i -u dietpi /usr/local/bin/mupibox/./stop_bt.sh";
		exec($command, $output, $result );
		$CHANGE_TXT=$CHANGE_TXT."<li>Bluetooth is deactivated [just Software for connecting, Service and Hardware continue runnung]</li>";
		$change=1;
		}

	$command = "sudo -i -u dietpi bluetoothctl show | grep 'Powered: yes'";
	exec($command, $btoutput, $btresult );
	if( $btoutput[0] )
		{
		$bt_state = "ON";
		$change_bt = "turn off";
		$command = "sudo -i -u dietpi bluetoothctl paired-devices";
		exec($command, $pairoutput, $pairresult );
		$command = "sudo -i -u dietpi bluetoothctl list";
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
                                        print "<form class='appnitro'  method='post' action='bluetooth.php' id='remform'>";
                                        print "<input type='hidden' name='remove_mac' value='".$split_device[1]."'>";
                                        print "<input id='saveForm' class='button_text' type='submit' name='remove_selected' value='Remove' />&ensp;";
                                        print $split_device[2]." [".$split_device[1]."]";
                                        $command = "sudo -i -u dietpi bluetoothctl info ".$split_device[1]." | grep 'Connected: yes'";
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
	<details>
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