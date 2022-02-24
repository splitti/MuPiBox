<?php
	$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
	$data = json_decode($string, true);
?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>MuPiBox Admin Interface</title>
<link rel="stylesheet" type="text/css" href="view.css" media="all">
<script type="text/javascript" src="view.js"></script>
<link rel="icon" type="image/x-icon" href="/images/favicon.ico">
</head>
<body id="main_body" >

        <img id="top" src="images/top.png" alt="">
		    <div id="container">

                <div id="navbar"><a href="index.php">Information</a><a href="mupi.php">MuPiBox-Config</a><a href="spotify.php">Spotify-Config</a><a href=network.php">Network-Config</a><a href="service.php">Services</a><a href="http://<?php 
				print $data["mupibox"]["host"];
				?>:8200">MuPiBox</a></div>