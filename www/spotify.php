
<?php
	include ('includes/header.html');
	$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
	$data = json_decode($string, true);
?>
        <img id="top" src="top.png" alt="">
        <div id="form_container">
                <h1><a>MuPiBox Configuration</a></h1>
                <form id="form_37271" class="appnitro"  method="post" action="">
                                        <div class="form_description">
                        <h2>General settings</h2>
                        <p>This is the central configuration of your MuPiBox...</p>
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
                        <input id="spotify_user" name="spotify_user" class="element text medium" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["deviceId"];
?>" readonly />
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>
				
				 <li id="li_1" >
                <label class="description" for="spotify_clientid">Spotify Client ID </label>
                <div>
                        <input id="spotify_clientid" name="spotify_clientid" class="element text medium" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["clientId"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>


				 <li id="li_1" >
                <label class="description" for="spotify_clientsecret">Spotify Client Secret </label>
                <div>
                        <input id="spotify_clientsecret" name="spotify_clientsecret" class="element text medium" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["clientSecret"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>



				 <li id="li_1" >
                <label class="description" for="spotify_accesstoken">Spotify Access Token </label>
                <div>
                        <input id="spotify_accesstoken" name="spotify_accesstoken" class="element text medium" type="text" maxlength="255" value="<?php
                        print $data["spotify"]["accessToken"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>
			
				 <li id="li_1" >
                <label class="description" for="spotify_refreshtoken">Spotify Refresh Token </label>
                <div>
                        <input id="spotify_refreshtoken" name="spotify_refreshtoken" class="element text medium" type="text" maxlength="255" value="<?php
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
        </div>
        <img id="bottom" src="bottom.png" alt="">

        </body>
</html>
