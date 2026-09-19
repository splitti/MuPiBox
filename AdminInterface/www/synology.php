<?php

$backendBase = 'http://localhost:8200/api/synology';

// Progress of a running "Download selected" (polled by the page below). Answers
// before header.php so that no HTML is sent along with the JSON.
if (isset($_GET['download_status'])) {
	header('Content-Type: application/json');
	echo json_encode(synologyApiCall("$backendBase/download/status", 'GET', null, 5));
	exit;
}

// Children of one folder for the tree view (loaded when a folder is expanded).
if (isset($_GET['browse'])) {
	header('Content-Type: application/json');
	echo json_encode(synologyApiCall("$backendBase/browse?path=" . urlencode($_GET['browse']), 'GET', null, 15));
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
	$CHANGE_TXT = $CHANGE_TXT . "<li>NAS folder selection saved</li>";
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

// The real NAS session lives in the backend (it can also silently
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

<div class="description" style="padding-left:25px;">
	<h2>NAS</h2>
	<p>Connect a NAS (Synology, QNAP, TrueNAS, ... - anything with a WebDAV server) as an additional media source. Enable WebDAV on the NAS first (Synology: package "WebDAV Server", ports 5005 http / 5006 https). Mark folders as "artist" (checkbox) to make them show up in the NAS tab on the MuPiBox - live, with no separate media update needed.</p>
</div>

<?php if (!$isLoggedIn) { ?>
	<form class="appnitro" method="post" action="synology.php" id="form">
		<ul>
			<li id="li_1">
				<label class="description" for="synology_address">Address incl. WebDAV port (e.g. 192.168.1.25:5006)</label>
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
			<input type="hidden" name="shown_folders" id="shown_folders" value="[]" />
			<ul>
				<?php if ($browseError) { ?>
					<li id="li_1"><p style="color:#900;"><?= htmlspecialchars($browseError) ?></p></li>
				<?php } ?>
				<li id="li_1">
					<style>
						#nas-tree { font-family: "Segoe UI", Tahoma, sans-serif; font-size: 15px; color: #1a1a1a; max-width: 720px; }
						.nas-head, .nas-row { display: flex; align-items: center; }
						.nas-head { height: 110px; align-items: flex-end; border-bottom: 1px solid #e0e0e0; margin-bottom: 4px; }
						.nas-cb { flex: 0 0 34px; text-align: center; }
						.nas-cb input { margin: 0; }
						.nas-head .nas-cb { display: flex; justify-content: center; }
						.nas-head .nas-cb span { display: inline-block; position: relative; left: 2px; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; line-height: 13px; padding-bottom: 4px; }
						.nas-row { height: 28px; border-radius: 3px; cursor: default; }
						.nas-row:hover { background: #e5f3ff; }
						/* The admin theme pads every div inside forms by 8px at the bottom - reset it so the row content sits centered in the row. */
						#nas-tree .nas-row, #nas-tree .nas-row div, #nas-tree .nas-row span, #nas-tree .nas-row i { padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; line-height: 1.2; }
						.nas-name { display: flex; align-items: center; flex: 1; min-width: 0; margin-left: 20px; }
						.nas-chevron { flex: 0 0 22px; text-align: center; color: #777; cursor: pointer; font-size: 11px; transition: transform .12s; user-select: none; }
						.nas-chevron.open { transform: rotate(90deg); }
						.nas-chevron.empty { visibility: hidden; }
						.nas-chevron:hover { color: #000; }
						.nas-folder { color: #f0c04a; margin: 0 8px 0 2px; font-size: 16px; }
						.nas-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
						.nas-done { color: #2a9d3f; margin-left: 8px; font-size: 13px; }
						.nas-children { display: none; }
						.nas-children.open { display: block; }
						.nas-msg { color: #888; font-style: italic; padding: 3px 0; }
					</style>
					<div id="nas-tree">
						<div class="nas-head">
							<div class="nas-cb"><span>Show in Mupibox</span></div>
							<div class="nas-cb"><span>Download local</span></div>
							<div class="nas-name"><b>Folder</b></div>
						</div>
						<div id="nas-root"></div>
					</div>
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
	<p style="padding-left:25px;"><a href="synology.php?relogin=1">Use a different NAS login</a></p>
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
		var row = document.createElement('div');
		row.className = 'nas-row';
		row.appendChild(checkbox('artist_folders[]', entry, entry.isMarked, 'Import artist'));
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
			if (loadedOnce) { return Promise.resolve(); }
			loadedOnce = true;
			var msg = document.createElement('div');
			msg.className = 'nas-msg';
			msg.style.paddingLeft = ((depth + 1) * 22 + 90) + 'px';
			msg.textContent = 'Loading...';
			children.appendChild(msg);
			return fetch('synology.php?browse=' + encodeURIComponent(entry.path), { cache: 'no-store' })
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
					return chain;
				})
				.catch(function () {
					msg.textContent = 'Could not load this folder.';
					if (!msg.parentNode) { children.appendChild(msg); }
					loadedOnce = false;
				});
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
