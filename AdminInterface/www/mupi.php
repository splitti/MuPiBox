<?php
	include ('includes/header.php');

	$hdmi_rotate_option[0][0]="0";
	$hdmi_rotate_option[0][1]="Disabled (default)";
	$hdmi_rotate_option[1][0]="1";
	$hdmi_rotate_option[1][1]="90 degrees";
	$hdmi_rotate_option[2][0]="2";
	$hdmi_rotate_option[2][1]="180 degrees";
	$hdmi_rotate_option[3][0]="3";
	$hdmi_rotate_option[3][1]="270 degrees";
	$hdmi_rotate_option[4][0]="0x10000";
	$hdmi_rotate_option[4][1]="Horizontal flip";
	$hdmi_rotate_option[5][0]="0x20000";
	$hdmi_rotate_option[5][1]="Vertical flip";
	$lcd_rotate_option[0][0]="0";
	$lcd_rotate_option[0][1]="Disabled (default)";
	$lcd_rotate_option[1][0]="2";
	$lcd_rotate_option[1][1]="180 degrees";
	$dlcd_rotate_option[0][0]="0";
	$dlcd_rotate_option[0][1]="Disabled (default)";
	$dlcd_rotate_option[1][0]="2";
	$dlcd_rotate_option[1][1]="180 degrees";

	$lcd_rotation_state=`sed -n '/^[[:blank:]]*lcd_rotate=/{s/^[^=]*=//p;q}' /boot/config.txt`;
	$dlcd_rotation_state=`sed -n '/^[[:blank:]]*display_lcd_rotate=/{s/^[^=]*=//p;q}' /boot/config.txt`;
	$hdmi_rotation_state=`sed -n '/^[[:blank:]]*display_hdmi_rotate=/{s/^[^=]*=//p;q}' /boot/config.txt`;

	// Display rotations: dietpi accepts integer rotation values (0/90/180/270
	// for HDMI, 0/1/2/3 for LCD-flips). The values were spliced into a
	// double-quoted shell string verbatim — a POST with hdmi_rotation="0\";
	// rm -rf /; #" would have torn the quoting apart. intval() collapses
	// anything non-numeric to 0 (safe default = no rotation).
	$rotationWhitelist = [0, 1, 2, 3, 90, 180, 270];
	if(isset($_POST['hdmi_rotation']))
		{
		$hdmiRot = intval($_POST['hdmi_rotation']);
		if (in_array($hdmiRot, $rotationWhitelist, true) && $hdmiRot != substr($hdmi_rotation_state,0,-1))
			{
			exec("sudo su - dietpi -c \". /boot/dietpi/func/dietpi-globals && G_SUDO G_CONFIG_INJECT 'display_hdmi_rotate=' 'display_hdmi_rotate=" . $hdmiRot . "' /boot/config.txt\"");
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>Set HDMI-Rotation [reboot is necessary]</li>";
			}
		}
	if(isset($_POST['lcd_rotation']))
		{
		$lcdRot = intval($_POST['lcd_rotation']);
		if (in_array($lcdRot, $rotationWhitelist, true) && $lcdRot != substr($lcd_rotation_state,0,-1))
			{
			exec("sudo su - dietpi -c \". /boot/dietpi/func/dietpi-globals && G_SUDO G_CONFIG_INJECT 'lcd_rotate=' 'lcd_rotate=" . $lcdRot . "' /boot/config.txt\"");
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>Set LCD-Rotation [reboot is necessary]</li>";
			}
		}
	if(isset($_POST['dlcd_rotation']))
		{
		$dlcdRot = intval($_POST['dlcd_rotation']);
		if (in_array($dlcdRot, $rotationWhitelist, true) && $dlcdRot != substr($dlcd_rotation_state,0,-1))
			{
			exec("sudo su - dietpi -c \". /boot/dietpi/func/dietpi-globals && G_SUDO G_CONFIG_INJECT 'display_lcd_rotate=' 'display_lcd_rotate=" . $dlcdRot . "' /boot/config.txt\"");
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>Set Display-LCD-Rotation [reboot is necessary]</li>";
			}
		}

	if($_POST['change_gpu'] == "disable")
		{
		$data["chromium"]["gpu"]=false;	
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>GPU-Support disabled</li>";
		}
	if($_POST['change_gpu'] == "enable")
		{
		$data["chromium"]["gpu"]=true;	
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>GPU-Support activated</li>";
		}
	if($_POST['change_cache'] )
		{
		if($_POST['cachesize'] )
			{
			$data["chromium"]["cachesize"]=$_POST['cachesize'];
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>Cache size changed to ".$data["chromium"]["cachesize"]."</li>";
			}
		}

	if($_POST['change_smoothscrolling'] == "disable")
		{
		$data["chromium"]["sccrollanimation"]=false;	
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Scroll animation disabled</li>";
		}
	if($_POST['change_smoothscrolling'] == "enable")
		{
		$data["chromium"]["sccrollanimation"]=true;	
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Scroll animation activated</li>";
		}

	if($_POST['change_kiosk'] == "disable")
		{
		$data["chromium"]["kiosk"]=false;	
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Kiosk mode disabled</li>";
		}
	if($_POST['change_kiosk'] == "enable")
		{
		$data["chromium"]["kiosk"]=true;	
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Kiosk mode activated</li>";
		}


	if($_POST['change_pm2log'])
		{
		if($data["pm2"]["ramlog"])
			{
			exec("sudo bash -c \"sed '/\/home\/dietpi\/.pm2\/logs/d' /etc/fstab > /tmp/.fstab && mv /tmp/.fstab /etc/fstab\"");
			$pm2_state = "disabled";
			$change_pm2 = "enable";
			$data["pm2"]["ramlog"]=0;
			}
		else
			{
			exec("sudo bash -c \"sed '/^tmpfs \/var\/log.*/a tmpfs \/home\/dietpi\/.pm2\/logs tmpfs size=50M,noatime,lazytime,nodev,nosuid,mode=1777' /etc/fstab > /tmp/.fstab && mv /tmp/.fstab /etc/fstab\"");
			$pm2_state = "active";
			$change_pm2 = "disable";
			$data["pm2"]["ramlog"]=1;
			}
		$change=2;
		$CHANGE_TXT=$CHANGE_TXT."<li>PM2-Logs to RAM ".$pm2_state." on next boot</li>";
		}
	else
		{
		if($data["pm2"]["ramlog"])
			{
				$pm2_state = "active";
				$change_pm2 = "disable";
			}
		else
			{
				$pm2_state = "disabled";
				$change_pm2 = "enable";
			}
		}
			
	if( $_POST['change_netboot'] == "activate for next boot" )
		{
		$command = "sudo /boot/dietpi/func/dietpi-set_software boot_wait_for_network 1";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Wait for Network on boot is enabled</li>";
		}
	else if( $_POST['change_netboot'] == "disable" )
		{
		$command = "sudo /boot/dietpi/func/dietpi-set_software boot_wait_for_network 0";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Wait for Network on boot is disabled</li>";
		}

	if( $_POST['change_warnings'] == "disable" )
		{
		// only the line of this setting goes (it used to cut off the last line of config.txt, whatever it was)
		$command = "sudo sed -i '/^avoid_warnings=1$/d' /boot/config.txt";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Warning Icons disabled [restart necessary]</li>";
		}
	else if( $_POST['change_warnings'] == "enable" )
		{
		$command = "echo 'avoid_warnings=1' | sudo tee -a /boot/config.txt";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Warning Icons enabled [restart necessary]</li>";
		}

	if( $_POST['change_turbo'] == "disable" )
		{
		$command = "sudo su - dietpi -c \". /boot/dietpi/func/dietpi-globals && G_SUDO G_CONFIG_INJECT 'initial_turbo' 'initial_turbo=0' /boot/config.txt\"";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Inital Turbo disabled</li>";
		}
	else if( $_POST['change_turbo'] == "enable" )
		{
		$command = "sudo su - dietpi -c \". /boot/dietpi/func/dietpi-globals && G_SUDO G_CONFIG_INJECT 'initial_turbo' 'initial_turbo=30' /boot/config.txt\"";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>Inital Turbo enabled</li>";
		}

	if( $_POST['change_swap'] == "disable" )
		{
		$command = "sudo /boot/dietpi/func/dietpi-set_swapfile 0";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>SWAP disabled</li>";
		}
	else if( $_POST['change_swap'] == "enable" )
		{
		$command = "sudo /boot/dietpi/func/dietpi-set_swapfile 1";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>SWAP enabled</li>";
		}

	if ($_POST['change_cpug'])
		{
		// H6: $_POST['cpugovernor'] floss bisher ungeprüft als Substring in
		// einen verschachtelten `sudo su -c "...G_CONFIG_INJECT 'CONFIG_CPU_GOVERNOR=<wert>'..."`-
		// Aufruf — post-auth Command-Injection. Whitelist gegen die vom Kernel
		// tatsächlich angebotenen Governors aus scaling_available_governors;
		// das ist auch genau die Liste, aus der der HTML-<select> generiert wird.
		$available = explode(' ', trim((string)@file_get_contents(
			'/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors')));
		$cpug_input = (string)($_POST['cpugovernor'] ?? '');
		if (in_array($cpug_input, $available, true)) {
			$command = "sudo su - dietpi -c \". /boot/dietpi/func/dietpi-globals && G_SUDO G_CONFIG_INJECT 'CONFIG_CPU_GOVERNOR=' 'CONFIG_CPU_GOVERNOR=".$cpug_input."' /boot/dietpi.txt\"";
			$test=exec($command, $output, $result );
			$command = "sudo /boot/dietpi/func/dietpi-set_cpu";
			exec($command, $output, $result );
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>CPU Governor changet to  ".htmlspecialchars($cpug_input, ENT_QUOTES, 'UTF-8')."</li>";
		} else {
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>CPU Governor change rejected: invalid value</li>";
		}
		}

	if( $_POST['change_sd'] == "activate for next boot" )
		{
		$command = "echo 'dtoverlay=sdtweak,overclock_50=100' | sudo tee -a /boot/config.txt";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>SD Overclocking activated [restart necessary]</li>";
		}
	else if( $_POST['change_sd'] == "disable" )
		{
		// only the line of this setting goes (it used to cut off the last line of config.txt, whatever it was)
		$command = "sudo sed -i '/^dtoverlay=sdtweak,overclock_50=100$/d' /boot/config.txt";
		exec($command, $output, $result );
		$change=1;
		$CHANGE_TXT=$CHANGE_TXT."<li>SD Overclocking disabled [restart necessary]</li>";
		}

	$command = "sudo bash -c \"[[ ! -f '/etc/systemd/system/dietpi-postboot.service.d/dietpi.conf' ]] || echo 1\"";
	exec($command, $netbootoutput, $netbootresult );

	if( $netbootoutput[0] )
		{
		$netboot_state = "active";
		$change_netboot = "disable";
		}
	else
		{
		$netboot_state = "disabled";
		$change_netboot = "activate for next boot";
		}

	$command = "sudo /usr/bin/cat /boot/config.txt | /usr/bin/grep 'dtoverlay=sdtweak,overclock_50=100'";
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
		
 if( $_POST['audioset'] )
  {
	$tvcommand = "sudo su dietpi -c '/usr/bin/amixer sget Master | grep \"Right:\" | cut -d\" \" -f7 | sed \"s/\\[//g\" | sed \"s/\\]//g\" | sed \"s/\%//g\"'";
	$tvresult = exec($tvcommand, $tvoutput);
	// The value went unchecked into a root shell (www-data has sudo ALL): accept an integer 0..100 only.
	$thisvolume = max(0, min(100, intval($_POST['thisvolume'] ?? 0)));
	if($thisvolume != $tvoutput[0])
		{
		$command="sudo su dietpi -c '/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ " . $thisvolume . "%'";
		$set_volume = exec($command, $output );
		$CHANGE_TXT=$CHANGE_TXT."<li>Volume: " . $thisvolume . "%</li>";
		$change=2;
		}
  }
 if( $_POST['displayset'] )
  {
	$command = "cat /sys/class/backlight/*/brightness";
	$thisbrightness = exec($command, $tboutput);

	switch ($_POST['newbrightness']) {
    case "0":
        $new_bn=0;
        break;
    case "20":
        $new_bn=51;
        break;
    case "40":
        $new_bn=102;
        break;
    case "60":
        $new_bn=153;
        break;
    case "80":
        $new_bn=204;
        break;
    case "100":
        $new_bn=255;
        break;
	default:
        $new_bn=255;
	}

	if( $new_bn != $tboutput[0] )
		{
		$brcommand="sudo su - -c 'echo " . $new_bn . " > /sys/class/backlight/*/brightness'";
		$set_brightness = exec($brcommand, $broutput );
		$CHANGE_TXT=$CHANGE_TXT."<li>Backlight-Brightness: " . $_POST['newbrightness'] . "%</li>";
		$change=2;
		}
  }
 // Only a soundcard from the offered list (it went into a root shell unchecked).
 $known_soundcards = array_map(function ($d) { return $d['tname']; }, $data["mupibox"]["AudioDevices"] ?? array());
 if( $data["mupibox"]["physicalDevice"]!=$_POST['audio'] && $_POST['audioset'] && in_array($_POST['audio'], $known_soundcards, true))
	{
	$data["mupibox"]["physicalDevice"]=$_POST['audio'];
	$command = "sudo /boot/dietpi/func/dietpi-set_hardware soundcard " . escapeshellarg($_POST['audio']);
	$change_soundcard = exec($command, $output, $change_soundcard );
	$CHANGE_TXT=$CHANGE_TXT."<li>Soundcard changed to  ".$data["mupibox"]["physicalDevice"]."x</li>";
	$change=2;
	}
 // A valid hostname only (RFC 1123 label) - the value went unchecked into a root shell.
 $hostname_valid = preg_match('/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/', (string)($_POST['hostname'] ?? ''));
 if( $_POST['submithn'] && !$hostname_valid )
  {
  $CHANGE_TXT=$CHANGE_TXT."<li>Invalid hostname (letters, digits and '-' only, max. 63 characters)</li>";
  }
 if( $data["mupibox"]["host"]!=$_POST['hostname'] && $_POST['submithn'] && $hostname_valid)
  {
  $data["mupibox"]["host"]=$_POST['hostname'];
  $command = "sudo /boot/dietpi/func/change_hostname " . escapeshellarg($_POST['hostname']);
  $change_hostname = exec($command, $output, $change_hostname );
  $CHANGE_TXT=$CHANGE_TXT."<li>Hostname changed to  ".$data["mupibox"]["host"]." [reboot is necessary]</li>";
  $change=1;
  }
 if( $_POST['theme'] != $data["mupibox"]["theme"] && $_POST['mupiset'] )
  {
  $data["mupibox"]["theme"]=$_POST['theme'];
  $CHANGE_TXT=$CHANGE_TXT."<li>New Theme  ".$data["mupibox"]["theme"]."  is active</li>";
  $change=1;
  }
 if( $_POST['mupiset'] )
  {
  $hideScrollbar = isset($_POST['hideScrollbar']);
  if( $hideScrollbar !== (($data["mupibox"]["hideScrollbar"] ?? false) === true) )
   {
   $data["mupibox"]["hideScrollbar"] = $hideScrollbar;
   $CHANGE_TXT=$CHANGE_TXT."<li>Horizontal scrollbar is now ".($hideScrollbar ? "hidden" : "shown")."</li>";
   $change=1;
   }
  }
 if( $_POST['mupiset'] )
  {
  $coverflowShowNames = isset($_POST['coverflowShowNames']);
  if( $coverflowShowNames !== (($data["mupibox"]["coverflowShowNames"] ?? false) === true) )
   {
   $data["mupibox"]["coverflowShowNames"] = $coverflowShowNames;
   $CHANGE_TXT=$CHANGE_TXT."<li>Album/folder names under Coverflow covers are now ".($coverflowShowNames ? "shown" : "hidden")."</li>";
   $change=1;
   }
  }
 // km themes: "Cover-Flow-Ansicht" (stage) and reading the name aloud when it stops - both only shown for a km theme
 if( $_POST['mupiset'] && isset($_POST['kmStageShown']) )
  {
  foreach (array('themeStage' => 'Cover-Flow view (stage) of the children\'s theme', 'themeStageAutoRead' => 'Reading the name aloud on the stage') as $kmKey => $kmText)
   {
   $kmOn = isset($_POST[$kmKey]);
   if( $kmOn !== (($data["mupibox"][$kmKey] ?? false) === true) )
    {
    $data["mupibox"][$kmKey] = $kmOn;
    $CHANGE_TXT=$CHANGE_TXT."<li>".$kmText." is now ".($kmOn ? "on" : "off")."</li>";
    $change=1;
    }
   }
  }
 if( $_POST['tts'] != $data["mupibox"]["ttsLanguage"] && $_POST['mupiset'] )
  {
  $data["mupibox"]["ttsLanguage"]=$_POST['tts'];
  $CHANGE_TXT=$CHANGE_TXT."<li>New TTS Language  ".$data["mupibox"]["ttsLanguage"]." [reboot is necessary]</li>";
  $command = "sudo rm /home/dietpi/MuPiBox/tts_files/*.mp3";
  exec($command, $output, $result );
  $change=1;
  }

 if( $_POST['resume'] != $data["mupibox"]["resume"] && $_POST['mupiset'] )
  {
  $data["mupibox"]["resume"]=intval($_POST['resume']);
  $CHANGE_TXT=$CHANGE_TXT."<li>Max resume entries  ".$data["mupibox"]["ttsLanguage"]."</li>";
  $change=1;
  }

 if( $_POST['listviewTimer'] != $data["mupibox"]["listviewTimer"] && $_POST['mupiset'] )
  {
  $data["mupibox"]["listviewTimer"]=floatval($_POST['listviewTimer']);
  $CHANGE_TXT=$CHANGE_TXT."<li>Listview timer set to  ".$data["mupibox"]["listviewTimer"]." sec</li>";
  $change=1;
  }

 if( $_POST['settingsAccessTimer'] != $data["mupibox"]["settingsAccessTimer"] && $_POST['mupiset'] )
  {
  $data["mupibox"]["settingsAccessTimer"]=floatval($_POST['settingsAccessTimer']);
  $CHANGE_TXT=$CHANGE_TXT."<li>Access to settings set to  ".$data["mupibox"]["settingsAccessTimer"]." sec</li>";
  $change=1;
  }


 if( $data["shim"]["ledBrightnessMax"]!=$_POST['ledmaxbrightness'] && $_POST['powerset'] )
  {
  $data["shim"]["ledBrightnessMax"]=$_POST['ledmaxbrightness'];
  $CHANGE_TXT=$CHANGE_TXT."<li>LED standard brightness set to ".$data["shim"]["ledBrightnessMax"]."%</li>";
  $change=2;
  }

 if( $data["shim"]["ledBrightnessMin"]!=$_POST['ledminbrightness'] && $_POST['powerset'] )
  {
  $data["shim"]["ledBrightnessMin"]=$_POST['ledminbrightness'];
  $CHANGE_TXT=$CHANGE_TXT."<li>LED standard brightness set to ".$data["shim"]["ledBrightnessMin"]."%</li>";
  $change=2;
  }

// The general "Submit" of the audio settings also saves the rotary encoder fields (they sit in the same form)
$rotary_save = isset($_POST['rotary_save']) || ( isset($_POST['audioset']) && isset($_POST['rotary_step']) );
if( isset($_POST['rotary_toggle']) || $rotary_save )
	{
	if( !isset($data["rotary"]) || !is_array($data["rotary"]) ) { $data["rotary"] = array( "active" => false, "button" => "off" ); }
	if( isset($_POST['rotary_toggle']) )
		{
		if( $_POST['rotary_toggle'] == "enable" )
			{
			$data["rotary"]["active"] = true;
			exec("sudo systemctl enable mupi_rotary.service");
			exec("sudo systemctl restart mupi_rotary.service");
			$CHANGE_TXT=$CHANGE_TXT."<li>Rotary encoder is active now.</li>";
			$rotary_changed = true;
			}
		else
			{
			$data["rotary"]["active"] = false;
			exec("sudo systemctl stop mupi_rotary.service");
			exec("sudo systemctl disable mupi_rotary.service");
			$CHANGE_TXT=$CHANGE_TXT."<li>Rotary encoder is deactivated now.</li>";
			$rotary_changed = true;
			}
		}
	if( $rotary_save )
		{
		// Only the offered functions (the service reads this value on every button press)
		$rotary_button = in_array($_POST['rotary_button'] ?? '', array('off','playpause','next','ffwd'), true) ? $_POST['rotary_button'] : 'off';
		$rotary_step = min(10, max(1, intval($_POST['rotary_step'] ?? 5)));
		if( ($data["rotary"]["button"] ?? null) !== $rotary_button || ($data["rotary"]["step"] ?? null) !== $rotary_step )
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>Rotary encoder settings saved (volume step ".$rotary_step."%, push button: ".$rotary_button.").</li>";
			$rotary_changed = true;
			}
		$data["rotary"]["button"] = $rotary_button;
		$data["rotary"]["step"] = $rotary_step;
		}
	// only a real change saves the config (and runs setting_update.sh): every audio "Submit" sends these fields
	if( !empty($rotary_changed) ) { $change = 2; }
	}

if( $_POST['fan_control'] )
	{
	$data["fan"]["fan_active"] = $_POST['FanPin'];
	$data["fan"]["fan_gpio"] = $_POST['FanPin'];
	$data["fan"]["fan_temp_100"] = $_POST['fan_100'];
	$data["fan"]["fan_temp_75"] = $_POST['fan_75'];
	$data["fan"]["fan_temp_50"] = $_POST['fan_50'];
	$data["fan"]["fan_temp_25"] = $_POST['fan_25'];
	if($_POST['fan_active'])
		{
		$data["fan"]["fan_active"] = true;
		exec("sudo systemctl enable mupi_fan.service");
		exec("sudo service mupi_fan start");
		$CHANGE_TXT=$CHANGE_TXT."<li>Fan is active now.</li>";
		}
	else 
		{
		$data["fan"]["fan_active"] = false;
		exec("sudo service mupi_fan stop");
		exec("sudo systemctl disable mupi_fan.service");
		$CHANGE_TXT=$CHANGE_TXT."<li>Fan is deactivated now.</li>";		
		}
	$change = 2;
	}

 // Volumes are stored as numbers 0..100: the web app's backend took only a number, so a "75" saved from here
 // switched the hearing protection (maxVolume) off there.
 if( $data["mupibox"]["maxVolume"]!=$_POST['maxVolume'] && $_POST['audioset'] )
  {
  $data["mupibox"]["maxVolume"]=max(0, min(100, intval($_POST['maxVolume'])));
  $CHANGE_TXT=$CHANGE_TXT."<li>Max Volume is set to ".$data["mupibox"]["maxVolume"]."% [reboot is necessary]</li>";
  $change=2;
  }

 if( $data["mupibox"]["startVolume"]!=$_POST['volume'] && $_POST['audioset'] )
  {
  $data["mupibox"]["startVolume"]=max(0, min(100, intval($_POST['volume'])));
  $CHANGE_TXT=$CHANGE_TXT."<li>Start Volume is set to ".$data["mupibox"]["startVolume"]."%</li>";
  $change=2;
  }
 if($data["timeout"]["idleDisplayOff"]!=$_POST['idleDisplayOff'] && isset($_POST['displayset']) && $_POST['idleDisplayOff'] >= 0)
  {
  $data["timeout"]["idleDisplayOff"]=$_POST['idleDisplayOff'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Idle Time for Display is set to ".$data["timeout"]["idleDisplayOff"]." minutes</li>";
  $change=2;
  }
 if( $data["timeout"]["pressDelay"]!=$_POST['pressDelay'] && $_POST['powerset'] )
  {
  $data["timeout"]["pressDelay"]=$_POST['pressDelay'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Press Button delay set to ".$_POST['pressDelay']. " seconds</li>";
  $change=2;
  }
 // Overlay texts of the box display: key => label. The texts per language come from the box frontend's
 // assets/i18n/display-texts.json; the box shows own text > chosen language > English.
 $display_text_fields = array(
  'blockedHeading' => 'Limit reached - heading',
  'blockedSubheading' => 'Limit reached - second line',
  'quietHeading' => 'Quiet time - heading (only for rules without a label)',
  'quietSubheading' => 'Quiet time - second line',
  'parentsTitle' => 'Parents QR code - heading',
  'parentsHint' => 'Parents QR code - hint',
  'parentsCountdown' => 'Parents QR code - countdown ({s} = seconds)',
  'parentsClose' => 'Parents QR code - close button',
 );
 $display_languages = array();
 $display_lang_file = @file_get_contents('/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/assets/i18n/display-texts.json');
 $display_lang_json = $display_lang_file ? json_decode($display_lang_file, true) : null;
 if( is_array($display_lang_json) && isset($display_lang_json['languages']) && is_array($display_lang_json['languages']) ) $display_languages = $display_lang_json['languages'];

 // Boot and maintenance screens: scenes, texts and text positions from the installed bootscreens.json; the box puts
 // the pictures together (bootscreen_update.sh) after a change.
 $bootscreen_json = @json_decode(@file_get_contents('/home/dietpi/MuPiBox/sysmedia/bootscreens/bootscreens.json'), true);
 $bootscreen_ids = array();
 foreach( (is_array($bootscreen_json) ? ($bootscreen_json['bootscreens'] ?? array()) : array()) as $bs ) { if( !empty($bs['id']) ) $bootscreen_ids[] = $bs['id']; }
 if( !empty($_POST['bootscreen_save']) && $bootscreen_ids )
  {
  $bsBoot = (string)($_POST['bootscreen'] ?? '');
  $bsMaint = (string)($_POST['maintenanceScreen'] ?? '');
  $bsLang = (string)($_POST['bootscreenLanguage'] ?? '');
  // the name: 14 characters at most, no control characters, spaces at the ends removed
  $bsName = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($_POST['boxName'] ?? '')));
  $bsName = mb_substr($bsName, 0, (int)($bootscreen_json['nameMaxLength'] ?? 14), 'UTF-8');
  // the default boot screen is not written down (empty = default): a later change of the default then reaches the box
  if( $bsBoot !== 'random' && !in_array($bsBoot, $bootscreen_ids, true) ) $bsBoot = '';
  if( $bsBoot === ($bootscreen_json['defaultBootscreen'] ?? '') ) $bsBoot = '';
  if( $bsMaint !== 'same' && !in_array($bsMaint, $bootscreen_ids, true) ) $bsMaint = 'same';
  if( !isset($display_languages[$bsLang]) ) $bsLang = 'en';
  $bsNew = array('bootscreen' => $bsBoot, 'maintenanceScreen' => $bsMaint, 'boxName' => $bsName, 'bootscreenLanguage' => $bsLang);
  $bsChanged = false;
  foreach( $bsNew as $bsKey => $bsValue )
   {
   if( ($data["mupibox"][$bsKey] ?? null) !== $bsValue ) { $data["mupibox"][$bsKey] = $bsValue; $bsChanged = true; }
   }
  if( $bsChanged )
   {
   save_mupiboxconfig($data);
   // putting the pictures together takes a few seconds (all 15 scenes for "Random"): in the background
   exec("sudo nohup /usr/local/bin/mupibox/bootscreen_update.sh > /dev/null 2>&1 &");
   $CHANGE_TXT = $CHANGE_TXT."<li>Boot and maintenance screens saved - the new boot screen is shown at the next start</li>";
   $change = 3;
   }
  }

 // Texts of the overlays on the box display (same keys as the parents' web app). An empty field
 // removes the text: the box shows the text of the chosen language then.
 if( isset($_POST['displaytexts_save']) )
  {
  $display_texts = array();
  $dt_lang = isset($_POST['dt_language']) && is_string($_POST['dt_language']) ? $_POST['dt_language'] : 'en';
  if( preg_match('/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i', $dt_lang) ) $data["displayLanguage"] = $dt_lang;
  foreach( $display_text_fields as $dt_key => $dt_label )
   {
   $dt_value = isset($_POST['dt_'.$dt_key]) && is_string($_POST['dt_'.$dt_key]) ? $_POST['dt_'.$dt_key] : '';
   $dt_value = trim(preg_replace('/[\x00-\x1F\x7F]/u', ' ', $dt_value) ?? '');
   $dt_value = mb_substr($dt_value, 0, 120);
   if( $dt_value !== '' ) $display_texts[$dt_key] = $dt_value;
   }
  if( count($display_texts) > 0 ) $data["displayTexts"] = $display_texts;
  else unset($data["displayTexts"]);
  $CHANGE_TXT = $CHANGE_TXT."<li>Display texts saved (language ".htmlspecialchars($data["displayLanguage"] ?? "en").", ".count($display_texts)." own text(s), shown the next time an overlay appears)</li>";
  $change = 2;
  }
 // Only one of the offered GPIO pins (it went unchecked into a root sed command).
 if( $data["shim"]["ledPin"]!=$_POST['ledPin'] && $_POST['ledPin'] && in_array($_POST['ledPin'], array("4", "12", "13", "17", "18", "21", "22", "23", "24", "25", "27"), true))
  {
  $data["shim"]["ledPin"]=$_POST['ledPin'];
  $CHANGE_TXT=$CHANGE_TXT."<li>New GPIO for Power-LED set to ".$data["shim"]["ledPin"]. "  [reboot is necessary]</li>";
  $DAEMON_ARGS='DAEMON_ARGS="--gpio '.$data["shim"]["ledPin"].'"';
  exec("sudo /usr/bin/sed -i 's|DAEMON_ARGS=\".*\"|".$DAEMON_ARGS."|g' /etc/init.d/pi-blaster.boot.sh");

  $change=2;
  }
 if( $data["chromium"]["resX"]!=$_POST['resX'] && $_POST['displayset'])
  {
  $data["chromium"]["resX"]=$_POST['resX'];
  $CHANGE_TXT=$CHANGE_TXT."<li>X-Resolution set to ".$data["chromium"]["resX"]." pixel</li>";
  $change=1;
  }
 if( $data["chromium"]["resY"]!=$_POST['resY'] && $_POST['displayset'])
  {
  $data["chromium"]["resY"]=$_POST['resY'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Y-Resolution set to ".$data["chromium"]["resY"]." pixel</li>";
  $change=1;
  }
  if( $data["mupibox"]["maxVolume"] < $data["mupibox"]["startVolume"] )
	{
	$data["mupibox"]["startVolume"]=$data["mupibox"]["maxVolume"];
	$CHANGE_TXT=$CHANGE_TXT."<li>Start Volume is set to ".$data["mupibox"]["maxVolume"]."% because of max volume setting</li>";
	$change=2;
	}
  
	if( $_POST['submitfile'] )
		{
		$target_dir = "/var/www/";
		$target_file = $target_dir . "custom-bg.jpg";#basename($_FILES["fileToUpload"]["name"]);
		$uploadOk = 1;
		//$FileType = strtolower(pathinfo($target_file,PATHINFO_EXTENSION));

		// never assume the upload succeeded
		if ($_FILES["fileToUpload"]["error"] !== UPLOAD_ERR_OK) {
			$CHANGE_TXT=$CHANGE_TXT."<li>Upload failed with error code " . $_FILES["fileToUpload"]["tmp_name"] . "</li>";
			$uploadOk = 0;
		}
		else
			{
			$info = getimagesize($_FILES["fileToUpload"]["tmp_name"]);
			if ($info[2] !== IMAGETYPE_JPEG) {
				$CHANGE_TXT=$CHANGE_TXT."<li>Wrong file-type. Please upload an image of type jpeg, webp, png or gif.</li>";
				$uploadOk = 0;
				}
			else
				{
				if ($info[0] != 800 || $info[1] != 480) 
					{
					$scale = max(800 / $info[0], 480 / $info[1]);
					$newWidth = $info[0] * $scale;
					$newHeight = $info[1] * $scale;

					$image = imagecreatefromstring(file_get_contents($_FILES["fileToUpload"]["tmp_name"]));
					if ($image === false)
						{
						$CHANGE_TXT .= "<li>Error loading the image file.</li>";
						$uploadOk = 0;
						} 
					else 
						{
						$newImage = imagecreatetruecolor($newWidth, $newHeight);

						// Bild kopieren und skalieren
						imagecopyresampled($newImage, $image, 0, 0, 0, 0, $newWidth, $newHeight, $info[0], $info[1]);

						// Bild speichern
						imagejpeg($newImage, $target_file, 90); // Bildqualität auf 90 (0-100)
						
						imagedestroy($image);
						imagedestroy($newImage);

						$CHANGE_TXT .= "<li>Image resized to min. 800 X 480px.</li>";
						}
					}
				else
					{
					if (move_uploaded_file($_FILES["fileToUpload"]["tmp_name"], $target_file))
						{
						$change=1;
						}
					else
						{
						$change=0;
						}
					}
				}
			}
		// Check if $uploadOk is set to 0 by an error
		if ($uploadOk != 0)
			{
			$final_file = "/home/dietpi/MuPiBox/themes/custom-bg.jpg";
			#$linked_file = "/home/dietpi/MuPiBox/themes/custom-bg.jpg";
			exec("sudo mv ".$target_file." ".$final_file);
			if (file_exists($final_file))
				{
				$CHANGE_TXT=$CHANGE_TXT."<li>Image upload completed!</li>";
				} 
			else 
				{
				$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: Error on uploading image!</li>";
				}
			}
		else
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>Image upload cancled!</li>";			
			}
		$change = 3;
		}  
 if( $change == 1 )
  {
   remove_config_cache_dir((string)($data["chromium"]["cachepath"] ?? ""));
   remove_config_cache_dir('/tmp/chromium_cache'); // where the kiosk keeps it now (in RAM)
   save_mupiboxconfig($data);
   exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
   exec("sudo -i -u dietpi /usr/local/bin/mupibox/./restart_kiosk.sh");
  }
 if( $change == 2 )
  {
   save_mupiboxconfig($data);
   exec("sudo /usr/local/bin/mupibox/./setting_update.sh");
  }

$CHANGE_TXT=$CHANGE_TXT."</ul></div>";
?>


<form class="appnitro" name="mupi" method="post" action="mupi.php" id="form"  enctype="multipart/form-data">
<div class="description">
<h2>MupiBox settings</h2>
<p>This is the central configuration of your MuPiBox...</p>
</div>

	<details id="mupiboxsetting">
		<summary><i class="fa-solid fa-radio"></i> MuPiBox settings</summary>
		<ul>
			<li id="li_1" >
				<h2>Theme </h2>
				<div>
				<select id="theme" name="theme" class="element text medium" onchange="switchImage(); toggleCoverflowNameOption(); toggleKmStageOption();">
				<?php
				// km themes (children's themes of one design): English names from km-themes.json, in a group of their own
				$kmNames = array();
				// the old themes of the box in the km layout (legacy): they keep their names, their place in the list and
				// their preview picture - only the Cover Flow switch below is theirs too
				$kmLegacy = array();
				$kmJson = @json_decode(@file_get_contents('/home/dietpi/MuPiBox/themes/km-themes.json'), true);
				foreach (($kmJson['themes'] ?? array()) as $kmTheme) {
					if (empty($kmTheme['id'])) continue;
					if (!empty($kmTheme['legacy'])) { $kmLegacy[$kmTheme['id']] = true; continue; }
					$kmNames[$kmTheme['id']] = (string)($kmTheme['labelEn'] ?? $kmTheme['label'] ?? $kmTheme['id']);
				}
				$Themes = $data["mupibox"]["installedThemes"];
				asort($Themes);
				$themeOption = function ($key, $label) use ($data) {
					$selected = ($key == $data["mupibox"]["theme"]) ? " selected=\"selected\"" : "";
					return "<option value=\"" . htmlspecialchars($key, ENT_QUOTES) . "\"" . $selected . ">" . htmlspecialchars($label) . "</option>";
				};
				$kmOptions = array();
				foreach($Themes as $key) {
					if (isset($kmNames[$key])) { $kmOptions[$kmNames[$key]] = $themeOption($key, $kmNames[$key]); continue; }
					print $themeOption($key, $key);
				}
				// kids' themes in the order of their names
				ksort($kmOptions, SORT_NATURAL | SORT_FLAG_CASE);
				$kmOptions = implode('', $kmOptions);
				if ($kmOptions !== '') print "<optgroup label=\"Kids' themes\">" . $kmOptions . "</optgroup>";
				?>
				</select>
				</div>
				<div class="themePrev"><img src="images/<?php print isset($kmNames[$data["mupibox"]["theme"]]) ? 'km/' . htmlspecialchars($data["mupibox"]["theme"]) . '.svg' : htmlspecialchars($data["mupibox"]["theme"]) . '.png'; ?>" width="250" height="150" name="selectedTheme" style="object-fit:cover;" /></div>
				<style>
					.mupi-toggle { display:inline-flex; align-items:center; gap:10px; margin-top:12px; cursor:pointer; }
					/* the label text as big as the normal text of the page (the label defaults were 9px bold) */
					.mupi-toggle span:not(.track) { font-size:13px; font-weight:400; line-height:1.5; color:#212529; float:none; margin:0; padding:0; }
					.mupi-toggle input { position:absolute; opacity:0; width:0; height:0; }
					.mupi-toggle .track { position:relative; width:44px; height:24px; border-radius:12px; background:#bbb; transition:background .15s; flex:0 0 auto; }
					.mupi-toggle .track::after { content:""; position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:50%; background:#fff; transition:transform .15s; box-shadow:0 1px 3px rgba(0,0,0,.35); }
					.mupi-toggle input:checked + .track { background:#2a9d3f; }
					.mupi-toggle input:checked + .track::after { transform:translateX(20px); }
					.mupi-toggle input:focus-visible + .track { outline:2px solid #4a90e2; outline-offset:2px; }
				</style>
				<div>
					<label class="mupi-toggle" for="hideScrollbar">
						<input type="checkbox" id="hideScrollbar" name="hideScrollbar" value="1" <?= (($data["mupibox"]["hideScrollbar"] ?? false) === true) ? 'checked="checked"' : '' ?> />
						<span class="track"></span>
						<span>Hide horizontal scrollbar</span>
					</label>
				</div>
				<div id="coverflowNameToggleWrap" style="<?= ($data["mupibox"]["theme"] === 'coverflow') ? '' : 'display:none;' ?>">
					<label class="mupi-toggle" for="coverflowShowNames">
						<input type="checkbox" id="coverflowShowNames" name="coverflowShowNames" value="1" <?= (($data["mupibox"]["coverflowShowNames"] ?? false) === true) ? 'checked="checked"' : '' ?> />
						<span class="track"></span>
						<span>Show folder/album names</span>
					</label>
				</div>
				<?php $kmSelected = isset($kmNames[$data["mupibox"]["theme"]]) || isset($kmLegacy[$data["mupibox"]["theme"]]); $kmStageOn = (($data["mupibox"]["themeStage"] ?? false) === true); ?>
				<div id="kmStageToggleWrap" style="<?= $kmSelected ? '' : 'display:none;' ?>">
					<input type="hidden" name="kmStageShown" value="1" />
					<label class="mupi-toggle" for="themeStage" title="Big cover in the middle, neighbours smaller. Swipe, or tap a neighbour to bring it to the middle.">
						<input type="checkbox" id="themeStage" name="themeStage" value="1" <?= $kmStageOn ? 'checked="checked"' : '' ?> onchange="toggleKmStageOption();" />
						<span class="track"></span>
						<span>Cover Flow view (stage)</span>
					</label>
					<div id="kmAutoReadWrap" style="<?= $kmStageOn ? '' : 'display:none;' ?>">
						<label class="mupi-toggle" for="themeStageAutoRead" title="When the stage stops on a cover, the box reads its name aloud.">
							<input type="checkbox" id="themeStageAutoRead" name="themeStageAutoRead" value="1" <?= (($data["mupibox"]["themeStageAutoRead"] ?? false) === true) ? 'checked="checked"' : '' ?> />
							<span class="track"></span>
							<span>Read the name aloud when it stops</span>
						</label>
					</div>
				</div>
				<script>
					var kmThemeIds = <?= json_encode(array_keys($kmNames)) ?>; // the kids' themes (their preview picture, see view.js)
					var kmStageIds = <?= json_encode(array_merge(array_keys($kmNames), array_keys($kmLegacy))) ?>; // all themes in the km layout
					function toggleKmStageOption() {
						var sel = document.getElementById('theme');
						var wrap = document.getElementById('kmStageToggleWrap');
						var stage = document.getElementById('themeStage');
						var autoRead = document.getElementById('kmAutoReadWrap');
						if (sel && wrap) wrap.style.display = (kmStageIds.indexOf(sel.value) >= 0) ? '' : 'none';
						if (stage && autoRead) autoRead.style.display = stage.checked ? '' : 'none';
					}
					function toggleCoverflowNameOption() {
						var sel = document.getElementById('theme');
						var wrap = document.getElementById('coverflowNameToggleWrap');
						if (sel && wrap) {
							wrap.style.display = (sel.value === 'coverflow') ? '' : 'none';
						}
					}
				</script>

			</li>
			<li id="li_1" >
				<h2>TTS Language </h2>
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
				<h2>Maximum number of resume entries</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["mupibox"]["resume"]
				?></output>				
				
				<input class="range slider-progress" name="resume" type="range" min="1" max="99" step="1.0" value="<?php 
					echo $data["mupibox"]["resume"]
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>

			<li id="li_1" >
				<h2>Listview timer</h2>
				<p>How long you need to press and hold the cover in the player to open the track list (in seconds)
				</p>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["mupibox"]["listviewTimer"]
				?> sec</output>				

				<input class="range slider-progress" name="listviewTimer" type="range" min="0.5" max="5" step="0.5" value="<?php
					echo $data["mupibox"]["listviewTimer"]
				?>" oninput="this.previousElementSibling.value = this.value + ' sec'">
				</div>
			</li>

			<li id="li_1" >
				<h2>Access to settings</h2>
				<p>How long you need to press and hold the status icon on the home screen to open the secret settings menu (in seconds)
				</p>
				<div>
					<output id="rangeval" class="rangeval"><?php
					echo $data["mupibox"]["settingsAccessTimer"]
				?> sec</output>

				<input class="range slider-progress" name="settingsAccessTimer" type="range" min="1" max="10" step="1" value="<?php
					echo $data["mupibox"]["settingsAccessTimer"]
				?>" oninput="this.previousElementSibling.value = this.value + ' sec'">
				</div>
			</li>

			<li class="buttons">
				<input type="hidden" name="form_id" value="37271" />

				<input id="saveForm" class="button_text" type="submit" name="mupiset" value="Submit" />
			</li>
		</ul>
	</details>

	<details id="currenttheme">
		<summary><i class="fa-solid fa-palette"></i> Custom theme</summary>
		<ul>
			<li id="li_1" >
				<h2>Background image </h2>
				<p>
				Please note: Activating the theme in the theme menu. The image should be 800X480px in size, ideally in JPEG format.
				</p>
				<input type="file" class="button_text_upload" name="fileToUpload" id="fileToUpload">
				<input type="submit" class="button_text" value="Upload Image" name="submitfile" >
			</li>
		</ul>
	</details>

<?php
	// empty, missing or unknown: the default boot screen (bootscreens.json)
	$bsDefault = (string)($bootscreen_json['defaultBootscreen'] ?? '');
	$bsCurBoot = (string)($data["mupibox"]["bootscreen"] ?? '');
	if( $bsCurBoot !== 'random' && !in_array($bsCurBoot, $bootscreen_ids, true) ) $bsCurBoot = $bsDefault;
	$bsCurMaint = (string)($data["mupibox"]["maintenanceScreen"] ?? 'same');
	$bsCurName = (string)($data["mupibox"]["boxName"] ?? '');
	$bsCurLang = (string)($data["mupibox"]["bootscreenLanguage"] ?? 'en');
	if( !isset($display_languages[$bsCurLang]) ) $bsCurLang = 'en';
?>
	<details id="bootscreens">
		<summary><i class="fa-solid fa-image"></i> Boot &amp; maintenance screens</summary>
		<ul>
		<?php if( !$bootscreen_ids ) { ?>
			<li><p>The boot screens are not installed yet (they come with the next update).</p></li>
		<?php } else { ?>
			<style>
				@font-face { font-family: "FredokaBS"; src: url("fonts/Fredoka-Variable.ttf") format("truetype"); font-weight: 300 700; }
				.bs-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0 4px; }
				.bs-tile { position: relative; display: block; width: 160px; cursor: pointer; margin: 0; float: none; }
				.bs-tile input { position: absolute; opacity: 0; width: 0; height: 0; }
				.bs-thumb { position: relative; display: block; width: 160px; height: 96px; border-radius: 8px; overflow: hidden; border: 3px solid transparent; box-sizing: content-box; background: #ddd; }
				.bs-tile input:checked + .bs-thumb { border-color: #0d5a80; }
				.bs-tile input:focus-visible + .bs-thumb { outline: 2px solid #4a90e2; }
				.bs-thumb img { display: block; width: 100%; height: 100%; }
				.bs-caption { display: block; font-size: 12px; margin-top: 3px; text-align: center; color: #212529; }
				.bs-random { display: grid; place-items: center; font-size: 34px; color: #0d5a80; background: repeating-linear-gradient(45deg, #eef4f8, #eef4f8 10px, #dde9f1 10px, #dde9f1 20px); }
				.bs-preview { position: relative; width: 400px; max-width: 100%; aspect-ratio: 800 / 480; border-radius: 10px; overflow: hidden; background: #ddd; margin: 8px 0; container-type: inline-size; }
				.bs-preview img { display: block; width: 100%; height: 100%; }
				.bs-text { position: absolute; white-space: nowrap; font-family: "FredokaBS", "DejaVu Sans", sans-serif; line-height: 1; }
				.bs-maint { position: absolute; font-family: "FredokaBS", "DejaVu Sans", sans-serif; }
				.bs-maint .t { display: block; line-height: 1.05; }
				.bs-maint .s { display: inline; line-height: 1.9; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
				/* the form styles of the page (view.css) float spans to the left with 8px below them and give labels in a
				   div a 9px line: not in the previews */
				.bs-thumb, .bs-caption, .bs-text, .bs-maint span { float: none; margin: 0; padding: 0; }
				.bs-tile { font-size: inherit; line-height: normal; padding: 0; color: inherit; }
				.bs-caption { margin-top: 6px; line-height: 1.3; }
				.bs-row { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
				.bs-row > div { flex: 0 1 400px; }
			</style>
			<li>
				<h2>Box name</h2>
				<input type="text" class="element text medium" name="boxName" id="bsName" maxlength="<?= (int)($bootscreen_json['nameMaxLength'] ?? 14) ?>" placeholder="MuPiBox" value="<?= htmlspecialchars($bsCurName, ENT_QUOTES) ?>" title="Shown in the boot screen. Empty = MuPiBox." />
				<p>Shown in the boot screen (at most <?= (int)($bootscreen_json['nameMaxLength'] ?? 14) ?> characters). Empty = "MuPiBox".</p>
			</li>
			<li>
				<h2>Boot screen</h2>
				<div class="bs-grid" id="bsGrid">
					<label class="bs-tile" title="A different boot screen at every start">
						<input type="radio" name="bootscreen" value="random" <?= $bsCurBoot === 'random' ? 'checked' : '' ?> />
						<span class="bs-thumb bs-random"><i class="fa-solid fa-shuffle"></i></span>
						<span class="bs-caption">Random</span>
					</label>
					<?php foreach( $bootscreen_json['bootscreens'] as $bs ) { ?>
					<label class="bs-tile">
						<input type="radio" name="bootscreen" value="<?= htmlspecialchars($bs['id'], ENT_QUOTES) ?>" <?= $bsCurBoot === $bs['id'] ? 'checked' : '' ?> />
						<span class="bs-thumb"><img src="images/bootscreens/<?= htmlspecialchars($bs['scene'], ENT_QUOTES) ?>" alt="" loading="lazy" /><span class="bs-text" data-bs-name="<?= htmlspecialchars($bs['id'], ENT_QUOTES) ?>"></span></span>
						<span class="bs-caption"><?= htmlspecialchars($bs['labelEn'] ?? $bs['id']) ?><?= $bs['id'] === $bsDefault ? ' (default)' : '' ?></span>
					</label>
					<?php } ?>
				</div>
			</li>
			<li>
				<div class="bs-row">
					<div>
						<h2>Maintenance screen</h2>
						<select class="element select medium" name="maintenanceScreen" id="bsMaint" title="Shown during updates, installations and when a new Wi-Fi is set up">
							<option value="same" <?= $bsCurMaint === 'same' ? 'selected' : '' ?>>Same as the boot screen</option>
							<?php foreach( $bootscreen_json['bootscreens'] as $bs ) { ?>
							<option value="<?= htmlspecialchars($bs['id'], ENT_QUOTES) ?>" <?= $bsCurMaint === $bs['id'] ? 'selected' : '' ?>><?= htmlspecialchars($bs['labelEn'] ?? $bs['id']) ?></option>
							<?php } ?>
						</select>
						<h2>Language</h2>
						<select class="element select medium" name="bootscreenLanguage" id="bsLang" title="Language of the maintenance texts">
							<?php foreach( $display_languages as $dl_code => $dl ) { ?>
							<option value="<?= htmlspecialchars($dl_code, ENT_QUOTES) ?>" <?= $dl_code === $bsCurLang ? 'selected' : '' ?>><?= htmlspecialchars($dl['name'] ?? $dl_code) ?></option>
							<?php } ?>
						</select>
						<h2>Preview</h2>
						<select class="element select medium" id="bsKind" title="Which maintenance screen the preview shows">
							<option value="update">Update running</option>
							<option value="install">Installation running</option>
							<option value="wlan">New Wi-Fi being set up</option>
							<option value="goodbye">Goodbye (switching off)</option>
							<option value="battery">Battery empty (switching off)</option>
						</select>
					</div>
					<div>
						<h2>Boot screen</h2>
						<div class="bs-preview" id="bsBootPreview"><img alt="" /><span class="bs-text"></span></div>
						<h2 id="bsMaintTitle">Maintenance screen</h2>
						<div class="bs-preview" id="bsMaintPreview"><img alt="" /><div class="bs-maint"></div></div>
					</div>
				</div>
				<p>The pictures are put together on the box when you save; they are shown from the next start (the maintenance screen at the next update, installation or new Wi-Fi). Goodbye and "battery empty" (shown when the box switches off) belong to the boot screen's scene.</p>
				<input type="submit" class="button_text" name="bootscreen_save" value="Save" />
			</li>
			<script>
			(function () {
				var cfg = <?= json_encode($bootscreen_json, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE) ?>;
				var byId = {};
				cfg.bootscreens.forEach(function (b) { byId[b.id] = b; });
				var nameInput = document.getElementById('bsName');
				var maintSel = document.getElementById('bsMaint');
				var langSel = document.getElementById('bsLang');
				var kindSel = document.getElementById('bsKind');
				var bootPreview = document.getElementById('bsBootPreview');
				var maintPreview = document.getElementById('bsMaintPreview');
				var shownBoot = null; // the scene the previews show (for "Random" the first one)

				function boxName() {
					var n = nameInput.value.trim().slice(0, cfg.nameMaxLength || 14);
					return n || cfg.defaultName || 'MuPiBox';
				}
				function scaledShadow(spec, s) {
					if (!spec || spec === 'none') return 'none';
					return spec.replace(/(-?[\d.]+)px/g, function (m, v) { return (parseFloat(v) * s) + 'px'; });
				}
				// the name at its place, as the box puts it in: the given size, made smaller when it is wider than maxWidth
				function placeName(el, b, width) {
					var s = width / 800, n = b.name;
					el.textContent = boxName();
					el.style.fontSize = (n.fontSize * s) + 'px';
					el.style.fontWeight = n.fontWeight;
					el.style.letterSpacing = (n.letterSpacing * s) + 'px';
					el.style.color = n.color;
					el.style.textShadow = scaledShadow(n.textShadow, s);
					el.style.top = (n.y * s) + 'px';
					el.style.transform = 'none';
					var center = n.align === 'center';
					el.style.left = center ? '50%' : (n.x * s) + 'px';
					var scale = Math.min(1, (n.maxWidth * s) / Math.max(1, el.scrollWidth));
					el.style.transformOrigin = center ? 'center top' : 'left top';
					el.style.transform = (center ? 'translateX(-50%) ' : '') + 'scale(' + scale + ')';
				}
				function placeMaint(box, b, width) {
					// the text area of the kind (e.g. goodbyeText), else the maintenance text's
					var s = width / 800, m = b[kindSel.value + 'Text'] || b.maintenanceText, p = m.subPill;
					var texts = (cfg.texts[kindSel.value] || {})[langSel.value] || (cfg.texts[kindSel.value] || {}).en || ['', ''];
					box.innerHTML = '';
					box.style.left = m.align === 'center' ? ((400 - m.maxWidth / 2) * s) + 'px' : (m.x * s) + 'px';
					box.style.top = (m.y * s) + 'px';
					box.style.width = (m.maxWidth * s) + 'px';
					box.style.setProperty('text-align', m.align === 'center' ? 'center' : 'left', 'important'); // the admin page sets text-align for its list items
					var t = document.createElement('span');
					t.className = 't';
					t.textContent = texts[0];
					t.style.cssText = 'font-size:' + (m.titleSize * s) + 'px;font-weight:' + m.titleWeight + ';color:' + m.color + ';text-shadow:' + scaledShadow(m.textShadow, s) + ';letter-spacing:' + (-1 * s) + 'px;margin-bottom:' + (m.gap * s) + 'px';
					var sub = document.createElement('span');
					sub.className = 's';
					sub.textContent = texts[1];
					sub.style.cssText = 'font-size:' + (m.subSize * s) + 'px;font-weight:' + m.subWeight + ';color:' + p.color + ';background:' + p.background + ';border-radius:' + (p.radius * s) + 'px;padding:' + (p.padY * s) + 'px ' + (p.padX * s) + 'px';
					box.appendChild(t);
					box.appendChild(sub);
					// the title in at most 2 lines: smaller when it needs more, as on the box
					for (var ts = m.titleSize; ts > 24 && t.getBoundingClientRect().height > 2.2 * ts * 1.05 * s; ts--) t.style.fontSize = ((ts - 1) * s) + 'px';
				}
				function update() {
					var checked = document.querySelector('#bsGrid input:checked');
					var bootId = checked ? checked.value : cfg.defaultBootscreen;
					shownBoot = bootId === 'random' ? cfg.bootscreens[0].id : bootId;
					var b = byId[shownBoot];
					bootPreview.querySelector('img').src = 'images/bootscreens/' + b.scene;
					var onScene = kindSel.value === 'goodbye' || kindSel.value === 'battery';
					var maintId = onScene || maintSel.value === 'same' ? shownBoot : maintSel.value;
					var mb = byId[maintId] || b;
					maintPreview.querySelector('img').src = 'images/bootscreens/' + (onScene ? mb[kindSel.value] : mb.maintenance);
					document.getElementById('bsMaintTitle').textContent = onScene ? 'Switching off' : 'Maintenance screen';
					var w = bootPreview.clientWidth || 400;
					placeName(bootPreview.querySelector('.bs-text'), b, w);
					placeMaint(maintPreview.querySelector('.bs-maint'), mb, maintPreview.clientWidth || 400);
					// the name in every tile of the grid
					document.querySelectorAll('#bsGrid [data-bs-name]').forEach(function (el) { placeName(el, byId[el.getAttribute('data-bs-name')], 160); });
				}
				['input', 'change'].forEach(function (ev) { nameInput.addEventListener(ev, update); });
				[maintSel, langSel, kindSel].forEach(function (el) { el.addEventListener('change', update); });
				document.querySelectorAll('#bsGrid input').forEach(function (el) { el.addEventListener('change', update); });
				// the section may be closed at first (size 0): update when it is opened, and once the font is there
				var details = document.getElementById('bootscreens');
				if (details) details.addEventListener('toggle', function () { if (details.open) update(); });
				if (document.fonts && document.fonts.load) document.fonts.load('600 20px FredokaBS').then(update, update);
				update();
			})();
			</script>
		<?php } ?>
		</ul>
	</details>

	<details id="displaytexts">
		<summary><i class="fa-solid fa-font"></i> Display texts</summary>
		<ul>
			<li id="li_1">
				<h2>About</h2>
				<p>Texts the child sees on the box display when the daily limit is used up, during a quiet time and on the parents' QR code. Choose a language; any text can be replaced by your own. A quiet-time rule with a label (e.g. "Bedtime") shows that label as the heading.</p>
			</li>
			<li id="li_1">
				<?php
				$display_texts_stored = isset($data["displayTexts"]) && is_array($data["displayTexts"]) ? $data["displayTexts"] : array();
				$display_lang_current = isset($data["displayLanguage"]) && is_string($data["displayLanguage"]) ? $data["displayLanguage"] : 'en';
				echo '<h2>Language</h2><select name="dt_language" id="dt_language" class="element select medium">';
				if( !isset($display_languages[$display_lang_current]) ) echo '<option value="'.htmlspecialchars($display_lang_current, ENT_QUOTES).'" selected>'.htmlspecialchars($display_lang_current).'</option>';
				foreach( $display_languages as $dl_code => $dl )
					{
					$dl_name = is_array($dl) && isset($dl['name']) && is_string($dl['name']) ? $dl['name'] : $dl_code;
					echo '<option value="'.htmlspecialchars($dl_code, ENT_QUOTES).'"'.($dl_code === $display_lang_current ? ' selected' : '').'>'.htmlspecialchars($dl_name).'</option>';
					}
				echo '</select><p>Own texts below (optional) replace the text of the language. Empty = text of the language (in grey).</p>';

				// The screens of the box display that have texts, and the text fields of each
				$display_screens = array(
					'blocked' => array('label' => 'Limit reached', 'fields' => array('blockedHeading', 'blockedSubheading')),
					'quiet' => array('label' => 'Quiet time', 'fields' => array('quietHeading', 'quietSubheading')),
					'parents' => array('label' => 'Parents QR code', 'fields' => array('parentsTitle', 'parentsHint', 'parentsCountdown', 'parentsClose')),
				);
				echo '<h2>Screen</h2><select id="dt_screen" class="element select medium">';
				foreach( $display_screens as $ds_key => $ds )
					{
					echo '<option value="'.htmlspecialchars($ds_key, ENT_QUOTES).'">'.htmlspecialchars($ds['label']).'</option>';
					}
				echo '</select>';
				echo '<p>The picture shows the screen as it looks on the box display (800 x 480 px, with the theme in use). It follows what you type, before anything is saved.</p>';
				echo '<div style="max-width:100%; overflow-x:auto;"><iframe id="dt_preview" width="800" height="480" style="border:1px solid #888; background:#000; display:block;" title="Preview of the box display"></iframe></div>';
				foreach( $display_screens as $ds_key => $ds )
					{
					echo '<div class="dt-screen-fields" data-screen="'.htmlspecialchars($ds_key, ENT_QUOTES).'" style="display:none;">';
					foreach( $ds['fields'] as $dt_key )
						{
						$dt_label = $display_text_fields[$dt_key] ?? $dt_key;
						// "Limit reached - heading" -> "Heading": the screen is chosen above
						if( strpos($dt_label, ' - ') !== false ) $dt_label = ucfirst(substr($dt_label, strpos($dt_label, ' - ') + 3));
						$dt_current = isset($display_texts_stored[$dt_key]) && is_string($display_texts_stored[$dt_key]) ? $display_texts_stored[$dt_key] : '';
						echo '<h2>'.htmlspecialchars($dt_label, ENT_QUOTES).'</h2>';
						echo '<input type="text" class="element text large" name="dt_'.htmlspecialchars($dt_key, ENT_QUOTES).'" data-dtkey="'.htmlspecialchars($dt_key, ENT_QUOTES).'" maxlength="120" value="'.htmlspecialchars($dt_current, ENT_QUOTES).'">';
						}
					echo '</div>';
					}
				?>
				<script>
				(function () {
					// grey suggestions = texts of the chosen language
					var langs = <?php echo json_encode($display_languages, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
					var select = document.getElementById('dt_language');
					var screenSelect = document.getElementById('dt_screen');
					var frame = document.getElementById('dt_preview');
					var details = document.getElementById('displaytexts');
					// the box display (its web frontend) is served on port 8200 of the same host
					var frameOrigin = location.protocol + '//' + location.hostname + ':8200';
					var frameReady = false;

					function apply() {
						var set = (langs[select.value] || langs.en || {}).texts || {};
						document.querySelectorAll('input[data-dtkey]').forEach(function (input) { input.placeholder = set[input.getAttribute('data-dtkey')] || ''; });
					}
					// sends the texts as typed (also unsaved ones) to the preview
					function send() {
						if (!frameReady || !frame.contentWindow) { return; }
						var texts = {};
						document.querySelectorAll('input[data-dtkey]').forEach(function (input) {
							if (input.value.trim() !== '') { texts[input.getAttribute('data-dtkey')] = input.value.trim(); }
						});
						frame.contentWindow.postMessage({ type: 'mupibox-display-texts', language: select.value, texts: texts }, frameOrigin);
					}
					function showScreen() {
						document.querySelectorAll('.dt-screen-fields').forEach(function (box) {
							box.style.display = box.getAttribute('data-screen') === screenSelect.value ? '' : 'none';
						});
						frameReady = false;
						frame.src = frameOrigin + '/text-preview?screen=' + encodeURIComponent(screenSelect.value);
					}
					frame.addEventListener('load', function () {
						frameReady = true;
						// the page of the box needs a moment to be ready for messages
						send();
						setTimeout(send, 600);
						setTimeout(send, 1800);
					});
					select.addEventListener('change', function () { apply(); send(); });
					screenSelect.addEventListener('change', showScreen);
					document.querySelectorAll('input[data-dtkey]').forEach(function (input) { input.addEventListener('input', send); });
					apply();
					// the preview is loaded when the section is opened (not with every visit of the page)
					var started = false;
					function start() { if (!started && details && details.open) { started = true; showScreen(); } }
					if (details) { details.addEventListener('toggle', start); }
					start();
					if (!started) {
						document.querySelectorAll('.dt-screen-fields').forEach(function (box) { box.style.display = box.getAttribute('data-screen') === screenSelect.value ? '' : 'none'; });
					}
				})();
				</script>
			</li>
			<li class="buttons">
				<input id="saveForm" class="button_text" type="submit" name="displaytexts_save" value="Save display texts" />
			</li>
		</ul>
	</details>

	<details id="displaysettings">
		<summary><i class="fa-solid fa-display"></i> Display settings</summary>
		<ul>
			<li id="li_1" >
				<h2>Brightness</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					$tbcommand = "cat /sys/class/backlight/*/brightness";
					$tbrightness = exec($tbcommand, $boutput);
					switch ($boutput[0]) {
					case "0":
						$new_bn=0;
						break;
					case "51":
						$new_bn=20;
						break;
					case "102":
						$new_bn=40;
						break;
					case "153":
						$new_bn=60;
						break;
					case "204":
						$new_bn=80;
						break;
					case "255":
						$new_bn=100;
						break;
					default:
						$new_bn=100;
					}
					echo $new_bn;
				?>%</output>				
				<input class="range slider-progress" data-tick-step="20" name="newbrightness" type="range" min="0" max="100" step="20.0" value="<?php
					echo $new_bn;
				?>" oninput="this.previousElementSibling.value = this.value + '%'">
				</div>
			</li>

			<?php
				$lcd_rotation_state=`sed -n '/^[[:blank:]]*lcd_rotate=/{s/^[^=]*=//p;q}' /boot/config.txt`;
				$dlcd_rotation_state=`sed -n '/^[[:blank:]]*display_lcd_rotate=/{s/^[^=]*=//p;q}' /boot/config.txt`;
				$hdmi_rotation_state=`sed -n '/^[[:blank:]]*display_hdmi_rotate=/{s/^[^=]*=//p;q}' /boot/config.txt`;
			?>
			<li id="li_1" >
				<h2>Display Rotation Settings</h2>
				<p>These three settings can rotate the display in different constellations. A restart is necessary after saving.</p>
				<h3>HDMI-Rotation</h3>
				<div>
				<select id="hdmi_rotation" name="hdmi_rotation" class="element text medium">
				<?php
				foreach($hdmi_rotate_option as $this_option) {
					if( $this_option[0] == substr($hdmi_rotation_state, 0, -1) )
					{
					$selected = " selected=\"selected\"";
					}
					else
					{
					$selected = "";
					}
					print "<option value=\"". $this_option[0] . "\"" . $selected  . ">" . $this_option[1] . "</option>";
				}
				?>
				"</select>
				</div>
			</li>

			<li id="li_1" >
				<h3>LCD-Rotation</h3>
				<div>
				<select id="lcd_rotation" name="lcd_rotation" class="element text medium">
				<?php
				foreach( $lcd_rotate_option as $this_option ) {
					if( $this_option[0] == substr($lcd_rotation_state,0,-1) )
					{
					$selected = " selected=\"selected\"";
					}
					else
					{
					$selected = "";
					}
					print "<option value=\"". $this_option[0] . "\"" . $selected  . ">" . $this_option[1] . "</option>";
				}
				?>
				"</select>

				</div>
			</li>
			<li id="li_1" >
				<h3>Display-LCD-Rotation</h3>
				<div>
				<select id="dlcd_rotation" name="dlcd_rotation" class="element text medium">
				<?php
				foreach( $dlcd_rotate_option as $this_option ) {
					if( $this_option[0] == substr($dlcd_rotation_state,0,-1) )
					{
					$selected = " selected=\"selected\"";
					}
					else
					{
					$selected = "";
					}
					print "<option value=\"". $this_option[0] . "\"" . $selected  . ">" . $this_option[1] . "</option>";
				}
				?>
				"</select>
				</div>
			</li>


			
			<li id="li_1" >
				<h2>Turn off display after ... minutes</h2>
				<p>
				Please note: Depending on the display, the screen goes black but the backlight remains on.
				</p>
				<div>
					<output id="rangeval" class="rangeval"><?php 
						echo $data["timeout"]["idleDisplayOff"]
				?> min</output>				
				<input class="range slider-progress" name="idleDisplayOff" type="range" min="0" max="120" step="1.0" value="<?php 
					echo $data["timeout"]["idleDisplayOff"]
				?>" oninput="this.previousElementSibling.value = this.value + ' min'">
				</div>
			</li>

			<li id="li_1" >
				<h2>Display resolution X in pixel</h2>
				<div>
				<input id="resX" name="resX" class="element text medium" type="number" maxlength="255" value="<?php
				print $data["chromium"]["resX"];
				?>"/>
				</div>
			</li>
			<li id="li_1" >
				<h2>Display resolution Y in pixel</h2>
				<div>
				<input id="resY" name="resY" class="element text medium" type="number" maxlength="255" value="<?php
				print $data["chromium"]["resY"];
				?>"/>
				</div>
			</li>

			<li class="buttons">
				<input type="hidden" name="form_id" value="37271" />

				<input id="saveForm" class="button_text" type="submit" name="displayset" value="Submit" />
			</li>
		</ul>
	</details>

	<details id="audiosettings">
		<summary><i class="fa-solid fa-volume-high"></i> Audio settings</summary>
		<ul>
			<li id="li_1" >
				<h2>Audio device / Soundcard </h2>
				<div>
				<select id="audio" name="audio" class="element text medium">
				<?php
				$bash_command = "sed -n '/^[[:blank:]]*CONFIG_SOUNDCARD=/{s/^[^=]*=//p;q}' /boot/dietpi.txt";

				// Führe den Bash-Befehl aus und speichere das Ergebnis in der Variablen $output
				$output = exec($bash_command);
				$audio = $data["mupibox"]["AudioDevices"];
				foreach($audio as $key) {
				if( strtolower($key['tname']) == strtolower($output) )
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
				<h2>Volume (in 5% Steps)</h2>
				<div>
				<p><b>PLEASE NOTE:</b> If you adjust the volume here, the volume indicator on the display will not be updated!</p>
					<output id="rangeval" class="rangeval"><?php 
					$command = "sudo su dietpi -c '/usr/bin/amixer sget Master | grep \"Right:\" | cut -d\" \" -f7 | sed \"s/\\[//g\" | sed \"s/\\]//g\" | sed \"s/\%//g\"'";
					$VolumeNow = exec($command, $voutput);
					echo $voutput[0];
				?>%</output>				

				<input class="range slider-progress" name="thisvolume" type="range" min="0" max="100" step="5.0" value="<?php 
					echo $voutput[0];
				?>"list="steplist" oninput="this.previousElementSibling.value = this.value + '%'">
				</div>

			</li>
			<li id="li_1" >
				<h2>Volume after power on </h2>
				<div>
				<output id="rangeval" class="rangeval"><?php 
					echo $data["mupibox"]["startVolume"];
				?>%</output>
				<input class="range slider-progress" name="volume" type="range" min="0" max="100" step="5.0" value="<?php 
					echo $data["mupibox"]["startVolume"];
				?>"list="steplist" oninput="this.previousElementSibling.value = this.value + '%'">
				</div>
			</li>

			<li id="li_1" >
				<h2>Set max volume</h2>
				<div>

				<output id="rangeval" class="rangeval"><?php 
					echo $data["mupibox"]["maxVolume"];
				?>%</output>
				<input class="range slider-progress" name="maxVolume" type="range" min="0" max="100" step="5.0" value="<?php 
					echo $data["mupibox"]["maxVolume"];
				?>"list="steplist" oninput="this.previousElementSibling.value = this.value + '%'">

				</div>
			</li>			
			

			<li id="li_1" >
				<style>
				.rotary-info { display: inline-block; float: none; padding: 0; vertical-align: middle; margin: 0 0 0 10px; cursor: pointer; color: #0d5a80; font-size: 22px; line-height: 1; user-select: none; }
				.rotary-info:hover { color: #0a3d57; }
				.rotary-pop { text-align: left; position: fixed; z-index: 10000; box-sizing: border-box; max-width: 440px; width: calc(100vw - 32px); background: #fff; color: #222; border-radius: 10px; padding: 14px 16px; font-size: 14px; line-height: 1.45; box-shadow: 0 6px 24px rgba(0, 0, 0, .35); }
				.rotary-pop img { display: block; width: 100%; max-width: 300px; height: auto; margin: 0 auto; border-radius: 4px; }
				.rotary-pop figcaption { margin: 4px 0 10px; font-size: 12px; font-style: italic; color: #666; text-align: center; }
				</style>
				<h2>Rotary encoder to control volume <span class="rotary-info" title="About the rotary encoder" role="button" tabindex="0"><i class="fa-solid fa-circle-info"></i></span></h2>
				<div id="rotary-info-src" style="display:none;">
					<figure style="margin:0">
						<img src="images/ky-040-rotary-encoder.jpg" alt="KY-040 Rotary Encoder Module" />
						<figcaption>KY-040 Rotary Encoder Module</figcaption>
					</figure>
					Turn the rotary encoder to change the volume (never above the max volume). Wiring: GPIO 26 = encoder A (CLK), GPIO 24 = encoder B (DT), GPIO 10 = push button (to GND)
				</div>
				<script>
				(function () {
					var pop = null;
					function closePop() { if (pop) { document.body.removeChild(pop); pop = null; } }
					function openPop(icon) {
						var src = document.getElementById('rotary-info-src');
						var same = pop && pop.__icon === icon;
						closePop();
						if (same || !src) { return; }
						pop = document.createElement('div');
						pop.className = 'rotary-pop';
						pop.__icon = icon;
						pop.innerHTML = src.innerHTML;
						document.body.appendChild(pop);
						var r = icon.getBoundingClientRect();
						var w = pop.offsetWidth, h = pop.offsetHeight;
						var left = Math.max(16, Math.min(r.left - 8, window.innerWidth - w - 16));
						// below the icon; above it if there is no room underneath
						var top = r.bottom + 8;
						if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) { top = r.top - h - 8; }
						pop.style.left = left + 'px';
						pop.style.top = top + 'px';
					}
					document.addEventListener('click', function (e) {
						var icon = e.target.closest ? e.target.closest('.rotary-info') : null;
						if (icon) { openPop(icon); return; }
						if (pop && !pop.contains(e.target)) { closePop(); }
					});
					document.addEventListener('keydown', function (e) {
						if (e.key === 'Escape') { closePop(); return; }
						if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('rotary-info')) { e.preventDefault(); openPop(e.target); }
					});
					window.addEventListener('scroll', closePop, true);
					window.addEventListener('resize', closePop);
				})();
				</script>
				<?php
				$rotary_active = !empty($data["rotary"]["active"]);
				$rotary_button = $data["rotary"]["button"] ?? "off";
				echo "Rotary encoder: <b>" . ($rotary_active ? "active" : "not active") . "</b>";
				?>
				<br />
				<input id="saveForm" class="button_text" type="submit" name="rotary_toggle" value="<?php print $rotary_active ? "disable" : "enable"; ?>" />
			</li>
			<?php if( $rotary_active ) { ?>
			<li id="li_1" >
				<h2>Volume change per step</h2>
				<p>How many percent the volume changes with every click of the rotary encoder.</p>
				<div>
				<output id="rangeval" class="rangeval"><?php echo intval($data["rotary"]["step"] ?? 5); ?> %</output>
				<input class="range slider-progress" name="rotary_step" type="range" min="1" max="10" step="1" value="<?php echo intval($data["rotary"]["step"] ?? 5); ?>" oninput="this.previousElementSibling.value = this.value + ' %'">
				</div>
				<h2>Push button function (GPIO 10)</h2>
				<div><select id="rotary_button" name="rotary_button" class="element text medium">
				<?php
				$rotary_functions = array( "off" => "Inactive", "playpause" => "Toggle pause / play", "next" => "Next song", "ffwd" => "Fast forward (30 sec)" );
				foreach($rotary_functions as $value => $label) {
					$selected = ( $value == $rotary_button ) ? " selected=\"selected\"" : "";
					print "<option value=\"" . $value . "\"" . $selected . ">" . $label . "</option>";
				}
				?>
				</select></div>
			</li>
			<?php } ?>

			<li class="buttons">
				<input type="hidden" name="form_id" value="37271" />

				<input id="saveForm" class="button_text" type="submit" name="audioset" value="Submit" />
			</li>
		</ul>
	</details>

	<details id="poweronsettings">
		<summary><i class="fa-solid fa-power-off"></i> Power-on settings</summary>
		<ul>
		
			<li id="li_1" >
				<h2>Power-Off Button delay </h2>
				<p>Waiting time (in seconds) until the button is pressed as a shutdown indicator
				</p>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["timeout"]["pressDelay"];
				?> sec</output>				

				<input class="range slider-progress" name="pressDelay" type="range" min="0" max="5" step="0.25" value="<?php 
					echo $data["timeout"]["pressDelay"];
				?>" oninput="this.previousElementSibling.value = this.value + ' sec'"><output></output>
				</div>
			</li>

			<li id="li_1" >
				<h2>LED GPIO OnOffShim </h2>
				<p>Possible standard GPIO-Pins are 4, 12, 13 (default PIN), 17, 18, 21, 22, 23, 24, 25 and 27. GPIOs 4 and 17 are used by OnOffShim. GPIOs 18 and 21 are used by HifiBerry MiniAmp. Just use free GPIOs to avoid system errors.</p>
				<div><select id="ledPin" name="ledPin" class="element text small">
				
				<?php
				$leds = array( "4", "12", "13", "17", "18", "21", "22", "23", "24", "25", "27" );
				foreach($leds as $pin) {
				if( $pin == $data["shim"]["ledPin"] )
				{
				$selected = " selected=\"selected\"";
				}
				else
				{
				$selected = "";
				}
				print "<option value=\"". $pin . "\"" . $selected  . ">" . $pin . "</option>";
				}
				?>
				"</select>	
				</div>
			</li>

			<li id="li_1" >
				<h2>LED Brightness normal (from 0 to 100%)</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["shim"]["ledBrightnessMax"]
				?></output>				
				
				<input class="range slider-progress" name="ledmaxbrightness" type="range" min="0" max="100" step="1.0" value="<?php 
					echo $data["shim"]["ledBrightnessMax"]
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>

			<li id="li_1" >
				<h2>LED Brightness dimmed (from 0 to 100%)</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["shim"]["ledBrightnessMin"]
				?></output>				
				<input class="range slider-progress" name="ledminbrightness" type="range" min="0" max="100" step="1.0" value="<?php 
					echo $data["shim"]["ledBrightnessMin"]
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>

			<li class="buttons">
				<input type="hidden" name="form_id" value="37271" />

				<input id="saveForm" class="button_text" type="submit" name="powerset" value="Submit" />
			</li>
		</ul>
	</details>

	<details id="fancontrol">
		<summary><i class="fa-solid fa-fan"></i> Fan-Control</summary>
		<ul>
			<li id="li_1" >
				<h2>Fan GPIO</h2>
				<p>Possible standard GPIO-Pins are 4, 12 (default PIN), 13, 17, 18, 21, 22, 23, 24, 25 and 27. GPIOs 4 and 17 are used by OnOffShim. GPIOs 18 and 21 are used by HifiBerry MiniAmp. Just use free GPIOs to avoid system errors.</p>
				<div><select id="FanPin" name="FanPin" class="element text small">
				
				<?php
				$gpios = array( "4", "12", "13", "17", "18", "21", "22", "23", "24", "25", "27" );
				foreach($gpios as $pin) {
				if( $pin == $data["fan"]["fan_gpio"] )
				{
				$selected = " selected=\"selected\"";
				}
				else
				{
				$selected = "";
				}
				print "<option value=\"". $pin . "\"" . $selected  . ">" . $pin . "</option>";
				}
				?>
				"</select>	
				</div>
			</li>

			<li id="li_1" >
				<h2>Temperature fan at full speed (100%)</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["fan"]["fan_temp_100"] . " °C"
				?></output>				
				
				<input class="range slider-progress" name="fan_100" type="range" min="20" max="90" step="1.0" value="<?php 
					echo $data["fan"]["fan_temp_100"]
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>
			<li id="li_1" >
				<h2>Temperature fan at 75%</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["fan"]["fan_temp_75"] . " °C"
				?></output>				
				
				<input class="range slider-progress" name="fan_75" type="range" min="20" max="90" step="1.0" value="<?php 
					echo $data["fan"]["fan_temp_75"]
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>
			<li id="li_1" >
				<h2>Temperature fan at 50%</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["fan"]["fan_temp_50"] . " °C"
				?></output>				
				
				<input class="range slider-progress" name="fan_50" type="range" min="20" max="90" step="1.0" value="<?php 
					echo $data["fan"]["fan_temp_50"]
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>
			<li id="li_1" >
				<h2>Temperature fan at 25%</h2>
				<div>
					<output id="rangeval" class="rangeval"><?php 
					echo $data["fan"]["fan_temp_25"] . " °C"
				?></output>				
				
				<input class="range slider-progress" name="fan_25" type="range" min="20" max="90" step="1.0" value="<?php 
					echo $data["fan"]["fan_temp_25"]
				?>" oninput="this.previousElementSibling.value = this.value">
				</div>
			</li>
			<li id="li_1" >
	<h2>Fan activation</h2>
	<p>This setting activates the fan.</p>
	<label class="labelchecked" for="fan">Fan activation state:&nbsp; &nbsp; <input type="checkbox" id="fan_active"  name="fan_active" <?php
	if( $data["fan"]["fan_active"] )
		{
		print "checked";
		}
?> /></label>


			<li class="buttons">
				<input id="saveForm" class="button_text" type="submit" name="fan_control" value="Submit" />
			</li>
		</ul>
	</details>

	<details id="systemsettings">
		<summary><i class="fa-solid fa-screwdriver-wrench"></i> System settings</summary>
		<ul>
			<li id="li_1" >
				<h2>Hostname </h2>
				<div>
				<input id="hostname" name="hostname" class="element text medium" type="text" maxlength="255" value="<?php
				print $data["mupibox"]["host"];
				?>"/>
				</div>
			</li>
			<li class="buttons">
				<input type="hidden" name="form_id" value="37271" />

				<input id="saveForm" class="button_text" type="submit" name="submithn" value="Submit" />
			</li>
			
			<li class="li_1"><h2>Overclock SD Card</h2>
				<p>
				Just for highspeed SD Cards. You can damage data or the microSD itself!
				</p>
				<p>
				<?php
				echo "Overclocking state: <b>".$sd_state."</b>";
				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_sd" value="<?php print $change_sd; ?>" />
			</li>

			<li class="li_1"><h2>PM2-Logs to RAM</h2>
				<p>
				To protect the microSD, the logs can be swapped out to RAM. However, logs can no longer be evaluated after a restart.
				</p>
				<p>
				<?php
				echo "PM2-Logs to RAM: <b>".$pm2_state."</b>";
				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_pm2log" value="<?php print $change_pm2; ?>" />
			</li>

			<li class="li_1"><h2>Wait for Network on boot</h2>
				<p>
				Speeds up the boot time, but sometimes the boot process is to fast and you have to wait for the network to be ready... Try it, if disabling this option works for you!
				</p>
				<p>
				<?php
				echo "Wait for Network on boot: <b>".$netboot_state."</b>";
				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_netboot" value="<?php print $change_netboot; ?>" />
			</li>

			<li class="li_1"><h2>Initial Turbo</h2>
				<p>
				Initial Turbo avoids throtteling sometimes...
				</p>
				<p>
				<?php
				$command = "cat /boot/config.txt | grep initial_turbo | cut -d '=' -f 2";
				$turbo = exec($command, $output);
				echo "Turbo seconds: <b>".$turbo."</b>";
				if($turbo == 0)
					{
					$change_turbo="enable";
					}
				else
					{
					$change_turbo="disable";
					}

				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_turbo" value="<?php print $change_turbo; ?>" />
			</li>

			<li class="li_1"><h2>CPU Governor</h2>
				<p>
				Try powersave (Limits CPU frequency to 600 MHz - Helps to avoid throtteling).
				</p>
				<p>
				<div>
				<select id="cpugovernor" name="cpugovernor" class="element text medium">
				<?php
				$command = "cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors";
				$governors = exec($command, $output);
				$cpug = explode(" ", $governors);
				$command = "cat /boot/dietpi.txt | grep CONFIG_CPU_GOVERNOR | cut -d '=' -f 2";
				$current_governor = exec($command, $output);

				foreach($cpug as $key) {
				if( $key == $current_governor )
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
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_cpug" value="Save CPU Governor" />
			</li>

			<li class="li_1"><h2>Disable Warnings (Throtteling Warning)</h2>
				<p>
				Enables or disables the lightning icon (warning)! In worst case, this option can cause you loose all your data.
				</p>
				<p>
				<?php
				$command = "cat /boot/config.txt | grep 'avoid_warnings=1'";
				$warnings = exec($command, $output);
				if($warnings == "")
					{
					$change_warnings="enable";
					echo "Warnings: <b>disabled</b>";
					}
				else
					{
					$change_warnings="disable";
					echo "Warnings: <b>enabled</b>";
					}
				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_warnings" value="<?php print $change_warnings; ?>" />
			</li>

			<li class="li_1"><h2>SWAP</h2>
				<p>
				Enables or disables SWAP!
				</p>
				<p>
				<?php
				$command = "cat /boot/dietpi.txt | grep AUTO_SETUP_SWAPFILE_SIZE= | cut -d '=' -f 2";
				$currentswapsize = exec($command, $output);
				if($currentswapsize == 0)
					{
					$change_swap="enable";
					}
				else
					{
					$change_swap="disable";
					}

				echo "SWAP Size: <b>".$currentswapsize." MB</b>";
				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_swap" value="<?php print $change_swap; ?>" />
			</li>
		</ul>
	</details>

	<details id="chromiumparameters">
		<summary><i class="fa-brands fa-chrome"></i> Chromium browser parameters</summary>
		<ul>
			<li id="li_1" >
			<h2>GPU-Support (experimental)</h2>
				<p>
				Enables or disables GPU-Support! This setting is disabled by default.
				</p>
				<p>
				<?php
				if($data["chromium"]["gpu"])
					{
					$currentgpusupport="active";
					$change_gpu="disable";
					}
				else
					{
					$currentgpusupport="disabled";
					$change_gpu="enable";
					}

				echo "GPU-Support: <b>".$currentgpusupport."</b>";
				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_gpu" value="<?php print $change_gpu; ?>" />

			<h2>Smooth scrolling animation (experimental)</h2>
				<p>
				Enables or disables scroll animation! This setting is disabled by default.
				</p>
				<p>
				<?php
				if($data["chromium"]["sccrollanimation"])
					{
					$currentsmoothscrolling="active";
					$change_smoothscrolling="disable";
					}
				else
					{
					$currentsmoothscrolling="disabled";
					$change_smoothscrolling="enable";
					}

				echo "Smooth scrolling: <b>".$currentsmoothscrolling."</b>";
				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_smoothscrolling" value="<?php print $change_smoothscrolling; ?>" />
			<h2>Kiosk mode</h2>
				<p>
				Enables or disables kiosk mode! This setting is enabled by default.
				</p>
				<p>
				<?php
				if($data["chromium"]["kiosk"])
					{
					$currentkiosk="active";
					$change_kiosk="disable";
					}
				else
					{
					$currentkiosk="disabled";
					$change_kiosk="enable";
					}

				echo "Kiosk mode: <b>".$currentkiosk."</b>";
				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_kiosk" value="<?php print $change_kiosk; ?>" />
				<h2>Cache size</h2>
				<p>Set chromium cache size in MB. Default value is 128.</p>
				<div>
				<select id="" name="cachesize" class="element text medium">
				<?php 
				$cache_sizes = array(0,8,16,32,64,128,256,512,1024,2048);
				foreach($cache_sizes as $mb) {
				if( $mb == $data["chromium"]["cachesize"] )
					{
					$selected = " selected=\"selected\"";
					}
				else
					{
					$selected = "";
					}
				print "<option value=\"". $mb . "\"" . $selected  . ">" . $mb . " MB</option>";
				}
				?>
				</select></div>
				<input id="saveForm" class="button_text" type="submit" name="change_cache" value="Change cache" />


			</li>

		</ul>
	</details>



</form><p>
<?php
 include ('includes/footer.php');
?>


<script>

for (let e of document.querySelectorAll('input[type="range"].slider-progress')) {
  e.style.setProperty('--value', e.value);
  e.style.setProperty('--min', e.min == '' ? '0' : e.min);
  e.style.setProperty('--max', e.max == '' ? '100' : e.max);
  e.addEventListener('input', () => e.style.setProperty('--value', e.value));
}

</script>
