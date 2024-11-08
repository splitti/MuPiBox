	<?php
			include ('includes/header.php');
			$onlinejson = file_get_contents('https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json');
			$dataonline = json_decode($onlinejson, true);

			exec("sudo rm /var/www/images/screenshot.png /val/www/images/temp.png /var/www/images/cpuload.png");
			exec("sudo -H -u dietpi bash -c 'DISPLAY=:0 scrot /tmp/screenshot.png'; sudo mv /tmp/screenshot.png /var/www/images/screenshot.png");
			exec('sudo rrdtool graph /var/www/images/temp.png --start -15m -z -a PNG -t "CPU Temperature" --slope-mode --vertical-label "Temperature ºC" -w 700 -h 100 DEF:cpu_temp=/tmp/.rrd/cputemp.rrd:cpu_temp:AVERAGE VDEF:cpu_templ=cpu_temp,LAST LINE1:cpu_temp#ff0000:"Raspberry Pi Temperature,   last\:" GPRINT:cpu_templ:"%7.2lf °C \t\t\t\t\t\t\t\t"');
			exec('sudo rrdtool graph /var/www/images/cpuload.png  --start -15m -a PNG -t "Load Average" --slope-mode --vertical-label "Average Load" -w 750 -h 100 DEF:load1=/tmp/.rrd/cpuusage.rrd:load1:AVERAGE DEF:load5=/tmp/.rrd/cpuusage.rrd:load5:AVERAGE DEF:load15=/tmp/.rrd/cpuusage.rrd:load15:AVERAGE VDEF:load1l=load1,LAST VDEF:load5l=load5,LAST VDEF:load15l=load15,LAST AREA:load1#ff0000:"1 Minute,   last\:" GPRINT:load1l:"%5.2lf \t" AREA:load5#ff9900:"5 Minutes,  last\:" GPRINT:load5l:"%5.2lf \t" AREA:load15#ffff00:"15 Minutes, last\:" GPRINT:load15l:"%5.2lf \t" LINE1:load5#ff9900:"" LINE1:load1#ff0000:"" > /dev/null');
			exec('sudo rrdtool graph /var/www/images/ram.png  --start -15m -a PNG -t "Memory Usage" --slope-mode --vertical-label "Usage in %" --lower-limit 0 --upper-limit 100 -w 750 -h 100 DEF:ram=/tmp/.rrd/ram.rrd:ram:AVERAGE DEF:swap=/tmp/.rrd/ram.rrd:swap:AVERAGE VDEF:raml=ram,LAST VDEF:swapl=swap,LAST AREA:ram#ff0000:"RAM USAGE,   last\:" GPRINT:raml:"%5.2lf " AREA:swap#ff9900:"SWAP USAGE,  last\:" GPRINT:swapl:"%5.2lf " LINE1:ram#ff0000:""  > /dev/null');

			exec("sudo chown www-data:www-data /var/www/images/temp.png /var/www/images/cpuload.png /var/www/images/screenshot.png");

			$rpi_temp = explode("=", exec("sudo vcgencmd measure_temp"))[1];
			function checkRpiThrottle() {
					$codes = array(
							0       => "under-voltage detected",
							1       => "arm frequency capped",
							2       => "currently throttled",
							3       => "soft temperature limit active",
							16      => "under-voltage has occurred",
							17      => "arm frequency capped has occurred",
							18      => "throttling has occurred",
							19      => "soft temperature limit has occurred"
					);

					$getThrottledResult = explode("0x", exec("sudo vcgencmd get_throttled"))[1];

					// code is zero => no issue
					if ($getThrottledResult == "0") return "OK";

					// analyse returned code
					$result = [];
					$codeHex = str_split($getThrottledResult);
					$codeBinary = "";
					foreach ($codeHex as $fourbits) {
							$codeBinary .= str_pad(base_convert($fourbits, 16, 2), 4, "0", STR_PAD_LEFT);
					}
					$codeBinary = array_reverse(str_split($codeBinary));
					foreach ($codeBinary as $bitNumber => $bitValue) {
							if ($bitValue) $result[] = $codes[$bitNumber];
					}
					return "WARNING: " . implode(", ", $result);
			}
			$rpi_throttle = checkRpiThrottle();
	?>

	<form class="appnitro" name="network" method="post" action="index.php" id="form">

		<details open>
			<summary><i class="fa-solid fa-circle-info"></i> MuPiBox-News</summary>
			<ul>
				<li class="li_norm">
						<p><h2>MuPiBox-Version</h2><table class="version">
							<tr>
									<th>Environment</th>
									<th>Latest Version</th>
									<th>Release Information</th>
							</tr>
							<tr>
									<td>Installed</td>
									<td><?php print $data["mupibox"]["version"]; ?></td>
									<td></td>
									</td>
							</tr>
							<tr>
									<td>Stable</td>
									<td><?php print $dataonline["release"]["stable"][count($dataonline["release"]["stable"])-1]["version"]; ?></td>
									<td><?php print $dataonline["release"]["stable"][count($dataonline["release"]["stable"])-1]["releaseinfo"]; ?></td>
									</td>
							</tr>
							<tr>
									<td>Beta</td>
									<td><?php print $dataonline["release"]["beta"][count($dataonline["release"]["beta"])-1]["version"]; ?></td>
									<td><?php print $dataonline["release"]["beta"][count($dataonline["release"]["beta"])-1]["releaseinfo"]; ?></td>
									</td>
							</tr>
							<tr>
									<td>Development</td>
									<td><?php
											exec("echo $(sudo curl -s 'https://api.github.com/repos/splitti/MuPiBox' | jq -r '.pushed_at' | cut -d'T' -f1)", $devversion, $rc);
											print "DEV " . $devversion[0];
										?>
									</td>
									<td><?php print $dataonline["release"]["dev"][count($dataonline["release"]["dev"])-1]["releaseinfo"]; ?></td>
									</td>
							</tr>
						</table></p>
				<?php
					$news = file_get_contents("https://raw.githubusercontent.com/splitti/MuPiBox/main/news.txt");
					print "<p><h2>MuPiBox-News</h2>".$news."</p>"; ?>
				</li>
			</ul>
		</details>

	<?php
	/*	$command = "ps -ef | grep websockify | grep -v grep";
		exec($command, $vncoutput, $vncresult );
		if( $vncoutput[0] )
		{
			echo '<details><summary><i class="fa-solid fa-display"></i> Live Screen</summary><ul><li class="li_norm">';
			$ip=exec("hostname -I | awk '{print $1}'");
			print "<p><embed src='http://".$ip.":6080/vnc_lite.html' id='remotecontrol'></p></details>";
		}
	*/
	?>
		<details>
			<summary><i class="fa-solid fa-display"></i> Current Screen</summary>
			<ul>
				<li class="li_norm">
				<p><a href="images/screenshot.png" target="_blank"><img src="images/screenshot.png" id="screenshot" /></a></p>
				</li>
			</ul>
		</details>
		<details>
			<summary><i class="fa-brands fa-raspberry-pi"></i> Raspberry Information</summary>
			<ul>
				<li class="li_norm"><h2>System Information</h2></li>
					<p>Download system information for support on discord:</p>
					<input id="saveForm" class="button_text" type="submit" name="supportdownload" value="Download Support-Infos" onclick="window.open('./support_data.php', '_blank');" />
				</li>
				<li class="li_norm">

	<?php
			$command = "/usr/bin/cat /sys/firmware/devicetree/base/model";
			exec($command, $moutput, $result );
			echo "<p><table class='sysinfotbl'><tr><td width=120px>Model:</td><td>" . $moutput[0] . "</td></tr>";
			$command = "grep PRETTY_NAME /etc/os-release | cut -c 13- | tr -d '\"'";
			exec($command, $ooutput, $result );
			echo "<tr><td>OS:</td><td>" . $ooutput[0] . "</td></tr>";
			$command = "/usr/bin/uname -m";
			exec($command, $aoutput, $result );
			echo "<tr><td>Architecture:</td><td>" . $aoutput[0] . "</td></tr>";
			echo "<tr><td>Throttle:</td><td>" . $rpi_throttle . "</td></tr>";
			exec("/usr/bin/librespot --version | awk '{print $2}'", $loutput, $result );
			exec("/usr/bin/jq --version", $joutput, $result );
			echo "<tr><td>MuPiBox:</td><td>" . $data["mupibox"]["version"] . "</td></tr>";			
			echo "<tr><td>Librespot:</td><td>" . $loutput[0] . "</td></tr></table></p>";
			echo "<tr><td>jq:</td><td>" . $joutput[0] . "</td></tr></table></p>";

			$command = "/usr/bin/systemd-analyze time";
			exec($command, $toutput, $resultx );
			echo "<p>" . $toutput[0] . "</p></li><li class=\"li_norm\">";


	?>

	<li class="li_norm"><p>
	<img src="images/cpuload.png" width="100%" />
	</p>
	</li><li class="li_norm">
	<p>
	<img src="images/temp.png"  width="100%" />
	</p>
	</li><li class="li_norm">
	<p>
	<img src="images/ram.png"  width="100%" />
	</p>
	</li></ul></details>


		<details>
			<summary><i class="fa-solid fa-sd-card"></i> SD-Card</summary>
			<ul>
				<li class="li_norm">

	<?php
			$root_free_bytes = disk_free_space("/");
			$root_free_gb = round($root_free_bytes / 1024 / 1024 / 1024, 2);
			$root_free = $root_free_gb . "GB";
			$root_total_bytes = disk_total_space("/") - $root_free_bytes;
			$root_total_gb = round($root_total_bytes / 1024 / 1024 / 1024, 2);
			$root_total = $root_total_gb . "GB";

			$boot_free_bytes = disk_free_space("/boot");
			$boot_free_mb = round($boot_free_bytes / 1024 / 1024, 2);
			$boot_free = $boot_free_mb . "MB";
			$boot_total_bytes = disk_total_space("/boot") - $boot_free_bytes;
			$boot_total_mb = round($boot_total_bytes / 1024 / 1024, 2);
			$boot_total = $boot_total_mb . "MB";
	?>

	<script type="text/javascript">
			// Load google charts
			google.charts.load('current', {'packages':['corechart']});
			google.charts.setOnLoadCallback(drawChartroot);
			google.charts.setOnLoadCallback(drawChartboot);


			// Draw the chart and set the chart values
			function drawChartroot() {
			  var data = google.visualization.arrayToDataTable([
			  ['Spacetype', 'Size'],
			  [<?php print "'/ free [". $root_free ."]'" ?>, <?php print $root_free_gb; ?>],
			  [<?php print "'/ used [". $root_total ."]'" ?>, <?php print $root_total_gb; ?>]
			]);

			  // Optional; add a title and set the width and height of the chart
			  var options = {'title':'Disc Space - / in Gigabytes','width':'auto','height':'auto','is3D':'true'};

			  // Display the chart inside the <div> element with id="piechart"
			  var chart = new google.visualization.PieChart(document.getElementById('rootchart'));
			  chart.draw(data, options);
			}

			// Draw the chart and set the chart values
			function drawChartboot() {
			  var data = google.visualization.arrayToDataTable([
			  ['Spacetype', 'Size'],
			  [<?php print "'/boot free [". $boot_free ."]'" ?>, <?php print $boot_free_mb; ?>],
			  [<?php print "'/boot used [". $boot_total ."]'" ?>, <?php print $boot_total_mb; ?>]
			]);

			  // Optional; add a title and set the width and height of the chart
			  var options = {'title':'Disc Space - /boot in Megabytes','width':'auto','height':'auto','is3D':'true'};
			  
			  // Display the chart inside the <div> element with id="piechart"
			  var chart = new google.visualization.PieChart(document.getElementById('bootchart'));
			  chart.draw(data, options);
			}
	</script>
	</li><li class="li_norm">
	<div class="col-md-6">
			<div id="rootchart" class="chart"></div>
	</div>
	</li><li class="li_norm">
	<div class="col-md-6">
			<div id="bootchart" class="chart"></div>
	</div>
	</li>
	</ul></details>


	</form>



	<?php
			include ('includes/footer.php');
	?>
