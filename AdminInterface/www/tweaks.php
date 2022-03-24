<?php
        $onlinejson = file_get_contents('https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json');
        $dataonline = json_decode($onlinejson, true);
        include ('includes/header.php');

        $change=0;
        $CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";

        if( $_POST['change_netboot'] == "activate for next boot" )
                {
                $command = "sudo /boot/dietpi/func/dietpi-set_software boot_wait_for_network 1";
                exec($command, $output, $result );
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>Wait for Network on boot is enabled</li>";
                }
        else if( $_POST['change_netboot'] == "disable" )
                {
                $command = "sudo /boot/dietpi/func/dietpi-set_software boot_wait_for_network 0";
                exec($command, $output, $result );
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>Wait for Network on boot is disabled</li>";
                }

        if( $_POST['change_sd'] == "activate for next boot" )
                {
                $command = "echo 'dtoverlay=sdtweak,overclock_50=100' | sudo tee -a /boot/config.txt";
                exec($command, $output, $result );
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>SD Overclocking activated [restart necessary]</li>";
                }
        else if( $_POST['change_sd'] == "disable" )
                {
                $command = "sudo sed -i -e 's/dtoverlay=sdtweak,overclock_50=100//g' /boot/config.txt && sudo head -n -1 /boot/config.txt > /tmp/config.txt && sudo mv /tmp/config.txt /boot/config.txt";
                exec($command, $output, $result );
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>SD Overclocking disabled [restart necessary]</li>";
                }

        $command = "[[ ! -f '/etc/systemd/system/dietpi-postboot.service.d/dietpi.conf' ]] || echo '1'";
        exec($command, $sdoutput, $sdresult );
        if( $sdoutput[0] )
                {
                $netboot_state = "active";
                $change_netboot = "disable";
                }
        else
                {
                $netboot_state = "disabled";
                $change_netboot = "activate for next boot";
                }


        $command = "sudo /usr/bin/cat /boot/config.txt | /usr/bin/grep 'dtoverlay=sdtweak,overclock_50=100'";
        exec($command, $sdoutput, $sdresult );
        if( $sdoutput[0] )
                {
                $sd_state = "active";
                $change_sd = "disable";
                }
        else
                {
                $sd_state = "disabled";
                $change_sd = "activate for next boot";
                }
        $CHANGE_TXT=$CHANGE_TXT."</ul>";
?>

               <form class="appnitro"  method="post" action="tweaks.php" id="form">
                                        <div class="description">
                        <h2>MupiBox tweaks</h2>
                        <p>Make your box smarter and faster...</p>
                </div>
                        <ul >

                                                                <li class="li_1"><h2>Overclock SD Card</h2>
                                                                <p>
                                                                Just for highspeed SD Cards. You can damage data or the microSD itself!
                                                                </p>
                                                                <p>
                                                                <?php
                                                                echo "Overclocking state: <b>".$sd_state."</b>";
                                                                ?>
                                                                </p>
                                                                <input id="saveForm" class="button_text" type="submit" name="change_sd" value="<?php print $change_sd; ?>" />
                                                        </li>

                                                                <li class="li_1"><h2>Wait for Network on boot</h2>
                                                                <p>
                                                                Speeds up the boot time, but sometimes the boot process is to fast... Try it!
                                                                </p>
                                                                <p>
                                                                <?php
                                                                echo "Wait for Network on boot: <b>".$sd_state."</b>";
                                                                ?>
                                                                </p>
                                                                <input id="saveForm" class="button_text" type="submit" name="change_netboot" value="<?php print $change_netboot; ?>" />
                                                        </li>


                        </ul>
                </form>
<?php
        include ('includes/footer.php');
?>