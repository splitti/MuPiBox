
<?php
	include ('includes/header.php');

	exec("sudo rm /var/www/images/screenshot.png /val/www/images/temp.png /var/www/images/cpuload.png");
	exec("sudo DISPLAY=:0 scrot /var/www/images/screenshot.png");
	exec('sudo rrdtool graph /var/www/images/temp.png --start -15m -z -a PNG -t "CPU Temperature" --vertical-label "Temperature ºC" -w 700 -h 100 DEF:cpu_temp=/tmp/.rrd/cputemp.rrd:cpu_temp:AVERAGE VDEF:cpu_templ=cpu_temp,LAST LINE1:cpu_temp#ff0000:"Raspberry Pi Temperature,   last\:" GPRINT:cpu_templ:"%7.2lf °C \t\t\t\t\t\t\t\t"');
	exec('sudo rrdtool graph /var/www/images/cpuload.png  --start -15m -a PNG -t "Load Average" --vertical-label "Average Load" -w 750 -h 100 DEF:load1=/tmp/.rrd/cpuusage.rrd:load1:AVERAGE DEF:load5=/tmp/.rrd/cpuusage.rrd:load5:AVERAGE DEF:load15=/tmp/.rrd/cpuusage.rrd:load15:AVERAGE VDEF:load1l=load1,LAST VDEF:load5l=load5,LAST VDEF:load15l=load15,LAST AREA:load1#ff0000:"1 Minute,   last\:" GPRINT:load1l:"%5.2lf \t" AREA:load5#ff9900:"5 Minutes,  last\:" GPRINT:load5l:"%5.2lf \t" AREA:load15#ffff00:"15 Minutes, last\:" GPRINT:load15l:"%5.2lf \t" LINE1:load5#ff9900:"" LINE1:load1#ff0000:"" > /dev/null');
	exec('sudo rrdtool graph /var/www/images/ram.png  --start -15m -a PNG -t "Memory Usage" --vertical-label "Usage in %" --lower-limit 0 --upper-limit 100 -w 750 -h 100 DEF:ram=/tmp/.rrd/ram.rrd:ram:AVERAGE DEF:swap=/tmp/.rrd/ram.rrd:swap:AVERAGE VDEF:raml=ram,LAST VDEF:swapl=swap,LAST AREA:ram#ff0000:"RAM USAGE,   last\:" GPRINT:raml:"%5.2lf " AREA:swap#ff9900:"SWAP USAGE,  last\:" GPRINT:swapl:"%5.2lf " LINE1:ram#ff0000:""  > /dev/null');

	exec("sudo chown www-data:www-data /var/www/images/temp.png /var/www/images/cpuload.png /var/www/images/screenshot.png");

	$rpi_temp = explode("=", exec("sudo vcgencmd measure_temp"))[1];
	function checkRpiThrottle() {
		$codes = array(
			0	=> "under-voltage detected",
			1	=> "arm frequency capped",
			2	=> "currently throttled",
			3	=> "soft temperature limit active",
			16	=> "under-voltage has occurred",
			17	=> "arm frequency capped has occurred",
			18	=> "throttling has occurred",
			19	=> "soft temperature limit has occurred"
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
	
	$exec = "df -H -B K / ";
	if($debug == "true") { 
		print "Command: ".$exec; 
	} 
	$exploded = preg_split("/ +/", exec($exec));
	// all values are in MeBit
	$all = round(Trim(substr($exploded[1],0,Strpos($exploded[1],"K")))/1024, 2);
	$used = round(Trim(substr($exploded[2],0,Strpos($exploded[2],"K")))/1024, 2);
	$free = round(Trim(substr($exploded[3],0,Strpos($exploded[3],"K")))/1024, 2);
	//cpu stat
	$prevVal = shell_exec("cat /proc/stat");
	$prevArr = explode(' ',trim($prevVal));
	$prevTotal = $prevArr[2] + $prevArr[3] + $prevArr[4] + $prevArr[5];
	$prevIdle = $prevArr[5];
	usleep(0.15 * 1000000);
	$val = shell_exec("cat /proc/stat");
	$arr = explode(' ', trim($val));
	$total = $arr[2] + $arr[3] + $arr[4] + $arr[5];
	$idle = $arr[5];
	$intervalTotal = intval($total - $prevTotal);
	$stat['cpu'] =  intval(100 * (($intervalTotal - ($idle - $prevIdle)) / $intervalTotal));
	$cpu_result = shell_exec("cat /proc/cpuinfo | grep model\ name");
	$stat['cpu_model'] = strstr($cpu_result, "\n", true);
	$stat['cpu_model'] = str_replace("model name    : ", "", $stat['cpu_model']);
	//memory stat
	$stat['mem_percent'] = round(shell_exec("free | grep Mem | awk '{print $3/$2 * 100.0}'"), 2);
	$mem_result = shell_exec("cat /proc/meminfo | grep MemTotal");
	$stat['mem_total'] = round(preg_replace("#[^0-9]+(?:\.[0-9]*)?#", "", $mem_result) / 1024 / 1024, 3);
	$mem_result = shell_exec("cat /proc/meminfo | grep MemFree");
	$stat['mem_free'] = round(preg_replace("#[^0-9]+(?:\.[0-9]*)?#", "", $mem_result) / 1024 / 1024, 3);
	$stat['mem_used'] = $stat['mem_total'] - $stat['mem_free'];
	//hdd stat
	$stat['hdd_free'] = round(disk_free_space("/") / 1024 / 1024 / 1024, 2);
	$stat['hdd_total'] = round(disk_total_space("/") / 1024 / 1024/ 1024, 2);
	$stat['hdd_used'] = $stat['hdd_total'] - $stat['hdd_free'];
	$stat['hdd_percent'] = round(sprintf('%.2f',($stat['hdd_used'] / $stat['hdd_total']) * 100), 2);
	//network stat
	$stat['network_rx'] = round(trim(file_get_contents("/sys/class/net/eth0/statistics/rx_bytes")) / 1024/ 1024/ 1024, 2);
	$stat['network_tx'] = round(trim(file_get_contents("/sys/class/net/eth0/statistics/tx_bytes")) / 1024/ 1024/ 1024, 2);
	//output headers
	/*header('Content-type: text/json');
	header('Content-type: application/json');*/
	//output data by json
	/*echo    
	"{\"cpu\": " . $stat['cpu'] . ", \"cpu_model\": \"" . $stat['cpu_model'] . "\"" . //cpu stats
	", \"mem_percent\": " . $stat['mem_percent'] . ", \"mem_total\":" . $stat['mem_total'] . ", \"mem_used\":" . $stat['mem_used'] . ", \"mem_free\":" . $stat['mem_free'] . //mem stats
	", \"hdd_free\":" . $stat['hdd_free'] . ", \"hdd_total\":" . $stat['hdd_total'] . ", \"hdd_used\":" . $stat['hdd_used'] . ", \"hdd_percent\":" . $stat['hdd_percent'] . ", " . //hdd stats
	"\"network_rx\":" . $stat['network_rx'] . ", \"network_tx\":" . $stat['network_tx'] . //network stats
	"}";*/
        ?>

<div class="main">
<h2>Current Screen</h2>
<p><a href="images/screenshot.png" target="_blank"><img src="images/screenshot.png" id="screenshot" /></a></p>

<h2>System Information</h2>
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
	  var options = {'title':'Disc Space - / in Gigabytes', 'width':350, 'height':200};

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
	  var options = {'title':'Disc Space - /boot in Megabytes', 'width':350, 'height':200};

	  // Display the chart inside the <div> element with id="piechart"
	  var chart = new google.visualization.PieChart(document.getElementById('bootchart'));
	  chart.draw(data, options);
	}
</script>
<div id=spacecharts">
	<div id="rootchart"></div>
	<div id="bootchart"></div>
</div>

<p>	
<?php
	echo "<p>Throttle: " . $rpi_throttle . "</p>";
?>
<img src="images/cpuload.png" width="100%" />
</p>
<p>
<img src="images/temp.png"  width="100%" />
</p>
<p>
<img src="images/ram.png"  width="100%" />
</p>

</div>



<?php
	include ('includes/footer.php');
?>

