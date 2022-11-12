<?php
	$onlinejson = file_get_contents('https://mupibox.de/version/latest/version.json');
	$dataonline = json_decode($onlinejson, true);
	include ('includes/header.php');
	$change=0;
	$shutdown=0;
	$reboot=0;
	$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";

	if( $_POST['spotifydebug'] == "Controller Debugging Off - turn on" )
		{
		$sdcommand='sudo su -c \'sed -i "s/\"logLevel\": \"error\"/\"logLevel\": \"debug\"/g" /home/dietpi/.mupibox/spotifycontroller-main/config/config.json\'';
		exec($sdcommand);
		$sdcommand="sudo su dietpi -c 'pm2 restart spotify-control'";
		exec($sdcommand);
		}
	if( $_POST['spotifydebug'] == "Controller Debugging Active - turn off" )
		{
		$sdcommand='sudo su -c \'sed -i "s/\"logLevel\": \"debug\"/\"logLevel\": \"error\"/g" /home/dietpi/.mupibox/spotifycontroller-main/config/config.json\'';
		exec($sdcommand);
		$sdcommand="sudo su dietpi -c 'pm2 restart spotify-control'";
		exec($sdcommand);
		}
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
	if( $_POST['submitfile'] )
		{
		$target_dir = "/tmp/";
		$target_file = $target_dir . basename($_FILES["fileToUpload"]["name"]);
		$uploadOk = 1;
		$FileType = strtolower(pathinfo($target_file,PATHINFO_EXTENSION));
		// Allow zip file format
		if($FileType != "gz" ) 
			{
			$uploadOk = 0;
			}
		// Check if $uploadOk is set to 0 by an error
		if ($uploadOk == 0)
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>WARNING: Please upload a .tar.gz-File!</li>";
			$change=1;
			} 
		else 
			{
			if (move_uploaded_file($_FILES["fileToUpload"]["tmp_name"], $target_file))
				{
				#$command = "sudo unzip -o -a '".$target_file."' -d / >> /tmp/restore.log";
				#$command = "sudo su - -c \"unzip -o -a '".$target_file."' -d / >> /tmp/restore.log && sleep 1\"";
				$command = "sudo tar xvzf ".$target_file." >> /tmp/restore.log";
				exec($command, $output, $result );
				$command = "sudo rm '".$target_file."'";
				exec($command, $output, $result );
				$change=1;
				$CHANGE_TXT=$CHANGE_TXT."<li>Backup-File restored. NOTICE: A restored Hostname will not work, please change and save the Hostname!</li>";
				}
			else
				{
				$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: Error on uploading Backup-File!</li>";
				}
			}
		}

	if( $_POST['restart_kiosk'] )
		{
		$command = "sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Chromium Kiosk restarted</li>";
		}
	if( $_POST['mupibox_update'] )
		{
		$command = "cd; curl -L https://mupibox.de/version/latest/update/start_mupibox_update.sh | sudo bash";
		exec($command, $output, $result );
		$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
		$data = json_decode($string, true);
		$change=3;
		$reboot=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Update complete to Version ".$data["mupibox"]["version"]."</li>";
		}
	if( $_POST['mupibox_devupdate'] )
		{
		$command = "cd; curl -L https://raw.githubusercontent.com/splitti/MuPiBox/main/update/start_mupibox_update-developer.sh | sudo bash";
		exec($command, $output, $result );
		$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
		$data = json_decode($string, true);
		$change=1;
		$reboot=1;
		$data["mupibox"]["version"]=$data["mupibox"]["version"]." DEVELOPMENT";
		$CHANGE_TXT=$CHANGE_TXT."<li>Update complete to Development-Version ".$data["mupibox"]["version"]."</li>";
		}
	if( $_POST['os_update'] )
		{
		$command = "sudo apt-get update -y && sudo apt-get update -y && echo 'Operating System updated!'";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>OS is up to date</li>";
		}
	if( $_POST['m3u'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./m3u_generator.sh";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Playlists generated</li>";
		}
	if( $_POST['shutdown'] )
		{
		#$command = 'bash -c "sleep 2; exec nohup setsid /usr/local/bin/mupibox/./shutdown.sh > /dev/null 2>&1" &';
		#exec($command);
		$shutdown=1;
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Shutdown initiated</li>";
		}
	if( $_POST['reboot'] )
		{
		#$command = 'bash -c "sleep 2;exec nohup setsid /usr/local/bin/mupibox/./restart.sh > /dev/null 2>&1" &';
		#exec($command);
		$reboot=1;
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Restart initiated</li>";
		}
	if( $_POST['update'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./setting_update.sh";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Update complete</li>";
		}
	if( $_POST['spotify_restart'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./spotify_restart.sh";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Spotify Services are restarted</li>";
		}
	if( $_POST['resetMupiConf'] )
		{
		$command = "sudo su - -c 'rm /etc/mupibox/mupiboxconfig.json;wget https://mupibox.de/version/latest/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json;chown root:www-data /etc/mupibox/mupiboxconfig.json;chmod 777 /etc/mupibox/mupiboxconfig.json'";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>MuPiBox-Conf is set to initial</li>";
		}
	if( $_POST['resetDataJson'] )
		{
		$command = "sudo rm /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/*data.json";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>data.json deleted</li>";
		}
	if( $change == 1 )
		{
		$json_object = json_encode($data);
		$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
		exec("sudo chmod 755 /etc/mupibox/mupiboxconfig.json");
		exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
		exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
		exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
		}
	if( $change == 2 )
		{
		$json_object = json_encode($data);
		$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
		exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
		exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
		}
	$rc = $output[count($output)-1];
	$CHANGE_TXT=$CHANGE_TXT."</ul></div>";
?>

<form class="appnitro" method="post" action="admin.php" id="form"enctype="multipart/form-data">
	<div class="description">
		<h2>MupiBox Administration</h2>
		<p>Please be sure what you do...</p>
	</div>
	<ul>
		<li id="li_1" >

			<li class="li_norm"><h2>MuPiBox Update</h2>
				<p>
				<table>
					<tr>
						<td>Current Version:</td>
						<td><?php print $data["mupibox"]["version"]; ?></td>
					</tr>
					<tr>
						<td>Latest Version:</td><td><?php print $dataonline["version"]; ?></td>
					</tr>
				</table>
			</p>
			<p><b>Please notice: </b>Always create a backup before updating!!!<br>The update procedure takes a long time (on older Raspberry Pi's up to 15 minutes). Do not close the browser and wait for the reboot.
			</p>
			<input id="saveForm" class="button_text" type="submit" name="os_update" value="Update OS"  onclick="return confirm('Do really want to update the Operating System?');" />
			<input id="saveForm" class="button_text" type="submit" name="mupibox_update" value="Update MuPiBox (Stable Version)"  onclick="return confirm('Do really want to Update the MuPiBox?');" />
			<input id="saveForm" class="button_text_red" type="submit" name="mupibox_devupdate" value="Update MuPiBox (Development Version)"  onclick="return confirm('Do really want to Update the MuPiBox to unstable version? Notice: This is an untested Development-Version!');" />
		</li>

		<li class="li_norm"><h2>Generate Playlists</h2>
			<p>The Job for generating local Playlists. Run this job after adding local media.</p>
			<input id="saveForm" class="button_text" type="submit" name="m3u" value="Generate Playlists" />
		</li>

		<li class="li_norm"><h2>Update MuPiBox settings</h2>
			<p>The box only updates some settings after a reboot. Some of these settings can be activated with this operation without reboot. </p>
			<input id="saveForm" class="button_text" type="submit" name="update" value="Update settings" />
			<input id="saveForm" class="button_text" type="submit" name="spotify_restart" value="Restart services" />
			<input id="saveForm" class="button_text" type="submit" name="restart_kiosk" value="Restart Chromium-Kiosk" />
		</li>

		<li class="li_norm"><h2>MuPiBox Debugging</h2>
			<p>Some important options to load necessary logs.</p>

				<?php
					if( $data["chromium"]["debug"] == 1)
						{
						print '<input id="saveForm" class="button_text_red" type="submit" name="debug" value="Chrome Debugging Active - turn off';
						}
					else
						{
						print '<input id="saveForm" class="button_text_green" type="submit" name="debug" value="Chrome Debugging Off - turn on"';
						}
				?>" />	
				<?php
					if( $data["chromium"]["debug"] == 1)
						{
						print '<input id="saveForm" class="button_text" type="submit" name="debugdownload" value="Download Debug-Log" onclick="window.open(\'./debug.php\', \'_blank\');" />';
						}
				?><br />
				<?php
					$sdcommand = "sudo cat /home/dietpi/.mupibox/spotifycontroller-main/config/config.json | grep '\"logLevel\": \"error\"'";
					exec($sdcommand, $sdoutput, $sdresult );
					if( $sdoutput )
						{
						print '<input id="saveForm" class="button_text_green" type="submit" name="spotifydebug" value="Controller Debugging Off - turn on';
						}
					else
						{
						print '<input id="saveForm" class="button_text_red" type="submit" name="spotifydebug" value="Controller Debugging Active - turn off';
						}
				?>" />
			<input id="saveForm" class="button_text" type="submit" name="pm2download" value="Download PM2-Log" onclick="window.open('./pm2logs.php', '_blank');" />
		</li>
		<li class="li_norm"><h2>Control MuPiBox</h2>
			<p>Restart or shutdown the box...</p>
			<input id="saveForm" class="button_text" type="submit" name="reboot" value="Reboot MuPiBox" onclick="return confirm('Do really want to reboot?');" />
			<input id="saveForm" class="button_text" type="submit" name="shutdown" value="Shutdown MuPiBox"  onclick="return confirm('Do really want to shutdown?');" />
		</li>
		<li class="li_norm"><h2>Backup MuPiBox-settings</h2>
			<p>Backup MuPiBox-Data (mupiboxconfig.json and data.json):</p>

			<input id="saveForm" class="button_text" type="submit" name="backupdownload" value="Download Backup" onclick="window.open('./backup.php', '_blank');" />
		</li>
		<li class="li_norm"><h2>Restore MuPiBox-settings</h2>
			<p>Restore Backup-File:</p>
			<input type="file" class="button_text_upload" name="fileToUpload" id="fileToUpload">
			<input type="submit" class="button_text" value="Upload Backup File" name="submitfile"  onclick="return confirm('Do really want to restore the settings?');" >
		</li>
		<li class="li_norm"><h2>Reset MuPiBox-settings</h2>
			<p>This will delete all configurations, including the Spotify-Connection:</p>
			<input id="saveForm" class="button_text_red" type="submit" name="resetMupiConf" value="RESET mupiboxconf.json" onclick="return confirm('Do really want to reset to default mupiboxconf.json?');" />
			<p>Delete all Media-Data in data.json:</p>
			<input id="saveForm" class="button_text_red" type="submit" name="resetDataJson" value="RESET data.json" onclick="return confirm('Do really want to delete data.json?');" />
		</li>
	</ul>
</form>
<?php
		include ('includes/footer.php');
?>
