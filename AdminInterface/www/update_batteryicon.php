<?php
	$mupihat_file = '/tmp/mupihat.json';
	$bat_icon = "";
	if (file_exists($mupihat_file)) {
		$string = file_get_contents($mupihat_file, true);
		$mupihat_data = json_decode($string, true);

		if ($mupihat_data["IBus"] > 0) {
			if ($mupihat_data["BatteryConnected"] > 0) {
				if ($mupihat_data["Bat_SOC"] == "100%") {
					$bat_icon = '<iconify-icon class="show-title" icon="mdi:battery-charging-100" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
				}
				elseif ($mupihat_data["Bat_SOC"] == "75%") {
					$bat_icon = '<iconify-icon class="show-title" icon="mdi:battery-charging-70" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
				}
				elseif ($mupihat_data["Bat_SOC"] == "50%") {
					$bat_icon = '<iconify-icon class="show-title" icon="mdi:battery-charging-50" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
				}
				elseif ($mupihat_data["Bat_SOC"] == "25%") {
					$bat_icon = '<iconify-icon class="show-title" icon="mdi:battery-charging-20" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
				}
				else {
					$bat_icon = '<iconify-icon class="show-title" icon="mdi:battery-charging-outline" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
				}
			}
			else {
				if ($mupihat_data["Bat_SOC"] == "100%") {
					$bat_icon = '<iconify-icon class="show-title" icon="mdi:battery" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
				}
				elseif ($mupihat_data["Bat_SOC"] == "75%") {
					$bat_icon = '<iconify-icon class="show-title" icon="mdi:battery-70" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
				}
				elseif ($mupihat_data["Bat_SOC"] == "50%") {
					$bat_icon = '<iconify-icon class="show-title" icon="mdi:battery-50" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
				}
				elseif ($mupihat_data["Bat_SOC"] == "25%") {
					$bat_icon = '<iconify-icon class="show-title" icon="mdi:battery-20" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
				}
				else {
					$bat_icon = '<iconify-icon class="show-title" icon="mdi:battery-outline" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
				}
			}
		}
	}
	print $bat_icon;
?>