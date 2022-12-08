<?php
 $change=0;
 $CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";
 include ('includes/header.php');

 if( isset($_POST['thisvolume']) )
  {
	$tvcommand = "sudo su dietpi -c '/usr/bin/amixer sget Master | grep \"Right:\" | cut -d\" \" -f7 | sed \"s/\\[//g\" | sed \"s/\\]//g\" | sed \"s/\%//g\"'";
	$tvresult = exec($tvcommand, $tvoutput);
	if($_POST['thisvolume'] != $tvoutput[0])
		{ 
		$command="sudo su dietpi -c '/usr/bin/amixer sset Master " . $_POST['thisvolume'] . "%'";
		$set_volume = exec($command, $output );
		$CHANGE_TXT=$CHANGE_TXT."<li>Volume: " . $_POST['thisvolume'] . "%</li>";
		$change=2;
		}
  }
 if( isset($_POST['newbrightness']) )
  {
	$command = "cat /sys/class/backlight/rpi_backlight/brightness";
	$thisbrightness = exec($command, $tboutput);

	if( $_POST['newbrightness'] != $tboutput[0] )
		{
		$brcommand="sudo su - -c 'echo " . $_POST['newbrightness'] . " > /sys/class/backlight/rpi_backlight/brightness'";
		$set_brightness = exec($brcommand, $broutput );
		$CHANGE_TXT=$CHANGE_TXT."<li>Brightness: " . $_POST['newbrightness'] . "</li>";
		$change=2;
		}
  }
 if( $data["mupibox"]["physicalDevice"]!=$_POST['audio'] && $_POST['audio'])
  {
  $data["mupibox"]["physicalDevice"]=$_POST['audio'];
  $command = "sudo /boot/dietpi/func/dietpi-set_hardware soundcard '" . $_POST['audio'] . "'";
  $change_soundcard = exec($command, $output, $change_soundcard );
  $CHANGE_TXT=$CHANGE_TXT."<li>Soundcard changed to  ".$data["mupibox"]["physicalDevice"]." [reboot is necessary]</li>";
  $change=2;
  }
 if( $data["mupibox"]["host"]!=$_POST['hostname'] && $_POST['hostname'])
  {
  $data["mupibox"]["host"]=$_POST['hostname'];
  $command = "sudo /boot/dietpi/func/change_hostname " . $_POST['hostname'];
  $change_hostname = exec($command, $output, $change_hostname );
  $command = "sudo su dietpi -c '/usr/local/bin/mupibox/./set_hostname.sh'";
  exec($command);
  $CHANGE_TXT=$CHANGE_TXT."<li>Hostname changed to  ".$data["mupibox"]["host"]." [reboot is necessary]</li>";
  $change=1;
  }
 if( $_POST['theme'] != $data["mupibox"]["theme"] && $_POST['theme'] )
  {
  $data["mupibox"]["theme"]=$_POST['theme'];
  $CHANGE_TXT=$CHANGE_TXT."<li>New Theme  ".$data["mupibox"]["theme"]."  is active</li>";
  $change=1;
  }
 if( $_POST['tts'] != $data["mupibox"]["ttsLanguage"] && $_POST['tts'] )
  {
  $data["mupibox"]["ttsLanguage"]=$_POST['tts'];
  $CHANGE_TXT=$CHANGE_TXT."<li>New TTS Language  ".$data["mupibox"]["ttsLanguage"]." [reboot is necessary]</li>";
  $command = "sudo rm /home/dietpi/MuPiBox/tts_files/*.mp3";
  exec($command, $output, $result );
  $change=2;
  }

 if( $data["mupibox"]["maxVolume"]!=$_POST['maxVolume'] && $_POST['maxVolume'] )
  {
  $data["mupibox"]["maxVolume"]=$_POST['maxVolume'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Max Volume is set to ".$data["mupibox"]["maxVolume"]." [reboot is necessary]</li>";
  $change=2;
  }

 if( $data["mupibox"]["startVolume"]!=$_POST['volume'] && $_POST['volume'] )
  {
  $data["mupibox"]["startVolume"]=$_POST['volume'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Start Volume is set to ".$data["mupibox"]["startVolume"]."</li>";
  $change=2;
  }
 if($data["timeout"]["idlePiShutdown"]!=$_POST['idlePiShutdown'] && isset($_POST['idlePiShutdown']) && $_POST['idlePiShutdown'] >= 0)
  {
  $data["timeout"]["idlePiShutdown"]=$_POST['idlePiShutdown'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Idle Shutdown Time is set to ".$data["timeout"]["idlePiShutdown"]."</li>";
  $change=2;
  }
 if($data["timeout"]["idleDisplayOff"]!=$_POST['idleDisplayOff'] && isset($_POST['idleDisplayOff']) && $_POST['idleDisplayOff'] >= 0)
  {
  $data["timeout"]["idleDisplayOff"]=$_POST['idleDisplayOff'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Idle Time for Display is set to ".$data["timeout"]["idleDisplayOff"]."</li>";
  $change=2;
  }
 if( $data["timeout"]["pressDelay"]!=$_POST['pressDelay'] && $_POST['pressDelay'] )
  {
  $data["timeout"]["pressDelay"]=$_POST['pressDelay'];
  $change=2;
  }
 if( $data["shim"]["ledPin"]!=$_POST['ledPin'] && $_POST['ledPin'])
  {
  $data["shim"]["ledPin"]=$_POST['ledPin'];
  $CHANGE_TXT=$CHANGE_TXT."<li>New GPIO for Power-LED set to ".$data["shim"]["ledPin"]. "  [reboot is necessary]</li>";
  $change=2;
  }
 if( $data["chromium"]["resX"]!=$_POST['resX'] && $_POST['resX'])
  {
  $data["chromium"]["resX"]=$_POST['resX'];
  $CHANGE_TXT=$CHANGE_TXT."<li>X-Resolution set to ".$data["chromium"]["resX"]."</li>";
  $change=1;
  }
 if( $data["chromium"]["resY"]!=$_POST['resY'] && $_POST['resY'])
  {
  $data["chromium"]["resY"]=$_POST['resY'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Y-Resolution set to ".$data["chromium"]["resY"]."</li>";
  $change=1;
  }
  if( $data["mupibox"]["maxVolume"] < $data["mupibox"]["startVolume"] )
	{
	$data["mupibox"]["startVolume"]=$data["mupibox"]["maxVolume"];
	$CHANGE_TXT=$CHANGE_TXT."<li>Start Volume is set to ".$data["mupibox"]["maxVolume"]." because of Max Volume</li>";
	$change=2;
	}
 if( $change == 1 )
  {
   $json_object = json_encode($data);
   $save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
   exec("sudo chmod 755 /etc/mupibox/mupiboxconfig.json");
   exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
   exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
   exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
  }
 if( $change == 2 )
  {
   $json_object = json_encode($data);
   $save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
   exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
   exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
  }
$CHANGE_TXT=$CHANGE_TXT."</ul></div>";
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
	<label class="description" for="thisvolume">Volume (in 5% Steps)</label>
	<div>
	<p><b>PLEASE NOTE:</b> If you adjust the volume here, the volume indicator on the display will not be updated!</p>
	<input class="element text medium" name="thisvolume" type="range" min="0" max="100" step="5.0" value="<?php 
		$command = "sudo su dietpi -c '/usr/bin/amixer sget Master | grep \"Right:\" | cut -d\" \" -f7 | sed \"s/\\[//g\" | sed \"s/\\]//g\" | sed \"s/\%//g\"'";
		$VolumeNow = exec($command, $voutput);
		echo $voutput[0];
	?>"list="steplist" oninput="this.nextElementSibling.value = this.value"><output></output>
<datalist id="steplist">
    <option>0</option>
    <option>5</option>
    <option>10</option>
    <option>15</option>
    <option>20</option>
    <option>25</option>
    <option>30</option>
    <option>35</option>
    <option>40</option>
    <option>45</option>
    <option>50</option>
    <option>55</option>
    <option>60</option>
    <option>65</option>
    <option>70</option>
    <option>75</option>
    <option>80</option>
    <option>85</option>
    <option>90</option>
    <option>95</option>
    <option>100</option>
</datalist>

	</div><p class="guidelines" id="guide_1"><small>Set the volume (here you can override the MaxVolume-Definition!</small></p>

</li>
<li id="li_1" >
	<label class="description" for="theme">Brightness (from 0 to 255)</label>
	<div>
	<input class="element text medium" name="newbrightness" type="range" min="0" max="255" step="51.0" value="<?php 
		$tbcommand = "cat /sys/class/backlight/rpi_backlight/brightness";
		$tbrightness = exec($tbcommand, $boutput);
		echo $boutput[0];
	?>" list="steplist2" oninput="this.nextElementSibling.value = this.value"><output></output>
<datalist id="steplist2">
    <option>0</option>
    <option>51</option>
    <option>102</option>
    <option>153</option>
    <option>204</option>
    <option>255</option>
</datalist><output></output>
	</div><p class="guidelines" id="guide_1"><small>Set Display Brightness!</small></p>

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
	</div>
	<div class="themePrev"><img src="images/<?php print $data["mupibox"]["theme"]; ?>_2.0.0.png" width="250" height="150" name="selectedTheme" /></div>

</li>
<li id="li_1" >
	<label class="description" for="theme">TTS Language </label>
	<div>
	<select id="tts" name="tts" class="element text medium">
	<?php
	$language = $data["mupibox"]["googlettslanguages"];
	foreach($language as $key) {
	if( $key['iso639-1'] == $data["mupibox"]["ttsLanguage"] )
	{
	$selected = " selected=\"selected\"";
	}
	else
	{
	$selected = "";
	}
	print "<option value=\"". $key['iso639-1'] . "\"" . $selected  . ">" . $key['Language'] . "</option>";
	}
	?>
	"</select>
	</div>
</li>
<li id="li_1" >
	<label class="description" for="theme">Audio Device / Soundcard </label>
	<div>
	<select id="audio" name="audio" class="element text medium">
	<?php
	$audio = $data["mupibox"]["AudioDevices"];
	foreach($audio as $key) {
	if( $key['tname'] == $data["mupibox"]["physicalDevice"] )
	{
	$selected = " selected=\"selected\"";
	}
	else
	{
	$selected = "";
	}
	print "<option value=\"". $key['tname'] . "\"" . $selected  . ">" . $key['ufname'] . "</option>";
	}
	?>
	"</select>
	</div>
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
	</div><p class="guidelines" id="guide_1"><small>Set the volume after booting...</small></p>
</li>

<li id="li_1" >
	<label class="description" for="maxvolume">Set max volume</label>
	<div>
	<select id="maxVolume" name="maxVolume" class="element text medium">
	<?php
	$volume = $data["mupibox"]["maxVolume"];
	for($i=0; $i <= 100; $i=$i+10) {
	if( $i == $data["mupibox"]["maxVolume"] )
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
	</div><p class="guidelines" id="guide_1"><small>Set the maximum volume...</small></p>
</li>


<li id="li_1" >
	<label class="description" for="idlePiShutdown">Idle Time to Shutdown </label>
	<div>
	<input id="idlePiShutdown" name="idlePiShutdown" class="element text medium" type="number" maxlength="255" value="<?php
	print $data["timeout"]["idlePiShutdown"];
	?>"/>
	</div><p class="guidelines" id="guide_1"><small>Set the idle time (idle = nothing played) to shutdown.</small></p>
</li>


<li id="li_1" >
	<label class="description" for="idleDisplayOff">Idle Display Off Timeout </label>
	<div>
	<input id="idleDisplayOff" name="idleDisplayOff" class="element text medium" type="number" maxlength="255" value="<?php
	print $data["timeout"]["idleDisplayOff"];
	?>"/>
	</div><p class="guidelines" id="guide_1"><small>Set the idle time to standby the display (powersaving).</small></p>
</li>

<li id="li_1" >
	<label class="description" for="pressDelay">Power Off Button Delay </label>
	<div>
	<input id="pressDelay" name="pressDelay" class="element text medium" type="number" maxlength="255" value="<?php
	print $data["timeout"]["pressDelay"];
	?>"/>
	</div><p class="guidelines" id="guide_1"><small>Currently UNUSED!</small></p>
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
	</div><p class="guidelines" id="guide_1"><small>Set the X-width (horizontal) in px. Please just enter Numbers.</small></p>
</li>

<li id="li_1" >
	<label class="description" for="resY">Display Resolution Y </label>
	<div>
	<input id="resY" name="resY" class="element text medium" type="number" maxlength="255" value="<?php
	print $data["chromium"]["resY"];
	?>"/>
	</div><p class="guidelines" id="guide_1"><small>Set the y-width (vertical) in px. Please just enter Numbers.</small></p>
</li>
<li class="buttons">
	<input type="hidden" name="form_id" value="37271" />

	<input id="saveForm" class="button_text" type="submit" name="submit" value="Submit" />
</li>


</ul>
</form><p>


<?php
 include ('includes/footer.php');
?>
