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
	$onlinejson = file_get_contents('https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json');
	$dataonline = json_decode($onlinejson, true);
	include ('includes/header.php');

	if( $_POST['scan_new'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./start_bt.sh";
		exec($command, $output, $result );
		$change=1;		
		}

	if( $_POST['change_bt'] == "turn on" )
		{
		$command = "sudo /usr/local/bin/mupibox/./start_bt.sh";
		exec($command, $output, $result );
		$change=1;
		}
	else if( $_POST['change_bt'] == "turn off" )
		{
		$command = "sudo /usr/local/bin/mupibox/./stop_bt.sh";
		exec($command, $output, $result );
		$change=1;
		}

	$rc = $output[count($output)-1];
	$command = "sudo bluetoothctl show | grep 'Powered: yes'";
	exec($command, $smboutput, $smbresult );
	if( $smboutput[0] )
		{
		$bt_state = "ON";
		$change_bt = "turn off";
		}
	else
		{
		$bt_state = "OFF";
		$change_bt = "turn on";
		}
?>

                <form class="appnitro"  method="post" action="bluetooth.php">
                                        <div class="description">
                        <h2>MupiBox bluetooth settings</h2>
                        <p> Set up bluetooth connections...</p>
                </div>
                        <ul ><li id="li_1" >
                                        
								<li class="li_1"><h2>Bluetooth power state</h2>
								<p>
								<?php 
								echo "Bluetooth power state: <b>".$bt_state."</b>";
								?>
								</p>
								<input id="saveForm" class="button_text" type="submit" name="change_bt" value="<?php print $change_bt; ?>" /></li>



                 <li id="li_1" >
                <div>
                        <select id="bt_device" name="bt_device" class="element text medium">
<?php
						$string = file_get_contents('/tmp/bt_scan', true);
						while (($line = fgetcsv($string, 0, "\t")) !== false) {
							print "<option value=\"". $line[1] . "\">" . $line[2] . "</option>";
						}
?>
</select>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Default: MuPiBox</small></p>
				<input id="saveForm" class="button_text" type="submit" name="scan_new" value="Scan for devices" />
				<input id="saveForm" class="button_text" type="submit" name="pair_selected" value="Pair selected device" />
                </li>

                        </ul>
                </form>
        </div>
<?php
	include ('includes/footer.html');
?>