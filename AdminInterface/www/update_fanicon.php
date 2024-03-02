<?php
	$mupifan_file = '/tmp/fan.json';
	$fan_icon = "";
	if (file_exists($mupifan_file)) {
		$string = file_get_contents($mupifan_file, true);
		$mupifan_data = json_decode($string, true);
	$speed = $mupifan_data["speed"];
	$cputemp = $mupifan_data["cputemp"];
	if (isset($mupifan_data["ictemp"])) {
		$ictemp = $mupifan_data["ictemp"];
		$show = 'CPU: ' . $cputemp . '°C  /  IC: ' . $ictemp . '°C  /  Fan: ' . $speed;
		}
	else {
		$show = 'CPU: ' . $cputemp . '°C  /  Fan: ' . $speed;
		}
	
	
	if ($speed == "100%") {
		$fan_icon = '<iconify-icon class="show-title rotate100" icon="mdi:fan" title="' . $show . '"></iconify-icon>';
	}
	elseif ($speed == "75%") {
		$fan_icon = '<iconify-icon class="show-title rotate75" icon="mdi:fan" title="' . $show . '"></iconify-icon>';
	}
	elseif ($speed == "50%") {
		$fan_icon = '<iconify-icon class="show-title rotate50" icon="mdi:fan" title="' . $show . '"></iconify-icon>';
	}
	elseif ($speed == "25%") {
		$fan_icon = '<iconify-icon class="show-title rotate25" icon="mdi:fan" title="' . $show . '"></iconify-icon>';
	}
	else {
		$fan_icon = '<iconify-icon class="show-title" icon="mdi:fan-off" title="' . $show . '"></iconify-icon>';
	}

	}
	print $fan_icon;
?>