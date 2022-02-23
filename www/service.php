
<?php
	$change=0;
	$onlinejson = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
	$dataonline = json_decode($onlinejson, true);
	include ('includes/header.php');
	if( $_POST['update'] )
		{
		$command = "cd; curl https://raw.githubusercontent.com/splitti/MuPiBox/main/update/start_update.sh | bash";
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
                        <ul ><li id="li_1" >
                                        
								<li class="li_1"><h2>MuPiBox Update</h2>
								<p><table><tr><td>Current Version:</td><td><?php print $data["mupibox"]["version"]; ?></td></tr>
								<tr><td>Latest Version:</td><td <?php print $dataonline["mupibox"]["version"]; ?></td></tr></table>
								</p><input id="saveForm" class="button_text" type="submit" name="update" value="Update system" /></li>
								<li class="li_1"><input id="saveForm" class="button_text" type="submit" name="m3u" value="Generate Playlists" /></li>
								<li class="li_1"><input id="saveForm" class="button_text" type="submit" name="update" value="Update settings" /></li>
                                <li class="li_1"><input id="saveForm" class="button_text" type="submit" name="reboot" value="Reboot MuPiBox" /></li>
                               <li class="li_1"> <input id="saveForm" class="button_text" type="submit" name="shutdown" value="Shutdown MuPiBox" /></li>
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