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
	$h = htmlspecialchars((string)$data["mupibox"]["host"], ENT_QUOTES, 'UTF-8');
	print "<p><embed src='http://".$h.":6080/vnc_lite.html?host=".$h."&port=5900' id='remotecontrol'></p>";
	print "<p><a href='http://".$h.":6080/vnc_lite.html?host=".$h."&port=5900' id='remotecontrol' target='_blank'>If it doesn't display properly or can't be served, try this Link and click me...</a></p>";
?>
</div>
<?php
	include ('includes/footer.php');
?>