<?php

// Spotify's answer to a login (code or error, with the login's state): the login is the app's (Node backend), also
// when it was started here. Boxes set up before the app name this page as the Redirect URI in their Spotify app (see
// eltern/oauth.ts redirectModeOf) - the answer goes on to the app's address, which checks the state and exchanges the
// code. Before the login check below: whoever is not signed in to this interface would lose the answer.
if (isset($_GET['state']) && (isset($_GET['code']) || isset($_GET['error']))) {
	header('Location: /app/spotify-callback?' . $_SERVER['QUERY_STRING'], true, 302);
	exit;
}

include('includes/header.php');
// The Redirect URI of this box, chosen as the app chooses it (eltern/oauth.ts redirectModeOf): spotify.redirect, else
// /spotify.php for a box signed in before the app did the login, /app/spotify-callback for a new one
$__sp = $data['spotify'] ?? array();
$__mode = $__sp['redirect'] ?? ((!empty($__sp['refreshToken']) && (empty($__sp['authorizedAt']) || !empty($__sp['authorizedEstimated']))) ? 'legacy' : 'app');
$REDIRECT_URI = "https://" . preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST']) . ($__mode === 'legacy' ? '/spotify.php' : '/app/spotify-callback');


if ( $_POST['clearCache']) {
    exec("sudo rm -r /home/dietpi/.mupibox/Sonos-Kids-Controller-master/cache/*");
	$CHANGE_TXT = $CHANGE_TXT . "<li>Cleared spotify metadata cache</li>";
	$change = 1;
}

// back from the login started below (the app's flow): it saved the tokens and restarted the player itself
if (isset($_GET['spotify_connected'])) {
	$CHANGE_TXT = $CHANGE_TXT . "<li>Spotify login done: tokens saved, player restarted</li>";
	$change = 1;
}
if (isset($_GET['spotify_error'])) {
	$CHANGE_TXT = $CHANGE_TXT . "<li>Spotify login failed: " . htmlspecialchars((string)$_GET['spotify_error'], ENT_QUOTES) . "</li>";
	$change = 1;
}

if ( $_POST['spotifyget'] ) {
	$CHANGE_TXT = $CHANGE_TXT . "<li>Token-Data generated, saved & Services restartet</li>";
	$change = 1;
}


if ($_POST['saveIDs']) {
	$data["spotify"]["clientId"] = $_POST['spotify_clientid'];
	$data["spotify"]["clientSecret"] = $_POST['spotify_clientsecret'];
	$CHANGE_TXT = $CHANGE_TXT . "<li>Client-Data saved</li>";
	$change = 1;
}

if ($_POST['savePlaylistScraper']) {
	$data["spotify"]["disableScraperForPlaylists"] = (bool) ($_POST['spotify_disable_scraper_playlists'] ?? false);
	$CHANGE_TXT = $CHANGE_TXT . "<li>Common Spotify settings saved</li>";
	$change = 1;
}

if ($_POST['resetData']) {
    exec("sudo rm -r /home/dietpi/.mupibox/Sonos-Kids-Controller-master/cache/*");
	remove_config_cache_dir((string)($data["spotify"]["cachepath"] ?? ""), true);
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
	save_mupiboxconfig($data);
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
                <p>Ensure that both <strong>Web API</strong> and <strong>Web Playback SDK</strong> are checked under <strong>Which API/SDK are you planning to use?</strong>.</p>
                <p>You will be redirected to the dashboard for the new created app. Copy and paste the Client ID and Client Secret of your app.</p>
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
				<p>Please press the following link to generate Access and Refresh Token. A login may be necessary. Spotify asks for a new login every 6 months; the box reminds you (app and Telegram).</p>
				<p><b><a href="#" id="spotify_login">Login and generate Refresh & Access Token</a></b></p>
				<p id="spotify_login_msg"></p>
				<script>
				// The login is started by the app's backend (it keeps the OAuth state, exchanges the code and saves the
				// tokens) and comes back here. It needs the app's login in this browser - signing in to this admin
				// interface signs in to the app as well.
				document.getElementById('spotify_login').addEventListener('click', async function (e) {
					e.preventDefault();
					var msg = document.getElementById('spotify_login_msg');
					try {
						var init = function () { return fetch('/api/app/spotify-oauth/init?return=' + encodeURIComponent('/spotify.php'), { credentials: 'same-origin' }); };
						var r = await init();
						// "Login required" off: no login here, the app hands out its session on asking - then once more
						if (r.status === 401 && (await fetch('/api/app/session', { credentials: 'same-origin' })).ok) { r = await init(); }
						var body = await r.json().catch(function () { return {}; });
						if (r.ok && body.authorize_url) { location.href = body.authorize_url; return; }
						if (r.status === 401) { msg.innerHTML = 'Please sign in first: <a href="/app/?portal=admin">sign in</a>, then press the link again.'; return; }
						msg.textContent = body.error === 'no_client_id' ? 'Please save the Client ID (step 1) first.' : 'The login could not be started.';
					} catch (err) {
						msg.textContent = 'The login could not be started.';
					}
				});
				</script>
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
                <h3>Spotify Playlist handling</h3>
                <p>There are specific playlists that are not found by the Spotify API. <br>
                    Also playlists that you don't own no longer show the included tracks.<br>
                    In the Mupibox we implemented a spotify website fallback to find these playlists.<br>
                    It is enabled by default and used for all playlists. <br>
                    You can disable this option to use the spotify API only and save CPU usage.
                </p>
            </li>

            <li class="buttons">
                <input name="spotify_disable_scraper_playlists" type="hidden" value="<?php
                print ($data["spotify"]["disableScraperForPlaylists"] ?? false)
                ? "0"
                : "1";
                ?>" />
                <input id="saveForm" class="button_text" type="submit" name="savePlaylistScraper" value="<?php
                print ($data["spotify"]["disableScraperForPlaylists"] ?? false)
                        ? "Enable playlist handling"
                        : "Disable playlist handling";
                ?>" />
            </li>

			<li id="li_1">
				<h3>Spotify metadata cache</h3>
				<p>Spotify playlists metadata from the Spotify website will be cached for 12 hours.</p>
				<p>All other spotify media metadata will be cached from 7 days for mostly static content (albums, shows, artists) down to 2–6 hours for more frequently changing playlists and search results.</p>
                <p>If you play a playlist, the cache will be refreshed immediately.</p>
			</li>

			<li class="buttons">
				<input id="saveForm" class="button_text" type="submit" name="clearCache" value="Clear cache" />
			</li>

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
