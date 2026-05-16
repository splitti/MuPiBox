<?php
	include ('includes/header.php');

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
