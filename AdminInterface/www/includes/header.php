<!DOCTYPE html>
<?php
	if (session_status() === PHP_SESSION_NONE) {
		// not readable by page scripts, and not sent along with requests other sites trigger
		session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
		session_start();
	}

	// CSRF helpers are defined in includes/csrf.php — pages that need
	// CSRF protection must `require csrf.php` BEFORE include('header.php')
	// because header.php emits HTML chrome and a post-output csrf_check()
	// can no longer set 403 headers. Including csrf.php here too keeps
	// the helpers available for csrf_field() calls deeper in the body.
	require_once __DIR__ . '/csrf.php';

	// Every admin page includes this file before it handles a form, so the CSRF check lives here
	// for all of them: before, only five pages checked the token and the others (mupi, network,
	// admin, smart, spotify, cover, synology) accepted a form posted by any foreign web page.
	// The token is added to every POST form of the page automatically (output filter below), so
	// no page has to remember csrf_field() - bluetooth.php, which called csrf_check() but never
	// printed the field, answered every action with 403.
	csrf_check();
	ob_start(function ($html) {
		$field = csrf_field();
		return preg_replace_callback('/<form\b[^>]*>/i', function ($m) use ($field) {
			return preg_match('/\bmethod\s*=\s*["\']?post\b/i', $m[0]) ? $m[0] . $field : $m[0];
		}, $html);
	});

	// B8: shared save_mupiboxconfig($data) writer with flock serialisation.
	// Replaces the ~15 inline `file_put_contents+sudo mv` patterns across
	// admin.php, mupi.php, mupihat.php, spotify.php and smart.php.
	require_once __DIR__ . '/save_config.php';

	if (isset($_POST['spotifyget']) && $_POST['spotifyget'] === 'saving') {
		if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
			$http_url = 'http://' . $_SERVER['HTTP_HOST'] . $_SERVER['PHP_SELF'];
			header("Location: $http_url?spotifyget=saving");
			exit;
		}
	}

	$session_timeout = 60 * 60;
	if (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true) {
		if (isset($_SESSION['last_activity'])) {
			if (time() - $_SESSION['last_activity'] > $session_timeout) {
				// Session ist abgelaufen
				session_unset();
				session_destroy();
				header("Location: " . $_SERVER['PHP_SELF']);
				exit;
			}
		}
		$_SESSION['last_activity'] = time(); // Zeit aktualisieren
	}

	// M5: route through the request-scoped reader so the same file isn't
	// re-parsed 7x per admin page load. $data stays exposed as a local for
	// downstream PHP that reads $data directly.
	$data = mupibox_config();
	// Signed out elsewhere: "sign out other devices" or a new password (in the app or on the Admin page) changes
	// interfacelogin.epoch - a session of this interface signed in before that ends here as well
	if (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true
		&& ($_SESSION['login_epoch'] ?? '') !== (string)($data['interfacelogin']['epoch'] ?? '')) {
		session_unset();
		session_destroy();
		header("Location: " . $_SERVER['PHP_SELF']);
		exit;
	}

	// Tabs that can be hidden from the top navigation (Admin > Control system).
	// Home, MuPiBox and Admin are always shown and are not part of this list.
	$navTabsHideable = array(
		'mupi' => 'MuPi-Conf', 'parental' => 'Parental', 'mupihat' => 'MuPiHAT', 'media' => 'Media', 'cover' => 'Cover',
		'bluetooth' => 'Bluetooth', 'spotify' => 'Spotify', 'nas' => 'NAS', 'network' => 'Network',
		'smart' => 'Smart', 'vnc' => 'VNC', 'dietpidash' => 'DietPi-Dash', 'logs' => 'Logs', 'json' => 'JSON',
	);
	$navTabsHidden = is_array($data['mupibox']['hiddenTabs'] ?? null) ? $data['mupibox']['hiddenTabs'] : array();
	// The NAS tab was called "synology" before: keep an old "hidden" choice.
	$navTabsHidden = array_map(function ($tab) { return $tab === 'synology' ? 'nas' : $tab; }, $navTabsHidden);
	if (isset($_POST['nav_tabs_save'])) {
		// The navigation is printed before admin.php handles the form, so read the
		// submitted choice here already - the change is then visible immediately.
		$navTabsShown = $_POST['nav_tabs_show'] ?? array();
		$navTabsHidden = array_values(array_diff(array_keys($navTabsHideable), $navTabsShown));
	}
	// The menu entry of the page shown is highlighted (class "active"). Pages without an entry of their own count
	// as the one they are reached from.
	function navActive($file) {
		$page = basename($_SERVER['SCRIPT_NAME'] ?? '');
		$page = array('' => 'index.php', 'service.php' => 'admin.php', 'tweaks.php' => 'admin.php')[$page] ?? $page;
		return $page === $file ? ' class="active" aria-current="page"' : '';
	}
	function navTabHidden($key) {
		global $navTabsHidden;
		return in_array($key, $navTabsHidden, true);
	}
	// Null-safe: a freshly seeded config may not carry the block yet.
	$loginEnabled = $data['interfacelogin']['state'] ?? false;
	$hashedPassword = $data['interfacelogin']['password'] ?? '';

	$change=0;
	$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";

	// R3-B-1: header.php is included by every admin page and previously
	// fired three exec()s on every render — `sudo iwgetid -r`,
	// `sudo iwconfig wlan0`, and the websockify ps-grep below. Each
	// exec forks a sudo helper and (for iw*) opens a netlink socket;
	// across navigation that's ~60 wasted forks/min and noticeable lag
	// on the Pi. Cache results to /tmp with a 5s TTL — fresh enough
	// that the wifi-quality readout stays current, but coarse enough
	// to absorb burst navigation.
	function mupibox_cached_exec($cacheKey, $ttlSeconds, $command) {
		$cacheFile = '/tmp/.mupibox.headercache.' . $cacheKey;
		if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < $ttlSeconds) {
			$cached = @file_get_contents($cacheFile);
			if ($cached !== false) {
				return rtrim($cached, "\n");
			}
		}
		$value = (string)exec($command);
		// Use LOCK_EX so concurrent header renders don't mangle the file.
		@file_put_contents($cacheFile, $value, LOCK_EX);
		return $value;
	}

	// the WiFi adapter in use (a USB adapter if there is one, else the onboard one);
	// cached too, the helper script is one more fork per render.
	$WIFI_IF = trim(mupibox_cached_exec('wifi_iface', 30, '/usr/local/bin/mupibox/mupi_wifi_iface.sh'));
	if ($WIFI_IF === '') { $WIFI_IF = 'wlan0'; }
	$commandSSID="sudo iwgetid -r";
	$WIFI = mupibox_cached_exec('wifi_ssid', 5, $commandSSID);
	$commandLQ="sudo iwconfig ".escapeshellarg($WIFI_IF)." | awk '/Link Quality/{split($2,a,\"=|/\");print int((a[2]/a[3])*100)\"\"}' | tr -d '%'";
	$LINKQ = mupibox_cached_exec('wifi_linkq', 5, $commandLQ);
	
	// These GET handlers reboot/shutdown the box and run privileged scripts
	// (restart_kiosk.sh, m3u_generator.sh). They MUST be gated by the login
	// check; otherwise an unauthenticated LAN attacker can curl
	// `?hshutdown=1` and DoS the box, or `?hrefreshdatabase=1` to grind the
	// SD card. The auth gate further down the file is the single source of
	// truth for whether the caller is allowed in — mirror it here.
	$authGatePassed = !$loginEnabled
		|| (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true);
	// The token in the link: a plain link or <img> on a foreign page must not shut the box down.
	if ($authGatePassed && hash_equals(csrf_token(), (string)($_GET['csrf_token'] ?? ''))) {
		if (isset($_GET['hshutdown'])) {
			$shutdown = 1;
			$change=99;
			$CHANGE_TXT=$CHANGE_TXT."<li>Shutdown MuPiBox</li>";
			}
		if (isset($_GET['hreboot'])) {
			$reboot = 1;
			$change=99;
			$CHANGE_TXT=$CHANGE_TXT."<li>Reboot MuPiBox</li>";
			}
		if (isset($_GET['hchromerestart'])) {
			exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
			$change=99;
			$CHANGE_TXT=$CHANGE_TXT."<li>Restart Chrome kiosk</li>";
			}
		if (isset($_GET['hrefreshdatabase'])) {
			exec("sudo /usr/local/bin/mupibox/./m3u_generator.sh");
			$change=99;
			$CHANGE_TXT=$CHANGE_TXT."<li>Update media database finished</li>";
			}
	}
		
	$mupihat_file = '/tmp/mupihat.json';
	$mupihat_state = false;
	if (file_exists($mupihat_file)) {
		$mupihat_state = true;
	}

	$force_https = false;
	if ($_SERVER['REQUEST_URI'] === '/securearea') {
		$force_https = true;
	}

	$protocol = $force_https ? 'https' : 'http';
	$host = $_SERVER['HTTP_HOST'];

	$link = $protocol . '://' . $host . '/';

?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
	<head>
		<script>
		// After a form submit the page is kept invisible until the scroll position is restored (see footer.php),
		// so it does not show the top of the page first and then jump down. Shown at the latest after 4 seconds.
		try {
			if (sessionStorage.getItem("mupibox-scroll") !== null) {
				document.documentElement.style.visibility = "hidden";
				if ("scrollRestoration" in history) history.scrollRestoration = "manual";
				setTimeout(function () { document.documentElement.style.visibility = ""; }, 4000);
			}
		} catch (e) {}
		</script>
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.4.1/css/bootstrap.min.css">
		<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
		<script src="https://code.jquery.com/ui/1.13.2/jquery-ui.min.js"></script>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.16.0/umd/popper.min.js"></script>
		<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"></script>
		<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
		<link rel="stylesheet" href="https://use.fontawesome.com/releases/v6.5.1/css/all.css">
		<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
		<title>MuPiBox Admin-Interface</title>
		<link rel="stylesheet" type="text/css" href="view.css?v=<?= (int)@filemtime(__DIR__ . '/../view.css') ?>" media="all">
		<script src="https://code.iconify.design/iconify-icon/2.0.0/iconify-icon.min.js"></script>
		<script type="text/javascript" src="view.js?v=<?= (int)@filemtime(__DIR__ . '/../view.js') ?>"></script>
		<script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
		<link rel="icon" type="image/x-icon" href="/images/favicon.ico">
		<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.15/codemirror.min.css">
		<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.15/theme/eclipse.min.css">
		<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.15/codemirror.min.js"></script>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.15/mode/javascript/javascript.min.js"></script>
	</head>
<?php
	if ($loginEnabled) {
		if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
			// The way in is the login of the app (port 80: /app/?portal, the choice between the app and this
			// interface), where lighttpd has it (config/lighttpd/90-mupibox-app.conf). The form below then only answers
			// the app's request for its CSRF token (?login_form) and the password the app sends (POST).
			// Signed in to the app: its one-time ticket ("Erweiterte Einstellungen" in the app), checked with the app on
			// the box itself - no second login.
			$appTicket = (string)($_GET['app_ticket'] ?? '');
			if (preg_match('/^[a-f0-9]{64}$/', $appTicket)) {
				$ctx = stream_context_create(['http' => [
					'method' => 'POST',
					'header' => "Content-Type: application/json\r\n",
					'content' => json_encode(['ticket' => $appTicket]),
					'timeout' => 3,
				]]);
				$answer = json_decode((string)@file_get_contents('http://127.0.0.1:8200/api/app/admin-ticket/redeem', false, $ctx), true);
				if (!empty($answer['ok'])) {
					session_regenerate_id(true);
					$_SESSION['logged_in'] = true;
					$_SESSION['login_epoch'] = (string)($data['interfacelogin']['epoch'] ?? '');
					header('Location: ' . $_SERVER['PHP_SELF']);
					exit;
				}
			}
			if ($_SERVER['REQUEST_METHOD'] === 'GET' && !isset($_GET['login_form'])
				&& file_exists('/etc/lighttpd/conf-enabled/90-mupibox-app.conf')) {
				header('Location: /app/?portal=admin', true, 302);
				exit;
			}
			if (isset($_POST['password'])) {
				if (password_verify($_POST['password'], $hashedPassword)) {
					// new session id at login: a session id planted before the login must not
					// become a logged-in one (session fixation)
					session_regenerate_id(true);
					$_SESSION['logged_in'] = true;
					$_SESSION['login_epoch'] = (string)($data['interfacelogin']['epoch'] ?? '');
					header("Location: " . $_SERVER['PHP_SELF']);
					exit;
				} else {
					sleep(1); // slows down password guessing
					$loginError = "Wrong password!"; // was $error, which the form never printed
				}
			}
			?>
<body>		
<style>
@keyframes fadein {
    from { opacity: 0; transform: translate(-50%, -60%); }
    to   { opacity: 1; transform: translate(-50%, -50%); }
}
</style>
	<div id="login-overlay"></div>

	<div id="login-wrapper">
		<form method="post" class="appnitro">
			<h2>🔒 Login required</h2>
			<input class="text" type="password" id="pw" name="password" placeholder="Please enter password" />
			<?php if (!empty($loginError)) echo "<p class='error'>$loginError</p>"; ?>
			<div class="buttons">
				<input type="submit" value="Login" class="button_text_green" />
			</div>
		</form>
	</div>
</body>
</html>
	<?php
	exit;

		}
	}
?>	
	<body id="main_body" >
		<img id="top" src="images/top.png" alt="">	
		<div id="container">
			<div class="controlnav" id="controlnav">
<?php 
	if ($data['interfacelogin']['state']) {
		echo '<a href="logout.php" onclick="confirm(\'Do really want to logout?\') || stopEvent(event)" ><iconify-icon icon="material-symbols:logout" title="Logout" ></iconify-icon></a>';
	}
?>
				<div id="Wifi_Icon"> </div>
				<div id="Battery_Icon"> </div>
				<div id="Fan_Icon"> </div>
				<a href="?hshutdown=1&csrf_token=<?= urlencode(csrf_token()) ?>" onclick="confirm('Do really want to shutdown?') || stopEvent(event)" ><iconify-icon icon="ic:outline-power-settings-new" title="Shutdown" ></iconify-icon></a>
				<a href="?hreboot=1&csrf_token=<?= urlencode(csrf_token()) ?>" onclick="confirm('Do really want to reboot?') || stopEvent(event)" ><iconify-icon icon="ic:outline-restart-alt" title="Reboot" ></iconify-icon></a>
				<a href="?hchromerestart=1&csrf_token=<?= urlencode(csrf_token()) ?>" onclick="confirm('Do really want to restart chrome kiosk?') || stopEvent(event)" ><iconify-icon icon="tabler:brand-chrome"  title="Restart chrome browser" ></iconify-icon></a>
			</div>
			<div class="topnav" id="myTopnav">
				<a<?= navActive('index.php') ?> href="<?= $link ?>index.php"><i class="fa fa-fw fa-home"></i> Home</a>
				<a<?= navActive('content.php') ?> href="<?= $link ?>content.php"><i class="fa-solid fa-music"></i> MuPiBox</a>				
<?php
	// R3-B-1: same caching rationale as the wifi exec()s above. The
	// `ps -ef | grep websockify` invocation forks ps + grep on every
	// page render; cache the boolean result for 5s.
	$vnc_active = mupibox_cached_exec(
		'vnc_active',
		5,
		"ps -ef | grep websockify | grep -v grep | head -n1"
	);
	if ($vnc_active !== '' && !navTabHidden('vnc'))
	{
		echo '<a' . navActive('vnc.php') . ' href="' . $link . 'vnc.php"><i class="fa-solid fa-display"></i> VNC</a>';
	}
?>
				<?php if (!navTabHidden('mupi')) { ?><a<?= navActive('mupi.php') ?> href="<?= $link ?>mupi.php"><i class="fa-solid fa-headphones"></i> MuPi-Conf</a><?php } ?>
				<?php if (!navTabHidden('parental')) { ?><a<?= navActive('parental.php') ?> href="<?= $link ?>parental.php"><i class="fa-solid fa-people-roof"></i> Parental</a><?php } ?>
				<?php if (!navTabHidden('mupihat')) { ?><a<?= navActive('mupihat.php') ?> href="<?= $link ?>mupihat.php"><i class="fa-solid fa-hat-wizard"></i> MuPiHAT</a><?php } ?>
				<?php if (!navTabHidden('media')) { ?><a<?= navActive('media.php') ?> href="<?= $link ?>media.php"><i class="fa-solid fa-list"></i> Media</a><?php } ?>
				<?php if (!navTabHidden('cover')) { ?><a<?= navActive('cover.php') ?> href="<?= $link ?>cover.php"><i class="fa-regular fa-image"></i> Cover</a><?php } ?>
				<?php if (!navTabHidden('bluetooth')) { ?><a<?= navActive('bluetooth.php') ?> href="<?= $link ?>bluetooth.php"><i class="fa-brands fa-bluetooth"></i> Bluetooth</a><?php } ?>
				<?php if (!navTabHidden('spotify')) { ?><a<?= navActive('spotify.php') ?> href="<?= $link ?>spotify.php"><i class="fa-brands fa-spotify"></i> Spotify</a><?php } ?>
				<?php if (!navTabHidden('nas')) { ?><a<?= navActive('nas.php') ?> href="<?= $link ?>nas.php"><i class="fa-solid fa-server"></i> NAS</a><?php } ?>
				<?php if (!navTabHidden('network')) { ?><a<?= navActive('network.php') ?> href="<?= $link ?>network.php"><i class="fa-solid fa-wifi"></i> Network</a><?php } ?>
				<?php if (!navTabHidden('smart')) { ?><a<?= navActive('smart.php') ?> href="<?= $link ?>smart.php"><i class="fa-solid fa-share-nodes"></i> Smart</a><?php } ?>
				<?php /*<a href="service.php"><i class="fa-solid fa-gear"></i> Services</a>
				<a href="tweaks.php"><i class="fa-solid fa-rocket"></i> Performance</a>*/ ?>
				<?php if (!navTabHidden('dietpidash')) { ?><a href="<?= $link ?>" onmouseover="javascript:event.target.port=5252" target="_blank"><i class="fa-brands fa-raspberry-pi"></i> DietPi-Dash</a><?php } ?>
				<?php /*<a href="/" onmouseover="javascript:event.target.port=8081" target="_blank"><i class="fa-brands fa-youtube"></i> Youtube</a>*/ ?>
				<?php if (!navTabHidden('logs')) { ?><a<?= navActive('logviewer.php') ?> href="<?= $link ?>logviewer.php"><i class="fa-solid fa-file-lines"></i> Logs</a><?php } ?>
				<?php if (!navTabHidden('json')) { ?><a<?= navActive('jsoneditor.php') ?> href="<?= $link ?>jsoneditor.php"><i class="fa-solid fa-code"></i> JSON</a><?php } ?>
				<a<?= navActive('admin.php') ?> href="<?= $link ?>admin.php"><i class="fa-solid fa-screwdriver-wrench"></i> Admin</a>
				<a href="javascript:void(0);" class="icon" onclick="myFunction()"><i class="fa fa-bars"></i></a>
			</div>
