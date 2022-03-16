<?php
        include ('includes/header.php');
        $commandM0="cat /sys/class/net/wlan0/address";
        $MAC0=exec($commandM0);
        $commandS0="/sbin/ifconfig wlan0 | awk '/netmask/{split($4,a,\":\"); print a[1]}'";
        $SUBNET0=exec($commandS0);
        $commandG0="ip route show 0.0.0.0/0 dev wlan0 | cut -d\  -f3";
        $GATEWAY0=exec($commandG0);
        $commandD="echo $(sudo cat /etc/resolv.conf | grep 'nameserver ') | sed 's/nameserver //g'";
        $DNS=exec($commandD);
        $commandW="sudo iw dev wlan0 info | grep ssid | awk '{print $2}'";
        $WIFI=exec($commandW);
        $commandL="sudo iwconfig wlan0 | awk '/Link Quality/{split($2,a,\"=|/\");print int((a[2]/a[3])*100)\"%\"}'";
        $LINKQ=exec($commandL);
        $commandS="sudo iwconfig wlan0 | awk '/Signal level/{split($4,a,\"=|/\");print a[2]\" dBm\"}'";
        $SIGNAL=exec($commandS);
        $commandB="sudo iwconfig wlan0 | awk '/Bit Rate/{split($2,a,\"=|/\");print a[2]\" Mb/s\"}'";
        $BITRATE=exec($commandB);

        $MAC1="";
        $filename = '/sys/class/net/wlan1/address';

        if (file_exists($filename)) {
                $commandM1="cat /sys/class/net/wlan1/address";
                $MAC1=exec($commandM1);
                }
?>
<div class="main">
        <h2>Network</h2>
        <p>Just a little bit network data. Maybe also configuration in the future...</p>
        <table id="network">
        <tr><td id="netl">IP-Address:</td><td id="netr"><?php print $_SERVER['SERVER_ADDR']; ?></td></tr>
        <tr><td id="netl">MAC-Address:</td><td id="netr"><?php print $MAC0; ?></td></tr>
        <tr><td id="netl">Subnet-Adresss:</td><td id="netr"><?php print $SUBNET0; ?></td></tr>
        <tr><td id="netl">Gateway:</td><td id="netr"><?php print $GATEWAY0; ?></td></tr>
        <tr><td id="netl">Nameserver:</td><td id="netr"><?php print $DNS; ?></td></tr>
        <tr><td id="netl">Wifi SSID:</td><td id="netr"><?php print $WIFI; ?></td></tr>
        <tr><td id="netl">Wifi Link Quality:</td><td id="netr"><?php print $LINKQ; ?></td></tr>
        <tr><td id="netl">Wifi Signal Level:</td><td id="netr"><?php print $SIGNAL; ?></td></tr>
        <tr><td id="netl">Bitrate:</td><td id="netr"><?php print $BITRATE ?></td></tr>
        </table>
        <?php
        if($MAC1) {
                print "<p>MAC-Address [wlan1]: ".$MAC1."</p>";
                }
        ?>
</div>

<?php
        include ('includes/footer.php');
?>
