<?php

$backendBase = 'http://localhost:8200/api/nas';

// Progress of a running "Download selected" (polled by the page below). Answers
// before header.php so that no HTML is sent along with the JSON.
if (isset($_GET['download_cancel']) && $_SERVER['REQUEST_METHOD'] === 'POST') {
	header('Content-Type: application/json');
	echo json_encode(nasApiCall("$backendBase/download/cancel", 'POST', new stdClass(), 10));
	exit;
}
if (isset($_GET['download_status'])) {
	header('Content-Type: application/json');
	echo json_encode(nasApiCall("$backendBase/download/status", 'GET', null, 5));
	exit;
}

// Children of one folder for the tree view (loaded when a folder is expanded).
if (isset($_GET['browse'])) {
	header('Content-Type: application/json');
	echo json_encode(nasApiCall("$backendBase/browse?path=" . urlencode($_GET['browse']), 'GET', null, 15));
	exit;
}

// Folder index (built by the backend) behind the "Filter folders" box.
if (isset($_GET['index_status'])) {
	header('Content-Type: application/json');
	echo json_encode(nasApiCall("$backendBase/index/status", 'GET', null, 10));
	exit;
}
if (isset($_GET['index_search'])) {
	header('Content-Type: application/json');
	echo json_encode(nasApiCall("$backendBase/index/search?q=" . urlencode((string)$_GET['index_search']), 'GET', null, 10));
	exit;
}
if (isset($_GET['index_refresh']) && $_SERVER['REQUEST_METHOD'] === 'POST') {
	header('Content-Type: application/json');
	echo json_encode(nasApiCall("$backendBase/index/refresh", 'POST', new stdClass(), 10));
	exit;
}

// Profiles of the NAS tab (kept by the backend in the config).
if (isset($_GET['profile_api'])) {
	header('Content-Type: application/json');
	$profileAction = (string)$_GET['profile_api'];
	if ($profileAction === 'list') {
		echo json_encode(nasApiCall("$backendBase/profiles", 'GET', null, 10));
	} elseif ($_SERVER['REQUEST_METHOD'] === 'POST' && in_array($profileAction, array('create', 'load', 'remove-missing', 'delete'), true)) {
		$profileBody = json_decode(file_get_contents('php://input'), true);
		// Loading checks every folder of the profile on the NAS, which can take a while.
		echo json_encode(nasApiCall("$backendBase/profiles/$profileAction", 'POST', is_array($profileBody) ? $profileBody : new stdClass(), $profileAction === 'load' ? 120 : 15));
	} else {
		http_response_code(400);
		echo json_encode(array('success' => false));
	}
	exit;
}

include('includes/header.php');

function nasApiCall($url, $method = 'GET', $body = null, $timeout = 30) {
	$ch = curl_init($url);
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
	curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
	curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
	if ($method === 'POST') {
		curl_setopt($ch, CURLOPT_POST, true);
		curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
		curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
	}
	$response = curl_exec($ch);
	$curlError = curl_error($ch);
	curl_close($ch);
	if ($response === false) {
		return array('success' => false, 'error' => 'Could not reach the MuPiBox backend: ' . $curlError);
	}
	$decoded = json_decode($response, true);
	if ($decoded === null) {
		return array('success' => false, 'error' => 'Invalid response from backend');
	}
	return $decoded;
}

$loginError = '';

if (isset($_POST['nas_signin'])) {
	$address = trim($_POST['nas_address'] ?? '');
	$account = trim($_POST['nas_account'] ?? '');
	$password = $_POST['nas_password'] ?? '';
	$useHttps = isset($_POST['nas_https']);
	$rememberMe = isset($_POST['nas_remember']);

	if ($address === '') {
		$loginError = 'Address not filled in.';
	} elseif ($account === '') {
		$loginError = 'Account not filled in.';
	} elseif ($password === '') {
		$loginError = 'Password not filled in.';
	} else {
		$result = nasApiCall("$backendBase/login", 'POST', array(
			'address' => $address,
			'https' => $useHttps,
			'account' => $account,
			'password' => $password,
			'rememberMe' => $rememberMe,
		), 30);

		if (empty($result['success'])) {
			$loginError = $result['error'] ?? 'Login failed.';
		}
	}
}

$downloadStarted = false;

$nasFlash = '';
$nasFlashError = '';
if (isset($_POST['nas_save_selection']) || isset($_POST['nas_download_selected'])) {
	$checkedShow = $_POST['artist_folders'] ?? array();
	$checkedHide = $_POST['hide_folders'] ?? array();
	$checkedDownload = $_POST['download_folders'] ?? array();
	$shown = json_decode($_POST['shown_folders'] ?? '[]', true) ?? array();
	foreach ($shown as $shownPath) {
		// A folder is either shown or hidden; hidden wins if both were sent.
		$isHidden = in_array($shownPath, $checkedHide, true);
		nasApiCall("$backendBase/mark", 'POST', array(
			'path' => $shownPath, 'marked' => !$isHidden && in_array($shownPath, $checkedShow, true), 'list' => 'artist'), 10);
		nasApiCall("$backendBase/mark", 'POST', array(
			'path' => $shownPath, 'marked' => $isHidden, 'list' => 'hidden'), 10);
		nasApiCall("$backendBase/mark", 'POST', array(
			'path' => $shownPath, 'marked' => in_array($shownPath, $checkedDownload, true), 'list' => 'download'), 10);
	}
	// No lightbox of the site-wide change notice here: the save shows a short line, the download its progress bar.
	$nasFlash = 'Selection saved.';

	if (isset($_POST['nas_download_selected'])) {
		$syncResult = nasApiCall("$backendBase/download/sync", 'POST', new stdClass(), 10);
		if (!empty($syncResult['success'])) {
			$downloadStarted = true;
			$nasFlash = '';
		} else {
			$nasFlashError = (string)($syncResult['error'] ?? 'Could not start the download.');
		}
	}
}

// The real NAS session lives in the backend (it can also silently
// re-login using remembered credentials), so PHP never tracks "logged in"
// state itself - it just asks the backend on every page load. "Change login"
// forces the login form to show even if the backend still has a session.
$forceLogin = isset($_GET['relogin']) || $loginError !== '';
$currentPath = isset($_GET['path']) ? $_GET['path'] : '';

$isLoggedIn = false;
$browseEntries = array();
$browseError = '';

if (!$forceLogin) {
	$browseResult = nasApiCall("$backendBase/browse?path=" . urlencode($currentPath), 'GET', null, 15);
	if (!empty($browseResult['success'])) {
		$isLoggedIn = true;
		$browseEntries = $browseResult['entries'] ?? array();
	} elseif (($browseResult['error'] ?? '') !== 'not_logged_in') {
		// Backend has a session, but this one NAS call failed (e.g. offline) -
		// still show the browser shell rather than forcing a fresh login.
		$isLoggedIn = true;
		$browseError = 'Could not reach the NAS right now - it may be offline.';
	}
}

$CHANGE_TXT = $CHANGE_TXT . "</ul>";
?>

<style>
	.nas-info { display: inline-block; vertical-align: middle; cursor: pointer; color: #0d5a80; font-size: 22px; line-height: 1; user-select: none; }
	.nas-info:hover { color: #0a3d57; }
	.nas-pop { text-align: left; position: fixed; z-index: 10000; box-sizing: border-box; max-width: 440px; width: calc(100vw - 32px); background: #fff; color: #222; border-radius: 10px; padding: 14px 16px; font-size: 14px; line-height: 1.45; box-shadow: 0 6px 24px rgba(0, 0, 0, .35); }
</style>
<div style="display:none;">
	<div id="nas-info-nas">Connect a NAS (Synology, QNAP, TrueNAS, ... - anything with a WebDAV server) as an additional media source. Enable WebDAV on the NAS first (Synology: package "WebDAV Server", ports 5005 http / 5006 https). Every folder with a checkmark under "Show in Mupibox" appears in the NAS tab on the MuPiBox together with all of its subfolders - so you only need to tick the top-level folder, not every subfolder. To leave out a single folder (and everything in it), tick "Hide in Mupibox" for it instead - a folder is either shown or hidden. Changes on the NAS show up live, with no separate media update needed.</div>
	<div id="nas-info-profiles">A profile remembers which folders are set to "Show", "Hide" and "Download local", together with the NAS login it was made with. Saving the selection updates the active profile. A profile can only be loaded while the same NAS and account are connected. Profiles and the NAS login (the password encrypted) are part of the configuration backup.</div>
</div>

<?php if ($isLoggedIn) { ?>
	<style>
		#nas-profile-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 10px 0 0 0; }
		#nas-profile-row .button_text { margin: 0; flex: 0 0 auto; }
		#nas-profile-select { box-sizing: border-box; height: 42px; min-width: 220px; padding: 0 12px; font-size: 16px; color: #222; background: #fff; border: 1px solid #9a9a9a; border-radius: 10px; }
		#nas-profile-info { font-size: 13px; color: #666; margin: 8px 0 12px 0; max-width: 720px; }
		.nas-modal-back { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, .45); z-index: 9999; display: flex; align-items: center; justify-content: center; }
		.nas-modal { box-sizing: border-box; background: #fff; color: #222; border-radius: 12px; padding: 22px 24px; max-width: 480px; width: calc(100% - 32px); box-shadow: 0 8px 30px rgba(0, 0, 0, .35); font-size: 15px; line-height: 1.4; }
		.nas-modal h3 { margin: 0 0 10px 0; font-size: 18px; }
		.nas-modal p { margin: 0 0 10px 0; }
		.nas-modal ul { margin: 0 0 10px 0; padding: 6px 6px 6px 22px; max-height: 180px; overflow: auto; background: #f4f4f4; border-radius: 6px; font-size: 13px; }
		.nas-modal input[type=text] { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; font-size: 16px; border: 1px solid #9a9a9a; border-radius: 8px; margin: 4px 0 6px 0; }
		.nas-modal-buttons { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; }
		.nas-modal-buttons .button_text { margin: 0; }
	</style>
	<div class="description" style="padding-left:25px; margin-top:21px;" id="nas-profiles">
		<h2>Profiles</h2>
		<div id="nas-profile-row">
			<select id="nas-profile-select" title="Profiles"></select>
			<input type="button" class="button_text" id="nas-profile-create" value="Create profile" />
			<input type="button" class="button_text" id="nas-profile-load" value="Load profile" />
			<input type="button" class="button_text" id="nas-profile-delete" value="Delete profile" />
			<span class="nas-info" data-info="nas-info-profiles" title="About profiles" role="button" tabindex="0"><i class="fa-solid fa-circle-info"></i></span>
		</div>
		<div id="nas-profile-info"></div>
	</div>
	<style>
		/* 21px between the line above and the box = 21px between the "S" of "Show in Mupibox" and the line below the header */
		#nas-filter-row { display: flex; align-items: center; gap: 16px; margin: 21px 0 0 25px; }
		#nas-filter-row .button_text { margin: 0; flex: 0 0 auto; }
		#nas-filter-wrap { position: relative; flex: 0 1 360px; min-width: 0; }
		#nas-filter-wrap i { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #8a8a8a; font-size: 15px; pointer-events: none; }
		#nas-filter { box-sizing: border-box; width: 100%; height: 42px; padding: 0 130px 0 40px; font-size: 16px; color: #222; background: #f9f9f9; border: 1px solid #dcdcdc; border-radius: 6px; outline: none; }
		#nas-filter:focus { border-color: #b5b5b5; background: #fbfbfb; }
		#nas-filter::placeholder { color: #aaa; }
		#nas-filter-status { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: #777; font-size: 13px; pointer-events: none; }
	</style>
	<div id="nas-filter-row">
	<div id="nas-filter-wrap">
		<i class="fa-solid fa-magnifying-glass"></i>
		<input id="nas-filter" type="text" title="Filter Folders" placeholder="Filter folders" autocomplete="off" />
		<span id="nas-filter-status" style="display:none;">searching...</span>
	</div>
	<input type="button" id="nas-index-refresh" class="button_text" value="Refresh index" />
	</div>
	<div id="nas-index-line" style="margin: 6px 0 0 25px; font-size: 13px; color: #666;"></div>
<?php } ?>

<?php if (!$isLoggedIn) {
	// The last used login stays in the config after "Logout" (never the password): offer it again.
	// (a "nas" section that only holds the template defaults must not hide an old "synology" one)
	$lastNas = !empty($data['nas']['address']) ? $data['nas'] : ($data['synology'] ?? ($data['nas'] ?? array()));
	$formAddress = isset($_POST['nas_address']) ? (string)$_POST['nas_address'] : (string)($lastNas['address'] ?? '');
	$formAccount = isset($_POST['nas_account']) ? (string)$_POST['nas_account'] : (string)($lastNas['account'] ?? '');
	$formHttps = isset($_POST['nas_signin']) ? isset($_POST['nas_https']) : !empty($lastNas['https']);
	$formRemember = isset($_POST['nas_signin']) ? isset($_POST['nas_remember']) : (!isset($lastNas['rememberMe']) || !empty($lastNas['rememberMe']));
?>
	<style>
		/* Same flat look as the "Filter folders" box. */
		#nas_address, #nas_account, #nas_password { box-sizing: border-box; height: 42px; padding: 0 12px; font-size: 16px; color: #222; background: #f9f9f9; border: 1px solid #dcdcdc; border-radius: 6px; outline: none; }
		#nas_address:focus, #nas_account:focus, #nas_password:focus { border-color: #b5b5b5; background: #fbfbfb; }
	</style>
	<form class="appnitro" method="post" action="nas.php" id="form">
		<ul>
			<li id="li_1">
				<label class="description" for="nas_address">Address incl. WebDAV port (e.g. 192.168.1.25:5006)</label>
				<div>
					<input id="nas_address" name="nas_address" class="element text large" type="text" maxlength="255" value="<?= htmlspecialchars($formAddress, ENT_QUOTES) ?>" />
				</div>
			</li>
			<li id="li_1">
				<label class="description" for="nas_account">Account</label>
				<div>
					<input id="nas_account" name="nas_account" class="element text large" type="text" maxlength="255" value="<?= htmlspecialchars($formAccount, ENT_QUOTES) ?>" />
				</div>
			</li>
			<li id="li_1">
				<label class="description" for="nas_password">Password</label>
				<div>
					<input id="nas_password" name="nas_password" class="element text large" type="password" maxlength="255" value="" />
				</div>
			</li>
			<li id="li_1">
				<label class="description" for="nas_https">HTTPS</label>
				<div>
					<input id="nas_https" name="nas_https" type="checkbox" value="1"<?= $formHttps ? ' checked="checked"' : '' ?> />
				</div>
			</li>
			<li id="li_1">
				<label class="description" for="nas_remember">Remember me</label>
				<div>
					<input id="nas_remember" name="nas_remember" type="checkbox" value="1"<?= $formRemember ? ' checked="checked"' : '' ?> />
				</div>
			</li>
			<?php if ($loginError) { ?>
				<li id="li_1"><p style="color:#900;"><?= htmlspecialchars($loginError) ?></p></li>
			<?php } ?>
			<li class="buttons">
				<input id="saveForm" class="button_text" type="submit" name="nas_signin" value="Sign In" title="Signing in can take up to ~15 seconds." />
			</li>
		</ul>
	</form>
<?php } else { ?>
	<form class="appnitro" method="post" action="nas.php" id="form">
			<input type="hidden" name="shown_folders" id="shown_folders" value="[]" />
			<ul>
				<?php if ($browseError) { ?>
					<li id="li_1"><p style="color:#900;"><?= htmlspecialchars($browseError) ?></p></li>
				<?php } ?>
				<li id="li_1">
					<style>
						#nas-tree { font-family: "Segoe UI", Tahoma, sans-serif; font-size: 15px; color: #1a1a1a; max-width: 720px; }
						.nas-head, .nas-row { display: flex; align-items: center; }
						.nas-head { /* auto height: the vertical "Show in Mupibox" text must not overlap the filter box; the form li above adds ~20px, so 1px more gives the same ~21px gap as between the "S" and the line below */ height: auto; padding-top: 1px; align-items: flex-end; border-bottom: 1px solid #e0e0e0; margin-bottom: 4px; }
						.nas-cb { flex: 0 0 34px; text-align: center; }
						.nas-cb input { margin: 0; }
						.nas-cb input:disabled { opacity: .3; cursor: not-allowed; }
						.nas-head .nas-cb { display: flex; justify-content: center; }
						.nas-head .nas-cb span { display: inline-block; position: relative; left: 2px; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; line-height: 13px; padding-bottom: 4px; }
						.nas-row { height: 28px; border-radius: 3px; cursor: default; }
						.nas-row:hover { background: #e5f3ff; }
						/* The admin theme pads every div inside forms by 8px at the bottom - reset it so the row content sits centered in the row. */
						#nas-tree .nas-row, #nas-tree .nas-row div, #nas-tree .nas-row span, #nas-tree .nas-row i { padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; line-height: 1.2; }
						.nas-name { display: flex; align-items: center; flex: 1; min-width: 0; margin-left: 20px; }
						.nas-chevron { flex: 0 0 22px; text-align: center; color: #777; cursor: pointer; font-size: 11px; transition: transform .12s; user-select: none; }
						.nas-chevron.open, .nas-chevron.filter-open { transform: rotate(90deg); }
						.nas-chevron.empty { visibility: hidden; }
						.nas-chevron:hover { color: #000; }
						.nas-folder { color: #f0c04a; margin: 0 8px 0 2px; font-size: 16px; }
						.nas-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
						.nas-done { color: #2a9d3f; margin-left: 8px; font-size: 13px; }
						.nas-children { display: none; }
						.nas-children.open, .nas-children.filter-open { display: block; }
						.nas-msg { color: #888; font-style: italic; padding: 3px 0; }
					</style>
					<div id="nas-tree">
						<div class="nas-head">
							<div class="nas-cb"><span>Show in Mupibox</span></div>
							<div class="nas-cb"><span>Hide in Mupibox</span></div>
							<div class="nas-cb"><span>Download local</span></div>
							<div class="nas-name"><b>Folder</b></div>
						</div>
						<div id="nas-root"></div>
					</div>
				</li>
<?php if (count($browseEntries) === 0 && !$browseError) { ?>
				<li id="li_1"><p>No subfolders here.</p></li>
			<?php } ?>
			<li class="buttons">
				<style>
					/* Three columns of the same width, so the buttons of both rows line up. */
					#nas-actions { display: grid; grid-template-columns: repeat(3, 200px) minmax(220px, 1fr) auto; gap: 10px; align-items: center; max-width: 1000px; }
					#nas-actions input.button_text { box-sizing: border-box; width: 100%; min-width: 0; margin: 0; }
					#nas-actions > :nth-child(-n+3) { grid-row: 1; }
					#nas-actions > :nth-child(n+4) { grid-row: 2; }
					#nas-progress { display: none; position: relative; box-sizing: border-box; height: 28px; border-radius: 8px; background: #d9e3ea; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0, 0, 0, .25); }
					#nas-progress-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background-image: linear-gradient(144deg, #024364, #00689C 50%, #44afe2); transition: width .4s; }
					#nas-progress-text { position: relative; display: block; text-align: center; line-height: 28px; font-size: 13px; font-weight: bold; color: #fff; text-shadow: 0 0 3px rgba(0, 0, 0, .7); white-space: nowrap; }
					#nas-download-cancel { display: none; }
					@media (max-width: 900px) {
						#nas-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
						#nas-actions > :nth-child(n+7) { grid-row: auto; grid-column: 1 / -1; }
					}
				</style>
				<div id="nas-actions">
					<input class="button_text" type="button" value="Select all" onclick="document.querySelectorAll('input[name=\'artist_folders[]\']').forEach(function (box) { if (!box.disabled) { box.checked = true; box.dispatchEvent(new Event('change')); } });" />
					<input class="button_text" type="button" value="Unselect all" onclick="document.querySelectorAll('input[name=\'artist_folders[]\']').forEach(function (box) { box.checked = false; box.dispatchEvent(new Event('change')); });" />
					<input id="saveForm" class="button_text" type="submit" name="nas_save_selection" value="Save selection" />
					<input class="button_text" type="button" value="Select all downloads" onclick="document.querySelectorAll('input[name=\'download_folders[]\']').forEach(function (box) { box.checked = true; });" />
					<input class="button_text" type="button" value="Unselect all downloads" onclick="document.querySelectorAll('input[name=\'download_folders[]\']').forEach(function (box) { box.checked = false; });" />
					<input class="button_text" type="submit" name="nas_download_selected" value="Download selected" onclick="return confirm('Download the checked folders to the MuPiBox and delete local copies of unchecked ones?');" />
					<div id="nas-progress"><div id="nas-progress-fill"></div><span id="nas-progress-text"></span></div>
					<input class="button_text" type="button" id="nas-download-cancel" value="Cancel" />
				</div>
			</li>
			<li id="li_1" style="padding-top:6px;">
				<div id="nas-flash" style="display:none; color:#2a7d3f; font-size:14px; margin-bottom:6px;"></div>
				<div id="nas-download-status" style="display:none;"></div>
			</li>
		</ul>
	</form>
	<?php
	// The NAS this MuPiBox is logged in to (an old config still calls the section "synology").
	$nasLoginAddress = !empty($data['nas']['address']) ? $data['nas']['address'] : ($data['synology']['address'] ?? '');
?>
	<div style="padding-left:25px; display:flex; align-items:center; gap:12px; margin: 8px 0;">
		<span class="nas-info" data-info="nas-info-nas" title="About the NAS tab" role="button" tabindex="0"><i class="fa-solid fa-circle-info"></i></span>
		<input type="button" class="button_text" id="nas-logout" value="Logout" style="margin:0;" title="<?= htmlspecialchars('Logout from NAS - ' . $nasLoginAddress, ENT_QUOTES) ?>" onclick="location.href='nas.php?relogin=1';" />
	</div>
<?php } ?>

<script>
(function () {
	var root = document.getElementById('nas-root');
	if (!root) { return; }
	var shownInput = document.getElementById('shown_folders');
	var shown = {};
	var STORE = 'nasTreeExpanded';

	function readExpanded() {
		try { return JSON.parse(localStorage.getItem(STORE) || '[]') || []; } catch (e) { return []; }
	}
	function writeExpanded(list) {
		try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) {}
	}
	function setExpanded(path, open) {
		var list = readExpanded().filter(function (p) { return p !== path; });
		if (open) { list.push(path); }
		writeExpanded(list);
	}

	// Alphabetical like the Windows file explorer (the NAS returns them unsorted).
	function sortEntries(list) {
		return list.slice().sort(function (a, b) {
			return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
		});
	}

	// Live folder filter. Two modes:
	//  - Index mode: the backend keeps an index of all folder paths (built in the background, renewed
	//    daily or with "Refresh index"), so a filter text is answered at once. Only the folders on the
	//    way to a match are loaded into the tree and shown open.
	//  - Fallback (no index yet): match on the folders already loaded and load all subfolders from the NAS.
	// Hidden rows keep their checkboxes, so saving is not affected by the filter.
	var filterInput = document.getElementById('nas-filter');
	var statusEl = document.getElementById('nas-filter-status');
	var infoEl = document.getElementById('nas-index-line');
	var idx = null;            // { matches, ancestors } (path lookups) while an index answer is applied
	var indexExists = false;
	var filterToken = 0, filterTimer = null;

	function kidsOf(div) { return div.querySelector(':scope > .nas-children'); }
	function chevronOf(div) { return div.querySelector(':scope > .nas-row .nas-chevron'); }
	function isNode(el) { return el.dataset && el.dataset.name !== undefined; }
	function setOpenForFilter(div, open) {
		var kids = kidsOf(div), chev = chevronOf(div);
		if (kids) { kids.classList.toggle('filter-open', open); }
		if (chev) { chev.classList.toggle('filter-open', open); }
	}

	function filterNode(div, forced, q) {
		var kids = kidsOf(div);
		var self = q === '' || div.dataset.name.indexOf(q) !== -1;
		var any = false;
		if (kids) {
			Array.prototype.forEach.call(kids.children, function (kid) {
				if (isNode(kid) && filterNode(kid, forced || self, q)) { any = true; }
			});
		}
		// A folder with a matching subfolder is shown open while filtering (its normal open/closed state is untouched).
		setOpenForFilter(div, q !== '' && any);
		var matched = self || any;
		div.style.display = (forced || matched) ? '' : 'none';
		return matched;
	}
	function filterNodeIdx(div, forced) {
		var p = div.dataset.path;
		var self = idx.matches.has(p);
		var open = idx.ancestors.has(p);
		var kids = kidsOf(div);
		if (kids) {
			Array.prototype.forEach.call(kids.children, function (kid) {
				if (isNode(kid)) { filterNodeIdx(kid, forced || self); }
			});
		}
		setOpenForFilter(div, open);
		div.style.display = (forced || self || open) ? '' : 'none';
	}
	function applyFilter() {
		if (!filterInput) { return; }
		var q = filterInput.value.trim().toLowerCase();
		Array.prototype.forEach.call(root.children, function (div) {
			if (!isNode(div)) { return; }
			if (idx && q !== '') { filterNodeIdx(div, false); } else { filterNode(div, false, q); }
		});
	}

	// Loads the subfolders of every folder for which shouldLoad(div) is true (4 requests at a time),
	// so the matches become part of the tree. Stops when the filter text changed (token).
	function crawl(shouldLoad, token) {
		var queue = [];
		function enqueue(container) {
			Array.prototype.forEach.call(container.children, function (d) { if (isNode(d)) { queue.push(d); } });
		}
		enqueue(root);
		var active = 0;
		return new Promise(function (resolve) {
			function next() {
				while (active < 4 && queue.length && token === filterToken) {
					var d = queue.shift();
					if (!d._load || !shouldLoad(d)) { continue; }
					active++;
					(function (node) {
						node._load().then(function () {
							var kids = kidsOf(node);
							if (kids) { enqueue(kids); }
							active--;
							next();
						});
					})(d);
				}
				if (active === 0 && (!queue.length || token !== filterToken)) { resolve(); }
			}
			next();
		});
	}
	function showSearching(on) { if (statusEl) { statusEl.style.display = on ? '' : 'none'; } }

	// Fallback without index: folders whose own name matches are not searched further (shown anyway).
	function runNameCrawl(q, token) {
		filterTimer = setTimeout(function () {
			showSearching(true);
			crawl(function (d) { return d.dataset.name.indexOf(q) === -1; }, token).then(function () {
				if (token === filterToken) { showSearching(false); }
				applyFilter();
			});
		}, 300);
	}
	function runIndexSearch(q, token) {
		filterTimer = setTimeout(function () {
			fetch('nas.php?index_search=' + encodeURIComponent(q), { cache: 'no-store' })
				.then(function (r) { return r.json(); })
				.then(function (res) {
					if (token !== filterToken) { return; }
					if (!res || !res.success) { idx = null; applyFilter(); runNameCrawl(q, token); return; }
					var matches = {}, ancestors = {};
					res.paths.forEach(function (p) {
						matches[p] = true;
						var parts = p.split('/').filter(Boolean);
						for (var n = 1; n < parts.length; n++) { ancestors['/' + parts.slice(0, n).join('/')] = true; }
					});
					idx = {
						matches: { has: function (p) { return matches[p] === true; } },
						ancestors: { has: function (p) { return ancestors[p] === true; } }
					};
					applyFilter();
					showSearching(true);
					crawl(function (d) { return ancestors[d.dataset.path] === true; }, token).then(function () {
						if (token === filterToken) { showSearching(false); }
						applyFilter();
					});
				})
				.catch(function () { if (token === filterToken) { idx = null; applyFilter(); runNameCrawl(q, token); } });
		}, 150);
	}
	function runFilter() {
		var token = ++filterToken;
		clearTimeout(filterTimer);
		showSearching(false);
		var q = filterInput.value.trim().toLowerCase();
		if (q === '') { idx = null; applyFilter(); return; }
		if (indexExists) {
			runIndexSearch(q, token); // keeps the previous answer on screen until the new one arrives
		} else {
			idx = null;
			applyFilter();
			runNameCrawl(q, token);
		}
	}
	if (filterInput) { filterInput.addEventListener('input', runFilter); }

	// Index status line ("Folder index: 3412 folders, updated ...  Refresh index").
	var wasBuilding = false;
	function safeText(t) { return String(t).replace(/[<>&]/g, ''); }
	function renderIndexInfo(st) {
		if (!infoEl) { return; }
		var btn = document.getElementById('nas-index-refresh');
		var text;
		if (st.running) {
			text = 'Building folder index... ' + st.folders + ' folders found so far' + (st.exists ? ' (the previous index is used meanwhile)' : '');
		} else if (st.exists) {
			text = 'Folder index: ' + st.count + ' folders, updated ' + new Date(st.updated).toLocaleString();
			if (st.error) { text += ' (last refresh failed: ' + safeText(st.error) + ')'; }
		} else {
			text = 'No folder index yet' + (st.error ? ' (last try failed: ' + safeText(st.error) + ')' : '');
		}
		infoEl.textContent = text;
		if (btn) {
			btn.disabled = !!st.running;
			btn.value = st.running ? 'Building index...' : (st.exists ? 'Refresh index' : 'Build index');
		}
	}
	function pollIndex() {
		fetch('nas.php?index_status=1', { cache: 'no-store' })
			.then(function (r) { return r.json(); })
			.then(function (st) {
				if (!st || !st.success) { return; }
				indexExists = !!st.exists;
				renderIndexInfo(st);
				if (st.running) {
					wasBuilding = true;
					setTimeout(pollIndex, 2000);
				} else if (wasBuilding) {
					wasBuilding = false;
					if (filterInput && filterInput.value.trim() !== '') { runFilter(); }
				}
			})
			.catch(function () {});
	}
	if (infoEl) {
		var refreshBtn = document.getElementById('nas-index-refresh');
		if (refreshBtn) {
			refreshBtn.addEventListener('click', function () {
				refreshBtn.disabled = true;
				fetch('nas.php?index_refresh=1', { method: 'POST' }).then(function () { setTimeout(pollIndex, 300); });
			});
		}
		pollIndex();
	}

	function checkbox(name, entry, checked, title) {
		var cell = document.createElement('div');
		cell.className = 'nas-cb';
		var input = document.createElement('input');
		input.type = 'checkbox';
		input.name = name;
		input.value = entry.path;
		input.title = title;
		input.checked = !!checked;
		cell.appendChild(input);
		return cell;
	}

	function addNode(container, entry, depth) {
		shown[entry.path] = true;
		var node = document.createElement('div');
		node.dataset.path = entry.path;
		node.dataset.name = entry.name.toLowerCase();
		node._load = function () { return load(); };
		var row = document.createElement('div');
		row.className = 'nas-row';
		var showCell = checkbox('artist_folders[]', entry, entry.isMarked, 'Show in Mupibox');
		var hideCell = checkbox('hide_folders[]', entry, entry.isHidden, 'Hide in Mupibox');
		var showBox = showCell.firstChild, hideBox = hideCell.firstChild;
		// A folder is either shown or hidden: while one box is checked the other one is inactive.
		function syncShowHide() { showBox.disabled = hideBox.checked; hideBox.disabled = showBox.checked; }
		showBox.addEventListener('change', syncShowHide);
		hideBox.addEventListener('change', syncShowHide);
		syncShowHide();
		row.appendChild(showCell);
		row.appendChild(hideCell);
		row.appendChild(checkbox('download_folders[]', entry, entry.isDownload, 'Download local'));

		var name = document.createElement('div');
		name.className = 'nas-name';
		name.style.paddingLeft = (depth * 22) + 'px';
		var chevron = document.createElement('span');
		chevron.className = 'nas-chevron';
		chevron.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
		var icon = document.createElement('i');
		icon.className = 'fa-solid fa-folder nas-folder';
		var label = document.createElement('span');
		label.className = 'nas-label';
		label.textContent = entry.name;
		name.appendChild(chevron);
		name.appendChild(icon);
		name.appendChild(label);
		if (entry.isDownloaded) {
			var done = document.createElement('i');
			done.className = 'fa-solid fa-circle-check nas-done';
			done.title = 'Downloaded';
			name.appendChild(done);
		}
		row.appendChild(name);

		var children = document.createElement('div');
		children.className = 'nas-children';
		node.appendChild(row);
		node.appendChild(children);
		container.appendChild(node);

		var loadedOnce = false;
		var loadPromise = null;
		function toggle(forceOpen) {
			var open = forceOpen === true ? true : !children.classList.contains('open');
			if (!open) {
				children.classList.remove('open');
				chevron.classList.remove('open');
				setExpanded(entry.path, false);
				return Promise.resolve();
			}
			children.classList.add('open');
			chevron.classList.add('open');
			setExpanded(entry.path, true);
				return load();
			}
			// Loads the subfolders once (also used by the filter, which does not open the folder itself).
			function load() {
				if (loadedOnce) { return loadPromise || Promise.resolve(); }
				loadedOnce = true;
			var msg = document.createElement('div');
			msg.className = 'nas-msg';
			msg.style.paddingLeft = ((depth + 1) * 22 + 90) + 'px';
			msg.textContent = 'Loading...';
			children.appendChild(msg);
			loadPromise = fetch('nas.php?browse=' + encodeURIComponent(entry.path), { cache: 'no-store' })
				.then(function (r) { return r.json(); })
				.then(function (res) {
					children.removeChild(msg);
					if (!res || !res.success) { throw new Error('failed'); }
					if (res.entries.length === 0) {
						chevron.classList.add('empty');
						chevron.classList.remove('open');
						children.classList.remove('open');
						return;
					}
					var chain = Promise.resolve();
					var expandedNow = readExpanded();
					sortEntries(res.entries).forEach(function (child) {
						var api = addNode(children, child, depth + 1);
						if (expandedNow.indexOf(child.path) !== -1) {
							chain = chain.then(function () { return api.toggle(true); });
						}
					});
					return chain.then(applyFilter);
				})
				.catch(function () {
					msg.textContent = 'Could not load this folder.';
					if (!msg.parentNode) { children.appendChild(msg); }
					loadedOnce = false;
				});
				return loadPromise;
			}
		chevron.addEventListener('click', function () { toggle(); });
		label.addEventListener('click', function () { toggle(); });
		icon.addEventListener('click', function () { toggle(); });
		return { toggle: toggle };
	}

	var initial = <?= json_encode(array_values($browseEntries)) ?>;
	var expanded = readExpanded();
	var chain = Promise.resolve();
	sortEntries(initial).forEach(function (entry) {
		var api = addNode(root, entry, 0);
		if (expanded.indexOf(entry.path) !== -1) {
			chain = chain.then(function () { return api.toggle(true); });
		}
	});

	// Only folders that were actually loaded (visible in the tree) are saved.
	document.getElementById('form').addEventListener('submit', function () {
		shownInput.value = JSON.stringify(Object.keys(shown));
	});
})();
</script>

<script>
(function () {
	var select = document.getElementById('nas-profile-select');
	if (!select) { return; }
	var info = document.getElementById('nas-profile-info');
	var btnCreate = document.getElementById('nas-profile-create');
	var btnLoad = document.getElementById('nas-profile-load');
	var btnDelete = document.getElementById('nas-profile-delete');
	var profiles = [];
	var DEFAULT = 'standard';

	// A simple popup: resolves with { value, text } of the clicked button (text = the input field, if any).
	function popup(o) {
		return new Promise(function (resolve) {
			var back = document.createElement('div');
			back.className = 'nas-modal-back';
			var box = document.createElement('div');
			box.className = 'nas-modal';
			var h = document.createElement('h3');
			h.textContent = o.title;
			box.appendChild(h);
			(o.paragraphs || []).forEach(function (t) {
				var p = document.createElement('p');
				p.textContent = t;
				box.appendChild(p);
			});
			if (o.list && o.list.length) {
				var ul = document.createElement('ul');
				o.list.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
				box.appendChild(ul);
			}
			if (o.after) {
				var pa = document.createElement('p');
				pa.textContent = o.after;
				box.appendChild(pa);
			}
			var input = null;
			if (o.input) {
				input = document.createElement('input');
				input.type = 'text';
				input.maxLength = 40;
				input.placeholder = o.input;
				box.appendChild(input);
			}
			var row = document.createElement('div');
			row.className = 'nas-modal-buttons';
			function close(value) {
				document.body.removeChild(back);
				document.removeEventListener('keydown', onKey);
				resolve({ value: value, text: input ? input.value : '' });
			}
			function onKey(e) { if (e.key === 'Escape') { close(o.buttons[0].value); } if (e.key === 'Enter' && input) { close(o.buttons[o.buttons.length - 1].value); } }
			o.buttons.forEach(function (b) {
				var btn = document.createElement('input');
				btn.type = 'button';
				btn.className = 'button_text';
				btn.value = b.label;
				btn.addEventListener('click', function () { close(b.value); });
				row.appendChild(btn);
			});
			box.appendChild(row);
			back.appendChild(box);
			document.body.appendChild(back);
			document.addEventListener('keydown', onKey);
			if (input) { input.focus(); }
		});
	}
	function notice(title, text, extra) {
		return popup({ title: title, paragraphs: [text].concat(extra || []), buttons: [{ label: 'OK', value: 'ok' }] });
	}
	window.nasNotice = notice;

	function api(action, body) {
		var opt = body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
		return fetch('nas.php?profile_api=' + encodeURIComponent(action), opt).then(function (r) { return r.json(); });
	}
	var working = false;
	function busy(on, text) {
		[btnCreate, btnLoad, btnDelete, select].forEach(function (e) { e.disabled = on; });
		if (on && text) { info.textContent = text; working = true; }
		if (!on) { updateButtons(); if (working) { working = false; refresh(); } }
	}
	function updateButtons() { btnDelete.disabled = select.value === DEFAULT; }

	function refresh(selectName) {
		return api('list').then(function (res) {
			if (!res || !res.success) { info.textContent = 'Profiles could not be read.'; return; }
			profiles = res.profiles;
			var wanted = selectName || select.value || res.active;
			select.innerHTML = '';
			profiles.forEach(function (p) {
				var o = document.createElement('option');
				o.value = p.name;
				o.textContent = p.name + (p.active ? '  (active)' : '');
				select.appendChild(o);
			});
			select.value = profiles.some(function (p) { return p.name === wanted; }) ? wanted : res.active;
			var act = profiles.filter(function (p) { return p.active; })[0];
			var text = 'Active profile: ' + res.active;
			if (act) {
				text += ' (' + act.shown + ' shown, ' + act.hidden + ' hidden, ' + act.download + ' download)';
				if (!act.matchesLogin) { text += ' - it belongs to another NAS/login, so changes to the selection are not saved into it.'; }
			}
			info.textContent = text;
			updateButtons();
		}).catch(function () { info.textContent = 'Profiles could not be read.'; });
	}

	function notLoggedIn() { return notice('Not connected', 'Not connected to the NAS. Please sign in again.'); }

	function create() {
		popup({
			title: 'Create profile',
			paragraphs: ['Stores the current saved selection (Show / Hide / Download local) as a profile and makes it the active one. Changes to the checkboxes have to be saved with "Save selection" first.'],
			input: 'Profile name',
			buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Create', value: 'create' }]
		}).then(function (r) {
			if (r.value !== 'create') { return; }
			var name = r.text.trim();
			return submitCreate(name, false);
		});
	}
	function submitCreate(name, overwrite) {
		busy(true, 'Saving the profile...');
		return api('create', { name: name, overwrite: overwrite }).then(function (res) {
			busy(false);
			if (res.success) {
				return notice('Profile created', 'Profile "' + name + '" was created and is now active.').then(function () { return refresh(name); });
			}
			if (res.error === 'exists') {
				return popup({
					title: 'Profile exists',
					paragraphs: ['A profile named "' + name + '" already exists. Replace it with the current selection?'],
					buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Replace', value: 'replace' }]
				}).then(function (r) { if (r.value === 'replace') { return submitCreate(name, true); } });
			}
			if (res.error === 'invalid_name') {
				return notice('Invalid name', 'Please use 1-40 letters, digits, spaces, dots, dashes or brackets, starting with a letter or digit.');
			}
			if (res.error === 'not_logged_in') { return notLoggedIn(); }
			return notice('Error', 'The profile could not be created.');
		}).catch(function () { busy(false); return notice('Error', 'The profile could not be created.'); });
	}

	function loadProfile() {
		var name = select.value;
		busy(true, 'Loading the profile and checking its folders on the NAS...');
		api('load', { name: name }).then(function (res) {
			busy(false);
			if (res.success) {
				var missing = res.missing || [];
				var extra = res.unverified > 0 ? res.unverified + ' folder(s) could not be checked because the NAS did not answer.' : '';
				if (missing.length === 0) {
					return notice('Profile loaded', 'Profile loaded successfully.', extra ? [extra] : []).then(function () { location.reload(); });
				}
				return popup({
					title: 'Profile loaded successfully',
					paragraphs: ['Profile "' + name + '" was loaded, but ' + missing.length + ' folder(s) no longer exist on the NAS:'],
					list: missing,
					after: 'Remove them from the list, or ignore them?' + (extra ? ' ' + extra : ''),
					buttons: [{ label: 'Ignore', value: 'ignore' }, { label: 'Remove from list', value: 'remove' }]
				}).then(function (r) {
					if (r.value !== 'remove') { location.reload(); return; }
					return api('remove-missing', { name: name, paths: missing }).then(function () { location.reload(); });
				});
			}
			if (res.error === 'different_login') {
				var p = profiles.filter(function (x) { return x.name === name; })[0];
				return notice('Profile not loaded', 'Profile could not be loaded because a different NAS IP / a different login was used.',
					p && (p.address || p.account) ? ['The profile was made for ' + p.address + ' with the account "' + p.account + '".'] : []);
			}
			if (res.error === 'not_logged_in') { return notLoggedIn(); }
			return notice('Error', 'The profile could not be loaded.');
		}).catch(function () { busy(false); return notice('Error', 'The profile could not be loaded.'); });
	}

	function deleteProfile() {
		var name = select.value;
		popup({
			title: 'Delete profile',
			paragraphs: ['Delete the profile "' + name + '"? The folders themselves are not touched.'],
			buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Delete', value: 'delete' }]
		}).then(function (r) {
			if (r.value !== 'delete') { return; }
			busy(true);
			return api('delete', { name: name }).then(function (res) {
				busy(false);
				if (res.success) { return refresh(); }
				if (res.error === 'standard') { return notice('Not possible', 'The profile "' + DEFAULT + '" cannot be deleted.'); }
				if (res.error === 'active') { return notice('Not possible', 'The active profile cannot be deleted. Load another profile first.'); }
				return notice('Error', 'The profile could not be deleted.');
			}).catch(function () { busy(false); return notice('Error', 'The profile could not be deleted.'); });
		});
	}

	select.addEventListener('change', updateButtons);
	btnCreate.addEventListener('click', create);
	btnLoad.addEventListener('click', loadProfile);
	btnDelete.addEventListener('click', deleteProfile);
	refresh();
})();
</script>

<script>
(function () {
	var pop = null;
	function closePop() { if (pop) { document.body.removeChild(pop); pop = null; } }
	function openPop(icon) {
		var src = document.getElementById(icon.getAttribute('data-info'));
		if (!src) { return; }
		var same = pop && pop.__icon === icon;
		closePop();
		if (same) { return; }
		pop = document.createElement('div');
		pop.className = 'nas-pop';
		pop.__icon = icon;
		pop.textContent = src.textContent.trim();
		document.body.appendChild(pop);
		var r = icon.getBoundingClientRect();
		var w = pop.offsetWidth, h = pop.offsetHeight;
		var left = Math.max(16, Math.min(r.left - 8, window.innerWidth - w - 16));
		// below the icon; above it if there is no room underneath
		var top = r.bottom + 8;
		if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) { top = r.top - h - 8; }
		pop.style.left = left + 'px';
		pop.style.top = top + 'px';
	}
	document.addEventListener('click', function (e) {
		var icon = e.target.closest ? e.target.closest('.nas-info') : null;
		if (icon) { openPop(icon); return; }
		if (pop && !pop.contains(e.target)) { closePop(); }
	});
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') { closePop(); return; }
		if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('nas-info')) { e.preventDefault(); openPop(e.target); }
	});
	window.addEventListener('scroll', closePop, true);
	window.addEventListener('resize', closePop);
})();
</script>

<script>
(function () {
	var box = document.getElementById('nas-download-status');
	if (!box) { return; }
	var autoStarted = <?= $downloadStarted ? 'true' : 'false' ?>;
	var flash = <?= json_encode($nasFlash) ?>;
	var flashError = <?= json_encode($nasFlashError) ?>;
	var flashBox = document.getElementById('nas-flash');
	if (flash && flashBox) {
		flashBox.textContent = flash;
		flashBox.style.display = 'block';
		setTimeout(function () { flashBox.style.display = 'none'; }, 5000);
	}
	if (flashError && window.nasNotice) { window.nasNotice('Download not started', flashError); }
	var bar = document.getElementById('nas-progress');
	var fill = document.getElementById('nas-progress-fill');
	var barText = document.getElementById('nas-progress-text');
	var cancelBtn = document.getElementById('nas-download-cancel');
	var spaceShown = false;
	var keepPolling = autoStarted; // a failed request must not end the polling while a download is running

	function fmt(bytes) {
		var units = ['B', 'KB', 'MB', 'GB', 'TB'], v = bytes, u = 0;
		while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
		return v.toFixed(u === 0 ? 0 : 1) + ' ' + units[u];
	}
	function showBar(on) {
		bar.style.display = on ? 'block' : 'none';
		cancelBtn.style.display = on ? 'block' : 'none';
		if (!on) { cancelBtn.disabled = false; cancelBtn.value = 'Cancel'; }
	}

	function refresh() {
		fetch('nas.php?download_status=1', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (st) {
			if (!st || st.message === undefined) { return; }
			keepPolling = !!st.running;
			if (st.running || autoStarted || st.filesTotal > 0) {
				box.style.display = 'block';
				var progress = st.filesTotal > 0 ? ' (' + st.filesDone + '/' + st.filesTotal + ' files)' : '';
				box.textContent = 'Download: ' + st.message + progress;
			}
			showBar(!!st.running);
			if (st.running) {
				var pct = st.bytesTotal > 0 ? Math.min(100, Math.round(st.bytesDone * 100 / st.bytesTotal)) : 0;
				fill.style.width = pct + '%';
				barText.textContent = st.bytesTotal > 0 ? fmt(st.bytesDone) + ' of ' + fmt(st.bytesTotal) + ' (' + pct + '%)' : 'Preparing...';
				setTimeout(refresh, 1000);
			} else if (st.spaceError && autoStarted && !spaceShown && window.nasNotice) {
				spaceShown = true;
				window.nasNotice('Not enough free space',
					'The selected folders need ' + fmt(st.spaceError.needed) + ', but only ' + fmt(st.spaceError.free) + ' are free on this MuPiBox (' + fmt(st.spaceError.reserve) + ' stay reserved for the system).',
					['The download was not started. Deselect some folders under "Download local" or free up space, then try again.']);
			}
		}).catch(function () { if (keepPolling) { setTimeout(refresh, 2000); } });
	}
	if (cancelBtn) {
		cancelBtn.addEventListener('click', function () {
			cancelBtn.disabled = true;
			cancelBtn.value = 'Cancelling...';
			fetch('nas.php?download_cancel=1', { method: 'POST' }).catch(function () {});
		});
	}
	refresh();
})();
</script>

<?php
include('includes/footer.php');
?>
