<?php
	// Online covers (NAS and local albums without a picture) are kept by the backend. The page shows them through
	// this proxy, so they load on an https admin page too. Answers before header.php: an image, no HTML.
	$ocBackend = 'http://localhost:8200/api';
	if (isset($_GET['online_cover'])) {
		require __DIR__ . '/includes/auth_check.php';
		$ocFile = (string)$_GET['online_cover'];
		if (!preg_match('/^[a-f0-9]{40}\.jpg$/', $ocFile)) {
			http_response_code(400);
			exit;
		}
		$ch = curl_init("$ocBackend/online-cover/$ocFile");
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_TIMEOUT, 10);
		$ocImage = curl_exec($ch);
		$ocStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		curl_close($ch);
		if ($ocImage === false || $ocStatus !== 200) {
			http_response_code(404);
			exit;
		}
		header('Content-Type: image/jpeg');
		header('Cache-Control: private, max-age=86400');
		echo $ocImage;
		exit;
	}

	function ocApiCall($url, $body = null) {
		$ch = curl_init($url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_TIMEOUT, 10);
		if ($body !== null) {
			curl_setopt($ch, CURLOPT_POST, true);
			curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
			curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
		}
		$response = curl_exec($ch);
		curl_close($ch);
		$decoded = $response === false ? null : json_decode($response, true);
		return is_array($decoded) ? $decoded : array('success' => false);
	}

	include ('includes/header.php');

	if (isset($_POST['online_covers_save'])) {
		$ocSaveBefore = (($data['mupibox']['onlineCoversSave'] ?? false) === true);
		$ocOnBefore = (($data['mupibox']['onlineCovers'] ?? false) === true);
		$data['mupibox']['onlineCovers'] = isset($_POST['onlineCovers']);
		$data['mupibox']['onlineCoversSave'] = isset($_POST['onlineCoversSave']);
		$ocError = '';
		if (save_mupiboxconfig($data, $ocError)) {
			$CHANGE_TXT = $CHANGE_TXT . "<li>Online covers " . ($data['mupibox']['onlineCovers'] ? 'switched on' : 'switched off') . "</li>";
			$CHANGE_TXT = $CHANGE_TXT . "<li>Saving them into the album folders " . ($data['mupibox']['onlineCoversSave'] ? 'switched on' : 'switched off') . "</li>";
			if ($data['mupibox']['onlineCoversSave'] && !$ocSaveBefore) {
				// switched on: the covers found so far are stored too (the backend sees the new setting a moment later)
				sleep(1);
				$ocResult = ocApiCall("$ocBackend/online-covers/save-all", new stdClass());
				if (!empty($ocResult['success'])) {
					$CHANGE_TXT = $CHANGE_TXT . "<li>" . (int)($ocResult['queued'] ?? 0) . " covers found so far are being stored in their album folders.</li>";
				}
			}
			if ($data['mupibox']['onlineCovers'] && !$ocOnBefore) {
				// switched on: all albums are looked up, not only the ones shown on the box
				sleep(1);
				ocApiCall("$ocBackend/online-covers/scan", new stdClass());
				$CHANGE_TXT = $CHANGE_TXT . "<li>All albums without a picture are being looked up in the background.</li>";
			}
		} else {
			$CHANGE_TXT = $CHANGE_TXT . "<li>ERROR: the setting could not be saved: " . htmlspecialchars($ocError) . "</li>";
		}
		$change = 1;
	}
	if (isset($_POST['online_cover_reject'])) {
		$ocResult = ocApiCall("$ocBackend/online-covers/reject", array('key' => (string)($_POST['online_cover_key'] ?? '')));
		$CHANGE_TXT = $CHANGE_TXT . (!empty($ocResult['success']) ? "<li>Cover discarded - this album is not looked up again.</li>" : "<li>ERROR: the cover could not be discarded.</li>");
		$change = 1;
	}
	if (isset($_POST['online_covers_save_all'])) {
		$ocResult = ocApiCall("$ocBackend/online-covers/save-all", new stdClass());
		$CHANGE_TXT = $CHANGE_TXT . (!empty($ocResult['success'])
			? "<li>" . (int)($ocResult['queued'] ?? 0) . " covers are being stored in their album folders. Reload this page in a moment to see the result.</li>"
			: "<li>ERROR: " . htmlspecialchars((string)($ocResult['error'] ?? 'the MuPiBox backend could not be reached.')) . "</li>");
		$change = 1;
	}
	if (isset($_POST['online_covers_retry'])) {
		$ocResult = ocApiCall("$ocBackend/online-covers/retry", array('alsoRejected' => isset($_POST['online_covers_retry_rejected'])));
		if (!empty($ocResult['success'])) ocApiCall("$ocBackend/online-covers/scan", new stdClass());
		$CHANGE_TXT = $CHANGE_TXT . (!empty($ocResult['success'])
			? "<li>" . (int)($ocResult['cleared'] ?? 0) . " albums are looked up again now, in the background (one after the other - with many albums this takes a while).</li>"
			: "<li>ERROR: the MuPiBox backend could not be reached.</li>");
		$change = 1;
	}
	if (isset($_POST['online_covers_scan'])) {
		$ocResult = ocApiCall("$ocBackend/online-covers/scan", new stdClass());
		$CHANGE_TXT = $CHANGE_TXT . (!empty($ocResult['success'])
			? "<li>All albums without a picture are being looked up in the background. Reload this page later to see the covers found.</li>"
			: "<li>ERROR: " . htmlspecialchars((string)($ocResult['error'] ?? 'the MuPiBox backend could not be reached.')) . "</li>");
		$change = 1;
	}

	if( $_POST['deleteimage'] )
		{
		// `sudo rm /var/www/cover/$image` ran as root, with $image straight
		// from POST. POSTing image=../../etc/mupibox/mupiboxconfig.json
		// would happily wipe the box's config. basename() collapses any
		// path components, and a name whitelist (only filename-safe chars)
		// rejects shell metacharacters before escapeshellarg.
		$rawName = basename($_POST['image'] ?? '');
		if (!preg_match('/^[A-Za-z0-9._-]+$/', $rawName)) {
			$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: invalid image filename, refused</li>";
			$change=1;
		} else {
			$file2delete = "/var/www/cover/" . $rawName;
			exec("sudo rm " . escapeshellarg($file2delete));
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>Image " . htmlspecialchars($file2delete) . " deleted!</li>";
		}
		}
	if( $_POST['submitfile'] )
		{
		$target_dir = "/var/www/cover/";
		// M10: same filename whitelist as the deleteimage branch. basename()
		// alone strips path components but happily passes "<", quotes, "&",
		// spaces and unicode lookalikes — those land in the file listing
		// below and (without htmlspecialchars there) inject into the <img>
		// tag rendered for every admin who loads cover.php afterwards.
		// Reject anything that isn't filename-safe ASCII before we even
		// look at the bytes.
		$rawName = basename($_FILES["fileToUpload"]["name"] ?? '');
		$uploadOk = 1;
		if (!preg_match('/^[A-Za-z0-9._-]+\.(jpe?g|png|gif|webp)$/i', $rawName)) {
			$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: invalid image filename. Use letters, digits, dot, underscore, dash only, with .jpg/.jpeg/.png/.gif/.webp extension.</li>";
			$uploadOk = 0;
		}
		$target_file = $target_dir . $rawName;

		if ($uploadOk && is_file($target_file)) {
			$CHANGE_TXT=$CHANGE_TXT."<li>There is already an image with this name! This file will be overwritten!</li>";
		}

		// never assume the upload succeeded
		if ($_FILES["fileToUpload"]["error"] !== UPLOAD_ERR_OK) {
			$CHANGE_TXT=$CHANGE_TXT."<li>Upload failed with error code " . $_FILES["fileToUpload"]["tmp_name"] . "</li>";
			$uploadOk = 0;
		}

		$info = getimagesize($_FILES["fileToUpload"]["tmp_name"]);
		if ($info === FALSE) {
			$CHANGE_TXT=$CHANGE_TXT."<li>Unable to determine image type of uploaded file. Please upload an image of type jpeg, png, gif or svg.</li>";
			$uploadOk = 0;
		}
		
		if (($info[2] !== IMAGETYPE_GIF) && ($info[2] !== IMAGETYPE_JPEG) && ($info[2] !== IMAGETYPE_PNG) && ($info[2] !== IMAGETYPE_WEBP)) {
			$CHANGE_TXT=$CHANGE_TXT."<li>Wrong file-type. Please upload an image of type jpeg, webp, png or gif.</li>";
			$uploadOk = 0;
			}

		if (($info[0] / $info[1]) != 1) {
			$CHANGE_TXT=$CHANGE_TXT."<li>The image format must be square, like 650X650px.</li>";
			$uploadOk = 0;
            }
		
		if ($info[0] < 300) {
			$CHANGE_TXT=$CHANGE_TXT."<li>The image size must be at least 300X300px and at most 1200X1200px.</li>";
			$uploadOk = 0;
            }
		
		if ($info[0] > 1200) {
			$CHANGE_TXT=$CHANGE_TXT."<li>The image size must be at least 300X300px and at most 1200X1200px.</li>";
			$uploadOk = 0;
            }


		// Check if $uploadOk is set to 0 by an error
		if ($uploadOk != 0)
			{
			exec("sudo chmod -R 755 /home/dietpi/MuPiBox/media/cover; sudo chown -R www-data:www-data /home/dietpi/MuPiBox/media/cover");
			if (move_uploaded_file($_FILES["fileToUpload"]["tmp_name"], $target_file))
				{
				$change=1;
				$CHANGE_TXT=$CHANGE_TXT."<li>Image upload completed!</li>";
				}
			else
				{
				$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: Error on uploading image!</li>";
				}
			}
		else
			{
				$change=1;
				$CHANGE_TXT=$CHANGE_TXT."<li>Image upload cancled!</li>";			
			}
		}
	$CHANGE_TXT = $CHANGE_TXT . "</ul></div>";
?>
<form class="appnitro" method="post" action="cover.php" id="form" enctype="multipart/form-data">
	<div class="description">
	<h2>Cover</h2>
	<p>Upload square formatted images. Copy the URL and paste it to Radiostream-URLs. Supported filetypes are: JPG/JPEG | WEBP | GIF | PNG</p>
	</div>
	<ul>

		<li class="li_norm"><h2>Upload Image</h2>
			<input type="file" class="button_text_upload" name="fileToUpload" id="fileToUpload">
			<input type="submit" class="button_text" value="Upload Image" name="submitfile" >
		</li>
	</ul>
</form>

<?php
	$ocEnabled = (($data['mupibox']['onlineCovers'] ?? false) === true);
	$ocList = ocApiCall("$ocBackend/online-covers");
	$ocEntries = is_array($ocList['entries'] ?? null) ? $ocList['entries'] : array();
	$ocPending = (int)($ocList['pending'] ?? 0);
	$ocScanning = !empty($ocList['scanning']);
	$ocSaveEnabled = (($data['mupibox']['onlineCoversSave'] ?? false) === true);
	$ocCount = array('found' => 0, 'none' => 0, 'rejected' => 0);
	$ocSavedCount = 0;
	$ocDeniedCount = 0;
	foreach ($ocEntries as $ocEntry) {
		$ocStatus = $ocEntry['status'] ?? '';
		if (isset($ocCount[$ocStatus])) $ocCount[$ocStatus]++;
		if ($ocStatus === 'found' && in_array($ocEntry['savedTo'] ?? '', array('nas', 'local'), true)) $ocSavedCount++;
		if ($ocStatus === 'found' && ($ocEntry['savedTo'] ?? '') === 'denied') $ocDeniedCount++;
	}
?>
<form class="appnitro" method="post" action="cover.php">
	<ul>
		<li class="li_norm"><h2>Online covers for NAS and local albums</h2>
			<p>Albums on the NAS or on the box without a picture of their own get their cover from iTunes or Deezer.
			A cover is only taken when title and episode number or series clearly match, otherwise the album keeps
			the picture of the folder above. All albums on the NAS (the folders shown in the MuPiBox) and on the box are
			looked up in the background, one after the other - when switched on, a few minutes after every start and
			once a day for new folders. The folder names are sent to Apple and Deezer for this.</p>
			<label class="labelchecked" for="onlineCovers">Look up covers online:&nbsp; &nbsp;
				<input type="checkbox" id="onlineCovers" name="onlineCovers" value="1" <?= $ocEnabled ? 'checked="checked"' : '' ?> />
			</label>
			<label class="labelchecked" for="onlineCoversSave">Also save them as cover.jpg in the album folder:&nbsp; &nbsp;
				<input type="checkbox" id="onlineCoversSave" name="onlineCoversSave" value="1" <?= $ocSaveEnabled ? 'checked="checked"' : '' ?> />
			</label>
			<p><small>Only into folders without any picture, an existing file is never replaced. On the NAS this needs write
			permission for the MuPiBox account on that shared folder; without it the cover stays on the box only.
			Discarding a cover removes the cover.jpg the box stored.</small></p>
			<input type="submit" class="button_text" value="Save" name="online_covers_save">
			<p>Found: <?= $ocCount['found'] ?> &nbsp;|&nbsp; No match: <?= $ocCount['none'] ?> &nbsp;|&nbsp; Discarded: <?= $ocCount['rejected'] ?><?= ($ocPending > 0 || $ocScanning) ? ' &nbsp;|&nbsp; <b>Still to look up: ' . $ocPending . ($ocScanning ? ' (reading folders ...)' : '') . '</b>' : '' ?></p>
		</li>
		<li class="li_norm">
			<label class="labelchecked" for="online_covers_retry_rejected">Also discarded ones:&nbsp;
				<input type="checkbox" id="online_covers_retry_rejected" name="online_covers_retry_rejected" value="1" />
			</label>
			<input type="submit" class="button_text" value="Look up albums without a match again" name="online_covers_retry">
		</li>
		<?php if ($ocEnabled) { ?>
		<li class="li_norm">
			<input type="submit" class="button_text" value="Search all albums now" name="online_covers_scan">
		</li>
		<?php } ?>
		<?php if ($ocSaveEnabled && $ocCount['found'] > $ocSavedCount) { ?>
		<li class="li_norm">
			<p>Stored in the album folder: <?= $ocSavedCount ?> of <?= $ocCount['found'] ?><?= $ocDeniedCount > 0 ? ' &nbsp;|&nbsp; NAS without write permission: ' . $ocDeniedCount : '' ?></p>
			<input type="submit" class="button_text" value="Store the other found covers now" name="online_covers_save_all">
		</li>
		<?php } ?>
	</ul>
</form>
<?php
	if ($ocCount['found'] > 0) {
		print "<div style='margin:30px;'>";
		foreach ($ocEntries as $ocEntry) {
			if (($ocEntry['status'] ?? '') !== 'found' || !preg_match('/^[a-f0-9]{40}\.jpg$/', (string)($ocEntry['file'] ?? ''))) continue;
			$ocKey = (string)($ocEntry['key'] ?? '');
			$ocWhere = strpos($ocKey, 'nas:') === 0 ? 'NAS' : 'local';
			$ocSource = ($ocEntry['source'] ?? '') === 'itunes' ? 'iTunes' : 'Deezer';
			print "<div style='display:inline-block;vertical-align:top;width:200px;margin:0 15px 20px 0;' align='center'>";
			print "<form method=\"post\" action=\"cover.php\">";
			print "<img src='cover.php?online_cover=" . $ocEntry['file'] . "' style='width:180px;height:180px;object-fit:cover;' loading='lazy' alt=''>";
			print "<p style='margin:4px 0;'><b>" . htmlspecialchars((string)($ocEntry['album'] ?? '')) . "</b><br>";
			print "<small>" . $ocWhere . ": " . htmlspecialchars((string)($ocEntry['series'] ?? '')) . "<br>";
			print $ocSource . ": " . htmlspecialchars((string)($ocEntry['matchedArtist'] ?? '')) . " - " . htmlspecialchars((string)($ocEntry['matchedTitle'] ?? '')) . "</small>";
			if (($ocEntry['reason'] ?? '') === 'notSquare') print "<br><small style='color:#555;'>shown instead of the album's own picture (not square, e.g. a scanned cassette inlay) - discard to get that back</small>";
			$ocSaved = (string)($ocEntry['savedTo'] ?? '');
			if ($ocSaved === 'nas' || $ocSaved === 'local') print "<br><small style='color:#2a7a3a;'>&#10003; stored as cover.jpg in the album folder</small>";
			elseif ($ocSaved === 'denied') print "<br><small style='color:#a05a00;'>no write permission - kept on the box only</small>";
			print "</p>";
			print "<input type=\"hidden\" name=\"online_cover_key\" value=\"" . htmlspecialchars($ocKey, ENT_QUOTES) . "\">";
			print "<input type=\"submit\" class=\"button_text\" value=\"Discard (wrong cover)\" name=\"online_cover_reject\">";
			print "</form></div>";
		}
		print "</div>";
	}
?>


<?php

	$files = glob('/var/www/cover/*.{jpeg,jpg,png,gif,webp}', GLOB_BRACE);
	print "<div style='margin:30px;'>";
	// M10 defence-in-depth: escape every basename and the host into HTML
	// attribute context. The upload branch now rejects unsafe names, but
	// older files from before this patch may still live on disk — escape
	// at render time so legacy data can't break out of the attributes.
	$hostHtml = htmlspecialchars($data["mupibox"]["host"] ?? '', ENT_QUOTES);
	foreach($files as $file) {
		$name = basename($file);
		$nameHtml = htmlspecialchars($name, ENT_QUOTES);
		$nameUrl = rawurlencode($name);
		print "<div style='float: left;margin-right:15px;margin-top:10px;margin-bottom:15px;' align='center'>";
		print "<form method=\"post\" action=\"cover.php\" id=\"form\" enctype=\"multipart/form-data\">";
		print "<img src='/cover/".$nameUrl."' style='max-width:280px;'>";
		print "<br>";
		print "<p>URL: <a href='http://".$hostHtml."/cover/".$nameUrl."' target='_blank'>http://".$hostHtml."/cover/".$nameHtml."</a>";
		print "<input type=\"hidden\" name=\"image\" value=\"".$nameHtml."\">";
		print "<br><input type=\"submit\" class=\"button_text\" value=\"Delete Image\" name=\"deleteimage\" ></p>";
		print "</form></div>";
	}
	print "</div>";
	
?>

<?php
 include ('includes/footer.php');
?>
