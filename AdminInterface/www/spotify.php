<?php

include('includes/header.php');
// The login goes through the app (Node backend): Spotify comes back to /app/spotify-callback - the one Redirect URI
// of the Spotify app for both the app and this page. The old address (/spotify.php) is no longer used.
$REDIRECT_URI = "https://" . preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST']) . "/app/spotify-callback";
// playlist-read-private/-collaborative added for Phase-14 Smart-Sync, which
// discovers the parent's prefixed playlists. Re-running this login grants the
// existing playback token the extra scopes in one consent step.
$SCOPELIST = "streaming user-read-currently-playing user-modify-playback-state user-read-playback-state user-read-private user-read-email playlist-read-private playlist-read-collaborative";
$SCOPE = urlencode($SCOPELIST);


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

// The Spotify redirect is a GET that replaces the tokens: accept it only with the state of a
// login this session started (see the authorize link below), once.
$spotify_state_ok = isset($_GET['code'], $_GET['state'], $_SESSION['spotify_oauth_state'])
	&& hash_equals($_SESSION['spotify_oauth_state'], (string)$_GET['state']);
if (isset($_GET['code']) && !$spotify_state_ok) {
	$CHANGE_TXT = $CHANGE_TXT . "<li>Spotify login ignored: it was not started from this page (please use the link below again)</li>";
	$change = 0;
}
if ($spotify_state_ok) {
	unset($_SESSION['spotify_oauth_state']);
	// All four interpolated values reach the shell. clientId / clientSecret
	// come from mupiboxconfig.json (admin-controlled) but $_GET['code'] is
	// echoed back from Spotify's redirect — an attacker could craft a
	// redirect URL with `code=$(rm -rf /)` or backticks. escapeshellarg()
	// each value so the shell sees them as a single quoted token.
	$command = "curl -d client_id=" . escapeshellarg($data["spotify"]["clientId"])
	         . " -d client_secret=" . escapeshellarg($data["spotify"]["clientSecret"])
	         . " -d grant_type=authorization_code"
	         . " -d code=" . escapeshellarg($_GET['code'])
	         . " -d redirect_uri=" . escapeshellarg($REDIRECT_URI)
	         . " https://accounts.spotify.com/api/token";
	exec($command, $Tokenoutput, $result);
	$tokendata = json_decode($Tokenoutput[0] ?? '', true);
	// Only replace the stored tokens with a complete answer: a failed exchange used to overwrite
	// both with null and leave Spotify dead until the next successful login.
	if (!empty($tokendata["access_token"]) && !empty($tokendata["refresh_token"])) {
		$data["spotify"]["accessToken"] = $tokendata["access_token"];
		$data["spotify"]["refreshToken"] = $tokendata["refresh_token"];
	}
	// Re-authorising via OAuth implies the user wants Spotify ON. Without this
	// flip, an admin who turned `active` off (e.g. while debugging) and then
	// re-ran the Connect-Spotify flow would still have Spotify hidden in the
	// frontend — and might assume the new tokens are also broken. Only flip if
	// we actually got both tokens back; the OAuth call could have failed and
	// returned an error blob, in which case enabling Spotify would resurrect
	// the loading-spinner-stuck state.
	if (!empty($tokendata["access_token"]) && !empty($tokendata["refresh_token"])) {
		$data["spotify"]["active"] = true;
			// Phase-14 Smart-Sync checks the granted scopes (hasRequiredSyncScopes)
			// to decide whether playlist access is available. The token response
			// carries them as a space-separated `scope` string; persist as array.
			if (!empty($tokendata["scope"])) {
				$data["spotify"]["tokenScopes"] = explode(" ", $tokendata["scope"]);
			}
	}
	save_mupiboxconfig($data);
	exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
	// The librespot credentials.json is NOT deleted here any more. Since 2026-08-10 Spotify refuses
	// librespot logins derived from a developer app's token (what env-librespot falls back to
	// without that file), so deleting it on every re-link broke Spotify Connect for good. It is
	// created by a librespot OAuth login (librespot --enable-oauth) and only "Reset data" removes it.
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
