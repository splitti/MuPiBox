<?php
        $change=0;
        $CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";

        include ('includes/header.php');
        $REDIRECT_URI="http://".$_SERVER['HTTP_HOST']."/spotify.php";
        $SCOPELIST="streaming user-read-currently-playing user-modify-playback-state user-read-playback-state user-read-private user-read-email";
        $SCOPE=urlencode($SCOPELIST);

        if($_GET['code'])
                {
                $command="curl -d client_id=".$data["spotify"]["clientId"]." -d client_secret=".$data["spotify"]["clientSecret"]." -d grant_type=authorization_code -d code=".$_GET['code']." -d redirect_uri=".$REDIRECT_URI." https://accounts.spotify.com/api/token";
                exec($command, $Tokenoutput, $result);
                $tokendata = json_decode($Tokenoutput[0], true);
                $data["spotify"]["accessToken"]=$tokendata["access_token"];
                $data["spotify"]["refreshToken"]=$tokendata["refresh_token"];
                $CHANGE_TXT=$CHANGE_TXT."<li>Token-Data generated and saved</li>";
                $change=1;
                }


        if($_POST['setDevID'])
                {
                $data["spotify"]["deviceId"]=$_POST['spotdevice'];
                $CHANGE_TXT=$CHANGE_TXT."<li>Spotify Device-ID saved</li>";
                $change=1;
                }

        if($_POST['saveLogin'])
                {
                $data["spotify"]["username"]=$_POST['spotify_user'];
                $data["spotify"]["password"]=$_POST['spotify_pwd'];
                $CHANGE_TXT=$CHANGE_TXT."<li>Login-Data saved</li>";
                $change=1;
                }
        if( $_POST['saveIDs'] )
                {
                $data["spotify"]["clientId"]=$_POST['spotify_clientid'];
                $data["spotify"]["clientSecret"]=$_POST['spotify_clientsecret'];
                $CHANGE_TXT=$CHANGE_TXT."<li>Client-Data saved</li>";
                $change=1;
                }
        if( $_POST['resetData'] )
                {
                $data["spotify"]["deviceId"]="";
                $data["spotify"]["accessToken"]="";
                $data["spotify"]["refreshToken"]="";
                $data["spotify"]["username"]="";
                $data["spotify"]["password"]="";
                $data["spotify"]["clientId"]="";
				$data["spotify"]["clientSecret"]="";
                $CHANGE_TXT=$CHANGE_TXT."<li>All Spotify Data resettet!</li>";
                $change=1;
                }
        if( $change )
                {
                $json_object = json_encode($data);
                $save_rc = file_put_contents('/etc/mupibox/mupiboxconfig.json', $json_object);
                $command = "sudo /usr/local/bin/mupibox/./setting_update.sh && /usr/local/bin/mupibox/./spotify_restart.sh";
                exec($command, $output, $result );
                }
        if( $_POST['generateDevID'] )
                {
                $command = "sudo /usr/local/bin/mupibox/./set_deviceid.sh";
                exec($command, $devIDoutput, $result);
                $string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
                $data = json_decode($string, true);
                $CHANGE_TXT=$CHANGE_TXT."<li>Device-ID generated and saved</li>";
                $change=1;
                }

$CHANGE_TXT=$CHANGE_TXT."</ul>";

?>
                <form class="appnitro"  method="post" action="spotify.php" id="form">
                                        <div class="description">
                        <h2>Spotify settings</h2>
                        <p>Specify your Spotify-Account-Settings and connect to Spotify... Please notice: all data will be saved as plain text (not encrypted).</p>
                </div>
 

	<details>
		<summary><i class="fa-regular fa-circle-check"></i> STEP 1 - Login-Data</summary>
				<ul>
			<li id="li_1" >

                <h2>Spotify user and password</h2>
                <p>Please enter Spotify Username and Password. Please notice, spotify premium or family is required!</p>
                        </li>

                                 <li id="li_1" >
                <label class="description" for="spotify_user">Spotify Username</label>
                <div>
                        <input id="spotify_user" name="spotify_user" class="element text medium" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["username"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please enter your Spotify Username.</small></p>
                </li>
                                 <li id="li_1" >
                <label class="description" for="spotify_pwd">Spotify Password </label>
                <div>
                        <input id="spotify_pwd" name="spotify_pwd" class="element text medium" type="password" maxlength="255" value="<?php
                        print $data["spotify"]["password"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please enter your Spotify Password. The Password will be saved as plain text.</small></p>
                </li>
                                <li class="buttons"><input id="saveForm" class="button_text" type="submit" name="saveLogin" value="Save Login Data" /></li>

		</ul>
	</details>	

	<details>
		<summary><i class="fa-regular fa-circle-check"></i> STEP 2 - Developer Client-Connection</summary>
		<ul>
			<li id="li_1" >

                                <h2>Create Developer-App and Client-Connection</h2>

                <p>Please login to <a href="https://developer.spotify.com/dashboard/login" target="_blank">Spotify Developer Dashboard</a> and create a new App. You can choose the App-Name or Description, or take "MuPiBox" easily.</p>
                <p>You will be redireted to the dashboard for the new created app. Copy and paste the Client ID and Client Secret of your app.</p>
                <p>Edit the settings and add the following URL to Redirect URIs:</p>
                                <?php print "<p><b>".$REDIRECT_URI."</b></p>"; ?>
                                </li>
                                 <li id="li_1" >
                <label class="description" for="spotify_clientid">Spotify Client ID </label>
                <div>
                        <input id="spotify_clientid" name="spotify_clientid" class="element text large" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["clientId"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the Client ID from your app in the Spotify Developer Dashboard.</small></p>
                </li>
                                 <li id="li_1" >
                <label class="description" for="spotify_clientsecret">Spotify Client Secret </label>
                <div>
                        <input id="spotify_clientsecret" name="spotify_clientsecret" class="element text large" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["clientSecret"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the Client Secret from your app in the Spotify Developer Dashboard.</small></p>
                </li>

                                <li class="buttons"><input id="saveForm" class="button_text" type="submit" name="saveIDs" value="Save IDs" /></li>

		</ul>
	</details>	

	<details>
		<summary><i class="fa-regular fa-circle-check"></i> STEP 3 - Access- and Refresh-Token</summary>
		<ul>
			<li id="li_1" >

                                <h2>Create Developer-App and Client-Connection</h2>

                <p>Please press the following URL to generate Access and Refresh Token. A login may be necessary.</p>
                                <p><b>
                                <?php 
                                        print '<a href=https://accounts.spotify.com/authorize?response_type=code&client_id='.$data["spotify"]["clientId"].'&redirect_uri='.$REDIRECT_URI.'&scope='.$SCOPE.' id="loading">Login and generate Refresh & Access Token</a>'; 
                                ?> 
                                </b></p>
                                </li> 
                                 <li id="li_1" >
                <label class="description" for="spotify_accesstoken">Spotify Access Token </label>
                <div>
                        <input id="readonly" name="spotify_accesstoken" class="element readonly large" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["accessToken"];
?>" readonly />
                </div></li>

                                 <li id="li_1" >
                <label class="description" for="spotify_refreshtoken">Spotify Refresh Token </label>
                <div>
                        <input id="spotify_refreshtoken" name="spotify_refreshtoken" class="element readonly large" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["refreshToken"];
?>" readonly />
                </div>
                                </li>

		</ul>
	</details>	

	<details>
		<summary><i class="fa-regular fa-circle-check"></i> STEP 4 - Device-ID</summary>
		<ul>
			<li id="li_1" >

			<h2>Set Device-ID</h2>
            <p>In this last step, you choose your Device... Please notice: sometimes it is necessary to play music on the MuPiBox via app so that the device ID is generated</p>
            </li>
			<li id="li_1" >
			<label class="description" for="spotify_deviceid">Select Spotify Device ID </label>
<?php
			if( $data["spotify"]["accessToken"] != "" AND $data["spotify"]["refreshToken"] != "" )
				{
				echo '<select id="spotdevice" name="spotdevice" class="element text medium">';

				$command = "sudo /usr/local/bin/mupibox/./get_deviceid.sh";
				exec($command, $devIDoutput, $result);
				$spotify_dev_json = file_get_contents('/tmp/.spotify_devices', true);
				$devices = json_decode($spotify_dev_json, true);
				foreach($devices as $this_device)
					{
					if( $this_device["id"] == $data["spotify"]["deviceId"] )
						{
						$selected = " selected=\"selected\"";
						$activated_device_name = $this_device["name"];
						}
					else
						{
						$selected = "";
						}
					print "<option value=\"". $this_device["id"] . "\"" . $selected  . ">" . $this_device["name"] . " (".$this_device["id"].")</option>";
					}
				echo '</select>';
				echo '</li><li class="buttons"><input id="saveForm" class="button_text" type="submit" name="setDevID" value="Set DeviceID" /></li><br><li id="li_1" >';
				}
			else
				{
				print "Please complete the previous steps.";
				}
?>
                <div>
                <label class="description" for="spotify_devicename">Activated Spotify Device Name:</label> 
                <input id="spotify_deviceid" name="spotify_devicename" class="element readonly large" type="text" maxlength="255" value="<?php
                print $activated_device_name;
?>" readonly /></div>
                <div><label class="description" for="spotify_deviceid">Activated Spotify Device ID:</label> 
                <input id="spotify_deviceid" name="spotify_deviceid" class="element readonly large" type="text" maxlength="255" value="<?php
                print $data["spotify"]["deviceId"];
?>" readonly /></div>

                </li>
		</ul>
	</details>	

	<details>
		<summary><i class="fa-solid fa-eraser"></i> Reset Spotify-Connection</summary>
		<ul>
			<li id="li_1" >
				<h2>RESET ALL DATA</h2>

                <p>Click this Button, to reset all saved spotify data!!!</p>
				</li>
					<li class="buttons">
						<input id="saveForm" class="button_text_red" type="submit" name="resetData" value="RESET SPOTIFY-CONNECTION" onclick="return confirm('Do really want to reset all Connection-Data to Spotify?');" />
					</li>
		</ul>
	</details>	

                </form>
                        <p></p>
<?php
        include ('includes/footer.php');
?>
