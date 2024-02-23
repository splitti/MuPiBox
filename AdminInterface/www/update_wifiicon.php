<?php
	$wifi_icon = "";
	$commandLQ="sudo iwconfig wlan0 | awk '/Link Quality/{split($2,a,\"=|/\");print int((a[2]/a[3])*100)\"\"}' | tr -d '%'";
	$LINKQ=exec($commandLQ);
	if ($LINKQ >= 70) {
		$wifi_icon='<iconify-icon icon="material-symbols:wifi-sharp" title="SSID: ' . $WIFI . ' / Signal Quality: ' . $LINKQ . '%"></iconify-icon>';
	}
	elseif ($LINKQ >= 40) {
		$wifi_icon='<iconify-icon icon="material-symbols:wifi-2-bar-sharp" title="SSID: ' . $WIFI . ' / Signal Quality: ' . $LINKQ . '%"></iconify-icon>';
	}
	else {
		$wifi_icon='<iconify-icon icon="material-symbols:wifi-1-bar-sharp" title="SSID: ' . $WIFI . ' / Signal Quality: ' . $LINKQ . '%"></iconify-icon>';
	}
	print $wifi_icon;
?>