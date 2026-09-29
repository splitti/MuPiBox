	<?php
		include ('includes/header.php');

		// The stored port and baud rate run through a root shell on every page load: quote them, and
		// only accept a serial device path and a plain number (values saved by older versions included).
		$wled_port = (string)($data["wled"]["com_port"] ?? '');
		$wled_baud = intval($data["wled"]["baud_rate"] ?? 0);
		if( preg_match('#^/dev/tty[A-Za-z0-9]+$#', $wled_port) && $wled_baud > 0 )
			{
			$command='sudo python3 /usr/local/bin/mupibox/wled_get_data.py -s '.escapeshellarg($wled_port).' -b '.$wled_baud.' -j '.escapeshellarg('{"v":true}');
			exec($command);
			}

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
			 if( $data["mqtt"]["ha_topic"]!=$_POST['ha_topic'])
				{
				$data["mqtt"]["ha_topic"]=$_POST['ha_topic'];
				}
			 if( $data["mqtt"]["ha_active"]!=$_POST['ha_active'])
				{
				if( $_POST['ha_active'] == "on" )
					{
					$data["mqtt"]["ha_active"]=true;
					$command='sudo service mupi_mqtt restart';
					exec($command);
					}
				else
					{
					$data["mqtt"]["ha_active"]=false;
					$command='sudo service mupi_mqtt restart';
					exec($command);
					}
				}

			 if( $data["mqtt"]["active"]!=$_POST['mqtt_active'])
				{
				if( $_POST['mqtt_active'] == "on" )
					{
					$data["mqtt"]["active"]=true;
					$command='sudo systemctl enable mupi_mqtt.service && sudo service mupi_mqtt start';
					exec($command);
					}
				else
					{
					$data["mqtt"]["active"]=false;
					$command='sudo service mupi_mqtt stop && sudo systemctl disable mupi_mqtt.service';
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
			// These values end up in shell commands (here and on every page load): keep only a serial
			// device path, a known baud rate and plain numbers.
			$baud_allowed = array(300,1200,2400,4800,9600,19200,38400,57600,115200,230400,460800,921600);
			// stored as strings like the template does; an empty preset id means "none"
			$digits_or_empty = function ($v) { $v = trim((string)$v); return ctype_digit($v) ? $v : ''; };
			if( in_array(intval($_POST['baud_rate']), $baud_allowed, true) )
				{
				$data["wled"]["baud_rate"] = (string)intval($_POST['baud_rate']);
				}
			if( preg_match('#^/dev/tty[A-Za-z0-9]+$#', (string)$_POST['com_port']) )
				{
				$data["wled"]["com_port"] = $_POST['com_port'];
				}
			else
				{
				$CHANGE_TXT=$CHANGE_TXT."<li>Invalid serial port ignored (expected e.g. /dev/ttyUSB0)</li>";
				}
			$data["wled"]["brightness_dimmed"] = (string)max(0, min(255, intval($_POST['brightness_dimmed'])));
			$data["wled"]["brightness_default"] = (string)max(0, min(255, intval($_POST['brightness_default'])));
			$data["wled"]["shutdown_id"] = $digits_or_empty($_POST['wled_shutdown_preset']);
			$data["wled"]["startup_id"] = $digits_or_empty($_POST['wled_boot_preset']);
			$data["wled"]["main_id"] = $digits_or_empty($_POST['wled_main_preset']);
			// The WLED address comes from the device's own answer: only use it if it is an IP address.
			$wled_ip = filter_var($wled_info_data["info"]["ip"] ?? '', FILTER_VALIDATE_IP) ?: '';
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
				if( $wled_ip !== '' )
					{
					exec('curl -H "Content-Type: application/x-www-form-urlencoded" -d '.escapeshellarg('BP='.$data["wled"]["startup_id"].'&&CA='.$data["wled"]["brightness_default"].'&&BO=on').' -X POST '.escapeshellarg('http://'.$wled_ip.'/settings/leds'));
					}
			}
			else
			{
				$data["wled"]["boot_active"]=false;
				if( $wled_ip !== '' )
					{
					exec('curl -H "Content-Type: application/x-www-form-urlencoded" -d '.escapeshellarg('BP='.$data["wled"]["startup_id"].'&&CA='.$data["wled"]["brightness_default"].'&&BO').' -X POST '.escapeshellarg('http://'.$wled_ip.'/settings/leds'));
					}
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
			$generated_id = trim($output[0]);
			// Append the freshly-detected chat to the existing list rather than
			// overwriting it. New format: array of {id, label?} objects. Old
			// format (single string) is migrated to the new format on save.
			$existing = $data["telegram"]["chatId"] ?? "";
			if (is_string($existing) || is_numeric($existing)) {
				$existing = trim((string)$existing);
				$existing = ($existing === "") ? array() : array(array("id" => $existing));
			}
			if (!is_array($existing)) {
				$existing = array();
			}
			$already = false;
			foreach ($existing as $entry) {
				$entry_id = is_array($entry) ? ($entry["id"] ?? "") : (string)$entry;
				if ((string)$entry_id === $generated_id) { $already = true; break; }
			}
			if (!$already && $generated_id !== "" && $generated_id !== "null") {
				$existing[] = array("id" => $generated_id, "label" => "");
				$CHANGE_TXT=$CHANGE_TXT."<li>Detected chat id ".$generated_id." added to the list.</li>";
			} else {
				$CHANGE_TXT=$CHANGE_TXT."<li>Telegram chat id detection: ".($generated_id === "" || $generated_id === "null" ? "no chat detected — write to your bot first" : "chat id already known")."</li>";
			}
			$data["telegram"]["chatId"] = $existing;
			$change=3;
			}

		if( $_POST['change_telegram'] )
			{
			// New form: parallel arrays telegram_chatId_id[] + telegram_chatId_label[]
			// (one row per chat). Filter out empty rows and store as array of
			// {id, label?} objects. Falls back to the legacy single-input field
			// if the array fields aren't posted.
			$ids = $_POST['telegram_chatId_id'] ?? null;
			$labels = $_POST['telegram_chatId_label'] ?? null;
			if (is_array($ids)) {
				$normalized = array();
				foreach ($ids as $i => $raw) {
					$id = trim((string)$raw);
					if ($id === "") continue;
					$entry = array("id" => $id);
					$lbl = isset($labels[$i]) ? trim((string)$labels[$i]) : "";
					if ($lbl !== "") $entry["label"] = $lbl;
					$normalized[] = $entry;
				}
				$data["telegram"]["chatId"] = $normalized;
			} else {
				// Legacy single-input fallback
				$data["telegram"]["chatId"] = $_POST['telegram_chatId'] ?? "";
			}
			$data["telegram"]["token"]=$_POST['telegram_token'];
			$data["telegram"]["notifyPlayback"] = !empty($_POST['telegram_notifyPlayback']);
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
					// (no "Telegram enabled" message to all chats on every save any more)
					$command="sudo systemctl enable mupi_telegram.service";
					exec($command);
					$command="sudo systemctl restart mupi_telegram.service";
					exec($command);
					}
				}
			else
				{
				$data["telegram"]["active"]=false;
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
			save_mupiboxconfig($data);
			exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
			exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
			}
		if( $change == 2 )
			{
			save_mupiboxconfig($data);
			exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
			}
		if( $change == 3 )
			{
			save_mupiboxconfig($data);
			$command="sudo su dietpi -c 'pm2 restart spotify-control'";
			exec($command);
			}
		if( $change == 4 )
			{
			save_mupiboxconfig($data);
			}
		$CHANGE_TXT=$CHANGE_TXT."</ul></div>";
	?>


	<form class="appnitro" name="mupi" method="post" action="smart.php" id="form">
	<div class="description">
	<h2>Smart settings</h2>
	<p>Make your MuPiBox smart...</p>
	</div>
	 <details id="mqttconfig">
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
					print htmlspecialchars((string)($data["mqtt"]["name"] ?? ''), ENT_QUOTES);
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>Broker</h3>
					<div>
					<input id="mqtt_broker" name="mqtt_broker" class="element text medium" type="text" maxlength="255" value="<?php
					print htmlspecialchars((string)($data["mqtt"]["broker"] ?? ''), ENT_QUOTES);
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>Port</h3>
					<div>
					<input id="mqtt_port" name="mqtt_port" class="element text medium" type="number" maxlength="5" value="<?php
					print htmlspecialchars((string)($data["mqtt"]["port"] ?? ''), ENT_QUOTES);
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>Topic</h3>
					<div>
					<input id="mqtt_topic" name="mqtt_topic" class="element text medium" type="text" maxlength="255" value="<?php
					print htmlspecialchars((string)($data["mqtt"]["topic"] ?? ''), ENT_QUOTES);
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>ClientID</h3>
					<div>
					<input id="mqtt_clientId" name="mqtt_clientId" class="element text medium" type="text" maxlength="255" value="<?php
					print htmlspecialchars((string)($data["mqtt"]["clientId"] ?? ''), ENT_QUOTES);
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>MQTT username</h3>
					<div>
					<input id="mqtt_username" name="mqtt_username" class="element text medium" type="text" maxlength="255" value="<?php
					print htmlspecialchars((string)($data["mqtt"]["username"] ?? ''), ENT_QUOTES);
					?>" />
					</div>
				</li>
				<li id="li_1" >
					<h3>MQTT password</h3>
					<div>
					<input id="mqtt_password" name="mqtt_password" class="element text medium" type="password" maxlength="255" value="<?php
					print htmlspecialchars((string)($data["mqtt"]["password"] ?? ''), ENT_QUOTES);
					?>" />
					</div>
				</li>
			<li id="li_1" >
				<h2>Refresh interval</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo htmlspecialchars((string)($data["mqtt"]["refresh"] ?? ''), ENT_QUOTES) . " seconds"
				?></output>				
				
				<input class="range slider-progress" name="mqtt_refresh" type="range" min="1" max="90" step="1.0" value="<?php 
					echo htmlspecialchars((string)($data["mqtt"]["refresh"] ?? ''), ENT_QUOTES)
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>

			<li id="li_1" >
				<h2>Refresh interval idle</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo htmlspecialchars((string)($data["mqtt"]["refreshIdle"] ?? ''), ENT_QUOTES) . " seconds"
				?></output>				
				
				<input class="range slider-progress" name="mqtt_refreshIdle" type="range" min="1" max="90" step="1.0" value="<?php 
					echo htmlspecialchars((string)($data["mqtt"]["refreshIdle"] ?? ''), ENT_QUOTES)
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>
			<li id="li_1" >
				<h2>Timeout</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo htmlspecialchars((string)($data["mqtt"]["timeout"] ?? ''), ENT_QUOTES) . " seconds"
				?></output>				
				
				<input class="range slider-progress" name="mqtt_timeout" type="range" min="10" max="180" step="5.0" value="<?php 
					echo htmlspecialchars((string)($data["mqtt"]["timeout"] ?? ''), ENT_QUOTES)
				?>" oninput="this.previousElementSibling.value = this.value">
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

	   	   <li id="li_1" ><div>
		 <label class="labelchecked" for="ha_active">Publish MQTT to Homeasssistant:&nbsp; &nbsp; <input type="checkbox" id="ha_active" name="ha_active" <?php
		 if( $data["mqtt"]["ha_active"] )
		  {
		  print "checked";
		  }
	?> /></label></div>
	   </li>
				<li id="li_1" >
					<h3>Homeassistant discovery prefix</h3>
					<p>Default: homeassistant</p><div>
					<input id="ha_topic" name="ha_topic" class="element text medium" type="text" maxlength="255" value="<?php
					print htmlspecialchars((string)($data["mqtt"]["ha_topic"] ?? ''), ENT_QUOTES);
					?>" />
					</div>
				</li>


		<input id="saveForm" class="button_text" type="submit" name="change_mqtt" value="Save MQTT-Config" />
	  </ul>
	 </details>

	 <details id="telegramconfig">
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

	   <li id="li_1" ><div>
		 <label class="labelchecked" for="telegram_notifyPlayback">Report playback:&nbsp; &nbsp; <input type="checkbox" id="telegram_notifyPlayback"  name="telegram_notifyPlayback" <?php
		 if( !empty($data["telegram"]["notifyPlayback"]) )
		  {
		  print "checked";
		  }
	?> /></label></div>
		<p class="guidelines"><small>Off: the bot only reports what matters (listening time used up, quiet time, low battery, start and shutdown) and is there for the commands. On: also every start, every track (with a screenshot), pause, stop and continue.</small></p>
	   </li>

	   <li id="li_1" >
					<label class="description" for="telegram_token">Telegram token</label>
					<div>
							<input id="telegram_token" name="telegram_token" class="element text medium" type="text" maxlength="255" value="<?php
							print htmlspecialchars((string)($data["telegram"]["token"] ?? ''), ENT_QUOTES);
	?>"/>
					</div><p class="guidelines" id="guide_1"><small>Please enter your telegram token.</small></p>
	   </li>

	   <li id="li_1" >
					<label class="description">Telegram Chat IDs</label>
					<div id="telegram_chatId_list">
<?php
	// Normalize stored value to a list of {id, label} pairs for display.
	$entries = array();
	$stored = $data["telegram"]["chatId"] ?? "";
	if (is_string($stored) || is_numeric($stored)) {
		$s = trim((string)$stored);
		if ($s !== "") $entries[] = array("id" => $s, "label" => "");
	} elseif (is_array($stored)) {
		foreach ($stored as $entry) {
			if (is_array($entry)) {
				$id = trim((string)($entry["id"] ?? ""));
				if ($id === "") continue;
				$entries[] = array("id" => $id, "label" => trim((string)($entry["label"] ?? "")));
			} elseif (is_string($entry) || is_numeric($entry)) {
				$id = trim((string)$entry);
				if ($id !== "") $entries[] = array("id" => $id, "label" => "");
			}
		}
	}
	if (empty($entries)) {
		// One empty row so the user has somewhere to type
		$entries[] = array("id" => "", "label" => "");
	}
	foreach ($entries as $entry) {
		echo '<div class="telegram_chatId_row" style="display:flex;gap:0.5em;margin-bottom:0.3em;align-items:center;">';
		echo '<input name="telegram_chatId_id[]" type="text" maxlength="64" placeholder="Chat ID (z. B. -1001234567890)" style="flex:1;" value="'.htmlspecialchars($entry["id"], ENT_QUOTES).'"/>';
		echo '<input name="telegram_chatId_label[]" type="text" maxlength="64" placeholder="Label (optional, z. B. Familie)" style="flex:1;" value="'.htmlspecialchars($entry["label"], ENT_QUOTES).'"/>';
		echo '<button type="button" onclick="removeTelegramChat(this)">Entfernen</button>';
		echo '</div>';
	}
?>
					</div>
					<button type="button" onclick="addTelegramChat()" style="margin-top:0.5em;">+ Chat hinzufügen</button>
					<p class="guidelines" id="guide_1"><small>Eine Zeile pro Chat oder Gruppe. Label ist optional und nur fürs eigene Wiedererkennen. Leere Zeilen werden beim Speichern verworfen. „Generate Telegram Chat ID" hängt einen neu erkannten Chat an die Liste an.</small></p>
	   </li>

<script>
function addTelegramChat() {
	var list = document.getElementById('telegram_chatId_list');
	var row = document.createElement('div');
	row.className = 'telegram_chatId_row';
	row.style.cssText = 'display:flex;gap:0.5em;margin-bottom:0.3em;align-items:center;';
	row.innerHTML =
		'<input name="telegram_chatId_id[]" type="text" maxlength="64" placeholder="Chat ID (z. B. -1001234567890)" style="flex:1;"/>' +
		'<input name="telegram_chatId_label[]" type="text" maxlength="64" placeholder="Label (optional, z. B. Familie)" style="flex:1;"/>' +
		'<button type="button" onclick="removeTelegramChat(this)">Entfernen</button>';
	list.appendChild(row);
}
function removeTelegramChat(btn) {
	var row = btn.closest('.telegram_chatId_row');
	if (row && row.parentNode) row.parentNode.removeChild(row);
}
</script>


	   <li class="buttons">
		<input id="saveForm" class="button_text" type="submit" name="change_telegram" value="Save Telegram Configuration" />
		<input id="saveForm" class="button_text" type="submit" name="generate_chatId" value="Generate Telegram Chat ID" />
	   </li>
	  </ul>
	 </details>
	 <details id="wledconfig">
	  <summary><i class="fa-solid fa-lightbulb"></i> WLED</summary>
		<ul>
	   <li id="li_1" >

					<h2>WLED configuration</h2>
					<li id="li_1" >
					<h3>Serial / Com-Port</h3>
					<p>Just change this value, if you really know what you do! Default: /dev/ttyUSB0</p>
					<div>
					<input id="com_port" name="com_port" class="element text medium" type="text" maxlength="255" value="<?php
					print htmlspecialchars((string)($data["wled"]["com_port"] ?? ''), ENT_QUOTES);
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
						<output id="rangeval" class="rangeval"><?php echo htmlspecialchars((string)($data["wled"]["brightness_default"] ?? ''), ENT_QUOTES); ?></output>
						<input class="range slider-progress" list="steplist_po" data-tick-step="1" name="brightness_default" type="range" min="0" max="255" step="1.0" value="<?php echo htmlspecialchars((string)($data["wled"]["brightness_default"] ?? ''), ENT_QUOTES); ?>" oninput="this.previousElementSibling.value = this.value">
			

					</div>
				</li>
	   <li id="li_1" >
					<div>	<h3>Dimmed brightness</h3>
						<output id="rangeval" class="rangeval"><?php echo htmlspecialchars((string)($data["wled"]["brightness_dimmed"] ?? ''), ENT_QUOTES); ?></output>
						<input class="range slider-progress" list="steplist_po" data-tick-step="1" name="brightness_dimmed" type="range" min="0" max="255" step="1.0" value="<?php echo htmlspecialchars((string)($data["wled"]["brightness_dimmed"] ?? ''), ENT_QUOTES); ?>" oninput="this.previousElementSibling.value = this.value">
			

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
