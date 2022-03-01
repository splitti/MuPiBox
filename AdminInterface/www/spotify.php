
<?php
	$change=0;
	include ('includes/header.php');
	if( $data["spotify"]["username"]!=$_POST['spotify_user'] && $_POST['spotify_user'])
		{
		$data["spotify"]["username"]=$_POST['spotify_user'];
		$change=1;
		}
	if( $data["spotify"]["password"]!=$_POST['spotify_pwd'] && $_POST['spotify_pwd'])
		{
		$data["spotify"]["password"]=$_POST['spotify_pwd'];
		$change=1;
		}
	if( $data["spotify"]["clientId"]!=$_POST['spotify_clientid'] && $_POST['spotify_clientid'])
		{
		$data["spotify"]["clientId"]=$_POST['spotify_clientid'];
		$change=1;
		}
	if( $data["spotify"]["clientSecret"]!=$_POST['spotify_clientsecret'] && $_POST['spotify_clientsecret'])
		{
		$data["spotify"]["clientSecret"]=$_POST['spotify_clientsecret'];
		$change=1;
		}
	if( $data["spotify"]["accessToken"]!=$_POST['spotify_accesstoken'] && $_POST['spotify_accesstoken'])
		{
		$data["spotify"]["accessToken"]=$_POST['spotify_accesstoken'];
		$change=1;
		}
	if( $data["spotify"]["refreshToken"]!=$_POST['spotify_refreshtoken'] && $_POST['spotify_refreshtoken'] )
		{
		$data["spotify"]["refreshToken"]=$_POST['spotify_refreshtoken'];
		$change=1;
		}
	if( $change )
		{
			$json_object = json_encode($data);
			$save_rc = file_put_contents('/etc/mupibox/mupiboxconfig.json', $json_object);
			$command = "sudo /usr/local/bin/mupibox/./setting_update.sh && /usr/local/bin/mupibox/./spotify_restart.sh";
			exec($command, $output, $result );
		}
	if( !($data["spotify"]["deviceId"]) && $data["spotify"]["username"] && $data["spotify"]["password"] && $_POST['spotify_clientid'] && $_POST['spotify_clientsecret'] && $_POST['spotify_accesstoken'] && $_POST['spotify_refreshtoken'] )
		{
		$command = "sudo /usr/local/bin/mupibox/./set_deviceid.sh";
		exec($command, $devIDoutput, $result);
		$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
		$data = json_decode($string, true);
		}
	
?>


                <form class="appnitro"  method="post" action="spotify.php">
                                        <div class="description">
                        <h2>Spotify settings</h2>
                        <p>Specify your Spotify-Account-Settings...</p>
                </div>
                        <ul >

				 <li id="li_1" >
                <label class="description" for="spotify_user">Spotify Username </label>
                <div>
                        <input id="spotify_user" name="spotify_user" class="element text medium" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["username"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>
				 <li id="li_1" >
                <label class="description" for="spotify_pwd">Spotify Password </label>
                <div>
                        <input id="spotify_pwd" name="spotify_pwd" class="element text medium" type="password" maxlength="255" value="<?php
                        print $data["spotify"]["password"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>

                                      
				 <li id="li_1" >
                <label class="description" for="spotify_deviceid">Spotify Device ID </label>
                <div>
                        <input id="spotify_user" name="spotify_deviceid" class="element text large" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["deviceId"];
?>" readonly />
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>
				
				 <li id="li_1" >
                <label class="description" for="spotify_clientid">Spotify Client ID </label>
                <div>
                        <input id="spotify_clientid" name="spotify_clientid" class="element text large" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["clientId"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>


				 <li id="li_1" >
                <label class="description" for="spotify_clientsecret">Spotify Client Secret </label>
                <div>
                        <input id="spotify_clientsecret" name="spotify_clientsecret" class="element text large" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["clientSecret"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>



				 <li id="li_1" >
                <label class="description" for="spotify_accesstoken">Spotify Access Token </label>
                <div>
                        <input id="spotify_accesstoken" name="spotify_accesstoken" class="element text large" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["accessToken"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>
			
				 <li id="li_1" >
                <label class="description" for="spotify_refreshtoken">Spotify Refresh Token </label>
                <div>
                        <input id="spotify_refreshtoken" name="spotify_refreshtoken" class="element text large" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["refreshToken"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>				
				
				

                                        <li class="buttons">
                            <input type="hidden" name="form_id" value="37271" />

                                <input id="saveForm" class="button_text" type="submit" name="submit" value="Submit" />
                </li>


                        </ul>
                </form>
								<?php
							if( $change )
								{
								if( $save_rc )
									{
										print "<div id='savestategood'><p>Data succesfully saved!</p></div>";
										if( $change == 2 )
											{
											print "<p>Settings updated...</p>";
											}
										print "</div>";
									}
								else
									{
										print "<div id='savestatebad'><p>Error while saving!</p></div>";
									}
								} 
				?>
        </div>
<?php
	include ('includes/footer.html');
?>