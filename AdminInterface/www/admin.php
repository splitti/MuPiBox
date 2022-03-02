
<?php
	$change=0;
	$onlinejson = file_get_contents('https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json');
	$dataonline = json_decode($onlinejson, true);
	include ('includes/header.php');
	if( $_POST['restart_kiosk'] )
		{
		$command = "/usr/local/bin/mupibox/./restart_kiosk.sh";
		exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['mupibox_update'] )
		{
		$command = "cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/update/start_mupibox_update.sh | sudo bash";
		exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['os_update'] )
		{
		$command = "sudo apt-get update -y && sudo apt-get update -y && echo 'Operating System updated!'";
		exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['m3u'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./m3u_generator.sh";
		exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['shutdown'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./software_shutdown.sh";
		exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['reboot'] )
		{
		$command = "sudo reboot";
		exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['update'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./setting_update.sh";
		exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['spotify_restart'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./spotify_restart.sh";
		exec($command, $output, $result );
		$change=1;
		}

	$rc = $output[count($output)-1];
?>

                <form class="appnitro"  method="post" action="admin.php">
                                        <div class="description">
                        <h2>MupiBox settings</h2>
                        <p>Some little helpers...</p>
                </div>
                        <ul ><li id="li_1" >
                                        
								<li class="li_1"><h2>MuPiBox Update</h2>
								<p>
									<table>
										<tr><td>Current Version:</td>
											<td><?php print $data["mupibox"]["version"]; ?></td>
										</tr>
										<tr>
											<td>Latest Version:</td><td><?php print $dataonline["version"]; ?></td>
										</tr>
									</table>
									Please notice: The update procedure takes a long time. Don't close the browser and wait for the status message!
								</p>
								<input id="saveForm" class="button_text" type="submit" name="os_update" value="Update OS" />
								<input id="saveForm" class="button_text" type="submit" name="mupibox_update" value="Update MuPiBox" /></li>
								
								<li class="li_1"><h2>Generate Playlists</h2>
								<p>The Job for generating Playlists runs every <?php print $data["mupibox"]["mediaCheckTimer"];  ?> seconds. If you need the data as soon as possible, start this job...</p>
								<input id="saveForm" class="button_text" type="submit" name="m3u" value="Generate Playlists" /></li>
								
								<li class="li_1"><h2>Update MuPiBox settings</h2>
								<p>The box only updates some settings after a reboot. Some of these settings can be activated with this operation without reboot. </p>
								<input id="saveForm" class="button_text" type="submit" name="update" value="Update settings" />
								<input id="saveForm" class="button_text" type="submit" name="spotify_restart" value="Restart services" />
								<input id="saveForm" class="button_text" type="submit" name="restart_kiosk" value="Restart Chromium-Kiosk" /></li>
                                
								<li class="li_1"><h2>Reboot MuPiBox</h2>
								<p>Sometimes only a restart helps...</p>
								<li class="li_1"><input id="saveForm" class="button_text" type="submit" name="reboot" value="Reboot MuPiBox" /></li>
                                
								<li class="li_1"><h2>Shutdown MuPiBox</h2>
								<p>Turn the box off... See you later!</p>
								<input id="saveForm" class="button_text" type="submit" name="shutdown" value="Shutdown MuPiBox" /></li>
								
								<li class="li_1">						<?php
							if( $change )
								{
								print "<div id='savestategood'><p>" . $rc . "</p></div>";
								}
						?>
                </li>


                        </ul>
                </form>
        </div>
<?php
	include ('includes/footer.html');
?>