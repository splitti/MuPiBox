<?php
	include ('includes/header.php');
?>
<div class="main">
<h2>VNC: MuPiBox Remote Control</h2><p>
<p>Remote control the Display-Session.</p>
<?php
	print "<p><embed src='http://".$data["mupibox"]["host"].":6080/vnc_lite.html?host=".$data["mupibox"]["host"]."&port=5900' id='remotecontrol'></p>";
	print "<p><a href='http://".$data["mupibox"]["host"].":6080/vnc_lite.html?host=".$data["mupibox"]["host"]."&port=5900'' id='remotecontrol' target='_blank'>If it doesn't display properly or can't be served, try this Link and click me...</a></p>";
?>
</div>
<?php
	include ('includes/footer.php');
?>