<?php
	$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";

	include ('includes/header.php');
 
	if( $_POST['submitfile'] )
		{
		$target_dir = "/var/www/cover/";
		#$target_file = $target_dir . basename($_FILES["fileToUpload"]["name"]);
		$uploadOk = 1;
		$FileType = strtolower(pathinfo($target_file,PATHINFO_EXTENSION));
		// never assume the upload succeeded
		if ($_FILES["fileToUpload"]["error"] !== UPLOAD_ERR_OK) {
		   die("Upload failed with error code " . $_FILES["fileToUpload"]["tmp_name"]);
		}

		$info = getimagesize($_FILES["fileToUpload"]["tmp_name"]);
		if ($info === FALSE) {
			$CHANGE_TXT=$CHANGE_TXT."<li>Unable to determine image type of uploaded file. Please upload an image of type jpeg, png, gif or svg.</li>";
			$uploadOk = 0;
		}

		if (($info[2] !== IMAGETYPE_GIF) && ($info[2] !== IMAGETYPE_JPEG) && ($info[2] !== IMAGETYPE_PNG)) {
			$CHANGE_TXT=$CHANGE_TXT."<li>Wrong file-type. Please upload an image of type jpeg, png, gif or svg.</li>";
			$uploadOk = 0;

		}
		// Allow zip file format
		/*if($FileType != "jpg" )
			{
			$uploadOk = 0;
			}*/
		// Check if $uploadOk is set to 0 by an error
		if ($uploadOk == 0)
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>The upload was aborted!</li>";
			$change=0;
			}
		else
			{
			if (move_uploaded_file($_FILES["fileToUpload"]["tmp_name"], $target_file))
				{
				#$command = "sudo unzip -o -a '".$target_file."' -d / >> /tmp/restore.log";
				#$command = "sudo su - -c \"unzip -o -a '".$target_file."' -d / >> /tmp/restore.log && sleep 1\"";
				#$command = "sudo su - -c 'tar xvzf ".$target_file." >> /tmp/restore.log'";
				#exec($command, $output, $result );
				#$command = "sudo rm '".$target_file."'";
				#exec($command, $output, $result );
				#$change=1;
				$CHANGE_TXT=$CHANGE_TXT."<li>Image upload completed!</li>";
				}
			else
				{
				$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: Error on uploading image!</li>";
				}
			}
		}
?>
<form class="appnitro" method="post" action="images.php" id="form"enctype="multipart/form-data">
	<div class="description">
	<h2>Cover-Images</h2>
	<p>Coming soon...</p>
	</div>
	<ul>

		<li class="li_norm"><h2>Upload Image</h2>
			<input type="file" class="button_text_upload" name="fileToUpload" id="fileToUpload">
			<input type="submit" class="button_text" value="Upload Image" name="submitfile" >
		</li>
	</ul>
</form>

<?php
 include ('includes/footer.php');
?>
