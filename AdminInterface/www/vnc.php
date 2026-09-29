<?php
	include ('includes/header.php');
?>
<div class="main">
<h2>VNC: MuPiBox Remote Control</h2><p>
<p>Remote control the Display-Session.</p>
<?php
	// LOW-2: hostname comes from mupiboxconfig.json, which a logged-in
	// admin (or stored-XSS via data.json pre-MED-15) could have written
	// with `";<script>...</script><` to break out of the attribute
	// quotes. htmlspecialchars + ENT_QUOTES escapes both ' and " so
	// neither attribute boundary can be escaped.
	// The remote control goes through the app (same address, its login): x11vnc and websockify listen on the box
	// itself only - no longer open to the whole network without a password (port 6080 / 5900 are gone).
	$vnc = '/app/vnc/vnc_lite.html?path=websockify&autoconnect=1&resize=scale';
	print "<p><embed src='".$vnc."' id='remotecontrol'></p>";
	print "<p><a href='/app/vnc/vnc.html?path=websockify&autoconnect=1&resize=scale&reconnect=1' target='_blank'>If it doesn't display properly, open it in a tab of its own ...</a></p>";
?>
</div>
<?php
	include ('includes/footer.php');
?>