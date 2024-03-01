<?php
	$mupifan_file = '/tmp/fan.json';
	$fan_icon = "";
	if (file_exists($mupifan_file)) {
		$string = file_get_contents($mupifan_file, true);
		$mupifan_data = json_decode($string, true);

	if ($mupifan_data["Bat_SOC"] == "100%") {
		$fan_icon = '<iconify-icon class="rotate100" icon="mdi:fan" title="' . $mupifan_data["speed"] . " / " . $mupifan_data["Vbat"] . 'mV"></iconify-icon>';
	}
	elseif ($mupifan_data["Bat_SOC"] == "75%") {
		$fan_icon = '<iconify-icon class="rotate75" icon="mdi:fan" title="' . $mupifan_data["speed"] . " / " . $mupifan_data["Vbat"] . 'mV"></iconify-icon>';
	}
	elseif ($mupifan_data["Bat_SOC"] == "50%") {
		$fan_icon = '<iconify-icon class="rotate50" icon="mdi:fan" title="' . $mupifan_data["speed"] . " / " . $mupifan_data["Vbat"] . 'mV"></iconify-icon>';
	}
	elseif ($mupifan_data["Bat_SOC"] == "25%") {
		$fan_icon = '<iconify-icon class="rotate25" icon="mdi:fan" title="' . $mupifan_data["speed"] . " / " . $mupifan_data["Vbat"] . 'mV"></iconify-icon>';
	}
	else {
		$fan_icon = '<iconify-icon class="rotate0" icon="mdi:fan" title="' . $mupifan_data["speed"] . " / " . $mupifan_data["Vbat"] . 'mV"></iconify-icon>';
	}

	}
	print $fan_icon;
?>