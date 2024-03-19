<?php
	$change=0;
	$onlinejson = file_get_contents('https://raw.githubusercontent.com/friebi/MuPiBox/develop/config/templates/mupiboxconfig.json');
	$dataonline = json_decode($onlinejson, true);
	include ('includes/header.php');
	$CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";

	if( $_POST['change_vnc'] == "stop & disable" )
		{
		exec("sudo systemctl stop mupi_vnc.service");
		exec("sudo systemctl stop mupi_novnc.service");
		exec("sudo systemctl disable mupi_vnc.service");
		exec("sudo systemctl disable mupi_novnc.service");
		exec("sudo apt-get remove x11vnc websockify -y");
		exec("sudo pkill websockify");
		exec("sudo rm -R /usr/share/novnc");
		exec("sudo su - -c \"/usr/bin/cat <<< $(/usr/bin/jq --arg v \"0\" '.tweaks.vnc = $v' /etc/mupibox/mupiboxconfig.json) >  /etc/mupibox/mupiboxconfig.json\"");
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>VNC-Services disabled</li>";
		}
	else if( $_POST['change_vnc'] == "enable & start" )
		{
		exec("sudo apt-get install x11vnc websockify -y");
		exec("sudo git clone https://github.com/novnc/noVNC.git /usr/share/novnc");
		exec("sudo chown -R dietpi:dietpi /usr/share/novnc");
		exec("sudo systemctl enable mupi_vnc.service");
		exec("sudo systemctl enable mupi_novnc.service");
		exec("sudo systemctl start mupi_vnc.service");
		exec("sudo systemctl start mupi_novnc.service");
		exec("sudo su - -c \"/usr/bin/cat <<< $(/usr/bin/jq --arg v \"1\" '.tweaks.vnc = $v' /etc/mupibox/mupiboxconfig.json) >  /etc/mupibox/mupiboxconfig.json\"");
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>VNC-Services enabled and started</li>";
		}

	if( $_POST['change_samba'] == "enable & start" )
		{
		$command = "sudo apt-get install samba -y && sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/develop/config/templates/smb.conf -O /etc/samba/smb.conf && sudo systemctl enable smbd.service && sudo systemctl start smbd.service";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Samba enabled</li>";
		}
	else if( $_POST['change_samba'] == "stop & disable" )
		{
		$command = "sudo systemctl stop smbd.service && sudo systemctl disable smbd.service && sudo apt-get remove samba -y";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Samba disabled</li>";
		}

	if( $_POST['change_ftp'] == "enable & start" )
		{
		$command = " sudo apt-get install proftpd -y && sudo apt-get install samba -y && sudo wget https://raw.githubusercontent.com/friebi/MuPiBox/develop/config/templates/proftpd.conf -O /etc/proftpd/proftpd.conf && sudo systemctl restart proftpd";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>FTP enabled</li>";
		}
	else if( $_POST['change_ftp'] == "stop & disable" )
		{
		$command = "sudo systemctl stop proftpd.service && sudo systemctl disable proftpd.service && sudo apt-get remove proftpd -y";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>FTP disabled</li>";
		}

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

	$rc = $output[count($output)-1];
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
	<div class="description">
		<h2>MupiBox services</h2>
		<p>De/Activate some helpfull services...</p>
	</div>
	<details>
		<summary><i class="fa-solid fa-network-wired"></i> Network</summary>
	<ul>
		<li class="li_1"><h2>Samba</h2>
			<p>
			<?php
			echo "Samba-Service Status: <b>".$samba_state."</b>";
			?>
			</p>
			<input id="saveForm" class="button_text" type="submit" name="change_samba" value="<?php print $change_samba; ?>" />
		</li>
		<li class="li_1"><h2>FTP-Server</h2>
			<p>
			<?php
			echo "FTP-Service Status: <b>".$ftp_state."</b>";
			?>
			</p>
			<input id="saveForm" class="button_text" type="submit" name="change_ftp" value="<?php print $change_ftp; ?>" />
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
			<input id="saveForm" class="button_text" type="submit" name="change_vnc" value="<?php print $change_vnc; ?>" />
		</li>
	</ul>
	</details>
	<details>
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
