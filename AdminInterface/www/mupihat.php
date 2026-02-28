<?php
	include ('includes/header.php');

	if( $_POST['save_custom'] )
		{
		// Erstelle ein leeres Array für die benutzerdefinierte Batteriekonfiguration
		$custom_battery_config = array();

		// Durchsuche das Array nach der benutzerdefinierten Batteriekonfiguration
		foreach ($data["mupihat"]["battery_types"] as $key => $battery_type) {
			if ($battery_type["name"] === "Custom") {
				// Speichere die benutzerdefinierte Batteriekonfiguration aus dem Formular in das Array
				$custom_battery_config["v_100"] = $_POST['v_100'];
				$custom_battery_config["v_75"] = $_POST['v_75'];
				$custom_battery_config["v_50"] = $_POST['v_50'];
				$custom_battery_config["v_25"] = $_POST['v_25'];
				$custom_battery_config["v_0"] = $_POST['v_0'];
				$custom_battery_config["th_warning"] = $_POST['th_warning'];
				$custom_battery_config["th_shutdown"] = $_POST['th_shutdown'];

				// Aktualisiere die benutzerdefinierte Batteriekonfiguration im Datenarray
				$data["mupihat"]["battery_types"][$key]["config"] = $custom_battery_config;

				// Führe den Code zum Speichern und Aktualisieren der Konfiguration aus
				$change = 4;
				$CHANGE_TXT = $CHANGE_TXT . "<li>Custom battery configuration saved</li>";
				break; // Beende die Schleife, da die Konfiguration gefunden und aktualisiert wurde
			}
		}
		}

	if( $_POST['activate_the_hat'] )
		{
			if($_POST['mupihat_active'])
				{
				$data["mupihat"]["hat_active"] = true;
				exec("sudo /usr/local/bin/mupibox/./enable_mupihat.sh");
				$CHANGE_TXT=$CHANGE_TXT."<li>MuPiHAT is active now - sound card set to MAX98357A bcm2835-i2s-HiFi HiFi-0. The MuPiBox will now restart.</li>";
				$change=2;
				$reboot = 1;
				}
			else
				{
				$data["mupihat"]["hat_active"] = false;
				exec("sudo /usr/local/bin/mupibox/./disable_mupihat.sh");
				$CHANGE_TXT=$CHANGE_TXT."<li>MuPiHAT is deactivated - - sound card set to Onboard 3.5mm output. The MuPiBox will now restart.</li>";
				$change=2;
				$reboot = 1;
				}
		}
	
	if( $_POST['save_battery'] )
		{
		$data["mupihat"]["selected_battery"] = $_POST['battery'];
		if($data["mupihat"]["hat_active"])
			{
			$change=5;
			$CHANGE_TXT=$CHANGE_TXT."<li>New battery " . $_POST['battery'] . " settings are active</li>";
			}
		else
			{
			$change=4;
			$CHANGE_TXT=$CHANGE_TXT."<li>New battery " . $_POST['battery'] . " settings are saved</li>";
			}
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
	if( $change == 5 )
		{
		$json_object = json_encode($data);
		$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
		exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
		exec("sudo service mupi_hat restart");
		}
	$CHANGE_TXT=$CHANGE_TXT."</ul></div>";
?>

<script>
	// Funktion für die AJAX-Anfrage
	function updateTable() {
		var xhttp = new XMLHttpRequest();
		xhttp.onreadystatechange = function() {
			if (this.readyState == 4 && this.status == 200) {
				// Parse JSON-Daten in ein JavaScript-Objekt
				var mupihatData = JSON.parse(this.responseText);
				
				// Fülle die Tabelle mit den erhaltenen Daten
				document.getElementById("Charger_Status").innerText = mupihatData.Charger_Status;
				document.getElementById("Vbat").innerText = mupihatData.Vbat + "mV";
				document.getElementById("Vbus").innerText = mupihatData.Vbus + "mV";
				document.getElementById("Ibat").innerText = mupihatData.Ibat + "mA";
				document.getElementById("IBus").innerText = mupihatData.IBus + "mA";
				document.getElementById("Temp").innerText = mupihatData.Temp + "°C";
				document.getElementById("Bat_SOC").innerText = mupihatData.Bat_SOC;
				document.getElementById("Bat_Stat").innerText = mupihatData.Bat_Stat;
				document.getElementById("Bat_Type").innerText = mupihatData.Bat_Type;
			}
		};
		xhttp.open("GET", "update_mupihattable.php", true); // Passe den Pfad zur Serverseite an
		xhttp.send();
	}

</script>	
<form class="appnitro" name="mupi" method="post" action="mupihat.php" id="form">
<div class="description">
<h2>MuPiHAT</h2>
<p>Release the power of MuPi...</p>
</div>
<?php
	if( $mupihat_state ) {
?>
 <details id="mupihatstatus">
  <summary><i class="fa-solid fa-circle-info"></i> Status</summary>
    <ul>
   <li id="li_1" >
		<h2>Battery Status</h2>
        <p>Will be refreshed in 5 second interval...</p>
		<table class="version">
			<tr><td>Charger status:</td><td id="Charger_Status"></td></tr>
			<tr><td>Vbat (battery mV):</td><td id="Vbat"></td></tr>
			<tr><td>Vbus (charger mV):</td><td id="Vbus"></td></tr>
			<tr><td>Ibat (dis- / charge mA):</td><td id="Ibat"></td></tr>
			<tr><td>IBus (charger mA):</td><td id="IBus"></td></tr>
			<tr><td>Temperature:</td><td id="Temp"></td></tr>
			<tr><td>Bat_SOC (battery level):</td><td id="Bat_SOC"></td></tr>
			<tr><td>Bat_Stat (battery status):</td><td id="Bat_Stat"></td></tr>
			<tr><td>Bat_Type (battery type):</td><td id="Bat_Type"></td></tr>
		</table>
   </li>
  </ul>
 </details>
<?php
}
 ?>
 <details id="mupihatconfiguration">
  <summary><i class="fa-solid fa-battery-three-quarters"></i> Configuration</summary>
    <ul>
   <li id="li_1" >
	<h2>MuPiHAT activation</h2>
	<p>This setting activates the MuPiHAT including the soundcard. The MuPiBox restarts after the change.</p>
	<label class="labelchecked" for="mupihat_active">MuPiHAT activation state:&nbsp; &nbsp; <input type="checkbox" id="mupihat_active"  name="mupihat_active" <?php
	if( $data["mupihat"]["hat_active"] )
		{
		print "checked";
		}
?> /></label>
	<input id="saveForm" class="button_text" type="submit" name="activate_the_hat" value="Save" />
	</li>


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
	<input id="saveForm" class="button_text" type="submit" name="save_battery" value="Save" />
	</select></div>
   </li>
   <li id="li_1" >
	<h2>Custom battery</h2>
	<p>Configure your own battery...</p>
	<div>
		<label class="description" for="battery">v_100 in mV (100% battery)</label>
				<input id="v_100" name="v_100" class="element text medium" type="text" maxlength="4" value="<?php
				// Den Namen der gesuchten Konfiguration
				$desired_config_name = 'Custom';

				// Iteriere durch die "battery_types", um die gewünschte Konfiguration zu finden
				foreach ($data['mupihat']['battery_types'] as $battery_type) {
					if ($battery_type['name'] === $desired_config_name) {
						// Die gewünschte Konfiguration gefunden
						$desired_config = $battery_type['config'];
						break;
					}
				}
				
				print $desired_config["v_100"];
	?>"/>
		</div>
	<div>
		<label class="description" for="battery">v_75 in mV (75% battery)</label>
				<input id="v_75" name="v_75" class="element text medium" type="text" maxlength="4" value="<?php
				print $desired_config["v_75"];
	?>"/>
		</div>
	<div>
		<label class="description" for="battery">v_50 in mV (50% battery)</label>
				<input id="v_50" name="v_50" class="element text medium" type="text" maxlength="4" value="<?php
				print $desired_config["v_50"];
	?>"/>
		</div>
	<div>
		<label class="description" for="battery">v_25 in mV (25% battery)</label>
				<input id="v_25" name="v_25" class="element text medium" type="text" maxlength="4" value="<?php
				print $desired_config["v_25"];
	?>"/>
		</div>
	<div>
		<label class="description" for="battery">v_0 in mV (0% battery)</label>
				<input id="v_0" name="v_0" class="element text medium" type="text" maxlength="4" value="<?php
				print $desired_config["v_0"];
	?>"/>
		</div>
	<div>
		<label class="description" for="battery">th_warning in mV (warning level)</label>
				<input id="th_warning" name="th_warning" class="element text medium" type="text" maxlength="4" value="<?php
				print $desired_config["th_warning"];
	?>"/>
		</div>
	<div>
		<label class="description" for="battery">th_shutdown in mV (shutdown level)</label>
				<input id="th_shutdown" name="th_shutdown" class="element text medium" type="text" maxlength="4" value="<?php
				print $desired_config["th_shutdown"];
	?>"/>
		</div>
	<input id="saveForm" class="button_text" type="submit" name="save_custom" value="Save" />

   </li>
  </ul>
 </details>
</form><p>
<script>

    // Funktionsaufruf, um die Tabelle beim Laden der Seite und dann alle 5 Sekunden zu aktualisieren
    updateTable(); // Ruft die Funktion zuerst auf, um die Tabelle beim Laden der Seite zu aktualisieren
    setInterval(updateTable, 5000); // Ruft die Funktion alle 5 Sekunden auf
</script>
<?php
 include ('includes/footer.php');
?>
