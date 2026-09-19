<?php

include('includes/header.php');

$backendBase = 'http://localhost:8200/api/synology';

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

if (isset($_POST['synology_save_selection'])) {
	$checked = $_POST['artist_folders'] ?? array();
	$shown = json_decode($_POST['shown_folders'] ?? '[]', true) ?? array();
	foreach ($shown as $shownPath) {
		$isChecked = in_array($shownPath, $checked, true);
		synologyApiCall("$backendBase/mark", 'POST', array('path' => $shownPath, 'marked' => $isChecked), 10);
	}
	$CHANGE_TXT = $CHANGE_TXT . "<li>Synology folder selection saved</li>";
	$change = 1;
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
			<?php foreach ($browseEntries as $entry) { ?>
				<li id="li_1">
					<input type="checkbox" name="artist_folders[]" value="<?= htmlspecialchars($entry['path']) ?>" title="Import artist" <?= !empty($entry['isMarked']) ? 'checked="checked"' : '' ?> />
					<i class="fa-solid fa-folder"></i>
					<a href="synology.php?path=<?= urlencode($entry['path']) ?>"><?= htmlspecialchars($entry['name']) ?></a>
				</li>
			<?php } ?>
			<?php if (count($browseEntries) === 0 && !$browseError) { ?>
				<li id="li_1"><p>No subfolders here.</p></li>
			<?php } ?>
			<li class="buttons">
				<input id="saveForm" class="button_text" type="submit" name="synology_save_selection" value="Save selection" />
			</li>
		</ul>
	</form>
	<p><a href="synology.php?relogin=1">Use a different NAS login</a></p>
<?php } ?>

<?php
include('includes/footer.php');
?>
