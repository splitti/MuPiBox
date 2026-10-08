<?php

	// B8: writes go through save_mupiboxconfig() (loaded by header.php) for
	// flock-serialised concurrent-save safety. Note that write_json() is
	// CALLED below the header include, so the helper is loaded by then —
	// the definition itself is parsed at file-load time and only executed
	// when invoked.
	function write_json($data)
		{
		save_mupiboxconfig($data);
		exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
		exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
		}

	// Narrow header-only auth gate for the submitfile upload handler below.
	// The handler lives ABOVE `include 'includes/header.php'`, so without
	// this an unauthenticated LAN POST can drop a crafted zip and have it
	// extracted to / via `unzip -d /`. All other POST handlers in this
	// file run AFTER the include — header.php's own auth gate already
	// blocks them on unauth, so we explicitly do NOT block other POSTs
	// here. In particular the login POST (password=...) must flow through
	// to header.php so the user can authenticate in the first place.
	// Same cookie flags as header.php (this page starts the session before header.php does).
	if (session_status() === PHP_SESSION_NONE) {
		session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
		session_start();
	}
	// M5: route the pre-header auth gate through the shared reader so
	// header.php's later read hits the same static cache rather than
	// doing a second file_get_contents + json_decode round.
	require_once __DIR__ . '/includes/save_config.php';
	$__authCfg  = mupibox_config();
	$__loginRequired = !empty($__authCfg['interfacelogin']['state']);
	$__loggedIn      = isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true;
	if ($__loginRequired && !$__loggedIn && !empty($_POST['submitfile'])) {
		http_response_code(403);
		exit('Authentication required');
	}
	// The restore below runs before header.php and therefore before its central CSRF check: a
	// form on a foreign page could post a crafted archive that was extracted to / as root. Check
	// the token here already (the upload form gets it from header.php's form filter).
	if (!empty($_POST['submitfile'])) {
		require_once __DIR__ . '/includes/csrf.php';
		csrf_check();
	}

	$shutdown=0;
	$reboot=0;

	if( !empty($_POST['submitfile']) )
		{
		$target_dir = "/tmp/";
		// Strip any directory components from the user-controlled filename.
		// The filename is later interpolated into a shell command, so even
		// after escapeshellarg() we want the basename so the file lands in
		// /tmp/ and not somewhere else via a relative path inside the name.
		$rawName = basename($_FILES["fileToUpload"]["name"]);
		// Conservative whitelist on filename: letters, digits, dot, dash,
		// underscore. Anything else (spaces, quotes, semicolons, …) is
		// rejected outright. Backup zips produced by backup.php/fullbackup.php
		// match this pattern.
		$uploadOk = 1;
		if (!preg_match('/^[A-Za-z0-9._-]+\.zip$/', $rawName)) {
			$uploadOk = 0;
		}
		$target_file = $target_dir . $rawName;
		// Check if $uploadOk is set to 0 by an error
		if ($uploadOk == 0)
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>WARNING: Please upload a .zip-File! (only A-Z, 0-9, ._- allowed in filename)</li>";
			$change=0;
			}
		else
			{
			if (move_uploaded_file($_FILES["fileToUpload"]["tmp_name"], $target_file))
				{
				// ZIP-Slip / arbitrary-path defence. backup.php and
				// fullbackup.php only ever pack files under three roots —
				// reject any zip entry that escapes them. Without this,
				// `unzip -o -a -d /` happily writes anywhere on disk.
				// Exact files, and below media/ only folders and media file types: any file was
				// allowed there before, and media/cover is served as /cover by lighttpd, which runs
				// .php files - a restored media/cover/x.php was code execution as root (www-data
				// has sudo). A prefix test also let "mupiboxconfig.json.php" through. Symbolic
				// links are refused as well (they could point anywhere once extracted).
				$allowedExactFiles = [
					'etc/mupibox/mupiboxconfig.json',
					'home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json',
					'home/dietpi/MuPiBox/themes/custom-bg.jpg',
				];
				$allowedExactDirs = ['etc/', 'etc/mupibox/', 'home/', 'home/dietpi/', 'home/dietpi/MuPiBox/', 'home/dietpi/MuPiBox/themes/',
					'home/dietpi/.mupibox/', 'home/dietpi/.mupibox/Sonos-Kids-Controller-master/',
					'home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/',
					'home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/'];
				// Types lighttpd executes or a browser runs as a page on the admin origin. Everything
				// else below media/ is fine (audio, covers, playlists, but also .DS_Store, booklets).
				$forbiddenMediaTypes = '/(\.(php\d?|phtml|phar|pht|pl|py|cgi|fcgi|sh|shtml|s?html?|xhtml|xht|svgz?|js|mjs|xml|xsl)|\/\.htaccess|\/\.user\.ini)$/i';
				$zip = new ZipArchive();
				$zipOk = false;
				$badEntry = '';
				if ($zip->open($target_file) === true) {
					$zipOk = true;
					for ($i = 0; $i < $zip->numFiles; $i++) {
						$entry = $zip->getNameIndex($i);
						// Normalise: strip leading slash, forbid `..`
						$norm = ltrim($entry, '/');
						if (strpos($norm, '..') !== false) {
							$zipOk = false;
							$badEntry = $entry;
							break;
						}
						$isDir = substr($norm, -1) === '/';
						$stat = $zip->statIndex($i, ZipArchive::FL_UNCHANGED);
						$opsys = 0; $attr = 0;
						$zip->getExternalAttributesIndex($i, $opsys, $attr);
						$isSymlink = $opsys === ZipArchive::OPSYS_UNIX && ((($attr >> 16) & 0170000) === 0120000);
						$inMedia = strpos($norm, 'home/dietpi/MuPiBox/media/') === 0 || $norm === 'home/dietpi/MuPiBox/media/';
						$matched = !$isSymlink && $stat !== false && (
							in_array($norm, $allowedExactFiles, true)
							|| ($isDir && (in_array($norm, $allowedExactDirs, true) || $inMedia))
							|| (!$isDir && $inMedia && !preg_match($forbiddenMediaTypes, $norm))
						);
						if (!$matched) {
							$zipOk = false;
							$badEntry = $entry;
							break;
						}
					}
					$zip->close();
				}
				if (!$zipOk) {
					exec("sudo rm " . escapeshellarg($target_file));
					$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: Backup rejected (entry outside whitelist: ".htmlspecialchars($badEntry).")</li>";
					$change=0;
				} else {
				// M5: external command above just mutated the config -- force fresh re-read.
				$data = mupibox_config(true);
				$old_version = $data["mupibox"]["version"];

				$command = "sudo unzip -o -a " . escapeshellarg($target_file) . " -d / >> /tmp/restore.log";
				exec($command, $output, $result );
				exec("sudo chown root:www-data /etc/mupibox/mupiboxconfig.json");
				exec("sudo chmod 644 /etc/mupibox/mupiboxconfig.json");
				exec("sudo chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json");
				exec("sudo chmod 644 /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json");

				// The installed copy first: piping a script fetched live from the upstream repo into a root
				// shell ran whatever that repo holds at that moment (and not this fork's version).
				$command = "cd; if [ -x /usr/local/bin/mupibox/conf_update.sh ]; then sudo /usr/local/bin/mupibox/conf_update.sh; else curl -L https://raw.githubusercontent.com/splitti/MuPiBox/main/update/conf_update.sh | sudo bash; fi";
				exec($command, $output, $result );

				// M5: external command above just mutated the config -- force fresh re-read.
				$data = mupibox_config(true);
				$data["mupibox"]["version"] = $old_version;
				write_json($data);

				$command = "sudo /boot/dietpi/func/change_hostname " . escapeshellarg($data["mupibox"]["host"]);
				$change_hostname = exec($command, $output, $change_hostname );
				$command = "sudo su dietpi -c '/usr/local/bin/mupibox/./set_hostname.sh'";
				exec($command);

				// What the restored config switches on but lives outside it (MuPiHAT, fan, rotary encoder ...)
				exec("sudo /usr/local/bin/mupibox/apply_restored_settings.sh >> /tmp/restore.log 2>&1");

				$command = "sudo rm " . escapeshellarg($target_file);
				exec($command, $output, $result );
				$change=99;
				$CHANGE_TXT=$CHANGE_TXT."<li>Backup-File restored! The MuPiBox will reboot now!</li>";
				$reboot=1;
				}
				}
			else
				{
				$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: Error on uploading Backup-File!</li>";
				}
			}
		}

	$onlinejson = file_get_contents('https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json');
	$dataonline = json_decode($onlinejson, true);
	include ('includes/header.php');

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

	if( isset($_POST['nav_tabs_save']) )
		{
		// $navTabsHidden was already worked out from the submitted form in header.php
		$data["mupibox"]["hiddenTabs"]=$navTabsHidden;
		$change=2;
		$CHANGE_TXT=$CHANGE_TXT."<li>Visible tabs saved</li>";
		}

	if( isset($_POST['display_cats_save']) )
		{
		$allowedCats = array('audiobook', 'music', 'nas', 'other');
		$hiddenCats = array_values(array_intersect($allowedCats, $_POST['hide_categories'] ?? array()));
		if( count($hiddenCats) >= count($allowedCats) )
			{
			$change=98;
			$CHANGE_TXT=$CHANGE_TXT."<li>At least one display category must stay visible - nothing was changed</li>";
			}
		else
			{
			$data["mupibox"]["hiddenCategories"]=$hiddenCats;
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>Display categories saved - the display restarts</li>";
			}
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
		$command = "cd; curl -L https://raw.githubusercontent.com/splitti/MuPiBox/main/update/start_mupibox_update.sh | sudo bash -s -- stable";
		exec($command, $output, $result );
		// M5: external command above just mutated the config -- force fresh re-read.
		$data = mupibox_config(true);
		$change=3;
		$reboot=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Update complete to Version ".$data["mupibox"]["version"]."</li>";
		}
	if( $_POST['mupibox_update_beta'] )
		{
		$command = "cd; curl -L https://raw.githubusercontent.com/splitti/MuPiBox/main/update/start_mupibox_update.sh | sudo bash -s -- beta";
		exec($command, $output, $result );
		// M5: external command above just mutated the config -- force fresh re-read.
		$data = mupibox_config(true);
		$change=1;
		$reboot=1;
		$data["mupibox"]["version"]=$data["mupibox"]["version"]." BETA";
		$CHANGE_TXT=$CHANGE_TXT."<li>Update complete to Beta-Version ".$data["mupibox"]["version"]."</li>";
		}
	if( $_POST['mupibox_update_dev'] )
		{
		$command = "cd; curl -L https://raw.githubusercontent.com/splitti/MuPiBox/main/update/start_mupibox_update.sh | sudo bash -s -- dev";

		exec($command, $output, $result );
		// M5: external command above just mutated the config -- force fresh re-read.
		$data = mupibox_config(true);
		$change=1;
		$reboot=1;
		$data["mupibox"]["version"]=$data["mupibox"]["version"]." DEVELOPMENT";
		$CHANGE_TXT=$CHANGE_TXT."<li>Update complete to Development-Version ".$data["mupibox"]["version"]."</li>";
		}
/*	if( $_POST['config_update'] )
		{
		// The installed copy first: piping a script fetched live from the upstream repo into a root
				// shell ran whatever that repo holds at that moment (and not this fork's version).
				$command = "cd; if [ -x /usr/local/bin/mupibox/conf_update.sh ]; then sudo /usr/local/bin/mupibox/conf_update.sh; else curl -L https://raw.githubusercontent.com/splitti/MuPiBox/main/update/conf_update.sh | sudo bash; fi";
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
		// (header.php is included above already: including it again here ended the page with a fatal error)
		// data.json is only written when it could be read and an old "playlist" entry was converted (it used to be
		// rewritten every time, and an unreadable file came back as "null")
		$playlist_converted = false;
		if( is_array($data_json_playlistid) )
			{
			foreach($data_json_playlistid as $i => $mydata)
				{
				if( is_array($mydata) && ($mydata['category'] ?? '') == "playlist" )
					{
					$data_json_playlistid[$i]['category'] = "music";
					$data_json_playlistid[$i]['playlistid'] = $mydata['id'] ?? '';
					unset($data_json_playlistid[$i]['id']);
					$playlist_converted = true;
					}
				}
			}
		if( $playlist_converted )
			{
			$json_changed = json_encode($data_json_playlistid);
			file_put_contents('/tmp/data.json', $json_changed );
			exec("sudo mv /tmp/data.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json");
			exec("sudo chown dietpi:dietpi /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json");
			}
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
		$command = "sudo /usr/local/bin/mupibox/./spotify_restart.sh";
		exec($command, $output, $result );
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Spotify Services are restarted</li>";
		}
	if( $_POST['resetMupiConf'] )
		{
		$command = "sudo su - -c 'rm /etc/mupibox/mupiboxconfig.json;wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json -O /etc/mupibox/mupiboxconfig.json;chown root:www-data /etc/mupibox/mupiboxconfig.json;chmod 777 /etc/mupibox/mupiboxconfig.json'";
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
	// Login of this interface (moved here from mupi.php: it protects the whole interface). $change 2 = save,
	// 4 = only show the message.
	// Changing the password needs the current one (a forged request or an unattended browser must
	// not be able to replace it), and the new one must not be empty or shorter than the form allows.
	if($_POST['submitpw'])
		{
		$newpwd = (string)($_POST['newpwd'] ?? '');
		$curpwd = (string)($_POST['curpwd'] ?? '');
		$oldhash = $data["interfacelogin"]["password"] ?? '';
		if( strlen($newpwd) < 6 )
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>Password not changed: at least 6 characters</li>";
			$change = 4; // message only, nothing saved (else the refusal was not shown at all)
			}
		else if( $oldhash !== '' && !password_verify($curpwd, $oldhash) )
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>Password not changed: current password is wrong</li>";
			$change = 3;
			}
		else
			{
			$hash = password_hash($newpwd, PASSWORD_DEFAULT);
			$data["interfacelogin"]["password"]=$hash;
			// the one password (as the app sets it): a parents' password of before goes, and every other device -
			// app and this interface - signs in again with the new one; this one stays signed in
			unset($data["eltern"]["password"]);
			$data["interfacelogin"]["epoch"] = bin2hex(random_bytes(8));
			$_SESSION['login_epoch'] = $data["interfacelogin"]["epoch"];
			$change=2;
			$CHANGE_TXT=$CHANGE_TXT."<li>New password has been set</li>";
			}
		}


	if($_POST['change_login'])
		{
		if($data["interfacelogin"]["state"])
			{
			$data["interfacelogin"]["state"]=false;	
			$CHANGE_TXT=$CHANGE_TXT."<li>Login disabled</li>";
			}
		else
			{
			$data["interfacelogin"]["state"]=true;	
			// every other device signs in now (app and this interface) - also those that came in while it was open;
			// this one stays when it is signed in
			$data["interfacelogin"]["epoch"] = bin2hex(random_bytes(8));
			if (!empty($_SESSION['logged_in'])) { $_SESSION['login_epoch'] = $data["interfacelogin"]["epoch"]; }
			$CHANGE_TXT=$CHANGE_TXT."<li>Login enabled</li>";
			}
		$change=2;
		}

	if( $change == 1 )
		{
		write_json($data);
		}
	if( $change == 2 )
		{
		save_mupiboxconfig($data);
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


	<details id="controlsystem">
		<summary><i class="fa-solid fa-power-off"></i> Control system</summary>
		<ul>
			<li class="li_norm">
				<p>Reboot or shutdown MuPiBox...</p>
				<input id="saveForm" class="button_text" type="submit" name="reboot" value="Reboot MuPiBox" onclick="return confirm('Do really want to reboot?');" />
				<input id="saveForm" class="button_text" type="submit" name="shutdown" value="Shutdown MuPiBox"  onclick="return confirm('Do really want to shutdown?');" />
			</li>
			<li class="li_norm">
				<p>Tabs in the top navigation - uncheck a tab to hide it. Home, MuPiBox and Admin are always shown.</p>
				<label style="display:inline-block; margin-right:14px;"><input type="checkbox" checked="checked" disabled="disabled" /> Home</label>
				<label style="display:inline-block; margin-right:14px;"><input type="checkbox" checked="checked" disabled="disabled" /> MuPiBox</label>
<?php foreach ($navTabsHideable as $tabKey => $tabLabel) { ?>
				<label style="display:inline-block; margin-right:14px;"><input type="checkbox" name="nav_tabs_show[]" value="<?= $tabKey ?>" <?= navTabHidden($tabKey) ? '' : 'checked="checked"' ?> /> <?= htmlspecialchars($tabLabel) ?></label>
<?php } ?>
				<label style="display:inline-block; margin-right:14px;"><input type="checkbox" checked="checked" disabled="disabled" /> Admin</label>
				<br/><br/>
				<input id="saveForm" class="button_text" type="submit" name="nav_tabs_save" value="Save tabs" />
			</li>
			<li class="li_norm">
				<p><b>Hide display categorys</b><br/>Tick a category to hide its tab in the display. The remaining tabs are spread evenly. At least one must stay visible.</p>
<?php $hiddenCatsNow = is_array($data['mupibox']['hiddenCategories'] ?? null) ? $data['mupibox']['hiddenCategories'] : array(); ?>
<?php foreach (array('audiobook' => 'Audiobooks', 'music' => 'Music', 'nas' => 'NAS', 'other' => 'Other') as $catKey => $catLabel) { ?>
				<label style="display:inline-block; margin-right:14px;"><input type="checkbox" name="hide_categories[]" value="<?= $catKey ?>" <?= in_array($catKey, $hiddenCatsNow, true) ? 'checked="checked"' : '' ?> /> <?= $catLabel ?></label>
<?php } ?>
				<br/><br/>
				<input id="saveForm" class="button_text" type="submit" name="display_cats_save" value="Save categories" onclick="if (document.querySelectorAll('input[name=\'hide_categories[]\']:checked').length >= 4) { alert('At least one category must stay visible.'); return false; }" />
			</li>
		</ul>
	</details>

	<details id="loginsettings">
		<summary><i class="fa-solid fa-user-lock"></i> Login settings</summary>
		<ul>
			<li id="li_1" >
				<h2>Password </h2>
				<p>
				The default password is "MuP1B0x"!
				</p>
				<div>
				<label for="curpwd">Current password</label>
				<input id="curpwd" name="curpwd" class="element text medium" type="password" maxlength="255" value="" autocomplete="current-password"/>
				<label for="newpwd">New password</label>
				<input id="newpwd" name="newpwd" class="element text medium" type="password" minlength="6" maxlength="255" value="" autocomplete="new-password"/>
				<input type="submit" class="button_text" value="Set new password" name="submitpw" >
				</div>
			</li>
		</ul>
		<ul>
			<li class="li_1"><h2>Enable login</h2>
				<p>
				The login will be instantly activated after enabling this option!
				</p>
				<p>
				<?php
				if ($data['interfacelogin']['state']) {
					$login_state="enabled";
					$login_button="disable";
					}
				else {
					$login_state="disabled";
					$login_button="enable";
					}
				echo "Login state: <b>".$login_state."</b>";
				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_login" value="<?php print $login_button; ?>" />
			</li>

		</ul>
	</details>

	<details id="backuprestore">
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

	<details id="settingsandservices">
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
	<details id="updatessection">
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
											exec("echo $(sudo curl -s 'https://api.github.com/repos/splitti/MuPiBox' | jq -r '.pushed_at' | cut -d'T' -f1)", $devversion, $rc);
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


	<details id="loggingdebug">
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
			
	<details id="resetconfiguration">
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
