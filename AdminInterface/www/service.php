<?php
	$change=0;
	$onlinejson = file_get_contents('https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/mupiboxconfig.json');
	$dataonline = json_decode($onlinejson, true);
	include ('includes/header.php');

	if( $_POST['change_samba'] == "enable & start" )
		{
		$command = "sudo apt-get install samba -y && sudo wget https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/smb.conf -O /etc/samba/smb.conf && sudo systemctl enable smbd.service && sudo systemctl start smbd.service";
		exec($command, $output, $result );
		$change=1;
		}
	else if( $_POST['change_samba'] == "stop & disable" )
		{
		$command = "sudo systemctl stop smbd.service && sudo systemctl disable smbd.service && sudo apt-get remove samba -y";
		exec($command, $output, $result );
		$change=1;
		}


	$rc = $output[count($output)-1];
	$command = "sudo service smbd status | grep running";
	exec($command, $smboutput, $smbresult );
	if( $smboutput[0] )
		{
		$samba_state = "started";
		$change_samba = "stop & disable";
		}
	else
		{
		$samba_state = "disabled";
		$change_samba = "enable & start";
		}
?>

                <form class="appnitro"  method="post" action="service.php" id="form">
                                        <div class="description">
                        <h2>MupiBox settings</h2>
                        <p>De/Activate some helpfull services...</p>
                </div>
                        <ul ><li id="li_1" >
                                        
								<li class="li_1"><h2>Samba</h2>
								<p>
								<?php 
								echo "Samba Status: <b>".$samba_state."</b>";
								?>
								</p>
								<input id="saveForm" class="button_text" type="submit" name="change_samba" value="<?php print $change_samba; ?>" /></li>


                        </ul>
                </form>
<?php
	include ('includes/footer.html');
?>