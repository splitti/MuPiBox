<?php
	$change=0;
	$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";
	include ('includes/header.php');
	
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
				document.getElementById("REG14").innerText = mupihatData.REG14;
				document.getElementById("Bat_SOC").innerText = mupihatData.Bat_SOC;
				document.getElementById("Bat_Stat").innerText = mupihatData.Bat_Stat;
				document.getElementById("Bat_Type").innerText = mupihatData.Bat_Type;
			}
		};
		xhttp.open("GET", "update_mupihattable.php", true); // Passe den Pfad zur Serverseite an
		xhttp.send();
	}

</script>	
<form class="appnitro" name="mupi" method="post" action="smart.php" id="form">
<div class="description">
<h2>MuPiHAT</h2>
<p>Release the power of MuPi...</p>
</div>

 <details open>
  <summary><i class="fa-solid fa-circle-info"></i> Status</summary>
    <ul>
   <li id="li_1" >
		<h2>Battery Status</h2>
		<table class="version">
			<tr><td>Charger status:</td><td id="Charger_Status"></td></tr>
			<tr><td>Vbat (battery mV):</td><td id="Vbat"></td></tr>
			<tr><td>Vbus (charger mV):</td><td id="Vbus"></td></tr>
			<tr><td>Ibat (dis- / charge mA):</td><td id="Ibat"></td></tr>
			<tr><td>IBus (charger mA):</td><td id="IBus"></td></tr>
			<tr><td>Temperature:</td><td id="Temp"></td></tr>
			<tr><td>REG14:</td><td id="REG14"></td></tr>
			<tr><td>Bat_SOC (battery level):</td><td id="Bat_SOC"></td></tr>
			<tr><td>Bat_Stat (battery status):</td><td id="Bat_Stat"></td></tr>
			<tr><td>Bat_Type (battery type):</td><td id="Bat_Type"></td></tr>
		</table>
   </li>
  </ul>
 </details>
 <details open>
  <summary><i class="fa-solid fa-battery-three-quarters"></i> Configuration</summary>
    <ul>
   <li id="li_1" >

                <h2>Battery selection</h2>
                <p>Choose your battery... work in progress</p>
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
<script>
    // Funktionsaufruf, um die Tabelle beim Laden der Seite und dann alle 5 Sekunden zu aktualisieren
    updateTable(); // Ruft die Funktion zuerst auf, um die Tabelle beim Laden der Seite zu aktualisieren
    setInterval(updateTable, 5000); // Ruft die Funktion alle 5 Sekunden auf
</script>
<?php
 include ('includes/footer.php');
?>
