<?php

include('includes/header.php');
$REDIRECT_URI = "https://" . $_SERVER['HTTP_HOST'] . "/spotify.php";
$SCOPELIST = "streaming user-read-currently-playing user-modify-playback-state user-read-playback-state user-read-private user-read-email";
$SCOPE = urlencode($SCOPELIST);


if ( $_POST['saveSettings']) {
	if ($_POST['spotifycache_active'] == "on") {
		$data["spotify"]["cachestate"] = true;
	} else {
		$data["spotify"]["cachestate"] = false;
	}
	$data["spotify"]["cachepath"] = $_POST['spotifycache_path'];
	$data["spotify"]["maxcachesize"] = $_POST['cache_size'];
	$CHANGE_TXT = $CHANGE_TXT . "<li>Settings saved</li>";
	$change = 1;
}

if ( $_POST['spotifyget'] ) {
	$CHANGE_TXT = $CHANGE_TXT . "<li>Token-Data generated, saved & Services restartet</li>";
	$change = 1;
}

if ($_GET['code']) {
	$command = "curl -d client_id=" . $data["spotify"]["clientId"] . " -d client_secret=" . $data["spotify"]["clientSecret"] . " -d grant_type=authorization_code -d code=" . $_GET['code'] . " -d redirect_uri=" . $REDIRECT_URI . " https://accounts.spotify.com/api/token";
	exec($command, $Tokenoutput, $result);
	$tokendata = json_decode($Tokenoutput[0], true);
	$data["spotify"]["accessToken"] = $tokendata["access_token"];
	$data["spotify"]["refreshToken"] = $tokendata["refresh_token"];
	$json_object = json_encode($data);
	$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
	exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
	exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
    exec("sudo rm {$data['spotify']['cachepath']}/credentials.json");
	exec("sudo /usr/local/bin/mupibox/./spotify_restart.sh");
?>
<form class="appnitro" method="post" action="spotify.php" id="form">
<div class="description">
<h2>Please wait... Data will be saved, page will reload automatically!!!</h2>
</div><p></p>
<input id="spotifyget" name="spotifyget" class="element readonly large" type="hidden" maxlength="255" value="saving" />
</form>
<p></p>
<?php
	include('includes/footer.php');
?>
<script type="text/javascript">
    document.getElementById('form').submit();
</script>
<?php
	exit();
}

if ($_POST['saveIDs']) {
	$data["spotify"]["clientId"] = $_POST['spotify_clientid'];
	$data["spotify"]["clientSecret"] = $_POST['spotify_clientsecret'];
	$CHANGE_TXT = $CHANGE_TXT . "<li>Client-Data saved</li>";
	$change = 1;
}

if ($_POST['resetData']) {
	$command = "sudo rm -R " . $data["spotify"]["cachepath"] . "/*";
	exec($command, $devIDoutput, $result);
	$data["spotify"]["username"] = "";
	$data["spotify"]["password"] = "";
	$data["spotify"]["deviceId"] = "";
	$data["spotify"]["accessToken"] = "";
	$data["spotify"]["refreshToken"] = "";
	$data["spotify"]["clientId"] = "";
	$data["spotify"]["clientSecret"] = "";
	$CHANGE_TXT = $CHANGE_TXT . "<li>All Spotify Data deleted & Services restartet!</li>";
	$change = 2;
}

if ($change) {
	$json_object = json_encode($data);
	$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
	exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
	exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
}

if ($change == 2) {
	exec("sudo /usr/local/bin/mupibox/./spotify_restart.sh");
}

$CHANGE_TXT = $CHANGE_TXT . "</ul>";

?>
<form class="appnitro" method="post" action="spotify.php" id="form">
	<div class="description">
		<h2>Spotify settings</h2>
        <p>Define login- and common-settings.</p>
	</div>

	<details id="step1">
		<summary><i class="fa-regular fa-circle-check"></i> STEP 1 - Developer Client-Connection</summary>
		<ul>
			<li id="li_1">

				<h3>Create Developer-App and Client-Connection</h3>

				<p>Please login to <a href="https://developer.spotify.com/dashboard/login" target="_blank">Spotify Developer Dashboard</a> and create a new App. You can choose the App-Name or Description, or take "MuPiBox" easily.</p>
				<p>You will be redireted to the dashboard for the new created app. Copy and paste the Client ID and Client Secret of your app.</p>
				<p>Edit the settings and add the following URL to Redirect URIs:</p>
				<?php print "<p><b>" . $REDIRECT_URI . "</b></p>"; ?>
			</li>
			<li id="li_1">
				<label class="description" for="spotify_clientid">Spotify Client ID </label>
				<div>
					<input id="spotify_clientid" name="spotify_clientid" class="element text large" type="text" maxlength="255" value="<?php
																																		print $data["spotify"]["clientId"];
																																		?>" />
				</div>
				<p class="guidelines" id="guide_1"><small>Please insert the Client ID from your app in the Spotify Developer Dashboard.</small></p>
			</li>
			<li id="li_1">
				<label class="description" for="spotify_clientsecret">Spotify Client Secret </label>
				<div>
					<input id="spotify_clientsecret" name="spotify_clientsecret" class="element text large" type="text" maxlength="255" value="<?php
																																				print $data["spotify"]["clientSecret"];
																																				?>" />
				</div>
				<p class="guidelines" id="guide_1"><small>Please insert the Client Secret from your app in the Spotify Developer Dashboard.</small></p>
			</li>

			<li class="buttons"><input id="saveForm" class="button_text" type="submit" name="saveIDs" value="Save IDs" /></li>

		</ul>
	</details>

	<details id="step2">
		<summary><i class="fa-regular fa-circle-check"></i> STEP 2 - Access- and Refresh-Token</summary>
		<ul>
			<li id="li_1">

				<h3>Create Developer-App and Client-Connection</h3>
				<p>Please press the following URL to generate Access and Refresh Token. A login may be necessary.</p>
				<p><b>
						<?php
						print '<a href=https://accounts.spotify.com/authorize?response_type=code&client_id=' . $data["spotify"]["clientId"] . '&redirect_uri=' . $REDIRECT_URI . '&scope=' . $SCOPE . ' id="loading">Login and generate Refresh & Access Token</a>';
						?>
					</b></p>
			</li>
			<li id="li_1">
				<label class="description" for="spotify_accesstoken">Spotify Access Token </label>
				<div>
					<input id="readonly" name="spotify_accesstoken" class="element readonly large" type="text" maxlength="255" value="<?php
																																		print $data["spotify"]["accessToken"];
																																		?>" readonly />
				</div>
			</li>

			<li id="li_1">
				<label class="description" for="spotify_refreshtoken">Spotify Refresh Token </label>
				<div>
					<input id="spotify_refreshtoken" name="spotify_refreshtoken" class="element readonly large" type="text" maxlength="255" value="<?php
																																					print $data["spotify"]["refreshToken"];
																																					?>" readonly />
				</div>
			</li>
		</ul>
	</details>

	<details  id="spotifycommonsettings">
		<summary><i class="fa-regular fa-circle-check"></i> Common spotify settings</summary>
		<ul>

			<li id="li_1">
				<h3>Spotify cache state</h3>
				<p>If set to true, audio data will be cached. Enabling this option could improve speed for playing spotify media. Default: enabled</p>
				<p>This option must be enabled to use spotify since version 4.1.0</p>

				<label class="labelchecked" for="spotifycache_active">Cache activation state:&nbsp; &nbsp; <input type="checkbox"  id="spotifycache_active" name="spotifycache_active" onclick="return false" <?php
					if ($data["spotify"]["cachestate"]) {
						print "checked";
						}
					?> readonly /></label>
			</li>

			<li id="li_1">

				<h3>Spotify cache path</h3>
				<p>Default: /home/dietpi/.cache/spotify</p>
				<input id="spotifycache_path" name="spotifycache_path" class="element text medium" type="text" maxlength="255" value="<?php
																																		print $data["spotify"]["cachepath"];
																																		?>" />
			</li>

			<li id="li_1">
				<h3>Cache size</h3>
				<p>Cache size in GB! Free space: <?php
													$df = floor(disk_free_space("/") / 1024 / 1024 / 1024);
													print $df;
													?> GB</p>
				<div>
					<select id="cache_size" name="cache_size" class="element text medium">
						<?php
						$cache_size = array(1, 2, 4, 8, 16, 32, 64);
						foreach ($cache_size as $size) {
							if ($size == $data["spotify"]["maxcachesize"]) {
								$selected = " selected=\"selected\"";
							} else {
								$selected = "";
							}
							print "<option value=\"" . $size . "\"" . $selected  . ">" . $size . " GB</option>";
						}
						?>
					</select>
				</div>
			</li>
			<li class="buttons"><input id="saveForm" class="button_text" type="submit" name="saveSettings" value="Save Settings" /></li>

		</ul>
	</details>


	<details id="spotifyreset">
		<summary><i class="fa-solid fa-eraser"></i> Reset Spotify-Connection</summary>
		<ul>
			<li id="li_1">
				<h3>RESET ALL DATA</h3>

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
include('includes/footer.php');
?>
