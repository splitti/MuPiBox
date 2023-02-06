<?php
	include ('includes/header.php');
?>
<h2>VNC: MuPiBox Remote Control</h2>
<?php
	print "<p><embed src='http://".$data["mupibox"]["host"].":6080/vnc_lite.html?host=".$data["mupibox"]["host"]."&port=5900' id='remotecontrol'></p></details>";
?>

<?php
	include ('includes/footer.php');
?>