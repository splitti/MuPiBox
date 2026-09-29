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
	// (on the app's own port 8200 of this box: its login cookie goes with it)
	$h = htmlspecialchars(preg_replace('/:\d+$/', '', (string)$_SERVER['HTTP_HOST']), ENT_QUOTES, 'UTF-8');
	$vnc = 'http://' . $h . ':8200/app/vnc/vnc.html?path=websockify&autoconnect=1&resize=scale&reconnect=1';
	if (empty($_SERVER['HTTPS'])) print "<p><iframe src='" . $vnc . "' id='remotecontrol' style='width:100%;aspect-ratio:1024/600;border:0'></iframe></p>";
	print "<p><a href='" . $vnc . "' target='_blank'>Open the remote control in a tab of its own ...</a></p>";
?>
</div>
<?php
	include ('includes/footer.php');
?>