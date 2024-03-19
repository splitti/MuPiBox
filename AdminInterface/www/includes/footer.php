
			<div id="footer">
				<div id="footerleft">
					<ul>
						<li><a href="https://mupibox.de/" target="_blank">MuPiBox.de</a></li>
						<li><a href="https://discord.gg/4EjCgpCbbe" target="_blank">Support on Discord</a></li>
						<li><a href="https://www.youtube.com/@mupibox" target="_blank">MuPiBox on Youtube</a></li>
					</ul>
				</div>
				<div id="footercenter">
					<ul>
						<li><a href="https://github.com/friebi/MuPiBox" target="_blank">Visit MupiBox on Github</a></li>
						<li><a href="https://github.com/friebi/MuPiBox/blob/develop/LICENSE.md" target="_blank">License / Copyright</a></li>
					</ul>
				</div>
				<div id="footerright">
					<img id="mupi" src="images/mupi.png" alt="I am Mupi and i like audiobooks..." title="I am Mupi and i like audiobooks...">
				</div>

			</div>
			<div id="lock-modal"></div>
			<div id="loading-circle"></div>
			<div id="mupif"><img src="images/mupif.png" /></div>
		</div>
		<img id="bottom" src="images/bottom.png" alt="">
<?php
	if( $change )
		{
		print '<div class="lightbox"><div class="iframeContainer"><div class="toolbarLB"><div class="closeLB" onclick="lightBoxClose()"><div class="closeLBSym">+</div></div></div><p>'.$CHANGE_TXT.'DONE</p></div></div>';
		}
?>
<script>
    function updateFanIcon() {
        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                // Empfangene Daten verarbeiten
                var fan_icon = this.responseText;

                // Batterie-Symbol in das Charger_Status-Div einfügen
                document.getElementById("Fan_Icon").innerHTML = fan_icon;
            }
        };
        xhttp.open("GET", "update_fanicon.php", true); // Passe den Pfad zur Serverseite an
        xhttp.send();
    }

	updateFanIcon();
    // Die Funktion alle 5 Sekunden aufrufen, um das Batteriesymbol zu aktualisieren
    setInterval(function() {
        updateFanIcon();
    }, 5000); // 5000 Millisekunden entsprechen 5 Sekunden




    // Funktion für die AJAX-Anfrage
    function updateWIFIIcon() {
        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                // Empfangene Daten verarbeiten
                var bat_icon = this.responseText;

                // Batterie-Symbol in das Charger_Status-Div einfügen
                document.getElementById("Wifi_Icon").innerHTML = bat_icon;
            }
        };
        xhttp.open("GET", "update_wifiicon.php", true); // Passe den Pfad zur Serverseite an
        xhttp.send();
    }

	updateWIFIIcon();
    // Die Funktion alle 5 Sekunden aufrufen, um das Batteriesymbol zu aktualisieren
    setInterval(function() {
        updateWIFIIcon();
    }, 3000); // 5000 Millisekunden entsprechen 5 Sekunden


    // Funktion für die AJAX-Anfrage
    function updateBatteryIcon() {
        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                // Empfangene Daten verarbeiten
                var bat_icon = this.responseText;

                // Batterie-Symbol in das Charger_Status-Div einfügen
                document.getElementById("Battery_Icon").innerHTML = bat_icon;
            }
        };
        xhttp.open("GET", "update_batteryicon.php", true); // Passe den Pfad zur Serverseite an
        xhttp.send();
    }

	updateBatteryIcon();
    // Die Funktion alle 5 Sekunden aufrufen, um das Batteriesymbol zu aktualisieren
    setInterval(function() {
        updateBatteryIcon();
    }, 5000); // 5000 Millisekunden entsprechen 5 Sekunden

$(document).ready(function() {
  $(document).on('click', '.show-title', function() {
    var title = $(this).attr('title');
    alert(title);
  });
});
</script>

	</body>
</html>

<?php
	if( $reboot == 1 )
		{
		$command='sudo su - -c "sleep 5; /usr/local/bin/mupibox/./restart.sh &" &';
		exec($command);
		}
	if( $shutdown == 1 )
		{
		$command='sudo su - -c "sleep 5; /usr/local/bin/mupibox/./shutdown.sh &" &';
		exec($command);
		}
?>
