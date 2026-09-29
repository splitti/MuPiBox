<?php
 include ('includes/header.php');
?>
<div class="main">
<h2>MuPiBox</h2>
<p>Audio books, music and streams can be added here. Control is the same as on the display, but the display is not synchronized. Playing music cannot be started here.</p>
<?php
        $ip=exec("hostname -I | awk '{print $1}'");
        // LOW-2: same XSS vector as vnc.php — host attribute escape.
        // hostname -I output is system-controlled and shouldn't contain
        // dangerous chars, but escape it too just in case (hostname could
        // theoretically be a value an attacker has set elsewhere).
        $h = htmlspecialchars((string)$data["mupibox"]["host"], ENT_QUOTES, 'UTF-8');
        $hIp = htmlspecialchars((string)$ip, ENT_QUOTES, 'UTF-8');
        print "<div style='max-width:800px;'><p><embed src='http://".$h.":8200' id='remotecontrol' width='800px' height='480px'></p></div>";
        print "<p><a href='http://".$hIp.":8200' id='remotecontrol' target='_blank'>If it doesn't display properly or can't be served, try this Link and click me...</a></p>";

?>


</div>

<?php
 include ('includes/footer.php');
?>
