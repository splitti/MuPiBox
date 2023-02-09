<?php
 include ('includes/header.php');
?>
<div class="main">
<h2>MuPiBox</h2>
<p>Audio books, music and streams can be added here. Control is the same as on the display, but the display is not synchronized. Playing music cannot be started here.</p>
<?php
        $ip=exec("hostname -I | awk '{print $1}'");
        print "<p><embed src='http://".$data["mupibox"]["host"].":8200' id='remotecontrol' width='800px' height='480px'></p>";
        print "<p><a href='http://".$data["mupibox"]["host"].":8200' id='remotecontrol' target='_blank'>If it doesn't display properly or can't be served, try this Link and click me...</a></p>";

?>


</div>

<?php
 include ('includes/footer.php');
?>
