<?php
	$WIFI_IF = trim((string) shell_exec('/usr/local/bin/mupibox/mupi_wifi_iface.sh'));
	if ($WIFI_IF === '') { $WIFI_IF = 'wlan0'; }
	$commandSSID="sudo iwgetid -r";
	$WIFI=exec($commandSSID);
	$wifi_icon = "";
	$commandLQ="sudo iwconfig ".$WIFI_IF." | awk '/Link Quality/{split($2,a,\"=|/\");print int((a[2]/a[3])*100)\"\"}' | tr -d '%'";
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