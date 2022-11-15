<?php
	$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";

	include ('includes/header.php');
 
	if( $_POST['submitfile'] )
		{
		$target_dir = "/var/www/cover/";
		$target_file = $target_dir . basename($_FILES["fileToUpload"]["name"]);
		$uploadOk = 1;
		//$FileType = strtolower(pathinfo($target_file,PATHINFO_EXTENSION));

		//if (is_file($target_file)) {
		//	$CHANGE_TXT=$CHANGE_TXT."<li>There is already an image with this name! This file will be overwritten!</li>";
		//}

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

		if (($info[2] !== IMAGETYPE_GIF) && ($info[2] !== IMAGETYPE_JPEG) && ($info[2] !== IMAGETYPE_PNG)) {
			$CHANGE_TXT=$CHANGE_TXT."<li>Wrong file-type. Please upload an image of type jpeg, png or gif.</li>";
			$uploadOk = 0;
			}

		// Check if $uploadOk is set to 0 by an error
		/*if ($uploadOk != 0)
			{
			if (move_uploaded_file($_FILES["fileToUpload"]["tmp_name"], $target_file))
				{
				$change=1;
				$CHANGE_TXT=$CHANGE_TXT."<li>Image upload completed!</li>";
				}
			else
				{
				$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: Error on uploading image!</li>";
				}
			}*/
		}
	$CHANGE_TXT=$CHANGE_TXT."</ul></div>";
?>
<form class="appnitro" method="post" action="cover.php" id="form"enctype="multipart/form-data">
	<div class="description">
	<h2>Cover</h2>
	<p>Coming soon...</p>
	</div>
	<ul>

		<li class="li_norm"><h2>Upload Image</h2>
			<input type="file" class="button_text_upload" name="fileToUpload" id="fileToUpload">
			<input type="submit" class="button_text" value="Upload Image" name="submitfile" >
		</li>


<?php

	$files = glob('/var/www/cover/*.{jpeg,jpg,png,gif}', GLOB_BRACE);
	foreach($files as $file) {
		print "<div style='float: left;margin-right:10px;margin-top:10px;margin-bottom:10px;'><img src='/cover/".basename($file)."' style='max-width:250px;'>";
		print "<br>";
		print "<p>URL: <a href='http://".$data["mupibox"]["host"]."/cover/".basename($file)."' target='_blank'>http://".$data["mupibox"]["host"]."/cover/".basename($file)."</a></p></div>";
	}

?>
	</ul>
</form>

<?php
 include ('includes/footer.php');
?>
