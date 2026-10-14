<?php
	// MED-16: csrf_check() must run BEFORE any output, otherwise the 403
	// header can't be set. Pull in the helpers and validate first; only
	// then include header.php (which renders HTML chrome).
	require_once __DIR__ . '/includes/csrf.php';
	csrf_check();

	$onlinejson = file_get_contents('https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json');
	$dataonline = json_decode($onlinejson, true);
	include ('includes/header.php');

	// LOW-3: every apt-get path here can collide with another concurrent
	// service-toggle (admin clicks "enable VNC" while "enable Samba" is
	// still running). dpkg has its own exclusive lock at
	// /var/lib/dpkg/lock-frontend, so the second request fails with a
	// confusing error in stderr but the PHP page just says "VNC enabled"
	// — the user has no idea it didn't actually run. Serialise apt-touching
	// commands behind a flock so the second one waits up to 120s for the
	// first to finish, and log if the wait expires.
	$APT_LOCK = '/tmp/.mupibox.apt.lock';
	$aptWrap = function ($cmd) use ($APT_LOCK) {
		return "flock -w 120 " . escapeshellarg($APT_LOCK) . " bash -c " . escapeshellarg($cmd);
	};

	// Samba, FTP and VNC are switched in the app (Settings > Network > Shares, backend-api eltern/services.ts): there
	// they are only started and stopped (the installation sets them up, switched off - issue #178). Here they were
	// removed with apt-get on every switch-off and installed again from the internet on every switch-on, the configs
	// fetched live from the upstream repository, and the VNC switch rewrote mupiboxconfig.json in place.
		


	if( $_POST['change_btac'] == "enable & start" )
		{
		$command = "sudo systemctl enable mupi_autoconnect_bt; sudo systemctl start mupi_autoconnect_bt";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>BT-Autoconnect-Service enabled</li>";
		}
	else if( $_POST['change_btac'] == "stop & disable" )
		{
		$command = "sudo systemctl stop mupi_autoconnect_bt; sudo systemctl disable mupi_autoconnect_bt";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>BT-Autoconnect-Service disabled</li>";
		}

	// On a GET request none of the POST handlers above ran, so $output is
	// never set. PHP 8 turned count(null) into a fatal TypeError —
	// service.php has been crashing on every plain page-load since this
	// box upgraded to PHP 8, with the form never reaching the browser.
	// Pre-existing bug (not introduced by Phase 5) but blocking the
	// CSRF-token verification, so fix here.
	$rc = !empty($output) ? $output[count($output)-1] : '';
	$command = "sudo service smbd status | grep running";
	exec($command, $smboutput, $smbresult );
	if( $smboutput[0] )
		{
		$command="/usr/bin/hostname -I | awk '{print $1}'";
		$IP=exec($command);
		$samba_state = "started&nbsp;&nbsp;&nbsp;&nbsp;[&nbsp;&nbsp;UNC-Path: \\\\".$IP."\\mupibox\\&nbsp;&nbsp;]";
		$change_samba = "stop & disable";
		}
	else
		{
		$samba_state = "disabled";
		$change_samba = "enable & start";
		}

	$command = "sudo service proftpd status | grep running";
	exec($command, $ftpoutput, $ftpresult );
	if( $ftpoutput[0] )
		{
		$ftp_state = "started";
		$change_ftp = "stop & disable";
		}
	else
		{
		$ftp_state = "disabled";
		$change_ftp = "enable & start";
		}

	$command = "sudo service mupi_autoconnect_bt status | grep running";
	exec($command, $btacoutput, $btacresult );
	if( $btacoutput[0] )
		{
		$btac_state = "started";
		$change_btac = "stop & disable";
		}
	else
		{
		$btac_state = "disabled";
		$change_btac = "enable & start";
		}
		
	$command = "ps -ef | grep websockify | grep -v grep";
	exec($command, $vncoutput, $vncresult );
	if( $vncoutput[0] )
		{
		$vnc_state = "started";
		$change_vnc = "stop & disable";
		}
	else
		{
		$vnc_state = "disabled";
		$change_vnc = "enable & start";
		}
?>

<form class="appnitro"  method="post" action="service.php" id="form">
<?= csrf_field() ?>
	<div class="description">
		<h2>MupiBox services</h2>
		<p>De/Activate some helpfull services...</p>
	</div>
	<details id="networkserciceconfig">
		<summary><i class="fa-solid fa-network-wired"></i> Network</summary>
	<ul>
		<li class="li_1"><h2>Samba</h2>
			<p>
			<?php 
			echo "Samba-Service Status: <b>".$samba_state."</b>";
			?>
			</p>
			<a class="button_text" href="/app/#/freigaben" target="_blank" rel="noopener">Switch in the app</a>
		</li>
		<li class="li_1"><h2>FTP-Server</h2>
			<p>
			<?php 
			echo "FTP-Service Status: <b>".$ftp_state."</b>";
			?>
			</p>
			<a class="button_text" href="/app/#/freigaben" target="_blank" rel="noopener">Switch in the app</a>
		</li>
		<li class="li_1"><h2>Enable/Disable VNC</h2>
			<p>
			Enables or disables VNC-Service! The service allows remote access to the browser (Display). Usage recommended for Pi version 3 and up.
			</p>
			<p>
			<?php 
			echo "VNC-Service Status: <b>".$vnc_state."</b>";
			?>
			</p>
			<a class="button_text" href="/app/#/freigaben" target="_blank" rel="noopener">Switch in the app</a>
		</li>
	</ul>
	</details>
	<details id="bluetoothserviceconfig">
		<summary><i class="fa-brands fa-bluetooth"></i> Bluetooth</summary>
	<ul>
		<li class="li_1"><h2>Bluetooth-Autoconnect-Helper (Just if automatic reconnect won't work)</h2>
			<p>
			<?php 
			echo "BT-Autoconnect-Service Status: <b>".$btac_state."</b>";
			?>
			</p>
			<input id="saveForm" class="button_text" type="submit" name="change_btac" value="<?php print $change_ftp; ?>" />
		</li>
	</ul>
	</details>
</form>
<?php
	include ('includes/footer.php');
?>