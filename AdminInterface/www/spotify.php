<?php
        $change=0;
        $CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";

        include ('includes/header.php');
        $command="sudo hostname -I";
        $IP=exec($command, $Tokenoutput, $result);

        $REDIRECT_URI="http://".$IP."/spotify.php";
        $SCOPELIST="streaming user-read-currently-playing user-modify-playback-state user-read-playback-state";
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
                        <p>Specify your Spotify-Account-Settings and connect to Spotify...</p>
                </div>
                                <h2>STEP 1</h2>
                <p>Please enter Spotify Username and Password. Please notice, spotify premium or family is required!</p>
                        <ul >

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
                                <h2>STEP 2</h2>
                <p>Please login to <a href="https://developer.spotify.com/dashboard/login" target="_blank">Spotify Developer Dashboard</a> and create a new App. You can choose the App-Name or Description, or take "MuPiBox" easily.</p>
                <p>You will be redireted to the dashboard for the new created app. Copy and paste the Client ID and Client Secret of your app.</p>
                <p>Edit the settings and add the following URL to Redirect URIs:</p>
                                <?php print "<p><b>".$REDIRECT_URI."</b></p>"; ?>
                                <ul>                      
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
                                <h2>STEP 3</h2>
                <p>Please press the following URL to generate Access and Refresh Token. A login may be necessary.</p>
                                <p><b>
                                <?php 
                                        print '<a href=https://accounts.spotify.com/authorize?response_type=code&client_id='.$data["spotify"]["clientId"].'&redirect_uri='.$REDIRECT_URI.'&scope='.$SCOPE.' id="loading">Login and generate Refresh & Access Token</a>'; 
                                ?> 
                                </b></p>
                                <ul> 
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
                                <h2>STEP 4</h2>
                <p>In this last step, you easliy press the button to generate the Device ID...</p>
                                <ul> 
                                <li class="buttons"><input id="saveForm" class="button_text" type="submit" name="generateDevID" value="Generate DeviceID" /></li>
                                <li id="li_1" >
                <label class="description" for="spotify_deviceid">Spotify Device ID </label>
                <div>
                        <input id="spotify_deviceid" name="spotify_deviceid" class="element readonly large" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["deviceId"];
?>" readonly />
                </div></li>
                        </ul>
                </form>
                        <p></p>
<?php
        include ('includes/footer.php');
?>
