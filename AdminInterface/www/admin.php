<?php
        $onlinejson = file_get_contents('https://mupibox.de/version/latest/version.json');
        $dataonline = json_decode($onlinejson, true);
        include ('includes/header.php');
        $change=0;
        $CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";

        if( $_POST['debug'] == "Chrome Debugging Off - turn on" )
                {
          $data["chromium"]["debug"]=1;
            $CHANGE_TXT=$CHANGE_TXT."<li>Chromium Debuggung activated</li>";
            $change=1;
    }
        if( $_POST['debug'] == "Chrome Debugging Active - turn off" )
                {
    $data["chromium"]["debug"]=0;
    $CHANGE_TXT=$CHANGE_TXT."<li>Chromium Debuggung deactivated</li>";
    $change=1;
    }

        if( $_POST['restart_kiosk'] )
                {
                $command = "sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh";
                exec($command, $output, $result );
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>Chromium Kiosk restarted</li>";
                }
        if( $_POST['mupibox_update'] )
                {
                $command = "cd; curl -L https://mupibox.de/version/latest/update/start_mupibox_update.sh | sudo bash";
                exec($command, $output, $result );
                $string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
                $data = json_decode($string, true);
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>Update complete to version ".$data["mupibox"]["version"]."</li>";
                }
        if( $_POST['os_update'] )
                {
                $command = "sudo apt-get update -y && sudo apt-get update -y && echo 'Operating System updated!'";
                exec($command, $output, $result );
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>OS is up to date</li>";
                }
        if( $_POST['m3u'] )
                {
                $command = "sudo /usr/local/bin/mupibox/./m3u_generator.sh";
                exec($command, $output, $result );
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>Playlists generated</li>";
                }
        if( $_POST['shutdown'] )
                {
                $command = 'bash -c "exec nohup setsid /usr/local/bin/mupibox/./shutdown.sh > /dev/null 2>&1 &"';
                exec($command);
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>Shutdown initiated</li>";
                }
        if( $_POST['reboot'] )
                {
                $command = 'bash -c "exec nohup setsid /usr/local/bin/mupibox/./restart.sh > /dev/null 2>&1 &"';
                exec($command);
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>Restart initiated</li>";
                }
        if( $_POST['update'] )
                {
                $command = "sudo /usr/local/bin/mupibox/./setting_update.sh";
                exec($command, $output, $result );
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>Update complete</li>";
                }
        if( $_POST['spotify_restart'] )
                {
                $command = "sudo /usr/local/bin/mupibox/./spotify_restart.sh";
                exec($command, $output, $result );
                $change=1;
                $CHANGE_TXT=$CHANGE_TXT."<li>Spotify Services are restarted</li>";
                }
  if( $change )
    {
     $json_object = json_encode($data);
     $save_rc = file_put_contents('/etc/mupibox/mupiboxconfig.json', $json_object);
     exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
     exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
    }
        $rc = $output[count($output)-1];

        $CHANGE_TXT=$CHANGE_TXT."</ul>";
?>

                <form class="appnitro" method="post" action="admin.php" id="form"enctype="multipart/form-data">
                                        <div class="description">
                        <h2>MupiBox Administration</h2>
                        <p>Please be sure what you do...</p>
                </div>
                        <ul ><li id="li_1" >

                                                                <li class="li_norm"><h2>MuPiBox Update</h2>
                                                                <p>
                                                                        <table>
                                                                                <tr><td>Current Version:</td>
                                                                                        <td><?php print $data["mupibox"]["version"]; ?></td>
                                                                                </tr>
                                                                                <tr>
                                                                                        <td>Latest Version:</td><td><?php print $dataonline["version"]; ?></td>
                                                                                </tr>
                                                                        </table>
                                                                        Please notice: The update procedure takes a long time (on older Raspberry Pi's up to one hour). Don't close the browser and wait for the status message!
                                                                </p>
                                                                <input id="saveForm" class="button_text" type="submit" name="os_update" value="Update OS" />
                                                                <input id="saveForm" class="button_text" type="submit" name="mupibox_update" value="Update MuPiBox" /></li>

                                                                <li class="li_norm"><h2>Generate Playlists</h2>
                                                                <p>The Job for generating local Playlists. Run this job after adding local media.</p>
                                                                <input id="saveForm" class="button_text" type="submit" name="m3u" value="Generate Playlists" /></li>

                                                                <li class="li_norm"><h2>Update MuPiBox settings</h2>
                                                                <p>The box only updates some settings after a reboot. Some of these settings can be activated with this operation without reboot. </p>
                                                                <input id="saveForm" class="button_text" type="submit" name="update" value="Update settings" />
                                                                <input id="saveForm" class="button_text" type="submit" name="spotify_restart" value="Restart services" />
                <input id="saveForm" class="button_text" type="submit" name="restart_kiosk" value="Restart Chromium-Kiosk" />
                                                                <input id="saveForm" class="button_text" type="submit" name="debug" value="<?php

                if( $data["chromium"]["debug"] == 1)
                  {
                 print "Chrome Debugging Active - turn off";
                  }
                else
                  {
                 print "Chrome Debugging Off - turn on";
                  }
                ?>" />
                <?php
                if( $data["chromium"]["debug"] == 1)
                  {
                print '<input id="saveForm" class="button_text" type="submit" name="debugdownload" value="Download Debug-Log" onclick="window.open(\'./debug.php\', \'_blank\');" />';
                  }
?>
</li>


<li class="li_norm"><h2>Control MuPiBox</h2>
<p>Restart or shutdown the box...</p>
<input id="saveForm" class="button_text" type="submit" name="reboot" value="Reboot MuPiBox" />
<input id="saveForm" class="button_text" type="submit" name="shutdown" value="Shutdown MuPiBox" /></li>

<li class="li_norm"><h2>Backup and restore MuPiBox-settings</h2>
<p>Backup MuPiBox-Data:</p>

<input id="saveForm" class="button_text" type="submit" name="backupdownload" value="Download Backup" onclick="window.open('./backup.php', '_blank');" />
<p>Restore Backup-File:</p
<input type="file" name="fileToUpload" id="fileToUpload">
<input type="submit" value="Upload Backup File" name="submitfile">

</li>
                        </ul>
                </form>
<?php
        include ('includes/footer.php');
?>
