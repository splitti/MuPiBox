<?php

	function write_json($data)
		{
		$json_object = json_encode($data);
		$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
		exec("sudo chmod 755 /etc/mupibox/mupiboxconfig.json");
		exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
		exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
		exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
		}

	$change=0;
	$shutdown=0;
	$reboot=0;
	$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";

	if( $_POST['submitfile'] )
		{
		$target_dir = "/tmp/";
		$target_file = $target_dir . basename($_FILES["fileToUpload"]["name"]);
		$uploadOk = 1;
		$FileType = strtolower(pathinfo($target_file,PATHINFO_EXTENSION));
		// Allow zip file format
		if($FileType != "zip" )
			{
			$uploadOk = 0;
			}
		// Check if $uploadOk is set to 0 by an error
		if ($uploadOk == 0)
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>WARNING: Please upload a .zip-File!</li>";
			$change=0;
			}
		else
			{
			if (move_uploaded_file($_FILES["fileToUpload"]["tmp_name"], $target_file))
				{
				$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
				$data = json_decode($string, true);
				$old_version = $data["mupibox"]["version"];

				$command = "sudo unzip -o -a '".$target_file."' -d / >> /tmp/restore.log";
				#$command = "sudo su - -c \"unzip -o -a '".$target_file."' -d / >> /tmp/restore.log && sleep 1\"";
				#$command = "sudo su - -c 'tar xvzf ".$target_file." >> /tmp/restore.log'";
				exec($command, $output, $result );
				exec("sudo chown root:www-data /etc/mupibox/mupiboxconfig.json");
				exec("sudo chmod 644 /etc/mupibox/mupiboxconfig.json");
				exec("sudo chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json");
				exec("sudo chmod 644 /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json");

				$command = "cd; curl -L https://raw.githubusercontent.com/friebi/MuPiBox/develop/update/conf_update.sh | sudo bash";
				exec($command, $output, $result );

				$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
				$data = json_decode($string, true);
				$data["mupibox"]["version"] = $old_version;
				write_json($data);

				$command = "sudo /boot/dietpi/func/change_hostname " . $data["mupibox"]["host"];
				$change_hostname = exec($command, $output, $change_hostname );
				$command = "sudo su dietpi -c '/usr/local/bin/mupibox/./set_hostname.sh'";
				exec($command);

				$command = "sudo rm '".$target_file."'";
				exec($command, $output, $result );
				$change=99;
				$CHANGE_TXT=$CHANGE_TXT."<li>Backup-File restored! The MuPiBox will reboot now!</li>";
				$reboot=1;
				}
			else
				{
				$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: Error on uploading Backup-File!</li>";
				}
			}
		}

	$onlinejson = file_get_contents('https://raw.githubusercontent.com/friebi/MuPiBox/develop/version.json');
	$dataonline = json_decode($onlinejson, true);
	include ('includes/header.php');

	if( $_POST['id3tags'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./id3tag_converter.sh";
		exec($command);
		$CHANGE_TXT=$CHANGE_TXT."<li>ID3-Tags converted</li>";
		$change=4;
		}

	if( $_POST['ip_control_backend'] == "enable" )
		{
		$data["mupibox"]["ip_control_backend"]=true;
		$change=2;
		$CHANGE_TXT=$CHANGE_TXT."<li>IP Control enabled - Services restarted</li>";
		}
	if( $_POST['ip_control_backend'] == "disable" )
		{
		$data["mupibox"]["ip_control_backend"]=false;
		$change=2;
		$CHANGE_TXT=$CHANGE_TXT."<li>IP Control disabled - Services restarted</li>";
		}

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

	if( $_POST['restart_kiosk'] )
		{
		//$command = "sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh";
		//exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Chromium Kiosk restarted</li>";
		}
	if( $_POST['mupibox_update'] )
		{
		$command = "cd; curl -L https://raw.githubusercontent.com/friebi/MuPiBox/develop/update/start_mupibox_update.sh | sudo bash -s -- stable";
		exec($command, $output, $result );
		$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
		$data = json_decode($string, true);
		$change=3;
		$reboot=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Update complete to Version ".$data["mupibox"]["version"]."</li>";
		}
	if( $_POST['mupibox_update_beta'] )
		{
		$command = "cd; curl -L https://raw.githubusercontent.com/friebi/MuPiBox/develop/update/start_mupibox_update.sh | sudo bash -s -- beta";
		exec($command, $output, $result );
		$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
		$data = json_decode($string, true);
		$change=1;
		$reboot=1;
		$data["mupibox"]["version"]=$data["mupibox"]["version"]." BETA";
		$CHANGE_TXT=$CHANGE_TXT."<li>Update complete to Beta-Version ".$data["mupibox"]["version"]."</li>";
		}
	if( $_POST['mupibox_update_dev'] )
		{
		$command = "cd; curl -L https://raw.githubusercontent.com/friebi/MuPiBox/develop/update/start_mupibox_update.sh | sudo bash -s -- dev";

		exec($command, $output, $result );
		$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
		$data = json_decode($string, true);
		$change=1;
		$reboot=1;
		$data["mupibox"]["version"]=$data["mupibox"]["version"]." DEVELOPMENT";
		$CHANGE_TXT=$CHANGE_TXT."<li>Update complete to Development-Version ".$data["mupibox"]["version"]."</li>";
		}
/*	if( $_POST['config_update'] )
		{
		$command = "cd; curl -L https://raw.githubusercontent.com/friebi/MuPiBox/develop/update/conf_update.sh | sudo bash";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Config is up to date.</li>";
		}
*/
	if( $_POST['os_update'] )
		{
		$command = "sudo apt-get -y --install-recommends -o Dpkg::Options::=\"--force-confdef\" -o Dpkg::Options::=\"--force-confold\" update && sudo apt-get -y --install-recommends -o Dpkg::Options::=\"--force-confdef\" -o Dpkg::Options::=\"--force-confold\" upgrade";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>OS is up to date.</li>";
		}
	if( $_POST['m3u'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./m3u_generator.sh";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Cleaning and updating media data complete</li>";
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
		/*UPDATE 3.0.0*/
		$str_data = file_get_contents('/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json', true);
		$data_json_playlistid = json_decode($str_data, true);
		include ('includes/header.php');
		$i = 0;
		foreach($data_json_playlistid as $mydata)
			{
			if( $mydata['category'] == "playlist" )
				{
				$data_json_playlistid[$i]['category'] = "music";
				$data_json_playlistid[$i]['playlistid'] = $mydata['id'];
				unset($data_json_playlistid[$i]['id']);
				}
			$i++;
			}
		$json_changed = json_encode($data_json_playlistid);
		file_put_contents('/tmp/data.json', $json_changed );
		exec("sudo mv /tmp/data.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json");
		exec("sudo chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json");
		/*END OF UPDATE 3.0.0*/
		$command = "sudo /usr/local/bin/mupibox/./setting_update.sh";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Update complete</li>";
		}
	if( $_POST['pm2_restart'] )
		{
		$command = "sudo -i -u dietpi pm2 restart server; sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Spotify Services are restarted</li>";
		}

	if( $_POST['spotify_restart'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./spotify_restartspotify_restart.sh";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Spotify Services are restarted</li>";
		}
	if( $_POST['resetMupiConf'] )
		{
		$command = "sudo su - -c 'rm /etc/mupibox/mupiboxconfig.json;wget https://raw.githubusercontent.com/friebi/MuPiBox/develop/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json;chown root:www-data /etc/mupibox/mupiboxconfig.json;chmod 777 /etc/mupibox/mupiboxconfig.json'";
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
	if( $_POST['resetConfigJson'] )
		{
		$command = "sudo su - -c '/usr/local/bin/mupibox/./repair_config.sh'";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>config.json repaired</li>";
		}
	if( $change == 1 )
		{
		write_json($data);
		}
	if( $change == 2 )
		{
		$json_object = json_encode($data);
		$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
		exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
		exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
		}
	if( $change == 3 )
		{
		//$json_object = json_encode($data);
		//$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
		//exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
		exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
		exec("sudo /usr/local/bin/mupibox/./set_hostname.sh");
		exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
		}
	$CHANGE_TXT=$CHANGE_TXT."</ul></div>";
?>

<form class="appnitro" method="post" action="admin.php" id="form"enctype="multipart/form-data">
	<div class="description">
		<h2>MupiBox Administration</h2>
		<p>Please be sure what you do...</p>
	</div>


	<details>
		<summary><i class="fa-solid fa-power-off"></i> Control system</summary>
		<ul>
			<li class="li_norm">
				<p>Reboot or shutdown MuPiBox...</p>
				<input id="saveForm" class="button_text" type="submit" name="reboot" value="Reboot MuPiBox" onclick="return confirm('Do really want to reboot?');" />
				<input id="saveForm" class="button_text" type="submit" name="shutdown" value="Shutdown MuPiBox"  onclick="return confirm('Do really want to shutdown?');" />
			</li>
		</ul>
	</details>

	<details>
		<summary><i class="fa-sharp fa-solid fa-music"></i> Music database</summary>
		<ul>
			<li class="li_norm"><h2>Clean and update music database</h2>
				<p>This job generates offline playlists, cleans up old data and links local covers to playlists. Run this job after adding or deleting local media.</p>
				<input id="saveForm" class="button_text" type="submit" name="m3u" value="Update mediadata" />
			</li>

			<li class="li_norm"><h2>Convert ID3-Tags</h2>
				<p>Sometimes ID3 tags are not displayed correctly (for example the German umlauts). This converter can help displaying the characters correctly.</p>
				<input id="saveForm" class="button_text" type="submit" name="id3tags" value="Update ID3-Tags" />
			</li>
		</ul>
	</details>

	<details>
		<summary><i class="fa-solid fa-download"></i> Backup and restore settings</summary>
		<ul>
			<li class="li_norm"><h2>Backup MuPiBox-settings</h2>
				<p>Backup MuPiBox-Data (cover, mupiboxconfig.json and data.json):</p>

				<input id="saveForm" class="button_text" type="submit" name="backupdownload" value="Download Configuration-Backup" onclick="window.open('./backup.php', '_blank');" />
				<p>Backup all MuPiBox-Data (media-files, cover, mupiboxconfig.json and data.json):</p>

				<input id="saveForm" class="button_text" type="submit" name="fullbackupdownload" value="Download Full-Backup" onclick="window.open('./fullbackup.php', '_blank');" />
			</li>
			<li class="li_norm"><h2>Restore MuPiBox-settings</h2>
				<p>Restore Backup-File:</p>
				<input type="file" class="button_text_upload" name="fileToUpload" id="fileToUpload">
				<input type="submit" class="button_text" value="Upload Backup File" name="submitfile"  onclick="return confirm('Do really want to restore the settings?');" >
			</li>
		</ul>
	</details>

	<details>
		<summary><i class="fa-solid fa-gears"></i> MuPiBox settings and services</summary>
		<ul>

			<li class="li_norm"><h2>Update MuPiBox settings</h2>
				<p>The box only updates some settings after a reboot. Some of these settings can be activated with this operation without reboot. </p>
				<input id="saveForm" class="button_text" type="submit" name="update" value="Update settings" />
			</li>
			<li class="li_norm"><h2>Restart MuPiBox Spotify services</h2>
				<p>Restart tbe MuPiBox frontend and the services to connect to spotify. </p>
				<input id="saveForm" class="button_text" type="submit" name="spotify_restart" value="Restart services" />
			</li>
			<li class="li_norm"><h2>Restart PM2</h2>
				<p>Restart tbe MuPiBox frontend and the kiosk. </p>
				<input id="saveForm" class="button_text" type="submit" name="pm2_restart" value="Restart services" />
			</li>
			<li class="li_norm"><h2>IP Control Backend</h2>
				<p>In some cases, the MuPiBox cannot communicate correctly via hostname. Try to activate this point, to set the communication to IP.</p>
				<p>
				<?php
				if( $data["mupibox"]["ip_control_backend"] )
					{
					$ip_control_backend_state="enabled";
					$change_ip_control="disable";
					}
				else
					{
					$ip_control_backend_state="disabled";
					$change_ip_control="enable";
					}

				echo "IP Control Backend: <b>".$ip_control_backend_state."</b>";
				?></p>
				<input id="saveForm" class="button_text" type="submit" name="ip_control_backend" value="<?php print $change_ip_control; ?>" />
			</li>
			<li class="li_norm"><h2>Restart MuPiBox kiosk</h2>
				<p>Restart chromium browser. </p>
				<input id="saveForm" class="button_text" type="submit" name="restart_kiosk" value="Restart Chromium-Kiosk" />
			</li>
		</ul>
	</details>
	<details>
		<summary><i class="fa-solid fa-rotate"></i> Updates</summary>
		<ul>
			<li class="li_norm"><h2>MuPiBox updates</h2>
				<p>You can update MuPiBox at any time to stable, beta or development version. Please be careful, the development version could destroy your installation!</p>
				<p>
					<table>
						<tr>
								<td><b>Installed version</b></br>
								<?php print $data["mupibox"]["version"]; ?></td>
						</tr>
					</table>
					<br>
					<table class="version">
						<tr>
								<th>Environment</th>
								<th>Latest Version</th>
								<th>Release-Infos</th>
								<th>Update-Button</th>
						</tr>
						<tr>
								<td>Stable</td>
								<td><?php print $dataonline["release"]["stable"][count($dataonline["release"]["stable"])-1]["version"]; ?></td>
								<td><?php print $dataonline["release"]["stable"][count($dataonline["release"]["stable"])-1]["releaseinfo"]; ?></td>
								<td>
								<input type="hidden" name="update_url" value="<?php print $dataonline["release"]["stable"][count($dataonline["release"]["stable"])-1]["url"]; ?>" />
								<input type="hidden" name="update_env" value="stable" />
								<input type="hidden" name="update_version" value="<?php print $dataonline["release"]["stable"][count($dataonline["release"]["stable"])-1]["version"]; ?>"  onclick="return confirm('Do really want to Update the MuPiBox?');" />
								<input id="saveForm" class="button_text_green" type="submit" name="mupibox_update" value="Update to version <?php print $dataonline["release"]["stable"][count($dataonline["release"]["stable"])-1]["version"]; ?>"  onclick="return confirm('Do really want to Update the MuPiBox?');" />
								</td>
						</tr>
						<tr>
								<td>Beta</td>
								<td><?php print $dataonline["release"]["beta"][count($dataonline["release"]["beta"])-1]["version"]; ?></td>
								<td><?php print $dataonline["release"]["beta"][count($dataonline["release"]["beta"])-1]["releaseinfo"]; ?></td>
								<td>
								<input type="hidden" name="update_url" value="<?php print $dataonline["release"]["beta"][count($dataonline["release"]["beta"])-1]["url"]; ?>" />
								<input type="hidden" name="update_env" value="beta" />
								<input type="hidden" name="update_version" value="<?php print $dataonline["release"]["beta"][count($dataonline["release"]["beta"])-1]["version"]; ?>"  onclick="return confirm('Do really want to Update the MuPiBox?');" />
								<input id="saveForm" class="button_text_orange" type="submit" name="mupibox_update_beta" value="Update to version <?php print $dataonline["release"]["beta"][count($dataonline["release"]["beta"])-1]["version"]; ?>"  onclick="return confirm('Do really want to Update the MuPiBox?');" />
								</td>
						</tr>
						<tr>
								<td>Development</td>
								<td><?php
											exec("echo $(sudo curl -s 'https://api.github.com/repos/friebi/MuPiBox' | jq -r '.pushed_at' | cut -d'T' -f1)", $devversion, $rc);
											print "DEV " . $devversion[0];
									?>
								 </td>
								<td><?php print $dataonline["release"]["dev"][count($dataonline["release"]["dev"])-1]["releaseinfo"]; ?></td>
								<td>
								<input type="hidden" name="update_url" value="<?php print $dataonline["release"]["dev"][count($dataonline["release"]["dev"])-1]["url"]; ?>" />
								<input type="hidden" name="update_env" value="dev" />
								<input type="hidden" name="update_version" value="<?php print $dataonline["release"]["dev"][count($dataonline["release"]["dev"])-1]["version"]; ?>"  onclick="return confirm('Do really want to Update the MuPiBox?');" />
								<input id="saveForm" class="button_text_red" type="submit" name="mupibox_update_dev" value="Update to version <?php print $dataonline["release"]["dev"][count($dataonline["release"]["dev"])-1]["version"]; ?>"  onclick="return confirm('Do really want to Update the MuPiBox?');" />
								</td>
						</tr>
					</table>
				</p>
				<li class="li_norm"><h2>Update OS (Operating System)</h2>
				<p><b>Please note: </b>Always create a backup before updating!!!<br>The update procedure takes a long time (on older Raspberry Pi's up to 30 minutes). Do not close the browser and wait for the reboot.
				</p>
			</li>
				Updating OS packages (apt-get update and apt-get upgrade):<br/>
				<input id="saveForm" class="button_text" type="submit" name="os_update" value="Update OS"  onclick="return confirm('Do really want to update the Operating System?');" />
			</li>
		</ul>
	</details>


	<details>
		<summary><i class="fas fa-stream"></i> Logging / Debug</summary>
		<ul>
			<li class="li_norm">
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
		</ul>
	</details>

	<details>
		<summary><i class="far fa-file-alt"></i> Reset configuration</summary>
		<ul>

			<li class="li_norm"><h2>Reset Spotify-Connection</h2>
				<p>This will delete all configurations, including the Spotify-Connection:</p>
				<input id="saveForm" class="button_text_red" type="submit" name="resetMupiConf" value="RESET mupiboxconf.json" onclick="return confirm('Do really want to reset to default mupiboxconf.json?');" />
			</li>
			<li class="li_norm"><h2>Reset media-configuration</h2>
				<p>Delete all media-data in data.json (you will delete all online entries for spotify and streaming):</p>
				<input id="saveForm" class="button_text_red" type="submit" name="resetDataJson" value="RESET data.json" onclick="return confirm('Do really want to delete data.json?');" />
			</li>
			<li class="li_norm"><h2>Reset server-config</h2>
				<p>Repair config.json (Helps for "This site can't be reached"-Error):</p>
				<input id="saveForm" class="button_text_red" type="submit" name="resetConfigJson" value="RESET config.json" onclick="return confirm('Do really want to repair config.json?');" />
			</li>

		</ul>
	</details>
</form>
<?php
		include ('includes/footer.php');
?>
