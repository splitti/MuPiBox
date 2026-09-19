<?php

$backendBase = 'http://localhost:8200/api/synology';

// Progress of a running "Download selected" (polled by the page below). Answers
// before header.php so that no HTML is sent along with the JSON.
if (isset($_GET['download_status'])) {
	header('Content-Type: application/json');
	echo json_encode(synologyApiCall("$backendBase/download/status", 'GET', null, 5));
	exit;
}

include('includes/header.php');

function synologyApiCall($url, $method = 'GET', $body = null, $timeout = 30) {
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

if (isset($_POST['synology_signin'])) {
	$address = trim($_POST['synology_address'] ?? '');
	$account = trim($_POST['synology_account'] ?? '');
	$password = $_POST['synology_password'] ?? '';
	$useHttps = isset($_POST['synology_https']);
	$rememberMe = isset($_POST['synology_remember']);

	$result = synologyApiCall("$backendBase/login", 'POST', array(
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

$downloadStarted = false;

if (isset($_POST['synology_save_selection']) || isset($_POST['synology_download_selected'])) {
	$checkedShow = $_POST['artist_folders'] ?? array();
	$checkedDownload = $_POST['download_folders'] ?? array();
	$shown = json_decode($_POST['shown_folders'] ?? '[]', true) ?? array();
	foreach ($shown as $shownPath) {
		synologyApiCall("$backendBase/mark", 'POST', array(
			'path' => $shownPath, 'marked' => in_array($shownPath, $checkedShow, true), 'list' => 'artist'), 10);
		synologyApiCall("$backendBase/mark", 'POST', array(
			'path' => $shownPath, 'marked' => in_array($shownPath, $checkedDownload, true), 'list' => 'download'), 10);
	}
	$CHANGE_TXT = $CHANGE_TXT . "<li>Synology folder selection saved</li>";
	$change = 1;

	if (isset($_POST['synology_download_selected'])) {
		$syncResult = synologyApiCall("$backendBase/download/sync", 'POST', new stdClass(), 10);
		if (!empty($syncResult['success'])) {
			$downloadStarted = true;
			$CHANGE_TXT = $CHANGE_TXT . "<li>Download of the selected folders started - progress is shown on this page</li>";
		} else {
			$CHANGE_TXT = $CHANGE_TXT . "<li>" . htmlspecialchars($syncResult['error'] ?? 'Could not start the download.') . "</li>";
		}
	}
}

// The real Synology session lives in the backend (it can also silently
// re-login using remembered credentials), so PHP never tracks "logged in"
// state itself - it just asks the backend on every page load. "Change login"
// forces the login form to show even if the backend still has a session.
$forceLogin = isset($_GET['relogin']);
$currentPath = isset($_GET['path']) ? $_GET['path'] : '';

$isLoggedIn = false;
$browseEntries = array();
$browseError = '';

if (!$forceLogin) {
	$browseResult = synologyApiCall("$backendBase/browse?path=" . urlencode($currentPath), 'GET', null, 15);
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

<div class="description">
	<h2>Synology NAS</h2>
	<p>Connect a Synology NAS as an additional media source. Mark folders as "artist" (checkbox) to make them show up in the NAS tab on the MuPiBox - live, with no separate media update needed.</p>
</div>

<?php if (!$isLoggedIn) { ?>
	<form class="appnitro" method="post" action="synology.php" id="form">
		<ul>
			<li id="li_1">
				<label class="description" for="synology_address">Address or QuickConnect ID</label>
				<div>
					<input id="synology_address" name="synology_address" class="element text large" type="text" maxlength="255" value="" />
				</div>
			</li>
			<li id="li_1">
				<label class="description" for="synology_account">Account</label>
				<div>
					<input id="synology_account" name="synology_account" class="element text large" type="text" maxlength="255" value="" />
				</div>
			</li>
			<li id="li_1">
				<label class="description" for="synology_password">Password</label>
				<div>
					<input id="synology_password" name="synology_password" class="element text large" type="password" maxlength="255" value="" />
				</div>
			</li>
			<li id="li_1">
				<label class="description" for="synology_https">HTTPS</label>
				<div>
					<input id="synology_https" name="synology_https" type="checkbox" value="1" />
				</div>
			</li>
			<li id="li_1">
				<label class="description" for="synology_remember">Remember me</label>
				<div>
					<input id="synology_remember" name="synology_remember" type="checkbox" value="1" checked="checked" />
				</div>
			</li>
			<?php if ($loginError) { ?>
				<li id="li_1"><p style="color:#900;"><?= htmlspecialchars($loginError) ?></p></li>
			<?php } ?>
			<li class="buttons">
				<p><small>Signing in can take up to ~15 seconds.</small></p>
				<input id="saveForm" class="button_text" type="submit" name="synology_signin" value="Sign In" />
			</li>
		</ul>
	</form>
<?php } else { ?>
	<form class="appnitro" method="post" action="synology.php" id="form">
		<input type="hidden" name="shown_folders" value='<?= htmlspecialchars(json_encode(array_column($browseEntries, 'path'))) ?>' />
		<ul>
			<?php if ($browseError) { ?>
				<li id="li_1"><p style="color:#900;"><?= htmlspecialchars($browseError) ?></p></li>
			<?php } ?>
			<li id="li_1">
				<h3>
					<a href="synology.php?path=">Home</a>
					<?php
					$parts = array_values(array_filter(explode('/', $currentPath)));
					$accum = '';
					foreach ($parts as $part) {
						$accum .= '/' . $part;
						echo ' / <a href="synology.php?path=' . urlencode($accum) . '">' . htmlspecialchars($part) . '</a>';
					}
					?>
				</h3>
			</li>
			<?php if ($currentPath !== '') {
				$parentParts = $parts;
				array_pop($parentParts);
				$parentPath = count($parentParts) > 0 ? '/' . implode('/', $parentParts) : '';
			?>
				<li id="li_1"><a href="synology.php?path=<?= urlencode($parentPath) ?>">.. (up)</a></li>
			<?php } ?>
			<li id="li_1">
				<table style="width:auto; border-collapse:collapse;">
					<thead>
						<tr style="text-align:left;">
							<th style="padding:4px 16px 4px 0; vertical-align:bottom;"><span style="display:inline-block; writing-mode:vertical-rl; transform:rotate(180deg); white-space:nowrap; line-height:13px;">Show in Mupibox</span></th>
							<th style="padding:4px 16px 4px 0; vertical-align:bottom;"><span style="display:inline-block; writing-mode:vertical-rl; transform:rotate(180deg); white-space:nowrap; line-height:13px;">Download local</span></th>
							<th style="padding:4px 0; vertical-align:bottom;">Folder</th>
						</tr>
					</thead>
					<tbody>
					<?php foreach ($browseEntries as $entry) { ?>
						<tr>
							<td style="padding:3px 16px 3px 0;">
								<input type="checkbox" name="artist_folders[]" value="<?= htmlspecialchars($entry['path']) ?>" title="Import artist" <?= !empty($entry['isMarked']) ? 'checked="checked"' : '' ?> />
							</td>
							<td style="padding:3px 16px 3px 0;">
								<input type="checkbox" name="download_folders[]" value="<?= htmlspecialchars($entry['path']) ?>" title="Download local" <?= !empty($entry['isDownload']) ? 'checked="checked"' : '' ?> />
							</td>
							<td style="padding:3px 0;">
								<i class="fa-solid fa-folder"></i>
								<a href="synology.php?path=<?= urlencode($entry['path']) ?>"><?= htmlspecialchars($entry['name']) ?></a>
								<?php if (!empty($entry['isDownloaded'])) { ?><i class="fa-solid fa-circle-check" title="Downloaded"></i><?php } ?>
							</td>
						</tr>
					<?php } ?>
					</tbody>
				</table>
			</li>
			<?php if (count($browseEntries) === 0 && !$browseError) { ?>
				<li id="li_1"><p>No subfolders here.</p></li>
			<?php } ?>
			<li id="li_1">
				<div id="nas-download-status" style="display:none;"></div>
			</li>
			<li class="buttons">
				<input class="button_text" type="button" value="Select all" onclick="document.querySelectorAll('input[name=\'artist_folders[]\']').forEach(function (box) { box.checked = true; });" />
				<input class="button_text" type="button" value="Unselect all" onclick="document.querySelectorAll('input[name=\'artist_folders[]\']').forEach(function (box) { box.checked = false; });" />
				<input id="saveForm" class="button_text" type="submit" name="synology_save_selection" value="Save selection" />
			</li>
			<li class="buttons">
				<input class="button_text" type="button" value="Select all downloads" onclick="document.querySelectorAll('input[name=\'download_folders[]\']').forEach(function (box) { box.checked = true; });" />
				<input class="button_text" type="button" value="Unselect all downloads" onclick="document.querySelectorAll('input[name=\'download_folders[]\']').forEach(function (box) { box.checked = false; });" />
				<input class="button_text" type="submit" name="synology_download_selected" value="Download selected" onclick="return confirm('Download the checked folders to the MuPiBox and delete local copies of unchecked ones?');" />
			</li>
		</ul>
	</form>
	<p><a href="synology.php?relogin=1">Use a different NAS login</a></p>
<?php } ?>

<script>
(function () {
	var box = document.getElementById('nas-download-status');
	if (!box) { return; }
	var autoStarted = <?= $downloadStarted ? 'true' : 'false' ?>;

	function refresh() {
		fetch('synology.php?download_status=1').then(function (r) { return r.json(); }).then(function (st) {
			if (!st || st.message === undefined) { return; }
			if (st.running || autoStarted || st.filesTotal > 0) {
				box.style.display = 'block';
				var progress = st.filesTotal > 0 ? ' (' + st.filesDone + '/' + st.filesTotal + ' files)' : '';
				box.textContent = 'Download: ' + st.message + progress;
			}
			if (st.running) { setTimeout(refresh, 2000); }
		}).catch(function () {});
	}
	refresh();
})();
</script>

<?php
include('includes/footer.php');
?>
