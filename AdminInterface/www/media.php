<?php
 include ('includes/header.php');
?>
<div class="main">
<h2>MuPiBox</h2>
<p>You can add Music, Streams or control the box here...</p>
<?php
        $ip=exec("hostname -I | awk '{print $1}'");
        print "<p><embed src='http://".$ip.":8200' id='remotecontrol'></p>";
        print "<p><a href='http://".$ip.":8200' id='remotecontrol' target='_blank'>If it doesn't display properly or can't be served, try this Link and click me...</a></p>";

?>


</div>

<?php
 include ('includes/footer.php');
?>
