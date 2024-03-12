	<?php
		$change=0;
		$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";
		include ('includes/header.php');

		$command='sudo python3 /usr/local/bin/mupibox/wled_get_data.py -s '.$data["wled"]["com_port"].' -b '.$data["wled"]["baud_rate"].' -j {"v":true}';
		exec($command);

		$info_string = file_get_contents('/tmp/.wled.info.json', true);
		$wled_info_data = json_decode($info_string, true);
		$presets_string = file_get_contents('/tmp/.wled.presets.json', true);
		$wled_presets_data = json_decode($presets_string, true);

		if( $_POST['change_mqtt'] )
			{
			 if( $data["mqtt"]["name"]!=$_POST['mqtt_name'])
				{
				$data["mqtt"]["name"]=$_POST['mqtt_name'];
				}
			 if( $data["mqtt"]["active"]!=$_POST['mqtt_active'])
				{
				if( $_POST['mqtt_active'] == "on" )
					{
					$data["mqtt"]["active"]=true;
					$command='sudo systemctl enable mupi-mqtt.service && sudo service mupi-mqtt start';
					exec($command);
					}
				else
					{
					$data["mqtt"]["active"]=false;
					$command='sudo service mupi-mqtt stop && sudo systemctl disable mupi-mqtt.service';
					exec($command);
					}
				}
			 if( $data["mqtt"]["broker"]!=$_POST['mqtt_broker'])
				{
				$data["mqtt"]["broker"]=$_POST['mqtt_broker'];
				}
			 if( $data["mqtt"]["port"]!=$_POST['mqtt_port'])
				{
				$data["mqtt"]["port"]=$_POST['mqtt_port'];
				}
			 if( $data["mqtt"]["topic"]!=$_POST['mqtt_topic'])
				{
				$data["mqtt"]["topic"]=$_POST['mqtt_topic'];
				}
			 if( $data["mqtt"]["clientId"]!=$_POST['mqtt_clientId'])
				{
				$data["mqtt"]["clientId"]=$_POST['mqtt_clientId'];
				}
			 if( $data["mqtt"]["username"]!=$_POST['mqtt_username'])
				{
				$data["mqtt"]["username"]=$_POST['mqtt_username'];
				}
			 if( $data["mqtt"]["password"]!=$_POST['mqtt_password'])
				{
				$data["mqtt"]["password"]=$_POST['mqtt_password'];
				}
			 if( $data["mqtt"]["refresh"]!=$_POST['mqtt_refresh'])
				{
				$data["mqtt"]["refresh"]=$_POST['mqtt_refresh'];
				}
			 if( $data["mqtt"]["refreshIdle"]!=$_POST['mqtt_refreshIdle'])
				{
				$data["mqtt"]["refreshIdle"]=$_POST['mqtt_refreshIdle'];
				}
			 if( $data["mqtt"]["timeout"]!=$_POST['mqtt_timeout'])
				{
				$data["mqtt"]["timeout"]=$_POST['mqtt_timeout'];
				}
			$change=4;
			$CHANGE_TXT=$CHANGE_TXT."<li>MQTT settings changed...</li>";
							
			}

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
	<h2>Smart settings</h2>
	<p>Make your MuPiBox smart...</p>
	</div>
	 <details>
	  <summary><i class="fa-solid fa-house-signal"></i> MQTT</summary>
		<ul>
	   <li id="li_1" >

					<h2>MQTT configuration</h2>
					<p>Coming soon...</p>
		</li>
				<li id="li_1" >
					<h3>Public device name</h3>
					<div>
					<input id="mqtt_name" name="mqtt_name" class="element text medium" type="text" maxlength="255" value="<?php
					print $data["mqtt"]["name"];
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>Broker</h3>
					<div>
					<input id="mqtt_broker" name="mqtt_broker" class="element text medium" type="text" maxlength="255" value="<?php
					print $data["mqtt"]["broker"];
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>Port</h3>
					<div>
					<input id="mqtt_port" name="mqtt_port" class="element text medium" type="number" maxlength="5" value="<?php
					print $data["mqtt"]["port"];
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>Topic</h3>
					<div>
					<input id="mqtt_topic" name="mqtt_topic" class="element text medium" type="text" maxlength="255" value="<?php
					print $data["mqtt"]["topic"];
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>ClientID</h3>
					<div>
					<input id="mqtt_clientId" name="mqtt_clientId" class="element text medium" type="text" maxlength="255" value="<?php
					print $data["mqtt"]["clientId"];
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>MQTT username</h3>
					<div>
					<input id="mqtt_username" name="mqtt_username" class="element text medium" type="text" maxlength="255" value="<?php
					print $data["mqtt"]["username"];
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>MQTT password</h3>
					<div>
					<input id="mqtt_password" name="mqtt_password" class="element text medium" type="password" maxlength="255" value="<?php
					print $data["mqtt"]["password"];
					?>" />
					</div>
				</li>
			<li id="li_1" >
				<h2>Refresh interval</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["mqtt"]["refresh"] . " seconds"
				?></output>				
				
				<input class="range slider-progress" name="mqtt_refresh" type="range" min="1" max="90" step="1.0" value="<?php 
					echo $data["mqtt"]["refresh"]
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>

			<li id="li_1" >
				<h2>Refresh interval idle</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["mqtt"]["refreshIdle"] . " seconds"
				?></output>				
				
				<input class="range slider-progress" name="mqtt_refreshIdle" type="range" min="1" max="90" step="1.0" value="<?php 
					echo $data["mqtt"]["refreshIdle"]
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>
			<li id="li_1" >
				<h2>Timeout</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["mqtt"]["timeout"] . " seconds"
				?></output>				
				
				<input class="range slider-progress" name="mqtt_timeout" type="range" min="10" max="180" step="5.0" value="<?php 
					echo $data["mqtt"]["timeout"]
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>

	   	   <li id="li_1" ><div>
		 <label class="labelchecked" for="ha_mqtt_active">Publish MQTT to Homeasssistant:&nbsp; &nbsp; <input type="checkbox" id="ha_mqtt_active"  name="ha_mqtt_active" <?php
		 if( $data["mqtt"]["ha_mqtt_active"] )
		  {
		  print "checked";
		  }
	?> /></label></div>
	   </li>
				<li id="li_1" >
					<h3>Homeassistant discovery prefix</h3>
					<p>Default: homeassistant</p><div>
					<input id="ha_topic" name="ha_topic" class="element text medium" type="text" maxlength="255" value="<?php
					print $data["mqtt"]["ha_topic"];
					?>" />
					</div>
				</li>


	   	   <li id="li_1" ><div>
		 <label class="labelchecked" for="mqtt_active">MQTT activation state:&nbsp; &nbsp; <input type="checkbox" id="mqtt_active"  name="mqtt_active" <?php
		 if( $data["mqtt"]["active"] )
		  {
		  print "checked";
		  }
	?> /></label></div>
	   </li>
		<input id="saveForm" class="button_text" type="submit" name="change_mqtt" value="Save MQTT-Config" />
	  </ul>
	 </details>

	 <details>
	  <summary><i class="fa-brands fa-telegram"></i> Telegram</summary>
		<ul>
	   <li id="li_1" >

					<h2>Telegram configuration</h2>
					<p>Please check the tutorial before activation: <a href="https://mupibox.de/anleitungen/einstellungen/tutorial-telegram-control/" target='_blank_'>Tutorial</a></p>
	   </li>

	   <li id="li_1" ><div>
		 <label class="labelchecked" for="telegram_active">Telegram activation state:&nbsp; &nbsp; <input type="checkbox" id="telegram_active"  name="telegram_active" <?php
		 if( $data["telegram"]["active"] )
		  {
		  print "checked";
		  }
	?> /></label></div>
	   </li>

	   <li id="li_1" >
					<label class="description" for="telegram_token">Telegram token</label>
					<div>
							<input id="telegram_token" name="telegram_token" class="element text medium" type="text" maxlength="255" value="<?php
							print $data["telegram"]["token"];
	?>"/>
					</div><p class="guidelines" id="guide_1"><small>Please enter your telegram token.</small></p>
	   </li>

	   <li id="li_1" >
					<label class="description" for="telegram_chatId">Telegram ChatID</label>
					<div>
							<input id="telegram_chatId" name="telegram_chatId" class="element text medium" type="text" maxlength="255" value="<?php
							print $data["telegram"]["chatId"];
	?>"/>
					</div><p class="guidelines" id="guide_1"><small>Please enter your telegram ChatId.</small></p>
	   </li>


	   <li class="buttons">
		<input id="saveForm" class="button_text" type="submit" name="change_telegram" value="Save Telegram Configuration" />
		<input id="saveForm" class="button_text" type="submit" name="generate_chatId" value="Generate Telegram Chat ID" />
	   </li>
	  </ul>
	 </details>
	 <details>
	  <summary><i class="fa-solid fa-lightbulb"></i> WLED</summary>
		<ul>
	   <li id="li_1" >

					<h2>WLED configuration</h2>
					<li id="li_1" >
					<h3>Serial / Com-Port</h3>
					<p>Just change this value, if you really know what you do! Default: /dev/ttyUSB0</p>
					<div>
					<input id="com_port" name="com_port" class="element text medium" type="text" maxlength="255" value="<?php
					print $data["wled"]["com_port"];
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>Baud-rate</h3>
					<p>Serial connection speed in bits per second - mostly recommend 115200bps!</p>
					<div>
					<select id="baud_rate" name="baud_rate" class="element text medium">
					<?php 
					$baud_rates = array(300,1200,2400,4800,9600,19200,38400,57600,115200,230400,460800,921600);
					foreach($baud_rates as $baud) {
					if( $baud == $data["wled"]["baud_rate"] )
						{
						$selected = " selected=\"selected\"";
						}
					else
						{
						$selected = "";
						}
					print "<option value=\"". $baud . "\"" . $selected  . ">" . $baud . "bps</option>";
					}
					?>
					</select></div>
				</li>
			<h3>WLED Controller Information</h3>

	<?php

		if( empty($wled_info_data["info"]["ver"]) )
			{
			print "<p>No WLED-Device found...</p>";
			}
		else
			{ ?>
				
		<p><table class="version"><tr><td>IP: </td><td><?php print $wled_info_data["info"]["ip"]; ?></td></tr>
		<tr><td>MAC: </td><td><?php print $wled_info_data["info"]["mac"]; ?></td></tr>
		<tr><td>Name: </td><td><?php print $wled_info_data["info"]["name"]; ?></td></tr>
		<tr><td>ESP: </td><td><?php print $wled_info_data["info"]["arch"]; ?></td></tr>
		<tr><td>Version: </td><td><?php print $wled_info_data["info"]["ver"]; ?></td></tr></table></p>
		<h3>WLED existing presets</h3>
		<p><table class="version"><tr><th>ID</th><th>PRESET</th></tr>
									<?php
									$presets = $wled_presets_data;
									$i=0;
									foreach($presets as $preset) {
											if( $i >0 )
													{
											print "<tr><td>".$i."</td><td>";
											print $preset['n'];
											print "</td></tr>";
											}
											$i+=1;
									}
									?></table></p>		
					<p>
		<h3>Set Boot-Preset</h3>
					<div>
					<select id="wled_boot_preset" name="wled_boot_preset" class="element text medium">
	<?php
	$presets = $wled_presets_data;
	$i=0;
	foreach($presets as $preset) {
		if( $i >0 )
			{
			if( $i == $data["wled"]["startup_id"] )
					{
					$selected = " selected=\"selected\"";
					}
			else
					{
					$selected = "";
					}
			print "<option value=\"". $i . "\"" . $selected  . ">" . $preset['n'] . "</option>";
			}
		$i+=1;	
		}
		?>
		</select></div></p>
					<p>
		<h3>Set Playback-Preset</h3>
					<div>
					<select id="wled_main_preset" name="wled_main_preset" class="element text medium">
	<?php
	$presets = $wled_presets_data;
	$i=0;
	foreach($presets as $preset) {
		if( $i >0 )
			{
			if( $i == $data["wled"]["main_id"] )
					{
					$selected = " selected=\"selected\"";
					}
			else
					{
					$selected = "";
					}
			print "<option value=\"". $i . "\"" . $selected  . ">" . $preset['n'] . "</option>";
			}
		$i+=1;	
		}
		?>
		</select></div></p>
					<p>
		<h3>Set Shutdown-Preset</h3>
					<div>
					<select id="wled_shutdown_preset" name="wled_shutdown_preset" class="element text medium">
	<?php
	$presets = $wled_presets_data;
	$i=0;
	foreach($presets as $preset) {
		if( $i >0 )
			{
			if( $i == $data["wled"]["shutdown_id"] )
					{
					$selected = " selected=\"selected\"";
					}
			else
					{
					$selected = "";
					}
			print "<option value=\"". $i . "\"" . $selected  . ">" . $preset['n'] . "</option>";

			}
		$i+=1;	
		}
		?>
		</select></div></p>

	   <li id="li_1" ><div>
		 <label class="labelchecked" for="wled_boot_active">WLED activation boot preset:&nbsp; &nbsp; <input type="checkbox" id="wled_boot_active"  name="wled_boot_active" <?php
		 if( $data["wled"]["boot_active"] )
		  {
		  print "checked";
		  }
	?> /></label></div>

	   <li id="li_1" ><div>
		 <label class="labelchecked" for="wled_shutdown_active">WLED activation shutdown preset:&nbsp; &nbsp; <input type="checkbox" id="wled_shutdown_active"  name="wled_shutdown_active" <?php
		 if( $data["wled"]["shutdown_active"] )
		  {
		  print "checked";
		  }
	?> /></label></div>
	   <li id="li_1" >
					<div>	<h3>Default brightness</h3>
					<p>Please notice: This value will overwrite brightness settings of the presets!</p>
						<output id="rangeval" class="rangeval"><?php echo $data["wled"]["brightness_default"]; ?></output>
						<input class="range slider-progress" list="steplist_po" data-tick-step="1" name="brightness_default" type="range" min="0" max="255" step="1.0" value="<?php echo $data["wled"]["brightness_default"]; ?>" oninput="this.previousElementSibling.value = this.value">
			

					</div>
				</li>
	   <li id="li_1" >
					<div>	<h3>Dimmed brightness</h3>
						<output id="rangeval" class="rangeval"><?php echo $data["wled"]["brightness_dimmed"]; ?></output>
						<input class="range slider-progress" list="steplist_po" data-tick-step="1" name="brightness_dimmed" type="range" min="0" max="255" step="1.0" value="<?php echo $data["wled"]["brightness_dimmed"]; ?>" oninput="this.previousElementSibling.value = this.value">
			

					</div>
				</li>
	   <li id="li_1" ><div>
		 <label class="labelchecked" for="wled_active">WLED activation state:&nbsp; &nbsp; <input type="checkbox" id="wled_active"  name="wled_active" <?php
		 if( $data["wled"]["active"] )
		  {
		  print "checked";
		  }
	?> /></label></div>
	   </li>
			<?php
			}
			?>
		<input id="saveForm" class="button_text" type="submit" name="change_wled" value="Save WLED-Config" />
							</li>
	   </li>
  </ul>
 </details>


	</form><p>

	<?php
	 include ('includes/footer.php');
	?>
