
<?php
	$change=0;
	include ('includes/header.php');
	if( $_POST['update'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./system_update.sh";
		$change_hostname = exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['m3u'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./m3u_generator.sh";
		$change_hostname = exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['shutdown'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./software_shutdown.sh";
		$change_hostname = exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['reboot'] )
		{
		$command = "sudo reboot";
		$change_hostname = exec($command, $output, $result );
		$change=1;
		}
	if( $_POST['update'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./setting_update.sh";
		$change_hostname = exec($command, $output, $result );
		$change=1;
		}
	$rc = $output[count($output)-1];
?>

                <form class="appnitro"  method="post" action="service.php">
                                        <div class="description">
                        <h2>MupiBox settings</h2>
                        <p>Some little helpers...</p>
                </div>
                        <ul >
                                        <li class="buttons">
								<input id="saveForm" class="button_text" type="submit" name="update" value="Update system" />
								<input id="saveForm" class="button_text" type="submit" name="m3u" value="Generate Playlists" />
								<input id="saveForm" class="button_text" type="submit" name="update" value="Update settings" />
                                <input id="saveForm" class="button_text" type="submit" name="reboot" value="Reboot MuPiBox" />
                                <input id="saveForm" class="button_text" type="submit" name="shutdown" value="Shutdown MuPiBox" />
														<?php
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