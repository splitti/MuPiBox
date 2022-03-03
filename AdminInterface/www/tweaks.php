
<?php
	$change=0;
	$onlinejson = file_get_contents('https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json');
	$dataonline = json_decode($onlinejson, true);
	include ('includes/header.php');

	if( $_POST['change_sd'] == "activate for next boot" )
		{
		$command = "sudo sh -c \"echo 'dtoverlay=sdtweak,overclock_50=100' >> /boot/config.txt\"";
		exec($command, $output, $result );
		$change=1;
		}
	else if( $_POST['change_sd'] == "disable" )
		{
		$command = "sudo sed -i -e 's/dtoverlay=sdtweak,overclock_50=100//g' /boot/config.txt";
		exec($command, $output, $result );
		$change=1;
		}
	
	command = "cat /boot/config.txt | grep 'dtoverlay=sdtweak,overclock_50=100'";
	exec($command, $sdoutput, $sdresult );
	if( $sdoutput[0] )
		{
		$sd_state = "active";
		$change_sd = "disable";
		}
	else
		{
		$sd_state = "disabled";
		$change_sd = "activate for next boot";
		}
?>

                <form class="appnitro"  method="post" action="admin.php">
                                        <div class="description">
                        <h2>MupiBox tweaks</h2>
                        <p>Make your box smarter and faster...</p>
                </div>
                        <ul ><li id="li_1" >
                                        
								<li class="li_1"><h2>Overclock SD Card</h2>
								<p>
								Just for highspeed SD Cards. You can damage data or the microSD itself!
								</p>
								<p>
								<?php 
								echo "Overclocking state: <b>".$sd_state."</b>";
								?>
								</p>
								<input id="saveForm" class="button_text" type="submit" name="change_sd" value="<?php print $change_sd; ?>" /></li>
							</li>


                        </ul>
                </form>
        </div>
<?php
	include ('includes/footer.html');
?>