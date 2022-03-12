
<?php
	$change=0;
	include ('includes/header.php');
	if( $data["mupibox"]["host"]!=$_POST['hostname'] && $_POST['hostname'])
		{
		$data["mupibox"]["host"]=$_POST['hostname'];
		$command = "sudo /boot/dietpi/func/change_hostname " . $_POST['hostname'];
		$change_hostname = exec($command, $output, $change_hostname );
		$change=1;
		}
	if( $_POST['theme'] != $data["mupibox"]["theme"] && $_POST['theme'] )
		{
		$data["mupibox"]["theme"]=$_POST['theme'];
		$change=1;
		}
	if( $data["mupibox"]["startVolume"]!=$_POST['volume'] && $_POST['volume'] )
		{
		$data["mupibox"]["startVolume"]=$_POST['volume'];
		$change=1;
		}
	if(isset($_POST['idlePiShutdown']) && $_POST['idlePiShutdown'] >= 0)
		{
		$data["timeout"]["idlePiShutdown"]=$_POST['idlePiShutdown'];
		$change=1;
		}
	if(isset($_POST['idleDisplayOff']) && $_POST['idleDisplayOff'] >= 0)
		{
		$data["timeout"]["idleDisplayOff"]=$_POST['idleDisplayOff'];
		$change=1;
		}
	if( $data["timeout"]["pressDelay"]!=$_POST['pressDelay'] && $_POST['pressDelay'] )
		{
		$data["timeout"]["pressDelay"]=$_POST['pressDelay'];
		$change=1;
		}
	if( $data["shim"]["ledPin"]!=$_POST['ledPin'] && $_POST['ledPin'])
		{
		$data["shim"]["ledPin"]=$_POST['ledPin'];
		$change=1;
		}
	if( $data["chromium"]["resX"]!=$_POST['resX'] && $_POST['resX'])
		{
		$data["chromium"]["resX"]=$_POST['resX'];
		$change=1;
		}
	if( $data["chromium"]["resY"]!=$_POST['resY'] && $_POST['resY'])
		{
		$data["chromium"]["resY"]=$_POST['resY'];
		$change=1;
		}

	if( $change )
		{
			$json_object = json_encode($data);
			$save_rc = file_put_contents('/etc/mupibox/mupiboxconfig.json', $json_object);
			exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
			exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
		}
?>

                <form class="appnitro" name="mupi" method="post" action="mupi.php" id="form">
                                        <div class="description">
                        <h2>MupiBox settings</h2>
                        <p>This is the central configuration of your MuPiBox...</p>
                </div>
                        <ul >

                                        <li id="li_1" >
                <label class="description" for="hostname">Hostname </label>
                <div>
                        <input id="hostname" name="hostname" class="element text medium" type="text" maxlength="255" value="<?php
                        print $data["mupibox"]["host"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>
                 <li id="li_1" >
                <label class="description" for="theme">Theme </label>
                <div>
                        <select id="theme" name="theme" class="element text medium" onchange="switchImage();">
<?php
						$Themes = $data["mupibox"]["installedThemes"];                    
						foreach($Themes as $key) {
							if( $key == $data["mupibox"]["theme"] )
								{
								$selected = " selected=\"selected\"";
								}
							else
								{
								$selected = "";
								}
							print "<option value=\"". $key . "\"" . $selected  . ">" . $key . "</option>";
						}
?>
"</select>
				<p><img src="images/blue.png" width="250" height="150" name="selectedTheme" />
<p>

                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Default: MuPiBox</small></p>
                </li>
				<li id="li_1" >
                <label class="description" for="volume">Volume after power on </label>
                <div>
                        <select id="volume" name="volume" class="element text medium">
<?php
						$volume = $data["mupibox"]["startVolume"];     
						for($i=0; $i <= 100; $i=$i+10) {
							if( $i == $data["mupibox"]["startVolume"] )
								{
								$selected = " selected=\"selected\"";
								}
							else
								{
								$selected = "";
								}
							print "<option value=\"". $i . "\"" . $selected  . ">" . $i . "</option>";
						}
?>
"</select>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Default: MuPiBox</small></p>
                </li>

                                        <li id="li_1" >
                <label class="description" for="idlePiShutdown">Idle Time to Shutdown </label>
                <div>
                        <input id="idlePiShutdown" name="idlePiShutdown" class="element text medium" type="number" maxlength="255" value="<?php
                        print $data["timeout"]["idlePiShutdown"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>


                                        <li id="li_1" >
                <label class="description" for="idleDisplayOff">Idle Display Off Timeout </label>
                <div>
                        <input id="idleDisplayOff" name="idleDisplayOff" class="element text medium" type="number" maxlength="255" value="<?php
                        print $data["timeout"]["idleDisplayOff"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>
				
                                        <li id="li_1" >
                <label class="description" for="pressDelay">Power Off Button Delay </label>
                <div>
                        <input id="pressDelay" name="pressDelay" class="element text medium" type="number" maxlength="255" value="<?php
                        print $data["timeout"]["pressDelay"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the hostname of the MuPiBox. Don't use Spaces or other special charachters! Default: MuPiBox</small></p>
                </li>

                                        <li id="li_1" >
                <label class="description" for="ledPin">LED GPIO OnOffShim </label>
                <div>
                        <input id="ledPin" name="ledPin" class="element text medium" type="number" maxlength="255" value="<?php
                        print $data["shim"]["ledPin"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the GPIO Number (not PIN!!!) of the connect LED. Default: 25</small></p>
                </li>

                                        <li id="li_1" >
                <label class="description" for="resX">Display Resolution X </label>
                <div>
                        <input id="resX" name="resX" class="element text medium" type="number" maxlength="255" value="<?php
                        print $data["chromium"]["resX"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the GPIO Number (not PIN!!!) of the connect LED. Default: 25</small></p>
                </li>

                                        <li id="li_1" >
                <label class="description" for="resY">Display Resolution Y </label>
                <div>
                        <input id="resY" name="resY" class="element text medium" type="number" maxlength="255" value="<?php
                        print $data["chromium"]["resY"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please insert the GPIO Number (not PIN!!!) of the connect LED. Default: 25</small></p>
                </li>
                                        <li class="buttons">
                            <input type="hidden" name="form_id" value="37271" />

                                <input id="saveForm" class="button_text" type="submit" name="submit" value="Submit" />
														
                </li>


                        </ul>
                </form><p>
				<?php
							if( $change )
								{
								if( $save_rc )
									{
										print "<div id='savestategood'><p>Data succesfully saved!</p></div>";
									}
								else
									{
										print "<div id='savestatebad'><p>Error while saving!</p></div>";
									}
								} 
				?>

<?php
	include ('includes/footer.php');
?>