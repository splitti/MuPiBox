<?php
require __DIR__ . '/includes/auth_check.php';

// MED-17: this endpoint was unauth and shipped both info-disclosure
// (SSID + Wi-Fi signal quality readable from the LAN, useful for
// fingerprinting which AP the box is on) and a sudo-fork-per-request
// pair (iwgetid + iwconfig). Browser tabs poll this every few seconds,
// so an unauth flood was effectively a DoS amplifier on the dietpi
// user. auth_check.php (header-only gate from CRIT-2/3/5) restricts
// callers to authenticated admin sessions.
	$commandSSID="sudo iwgetid -r";
	$WIFI=exec($commandSSID);
	$wifi_icon = "";
	$commandLQ="sudo iwconfig wlan0 | awk '/Link Quality/{split($2,a,\"=|/\");print int((a[2]/a[3])*100)\"\"}' | tr -d '%'";
	$LINKQ=exec($commandLQ);
	if ($LINKQ >= 70) {
		$wifi_icon='<iconify-icon class="show-title" icon="material-symbols:wifi-sharp" title="SSID: ' . $WIFI . ' / Signal Quality: ' . $LINKQ . '%"></iconify-icon>';
	}
	elseif ($LINKQ >= 40) {
		$wifi_icon='<iconify-icon class="show-title" icon="material-symbols:wifi-2-bar-sharp" title="SSID: ' . $WIFI . ' / Signal Quality: ' . $LINKQ . '%"></iconify-icon>';
	}
	else {
		$wifi_icon='<iconify-icon class="show-title" icon="material-symbols:wifi-1-bar-sharp" title="SSID: ' . $WIFI . ' / Signal Quality: ' . $LINKQ . '%"></iconify-icon>';
	}
	print $wifi_icon;
?>