<?php
	$string = file_get_contents('/etc/mupibox/mupiboxconfig.json', true);
	$data = json_decode($string, true);
	
	$mupihat_file = '/tmp/mupihat.json';
	$mupihat_state = 0;

	$commandSSID="sudo iwgetid -r";
	$WIFI=exec($commandSSID);
	$commandLQ="sudo iwconfig wlan0 | awk '/Link Quality/{split($2,a,\"=|/\");print int((a[2]/a[3])*100)\"\"}' | tr -d '%'";
	$LINKQ=exec($commandLQ);
	if ($LINKQ >= 70) {
		$wifi_icon='<iconify-icon icon="material-symbols:wifi-sharp" title="SSID: ' . $WIFI . ' / Signal Quality: ' . $LINKQ . '%"></iconify-icon>';
	}
	elseif ($LINKQ >= 40) {
		$wifi_icon='<iconify-icon icon="material-symbols:wifi-2-bar-sharp" title="SSID: ' . $WIFI . ' / Signal Quality: ' . $LINKQ . '%"></iconify-icon>';
	}
	else {
		$wifi_icon='<iconify-icon icon="material-symbols:wifi-1-bar-sharp" title="SSID: ' . $WIFI . ' / Signal Quality: ' . $LINKQ . '%"></iconify-icon>';
	}
	

	if ($_GET['hshutdown']) {
		$shutdown = 1;
		}
	if ($_GET['hreboot']) {
		$reboot = 1;
		}
	
	if (file_exists($mupihat_file)) {
		$mupihat_state = 1;
		$string = file_get_contents($mupihat_file, true);
		$mupihat_data = json_decode($string, true);

		$bat_icon ='';
		if ($mupihat_data["Charger_Status"] != "Not Charging") {
			if ($mupihat_data["Bat_SOC"] == "100%") {
				$bat_icon = '<iconify-icon icon="mdi:battery-charging-100" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
			}
			elseif ($mupihat_data["Bat_SOC"] == "75%") {
				$bat_icon = '<iconify-icon icon="mdi:battery-charging-70" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
			}
			elseif ($mupihat_data["Bat_SOC"] == "50%") {
				$bat_icon = '<iconify-icon icon="mdi:battery-charging-50"> title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"</iconify-icon>';
			}
			elseif ($mupihat_data["Bat_SOC"] == "25%") {
				$bat_icon = '<iconify-icon icon="mdi:battery-charging-20" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
			}
			else {
				$bat_icon = '<iconify-icon icon="mdi:battery-charging-outline" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
			}
		}
		else {
			if ($mupihat_data["Bat_SOC"] == "100%") {
				$bat_icon = '<iconify-icon icon="mdi:battery" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
			}
			elseif ($mupihat_data["Bat_SOC"] == "75%") {
				$bat_icon = '<iconify-icon icon="mdi:battery-70" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
			}
			elseif ($mupihat_data["Bat_SOC"] == "50%") {
				$bat_icon = '<iconify-icon icon="mdi:battery-50" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
			}
			elseif ($mupihat_data["Bat_SOC"] == "25%") {
				$bat_icon = '<iconify-icon icon="mdi:battery-20" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
			}
			else {
				$bat_icon = '<iconify-icon icon="mdi:battery-outline" title="' . $mupihat_data["Charger_Status"] . " / " . $mupihat_data["Vbat"] . 'mV"></iconify-icon>';
			}
		}
	}
?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
	<head>
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.4.1/css/bootstrap.min.css">
		<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
		<script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.4.1/js/bootstrap.min.js"></script>
		<link rel="stylesheet" href="https://use.fontawesome.com/releases/v6.2.1/css/all.css">
		<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
		<title>MuPiBox Admin-Interface</title>
		<link rel="stylesheet" type="text/css" href="view.css?v=7.1.7" media="all">
		<script src="https://code.iconify.design/iconify-icon/2.0.0/iconify-icon.min.js"></script>
		<script type="text/javascript" src="view.js?v=6.0.0"></script>
		<script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
		<link rel="icon" type="image/x-icon" href="/images/favicon.ico">

	</head>
	<body id="main_body" >
		<img id="top" src="images/top.png" alt="">	
		<div id="container">
			<div class="controlnav" id="controlnav">
				<?php
					print $wifi_icon . $bat_icon;
				?>
				<a href="?hshutdown=1" onclick="return confirm('Do really want to shutdown?')"><iconify-icon icon="ic:outline-power-settings-new" title="Shutdown" ></iconify-icon></a>
				<a href="?hreboot=1" onclick="return confirm('Do really want to reboot?')"><iconify-icon icon="ic:outline-restart-alt" title="Reboot" ></iconify-icon></a>
			</div>
			<div class="topnav" id="myTopnav">
				<a href="index.php"><i class="fa fa-fw fa-home"></i> Home</a>
				<a href="content.php"><i class="fa-solid fa-music"></i> MuPiBox</a>				
<?php
	$command = "ps -ef | grep websockify | grep -v grep";
	exec($command, $vncoutput, $vncresult );
	if( $vncoutput[0] )
	{
		echo '				<a href="vnc.php"><i class="fa-solid fa-display"></i> VNC</a>';
	}
?>
				<a href="mupi.php"><i class="fa-solid fa-headphones"></i> MuPi-Conf</a>
				<a href="mupihat.php"><i class="fa-solid fa-hat-wizard"></i> MuPiHAT</a>
				<a href="media.php"><i class="fa-solid fa-list"></i> Media</a>
				<a href="cover.php"><i class="fa-regular fa-image"></i> Cover</a>
				<a href="bluetooth.php"><i class="fa-brands fa-bluetooth"></i> Bluetooth</a>
				<a href="spotify.php"><i class="fa-brands fa-spotify"></i> Spotify</a>
				<a href="network.php"><i class="fa-solid fa-wifi"></i> Network</a>
				<a href="smart.php"><i class="fa-solid fa-share-nodes"></i> Smart</a>
				<?php /*<a href="service.php"><i class="fa-solid fa-gear"></i> Services</a>
				<a href="tweaks.php"><i class="fa-solid fa-rocket"></i> Performance</a>*/ ?>
				<a href="/" onmouseover="javascript:event.target.port=5252" target="_blank"><i class="fa-brands fa-raspberry-pi"></i> DietPi-Dash</a>
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
		<p>The team continues to work on new functions, hardware expansions (MuPiHAT), optimizations and much more. We also offer you support in the Discord.</p>

       <p>Please honor the work and donate a small amount:</p>
       <ul>
         <li><a href="https://paypal.me/DonateMuPiBox" target="_blank">Paypal to paypal@MuPiBox.de</a></li>
      </ul>
	  <p><center><img src='/images/thank-you.jpg' width='300px' /></center></p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>