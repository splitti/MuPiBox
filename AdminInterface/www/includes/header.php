<?php
	$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
	$data = json_decode($string, true);
?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
	<head>
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.4.1/css/bootstrap.min.css">
		<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
		<script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.4.1/js/bootstrap.min.js"></script>
		<link rel="stylesheet" href="https://use.fontawesome.com/releases/v6.0.0/css/all.css">
		<script type="text/javascript" src="view.js"></script>
		<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
		<title>MuPiBox Web Interface</title>
		<link rel="stylesheet" type="text/css" href="view.css" media="all">
		<script type="text/javascript" src="view.js"></script>
		<script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
		<link rel="icon" type="image/x-icon" href="/images/favicon.ico">
	</head>
	<body id="main_body" >
		<img id="top" src="images/top.png" alt="">
		<div id="container">
			<div class="topnav" id="myTopnav">
				<a href="index.php"><i class="fa fa-fw fa-home"></i> Home</a>
				<a href="content.php"><i class="fa-solid fa-music"></i> MuPiBox</a>
				<a href="mupi.php"><i class="fa-solid fa-headphones"></i> MuPi-Conf</a>
				<a href="media.php"><i class="fa-solid fa-list"></i> Media</a>
				<a href="cover.php"><i class="fa-regular fa-image"></i> Cover</a>
				<a href="bluetooth.php"><i class="fa-brands fa-bluetooth"></i> Bluetooth</a>
				<a href="spotify.php"><i class="fa-brands fa-spotify"></i> Spotify</a>
				<a href="network.php"><i class="fa-solid fa-wifi"></i> Network</a>
				<a href="service.php"><i class="fa-solid fa-gear"></i> Services</a>
				<a href="tweaks.php"><i class="fa-solid fa-rocket"></i> Performance</a>
				<a href="admin.php"><i class="fa-solid fa-screwdriver-wrench"></i> Admin</a>
				<a href="javascript:void(0);" class="icon" onclick="myFunction()"><i class="fa fa-bars"></i></a>
			</div>

<div class="modal fade" id="ModalCenter" tabindex="-1" role="dialog" aria-labelledby="ModalCenterTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title" id="exampleModalCenterTitle">Please Donate</h3>
      </div>
      <div class="modal-body">
       <p>The MuPiBox is an open source project and it should stay that way. Erik (nero) and Olaf (splitti) are constantly developing the box, putting a lot of love and energy into the project. The two also offer you support in Discord.</p>

       <p>Please honor the work and donate a small amount:</p>
       <ul>
         <li><a href="https://paypal.me/EGerhardt" target="_blank">Paypal to Erik (nero)</a></li>
         <li><a href="https://paypal.me/splittscheid" target="_blank">Paypal to Olaf (splitti)</a></li>
      </ul>
	  <p><center><img src='/images/thank-you.jpg' width='300px' /></center></p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>