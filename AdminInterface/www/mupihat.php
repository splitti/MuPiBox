<?php
	$change=0;
	$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";
	include ('includes/header.php');


	if( $_POST['change_wled'] )
		{
		$data["wled"]["baud_rate"] = $_POST['baud_rate'];
		$data["wled"]["com_port"] = $_POST['com_port'];
		$data["wled"]["brightness_dimmed"] = $_POST['brightness_dimmed'];
		$data["wled"]["brightness_default"] = $_POST['brightness_default'];
		$data["wled"]["shutdown_id"] = $_POST['wled_shutdown_preset'];
		$data["wled"]["startup_id"] = $_POST['wled_boot_preset'];
		$data["wled"]["main_id"] = $_POST['wled_main_preset'];
		if( $_POST['wled_shutdown_active'] == "on" )
		{
			$data["wled"]["shutdown_active"]=true;
		}
		else
		{
			$data["wled"]["shutdown_active"]=false;			
		}
	
		if( $_POST['wled_boot_active'] == "on" )
		{
			$data["wled"]["boot_active"]=true;
			exec('curl -H "Content-Type: application/x-www-form-urlencoded" -d "BP='.$data["wled"]["startup_id"].'&&CA='.$data["wled"]["brightness_default"].'&&BO=on" -X POST http://'.$wled_info_data["info"]["ip"].'/settings/leds');
		}
		else
		{
			$data["wled"]["boot_active"]=false;			
			exec('curl -H "Content-Type: application/x-www-form-urlencoded" -d "BP='.$data["wled"]["startup_id"].'&&CA='.$data["wled"]["brightness_default"].'&&BO" -X POST http://'.$wled_info_data["info"]["ip"].'/settings/leds');
		}
		if( $_POST['wled_active'] )
		{
			$data["wled"]["active"]=true;
		}
		else
		{
			$data["wled"]["active"]=false;			
		}
		$change=4;
		$CHANGE_TXT=$CHANGE_TXT."<li>WLED settings changed...</li>";
		}
	if( $_POST['generate_chatId'] )
		{
		$command="sudo bash -c '/usr/local/bin/mupibox/./telegram_set_deviceid.sh'";
		exec($command, $output);
		$data["telegram"]["chatId"]=$output[0];
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Telegram Chat ID generation finished...</li>";
		}

	if( $_POST['change_telegram'] )
		{
		$data["telegram"]["chatId"]=$_POST['telegram_chatId'];
		$data["telegram"]["token"]=$_POST['telegram_token'];
		if($_POST['telegram_active'])
			{
			if (empty($data["telegram"]["chatId"]) or empty($data["telegram"]["token"]))
				{
				$CHANGE_TXT=$CHANGE_TXT."<li>Chat ID and Token are needed for service activation!!!</li>";
				$data["telegram"]["active"]=false;
				$command="sudo systemctl stop mupi_telegram.service";
				exec($command);
				$command="sudo systemctl disable mupi_telegram.service";
				exec($command);
				}
			else
				{
				$data["telegram"]["active"]=true;
				$command="sudo su dietpi -c '/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py \"Telegram enabled\"'";
				exec($command);
				$command="sudo systemctl enable mupi_telegram.service";
				exec($command);
				$command="sudo systemctl restart mupi_telegram.service";
				exec($command);
				}
			}
		else
			{
			$data["telegram"]["active"]=false;
			$command="sudo su dietpi -c '/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py \"Telegram disabled\"'";
			exec($command);
			$command="sudo systemctl stop mupi_telegram.service";
			exec($command);
			$command="sudo systemctl disable mupi_telegram.service";
			exec($command);
			}
	$CHANGE_TXT=$CHANGE_TXT."<li>Telegram configuration saved...</li>";
	$change=3;
	}
	
	if( $change == 1 )
		{
		$json_object = json_encode($data);
		$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
		exec("sudo chmod 755 /etc/mupibox/mupiboxconfig.json");
		exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
		exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
		exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
		}
	if( $change == 2 )
		{
		$json_object = json_encode($data);
		$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
		exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
		exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
		}
	if( $change == 3 )
		{
		$json_object = json_encode($data);
		$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
		exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
		$command="sudo su dietpi -c 'pm2 restart spotify-control'";
		exec($command);
		}
	if( $change == 4 )
		{
		$json_object = json_encode($data);
		$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
		exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
		}
	$CHANGE_TXT=$CHANGE_TXT."</ul></div>";
?>


<form class="appnitro" name="mupi" method="post" action="smart.php" id="form">
<div class="description">
<h2>MuPiHAT</h2>
<p>Make your MuPiBox smart...</p>
</div>
 <details  open>
  <summary><i class="fa-solid fa-house-signal"></i> Configuration</summary>
    <ul>
   <li id="li_1" >

                <h2>Battery selection</h2>
                <p>Choose your battery...</p>
				<div>
				<select id="battery" name="battery" class="element text medium">


				<?php
				$batterys = $data["mupihat"]["battery_types"];
				foreach($batterys as $battery) {
				if( $battery['name'] == $data["mupihat"]["selected_battery"] )
				{
				$selected = " selected=\"selected\"";
				}
				else
				{
				$selected = "";
				}
				print "<option value=\"". $battery['name'] . "\"" . $selected  . ">" . $battery['name'] . "</option>";
				}
				?>
				</select></div>

   </li>
  </ul>
 </details>
</form><p>

<?php
 include ('includes/footer.php');
?>
