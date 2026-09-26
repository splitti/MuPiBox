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

	if($_POST['stop_sleeptimer'] == "Stop running timer")
		{
		$command = "sudo pkill -f \"sleep_timer.sh\"";
		exec($command);
		$command = "sudo rm /tmp/.time2sleep";
		exec($command);
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Sleeptimer stopped</li>";
		}

	// Changing the password needs the current one (a forged request or an unattended browser must
	// not be able to replace it), and the new one must not be empty or shorter than the form allows.
	if($_POST['submitpw'])
		{
		$newpwd = (string)($_POST['newpwd'] ?? '');
		$curpwd = (string)($_POST['curpwd'] ?? '');
		$oldhash = $data["interfacelogin"]["password"] ?? '';
		if( strlen($newpwd) < 6 )
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>Password not changed: at least 6 characters</li>";
			$change = 3; // message only, nothing saved (else the refusal was not shown at all)
			}
		else if( $oldhash !== '' && !password_verify($curpwd, $oldhash) )
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>Password not changed: current password is wrong</li>";
			$change = 3;
			}
		else
			{
			$hash = password_hash($newpwd, PASSWORD_DEFAULT);
			$data["interfacelogin"]["password"]=$hash;
			$change=1;
			$CHANGE_TXT=$CHANGE_TXT."<li>New password has been set</li>";
			}
		}


	if($_POST['change_login'])
		{
		if($data["interfacelogin"]["state"])
			{
			$data["interfacelogin"]["state"]=false;	
			$CHANGE_TXT=$CHANGE_TXT."<li>Login disabled</li>";
			}
		else
			{
			$data["interfacelogin"]["state"]=true;	
			$CHANGE_TXT=$CHANGE_TXT."<li>Login enabled</li>";
			}
		$change=1;
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
			
	if($_POST['potimer'])
		{
		// powerofftimer is in minutes (admin-typed). intval() forces it to
		// an integer; the *60 just produces another integer, so even
		// without escapeshellarg() the shell only sees digits. Plus a
		// sanity cap: 24 hours is the longest a parent could reasonably
		// want, beyond that it's an input mistake or an attacker.
		$minutes = intval($_POST['powerofftimer'] ?? 0);
		if ($minutes > 0 && $minutes <= 24 * 60)
			{
			$timerSleepingTime = $minutes * 60;
			$command = "sudo nohup /usr/local/bin/mupibox/./sleep_timer.sh " . $timerSleepingTime . "  > /dev/null 2>&1 &";
			exec($command);
			$change=3;
			$CHANGE_TXT=$CHANGE_TXT."<li>" . $minutes . " minutes sleeptimer started</li>";
			//sudo pkill -f "sleep_timer.sh"
			}
		else
			{
			$CHANGE_TXT=$CHANGE_TXT."<li>ERROR: invalid sleeptimer value, refused</li>";
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
		$command = "sudo sed -i -e 's/avoid_warnings=1//g' /boot/config.txt && sudo head -n -1 /boot/config.txt > /tmp/config.txt && sudo mv /tmp/config.txt /boot/config.txt";
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
		$command = "sudo sed -i -e 's/dtoverlay=sdtweak,overclock_50=100//g' /boot/config.txt && sudo head -n -1 /boot/config.txt > /tmp/config.txt && sudo mv /tmp/config.txt /boot/config.txt";
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

 if( $data["mupibox"]["maxVolume"]!=$_POST['maxVolume'] && $_POST['audioset'] )
  {
  $data["mupibox"]["maxVolume"]=$_POST['maxVolume'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Max Volume is set to ".$data["mupibox"]["maxVolume"]."% [reboot is necessary]</li>";
  $change=2;
  }

 if( $data["mupibox"]["startVolume"]!=$_POST['volume'] && $_POST['audioset'] )
  {
  $data["mupibox"]["startVolume"]=$_POST['volume'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Start Volume is set to ".$data["mupibox"]["startVolume"]."%</li>";
  $change=2;
  }
 if($_POST['idletime'])
  {
  $data["timeout"]["idlePiShutdown"]=$_POST['idlePiShutdown'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Idle Shutdown Time is set to ".$data["timeout"]["idlePiShutdown"]." minutes</li>";
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
 // How playback may go on when a limit is reached: stop | track (let the song finish) | album (let the album finish).
 // Older configs only have maxOverrunMinutes: 0 meant stop at once, anything else let the song finish.
 function grace_mode_of($block)
  {
  if( is_array($block) && isset($block['graceMode']) && in_array($block['graceMode'], array('stop','track','album'), true) ) return $block['graceMode'];
  if( is_array($block) && isset($block['maxOverrunMinutes']) && intval($block['maxOverrunMinutes']) === 0 ) return 'stop';
  return 'track';
  }
 function grace_mode_posted($name)
  {
  return ( isset($_POST[$name]) && in_array($_POST[$name], array('stop','track','album'), true) ) ? $_POST[$name] : 'track';
  }
 $playtime_changed = false;
 if( $_POST['playtime_save'] )
  {
  if( !isset($data["playtimeLimit"]) || !is_array($data["playtimeLimit"]) )
   {
   $data["playtimeLimit"] = array(
    "enabled" => false,
    "resetHour" => 0,
    "graceMode" => "track",
    "limitsMinutes" => array("mon"=>60,"tue"=>60,"wed"=>60,"thu"=>60,"fri"=>60,"sat"=>60,"sun"=>60),
   );
   }
  if( !isset($data["playtimeLimit"]["limitsMinutes"]) || !is_array($data["playtimeLimit"]["limitsMinutes"]) )
   {
   $data["playtimeLimit"]["limitsMinutes"] = array("mon"=>60,"tue"=>60,"wed"=>60,"thu"=>60,"fri"=>60,"sat"=>60,"sun"=>60);
   }
  $data["playtimeLimit"]["enabled"] = (isset($_POST['playtime_enabled']) && $_POST['playtime_enabled'] === '1');
  $data["playtimeLimit"]["resetHour"] = max(0, min(23, intval($_POST['playtime_resetHour'])));
  $data["playtimeLimit"]["graceMode"] = grace_mode_posted('playtime_graceMode');
  unset($data["playtimeLimit"]["maxOverrunMinutes"]);
  $playtime_days = array('mon','tue','wed','thu','fri','sat','sun');
  foreach( $playtime_days as $d )
   {
   $field = 'playtime_limit_' . $d;
   $val = isset($_POST[$field]) ? intval($_POST[$field]) : 60;
   $data["playtimeLimit"]["limitsMinutes"][$d] = max(0, min(1440, $val));
   }
  $playtime_changed = true;
  $CHANGE_TXT = $CHANGE_TXT."<li>Playtime limit settings saved (live, no restart needed)</li>";
  $change = 2;
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

 if( $_POST['quiethours_save'] )
  {
  if( !isset($data["quietHours"]) || !is_array($data["quietHours"]) )
   {
   $data["quietHours"] = array(
    "enabled" => false,
    "graceMode" => "track",
    "schedule" => array("mon"=>array(),"tue"=>array(),"wed"=>array(),"thu"=>array(),"fri"=>array(),"sat"=>array(),"sun"=>array()),
   );
   }
  $data["quietHours"]["enabled"] = (isset($_POST['quiethours_enabled']) && $_POST['quiethours_enabled'] === '1');
  $data["quietHours"]["graceMode"] = grace_mode_posted('quiethours_graceMode');
  unset($data["quietHours"]["maxOverrunMinutes"]);
  $quiethours_days = array('mon','tue','wed','thu','fri','sat','sun');
  $quiethours_window_count = 0;
  // The rule fields are built by the page script. Without its marker (script failed or JS off) the posted
  // form has no windows at all: keep the stored schedule instead of saving every day as empty.
  $quiethours_windows_posted = isset($_POST['quiet_windows_present']) && $_POST['quiet_windows_present'] === '1';
  foreach( ($quiethours_windows_posted ? $quiethours_days : array()) as $d )
   {
   $rawWindows = isset($_POST['quiet_windows'][$d]) && is_array($_POST['quiet_windows'][$d]) ? $_POST['quiet_windows'][$d] : array();
   $cleaned = array();
   foreach( $rawWindows as $w )
    {
    if( !is_array($w) ) continue;
    $from = isset($w['from']) ? trim($w['from']) : '';
    $to = isset($w['to']) ? trim($w['to']) : '';
    // Skip incomplete rows (so add-row-then-don't-fill doesn't pollute config).
    if( $from === '' || $to === '' ) continue;
    if( !preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/', $from) ) continue;
    if( !preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/', $to) ) continue;
    $entry = array('from' => $from, 'to' => $to);
    $label = isset($w['label']) ? trim($w['label']) : '';
    if( $label !== '' ) $entry['label'] = $label;
    $cleaned[] = $entry;
    $quiethours_window_count++;
    }
   $data["quietHours"]["schedule"][$d] = array_values($cleaned);
   }
  $playtime_changed = true;
  $CHANGE_TXT = $CHANGE_TXT."<li>Quiet hours saved (".($quiethours_windows_posted ? $quiethours_window_count." window(s)" : "rules unchanged").", live, no restart needed)</li>";
  $change = 2;
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
 // Note: playtime/quiet-hours saves used to trigger `pm2 restart spotify-control` here
 // because the player cached mupiboxconfig.json at startup via require(). The player
 // now does live-reload via fs.watch, so the restart is no longer needed for those
 // sub-blocks — the changes take effect within ~50ms without an audio gap.
 // $playtime_changed stays as a flag in case future code wants to react to it.

$CHANGE_TXT=$CHANGE_TXT."</ul></div>";
?>


<form class="appnitro" name="mupi" method="post" action="mupi.php" id="form"  enctype="multipart/form-data">
<div class="description">
<h2>MupiBox settings</h2>
<p>This is the central configuration of your MuPiBox...</p>
</div>

	<details id="loginsettings">
		<summary><i class="fa-solid fa-user-lock"></i> Login settings</summary>
		<ul>
			<li id="li_1" >
				<h2>Password </h2>
				<p>
				The default password is "MuP1B0x"!
				</p>
				<div>
				<label for="curpwd">Current password</label>
				<input id="curpwd" name="curpwd" class="element text medium" type="password" maxlength="255" value="" autocomplete="current-password"/>
				<label for="newpwd">New password</label>
				<input id="newpwd" name="newpwd" class="element text medium" type="password" minlength="6" maxlength="255" value="" autocomplete="new-password"/>
				<input type="submit" class="button_text" value="Set new password" name="submitpw" >
				</div>
			</li>
		</ul>
		<ul>
			<li class="li_1"><h2>Enable login</h2>
				<p>
				The login will be instantly activated after enabling this option!
				</p>
				<p>
				<?php
				if ($data['interfacelogin']['state']) {
					$login_state="enabled";
					$login_button="disable";
					}
				else {
					$login_state="disabled";
					$login_button="enable";
					}
				echo "Login state: <b>".$login_state."</b>";
				?>
				</p>
				<input id="saveForm" class="button_text" type="submit" name="change_login" value="<?php print $login_button; ?>" />
			</li>

		</ul>
	</details>


	<details id="timerseetings">
		<summary><i class="fa-solid fa-clock"></i> Timer settings</summary>
		<ul>
			<li id="li_1" >
				<h2>Sleeptimer</h2>
				<?php
				if (file_exists("/tmp/.time2sleep")) {
						?>
					MuPiBox will shut down  after (hh:mm:ss):</br>
					<div id="app"></div>
									</li>
				<li class="buttons">
				<input type="hidden" name="form_id" value="37271" />

				<input id="saveForm" class="button_text_red" type="submit" name="stop_sleeptimer" value="Stop running timer" />
			</li>

						<?php
				} else { ?>
				How many minutes to shut down MuPiBox (default 60 minutes):
				<br/>
				<div>
					<output id="rangeval" class="rangeval">60 min</output>
					<input class="range slider-progress" list="steplist_po" data-tick-step="60" name="powerofftimer" type="range" min="15" max="360" step="15.0" value="60" oninput="this.previousElementSibling.value = this.value + ' min'">
					<datalist id="steplist_po">
				<option>15</option>
				<option>30</option>
				<option>45</option>
				<option>60</option>
				<option>75</option>
				<option>90</option>
				<option>105</option>
				<option>120</option>
				<option>135</option>
				<option>150</option>
				<option>165</option>
				<option>180</option>
				<option>195</option>
				<option>210</option>
				<option>225</option>
				<option>240</option>
				<option>255</option>
				<option>270</option>
				<option>285</option>
				<option>300</option>
				<option>315</option>
				<option>330</option>
				<option>345</option>
				<option>360</option>
			</datalist>

				</div>
			</li>
			<li class="buttons">
				<input type="hidden" name="form_id" value="37271" />

				<input id="saveForm" class="button_text" type="submit" name="potimer" value="Start Power-Off Timer" />
			</li>
				<?php } ?>
			<li id="li_1" >
				<h2>Idle time to shutdown </h2>
				<p>Idle time (in minutes) without playback until the box turns off:</p>
				<div>
					<output id="rangeval" class="rangeval"><?php echo $data["timeout"]["idlePiShutdown"]; ?> min</output>
					<input class="range slider-progress" list="steplist_po" data-tick-step="60" name="idlePiShutdown" type="range" min="0" max="300" step="15.0" value="<?php echo $data["timeout"]["idlePiShutdown"]; ?>" oninput="this.previousElementSibling.value = this.value + ' min'">
				</div>

			</li>
			<li class="buttons">
				<input type="hidden" name="form_id" value="37271" />

				<input id="saveForm" class="button_text" type="submit" name="idletime" value="Submit idle time" />
			</li>
		</ul>
	</details>

	<details id="playtimelimit">
		<summary><i class="fa-solid fa-hourglass-half"></i> Daily playtime limit</summary>
		<ul>
			<li id="li_1">
				<h2>About</h2>
				<p>Caps the total daily listening time on the box. When the limit is reached, playback stops and new playback is refused until the next day. Set a day to <b>0</b> to block playback completely on that day. Settings take effect after saving (the player is restarted automatically).</p>
			</li>
			<li id="li_1">
				<h2>Status</h2>
				<?php
				$playtime_enabled_state = ( isset($data["playtimeLimit"]["enabled"]) && $data["playtimeLimit"]["enabled"] ) ? true : false;
				$playtime_resetHour = isset($data["playtimeLimit"]["resetHour"]) ? intval($data["playtimeLimit"]["resetHour"]) : 0;
				$playtime_limits = isset($data["playtimeLimit"]["limitsMinutes"]) && is_array($data["playtimeLimit"]["limitsMinutes"]) ? $data["playtimeLimit"]["limitsMinutes"] : array();
				echo '<p>Currently: <b>'.($playtime_enabled_state ? 'ENABLED' : 'DISABLED').'</b></p>';
				?>
				<?php /* The field keeps the current state for the normal Save; the button below flips it and saves at once. */ ?>
				<input type="hidden" name="playtime_enabled" id="playtime_enabled_field" value="<?php echo $playtime_enabled_state ? '1' : '0'; ?>">
				<input type="submit" class="button_text" name="playtime_save" value="<?php echo $playtime_enabled_state ? 'Disable' : 'Enable'; ?>" title="Enable / disable the daily limit" onclick="document.getElementById('playtime_enabled_field').value='<?php echo $playtime_enabled_state ? '0' : '1'; ?>';">
			</li>
			<li id="li_1">
				<h2>Reset hour (0 - 23)</h2>
				<p>Hour of day at which the counter resets to 0. <b>0</b> = midnight. Use e.g. <b>4</b> if you don't want a reset to interrupt late evening listening.</p>
				<input type="number" name="playtime_resetHour" min="0" max="23" step="1" value="<?php echo $playtime_resetHour; ?>">
			</li>
			<li id="li_1">
				<h2>When the daily limit is reached</h2>
				<p>What happens to what is playing when today's time is used up. Nothing new is started after the limit. Letting the song or album finish is capped at 30 minutes / 3 hours as a safety net (very long audiobooks). <b>Whatever you choose: podcasts may always finish the current episode, and radio streams are always stopped at once.</b></p>
				<?php $playtime_graceMode = grace_mode_of(isset($data["playtimeLimit"]) ? $data["playtimeLimit"] : null); ?>
				<select name="playtime_graceMode">
					<option value="stop" <?php echo $playtime_graceMode === 'stop' ? 'selected' : ''; ?>>Stop immediately</option>
					<option value="track" <?php echo $playtime_graceMode === 'track' ? 'selected' : ''; ?>>Let the current song finish</option>
					<option value="album" <?php echo $playtime_graceMode === 'album' ? 'selected' : ''; ?>>Let the current album finish</option>
				</select>
			</li>
			<li id="li_1">
				<h2>Daily limit per weekday (minutes)</h2>
				<p>Set <b>0</b> to block playback entirely on that day. Maximum 1440 (= 24 h).</p>
				<table class="version">
					<tr><th>Day</th><th>Minutes per day</th></tr>
					<?php
					$playtime_day_labels = array(
						'mon' => 'Monday',
						'tue' => 'Tuesday',
						'wed' => 'Wednesday',
						'thu' => 'Thursday',
						'fri' => 'Friday',
						'sat' => 'Saturday',
						'sun' => 'Sunday',
					);
					foreach( $playtime_day_labels as $key => $label )
						{
						$val = isset($playtime_limits[$key]) ? intval($playtime_limits[$key]) : 60;
						echo '<tr><td>'.$label.'</td><td><input type="number" name="playtime_limit_'.$key.'" min="0" max="1440" step="1" value="'.$val.'"> min</td></tr>';
						}
					?>
				</table>
			</li>
			<li class="buttons">
				<input type="hidden" name="form_id" value="37271" />
				<input id="saveForm" class="button_text" type="submit" name="playtime_save" value="Save playtime settings" />
			</li>
		</ul>
	</details>

	<details id="quiethours">
		<summary><i class="fa-solid fa-moon"></i> Quiet hours</summary>
		<ul>
			<li id="li_1">
				<h2>About</h2>
				<p>Define time windows per weekday during which playback is automatically blocked (e.g. homework, mealtimes, bedtime). Multiple windows per day are supported.</p>
				<p><b>How a window is interpreted:</b></p>
				<ul style="margin-left:1.2em;list-style:disc;">
					<li>A window <b>belongs to the day it starts on</b>.</li>
					<li>If <b>from</b> is later than <b>to</b>, the window automatically continues into the next morning.</li>
					<li><b>Example:</b> a single entry on <i>Monday</i> with <code>from 20:00 → to 08:00</code> blocks playback Monday evening <i>and</i> Tuesday morning until 08:00. You do <b>not</b> need a separate Tuesday entry for the same night.</li>
					<li>Multiple windows on the same day combine — e.g. add a <code>14:00 → 16:00 (Homework)</code> alongside <code>20:00 → 08:00 (Bedtime)</code> to block both periods.</li>
					<li>The optional <b>label</b> is shown to the kid on the block screen (e.g. „Homework", „Bedtime").</li>
				</ul>
				<p>Settings take effect after saving (the player is restarted automatically).</p>
			</li>
			<li id="li_1">
				<h2>Status</h2>
				<?php
				$qh_enabled_state = ( isset($data["quietHours"]["enabled"]) && $data["quietHours"]["enabled"] ) ? true : false;
				$qh_schedule = isset($data["quietHours"]["schedule"]) && is_array($data["quietHours"]["schedule"]) ? $data["quietHours"]["schedule"] : array();
				echo '<p>Currently: <b>'.($qh_enabled_state ? 'ENABLED' : 'DISABLED').'</b></p>';
				?>
				<?php /* The field keeps the current state for the normal Save; the button below flips it and saves at once. */ ?>
				<input type="hidden" name="quiethours_enabled" id="quiethours_enabled_field" value="<?php echo $qh_enabled_state ? '1' : '0'; ?>">
				<input type="submit" class="button_text" name="quiethours_save" value="<?php echo $qh_enabled_state ? 'Disable' : 'Enable'; ?>" title="Enable / disable quiet hours" onclick="document.getElementById('quiethours_enabled_field').value='<?php echo $qh_enabled_state ? '0' : '1'; ?>';">
			</li>
			<li id="li_1">
				<h2>When a quiet window starts</h2>
				<p>What happens to what is playing when a quiet window begins. Nothing new is started during the window. Letting the song or album finish is capped at 30 minutes / 3 hours as a safety net. <b>Whatever you choose: podcasts may always finish the current episode, and radio streams are always stopped at once.</b></p>
				<?php $qh_graceMode = grace_mode_of(isset($data["quietHours"]) ? $data["quietHours"] : null); ?>
				<select name="quiethours_graceMode">
					<option value="stop" <?php echo $qh_graceMode === 'stop' ? 'selected' : ''; ?>>Stop immediately</option>
					<option value="track" <?php echo $qh_graceMode === 'track' ? 'selected' : ''; ?>>Let the current song finish</option>
					<option value="album" <?php echo $qh_graceMode === 'album' ? 'selected' : ''; ?>>Let the current album finish</option>
				</select>
			</li>
			<li id="li_1">
				<h2>Rules</h2>
				<p>Playback is blocked during these time spans. A span may run past midnight (e.g. 19:30 to 07:00).</p>
				<?php
				$qh_day_labels = array('mon' => 'Monday', 'tue' => 'Tuesday', 'wed' => 'Wednesday', 'thu' => 'Thursday', 'fri' => 'Friday', 'sat' => 'Saturday', 'sun' => 'Sunday');
				// the saved schedule as one flat list: {day, from, to, label}
				$qh_rules = array();
				foreach( $qh_day_labels as $key => $label ) {
					$windows = isset($qh_schedule[$key]) && is_array($qh_schedule[$key]) ? $qh_schedule[$key] : array();
					foreach( $windows as $w ) {
						if( !is_array($w) ) continue;
						$qh_rules[] = array(
							'day' => $key,
							'from' => isset($w['from']) ? (string)$w['from'] : '',
							'to' => isset($w['to']) ? (string)$w['to'] : '',
							'label' => isset($w['label']) ? (string)$w['label'] : '',
						);
					}
				}
				?>
				<style>
					.qr-add { margin: 4px 0 12px 0; }
					table.qr-table { width: 100%; max-width: 720px; border-collapse: collapse; font-size: 15px; }
					table.qr-table th { text-align: left; font-size: 13px; color: #8a8a8a; font-weight: bold; padding: 6px 10px; border-bottom: 1px solid #dcdcdc; }
					table.qr-table td { padding: 8px 10px; border-bottom: 1px solid #ececec; }
					table.qr-table td.qr-empty { color: #8a8a8a; font-style: italic; text-align: center; padding: 18px 10px; }
					table.qr-table td.qr-actions { width: 1%; white-space: nowrap; text-align: right; }
					.qr-del { border: 0; background: transparent; color: #b03030; font-size: 18px; cursor: pointer; padding: 0 6px; }
					.qr-back { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; background: rgba(0, 0, 0, .45); display: flex; align-items: center; justify-content: center; }
					.qr-modal { box-sizing: border-box; width: calc(100% - 32px); max-width: 620px; background: #fff; color: #222; border-radius: 12px; padding: 26px 28px 22px 28px; box-shadow: 0 8px 30px rgba(0, 0, 0, .35); text-align: left; }
					.qr-modal h3 { margin: 0 0 18px 0; font-size: 20px; }
					.qr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 24px; }
					.qr-field label { display: block; font-size: 14px; font-weight: bold; color: #a0a0a0; margin: 0 0 6px 2px; }
					.qr-field select, .qr-field input[type=text] { box-sizing: border-box; width: 100%; height: 44px; padding: 0 14px; font-size: 16px; color: #222; background: #f9f9f9; border: 1px solid #dcdcdc; border-radius: 6px; outline: none; }
					.qr-field select:focus, .qr-field input[type=text]:focus { border-color: #b5b5b5; background: #fbfbfb; }
					.qr-error { min-height: 20px; margin: 12px 2px 0 2px; color: #b03030; font-size: 14px; }
					.qr-foot { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; padding-top: 18px; border-top: 1px solid #e5e5e5; }
					.qr-btn { box-sizing: border-box; height: 40px; padding: 0 20px; font-size: 15px; letter-spacing: .5px; text-transform: uppercase; border-radius: 4px; cursor: pointer; }
					.qr-cancel { background: #fff; color: #777; border: 2px solid #e2e2e2; }
					.qr-save { background: #7d7d7d; color: #fff; border: 2px solid #7d7d7d; }
					.qr-save:hover { background: #666; border-color: #666; }
					@media (max-width: 560px) { .qr-grid { grid-template-columns: 1fr; } }
				</style>
				<input type="button" class="button_text qr-add" id="qr-add" value="Add rule" />
				<table class="qr-table" id="qr-table">
					<thead><tr><th>Weekday</th><th>From</th><th>To</th><th>Label</th><th></th></tr></thead>
					<tbody id="qr-body"></tbody>
				</table>
				<div id="qr-hidden"></div>
			</li>
			<li class="buttons">
				<input type="hidden" name="form_id" value="37271" />
				<input id="saveForm" class="button_text" type="submit" name="quiethours_save" value="Save quiet hours" />
			</li>
		</ul>
	</details>

	<script>
	// Quiet-hours rules: a table plus a popup to add one. The rules are sent with the form as hidden fields
	// (quiet_windows[day][n][from|to|label]); "Save rule" and the delete button store the change at once.
	(function () {
		var DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
		var rules = <?php echo json_encode($qh_rules, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
		var body = document.getElementById('qr-body');
		var hidden = document.getElementById('qr-hidden');
		var addBtn = document.getElementById('qr-add');
		if (!body || !hidden || !addBtn) { return; }
		var form = addBtn.closest('form');
		if (!form) { return; }

		function dayName(key) { for (var i = 0; i < DAYS.length; i++) { if (DAYS[i][0] === key) { return DAYS[i][1]; } } return key; }
		function dayIndex(key) { for (var i = 0; i < DAYS.length; i++) { if (DAYS[i][0] === key) { return i; } } return 99; }
		function sortRules() {
			rules.sort(function (a, b) { return dayIndex(a.day) - dayIndex(b.day) || String(a.from).localeCompare(String(b.from)); });
		}

		function cell(text) { var td = document.createElement('td'); td.textContent = text; return td; }
		function render() {
			sortRules();
			body.innerHTML = '';
			if (rules.length === 0) {
				var tr = document.createElement('tr');
				var td = document.createElement('td');
				td.colSpan = 5;
				td.className = 'qr-empty';
				td.textContent = 'No entry';
				tr.appendChild(td);
				body.appendChild(tr);
			}
			rules.forEach(function (rule, i) {
				var row = document.createElement('tr');
				row.appendChild(cell(dayName(rule.day)));
				row.appendChild(cell(rule.from));
				row.appendChild(cell(rule.to));
				row.appendChild(cell(rule.label || ''));
				var act = document.createElement('td');
				act.className = 'qr-actions';
				var del = document.createElement('button');
				del.type = 'button';
				del.className = 'qr-del';
				del.title = 'Delete rule';
				del.innerHTML = '&times;';
				del.addEventListener('click', function () {
					if (!confirm('Delete this rule?')) { return; }
					rules.splice(i, 1);
					persist();
				});
				act.appendChild(del);
				row.appendChild(act);
				body.appendChild(row);
			});
			// the hidden fields the PHP save reads
			hidden.innerHTML = '';
			// tells the PHP save that the rule fields below are complete (see quiet_windows_present)
			var present = document.createElement('input');
			present.type = 'hidden';
			present.name = 'quiet_windows_present';
			present.value = '1';
			hidden.appendChild(present);
			var perDay = {};
			rules.forEach(function (rule) {
				var n = perDay[rule.day] = (perDay[rule.day] === undefined ? 0 : perDay[rule.day] + 1);
				['from', 'to', 'label'].forEach(function (field) {
					var input = document.createElement('input');
					input.type = 'hidden';
					input.name = 'quiet_windows[' + rule.day + '][' + n + '][' + field + ']';
					input.value = rule[field] || '';
					hidden.appendChild(input);
				});
			});
		}
		// stores the rules right away by submitting the quiet-hours part of the form
		function persist() {
			render();
			var save = document.createElement('input');
			save.type = 'hidden';
			save.name = 'quiethours_save';
			save.value = '1';
			hidden.appendChild(save);
			form.submit();
		}

		function timeOptions() {
			var html = '';
			for (var m = 0; m < 24 * 60; m += 15) {
				var t = ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
				html += '<option value="' + t + '">' + t + '</option>';
			}
			return html;
		}
		function field(labelText, control) {
			var wrap = document.createElement('div');
			wrap.className = 'qr-field';
			var label = document.createElement('label');
			label.textContent = labelText;
			wrap.appendChild(label);
			wrap.appendChild(control);
			return wrap;
		}

		function openPopup() {
			var back = document.createElement('div');
			back.className = 'qr-back';
			var modal = document.createElement('div');
			modal.className = 'qr-modal';
			var title = document.createElement('h3');
			title.textContent = 'Add rule';
			modal.appendChild(title);

			var daySel = document.createElement('select');
			DAYS.forEach(function (d) { var o = document.createElement('option'); o.value = d[0]; o.textContent = d[1]; daySel.appendChild(o); });
			var labelIn = document.createElement('input');
			labelIn.type = 'text';
			labelIn.maxLength = 60;
			labelIn.placeholder = 'e.g. Bedtime';
			var fromSel = document.createElement('select');
			fromSel.innerHTML = timeOptions();
			fromSel.value = '19:30';
			var toSel = document.createElement('select');
			toSel.innerHTML = timeOptions();
			toSel.value = '07:00';

			var grid = document.createElement('div');
			grid.className = 'qr-grid';
			grid.appendChild(field('Weekday', daySel));
			grid.appendChild(field('Label (optional)', labelIn));
			grid.appendChild(field('From', fromSel));
			grid.appendChild(field('To', toSel));
			modal.appendChild(grid);

			var err = document.createElement('div');
			err.className = 'qr-error';
			modal.appendChild(err);

			var foot = document.createElement('div');
			foot.className = 'qr-foot';
			var cancel = document.createElement('button');
			cancel.type = 'button';
			cancel.className = 'qr-btn qr-cancel';
			cancel.innerHTML = '&#10005;&nbsp; Cancel';
			var save = document.createElement('button');
			save.type = 'button';
			save.className = 'qr-btn qr-save';
			save.innerHTML = '&#10003;&nbsp; Save rule';
			foot.appendChild(cancel);
			foot.appendChild(save);
			modal.appendChild(foot);
			back.appendChild(modal);
			document.body.appendChild(back);

			function close() { document.body.removeChild(back); document.removeEventListener('keydown', onKey); }
			function onKey(e) { if (e.key === 'Escape') { close(); } }
			document.addEventListener('keydown', onKey);
			cancel.addEventListener('click', close);
			back.addEventListener('mousedown', function (e) { if (e.target === back) { close(); } });
			save.addEventListener('click', function () {
				var rule = { day: daySel.value, from: fromSel.value, to: toSel.value, label: labelIn.value.trim() };
				if (rule.from === rule.to) { err.textContent = 'From and To must be different.'; return; }
				var exists = rules.some(function (r) { return r.day === rule.day && r.from === rule.from && r.to === rule.to; });
				if (exists) { err.textContent = 'This rule already exists.'; return; }
				rules.push(rule);
				close();
				persist();
			});
			daySel.focus();
		}

		addBtn.addEventListener('click', openPopup);
		render();
	})();
	</script>

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
				foreach( $display_text_fields as $dt_key => $dt_label )
					{
					$dt_current = isset($display_texts_stored[$dt_key]) && is_string($display_texts_stored[$dt_key]) ? $display_texts_stored[$dt_key] : '';
					echo '<h2>'.htmlspecialchars($dt_label, ENT_QUOTES).'</h2>';
					echo '<input type="text" class="element text large" name="dt_'.htmlspecialchars($dt_key, ENT_QUOTES).'" data-dtkey="'.htmlspecialchars($dt_key, ENT_QUOTES).'" maxlength="120" value="'.htmlspecialchars($dt_current, ENT_QUOTES).'">';
					}
				?>
				<script>
				(function () {
					// grey suggestions = texts of the chosen language
					var langs = <?php echo json_encode($display_languages, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
					var select = document.getElementById('dt_language');
					function apply() {
						var set = (langs[select.value] || langs.en || {}).texts || {};
						document.querySelectorAll('input[data-dtkey]').forEach(function (input) { input.placeholder = set[input.getAttribute('data-dtkey')] || ''; });
					}
					select.addEventListener('change', apply);
					apply();
				})();
				</script>
			</li>
			<li class="buttons">
				<input id="saveForm" class="button_text" type="submit" name="displaytexts_save" value="Save display texts" />
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
				$kmJson = @json_decode(@file_get_contents('/home/dietpi/MuPiBox/themes/km-themes.json'), true);
				foreach (($kmJson['themes'] ?? array()) as $kmTheme) {
					if (!empty($kmTheme['id'])) $kmNames[$kmTheme['id']] = (string)($kmTheme['labelEn'] ?? $kmTheme['label'] ?? $kmTheme['id']);
				}
				$Themes = $data["mupibox"]["installedThemes"];
				asort($Themes);
				$themeOption = function ($key, $label) use ($data) {
					$selected = ($key == $data["mupibox"]["theme"]) ? " selected=\"selected\"" : "";
					return "<option value=\"" . htmlspecialchars($key, ENT_QUOTES) . "\"" . $selected . ">" . htmlspecialchars($label) . "</option>";
				};
				$kmOptions = '';
				foreach($Themes as $key) {
					if (isset($kmNames[$key])) { $kmOptions .= $themeOption($key, $kmNames[$key]); continue; }
					print $themeOption($key, $key);
				}
				if ($kmOptions !== '') print "<optgroup label=\"Kids' themes\">" . $kmOptions . "</optgroup>";
				?>
				</select>
				</div>
				<div class="themePrev"><img src="images/<?php print isset($kmNames[$data["mupibox"]["theme"]]) ? 'km/' . htmlspecialchars($data["mupibox"]["theme"]) . '.svg' : htmlspecialchars($data["mupibox"]["theme"]) . '.png'; ?>" width="250" height="150" name="selectedTheme" style="object-fit:cover;" /></div>
				<style>
					.mupi-toggle { display:inline-flex; align-items:center; gap:10px; margin-top:12px; cursor:pointer; }
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
						<span>Ordner/Albumnamen einblenden</span>
					</label>
				</div>
				<?php $kmSelected = isset($kmNames[$data["mupibox"]["theme"]]); $kmStageOn = (($data["mupibox"]["themeStage"] ?? false) === true); ?>
				<div id="kmStageToggleWrap" style="<?= $kmSelected ? '' : 'display:none;' ?>">
					<input type="hidden" name="kmStageShown" value="1" />
					<label class="mupi-toggle" for="themeStage" title="Großes Cover in der Mitte, Nachbarn kleiner. Wischen oder Nachbar antippen holt ihn in die Mitte.">
						<input type="checkbox" id="themeStage" name="themeStage" value="1" <?= $kmStageOn ? 'checked="checked"' : '' ?> onchange="toggleKmStageOption();" />
						<span class="track"></span>
						<span>Cover-Flow-Ansicht (Bühne)</span>
					</label>
					<div id="kmAutoReadWrap" style="<?= $kmStageOn ? '' : 'display:none;' ?>">
						<label class="mupi-toggle" for="themeStageAutoRead" title="Bleibt die Bühne auf einem Cover stehen, liest die Box seinen Namen vor.">
							<input type="checkbox" id="themeStageAutoRead" name="themeStageAutoRead" value="1" <?= (($data["mupibox"]["themeStageAutoRead"] ?? false) === true) ? 'checked="checked"' : '' ?> />
							<span class="track"></span>
							<span>Name beim Anhalten vorlesen</span>
						</label>
					</div>
				</div>
				<script>
					var kmThemeIds = <?= json_encode(array_keys($kmNames)) ?>;
					function toggleKmStageOption() {
						var sel = document.getElementById('theme');
						var wrap = document.getElementById('kmStageToggleWrap');
						var stage = document.getElementById('themeStage');
						var autoRead = document.getElementById('kmAutoReadWrap');
						if (sel && wrap) wrap.style.display = (kmThemeIds.indexOf(sel.value) >= 0) ? '' : 'none';
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

<?php
        // M11: /tmp/.time2sleep only exists while a sleep timer is active.
        // Without an active timer fopen() returned false and fgets(false)
        // raised an uncaught TypeError on PHP 8+. Guard the resource open
        // and default to empty string so the page renders cleanly either
        // way (the JS side already handles an empty value).
        $time2sleep = '';
        if ($fh = @fopen("/tmp/.time2sleep", 'r')) {
            $time2sleep = fgets($fh);
            fclose($fh);
        }
?>


<script>

for (let e of document.querySelectorAll('input[type="range"].slider-progress')) {
  e.style.setProperty('--value', e.value);
  e.style.setProperty('--min', e.min == '' ? '0' : e.min);
  e.style.setProperty('--max', e.max == '' ? '100' : e.max);
  e.addEventListener('input', () => e.style.setProperty('--value', e.value));
}

// Credit: Mateusz Rybczonec

const FULL_DASH_ARRAY = 283;
const WARNING_THRESHOLD = 10;
const ALERT_THRESHOLD = 5;

const COLOR_CODES = {
  info: {
    color: "green"
  },
  warning: {
    color: "orange",
    threshold: WARNING_THRESHOLD
  },
  alert: {
    color: "red",
    threshold: ALERT_THRESHOLD
  }
};

const TIME_LIMIT = <?php 
if( $time2sleep )
	{
	echo $time2sleep;
	}
else
	{
	echo "0";
	}
?>;
let timePassed = 0;
let timeLeft = TIME_LIMIT;
let timerInterval = null;
let remainingPathColor = COLOR_CODES.info.color;

document.getElementById("app").innerHTML = `
<div class="base-timer">
  <svg class="base-timer__svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g class="base-timer__circle">
      <circle class="base-timer__path-elapsed" cx="50" cy="50" r="45"></circle>
      <path
        id="base-timer-path-remaining"
        stroke-dasharray="283"
        class="base-timer__path-remaining ${remainingPathColor}"
        d="
          M 50, 50
          m -45, 0
          a 45,45 0 1,0 90,0
          a 45,45 0 1,0 -90,0
        "
      ></path>
    </g>
  </svg>
  <span id="base-timer-label" class="base-timer__label">${formatTime(
    timeLeft
  )}</span>
</div>
	`;

startTimer();

function onTimesUp() {
  clearInterval(timerInterval);
}

function startTimer() {
  timerInterval = setInterval(() => {
    timePassed = timePassed += 1;
    timeLeft = TIME_LIMIT - timePassed;
    document.getElementById("base-timer-label").innerHTML = formatTime(
      timeLeft
    );
    setCircleDasharray();
    setRemainingPathColor(timeLeft);

    if (timeLeft === 0) {
      onTimesUp();
    }
  }, 1000);
}

function formatTime(time) {
  const hours = Math.floor(time / 60 / 60);
  minutes = Math.floor(time / 60 - hours * 60);
  let seconds = time % 60;

  if (seconds < 10) {
    seconds = `0${seconds}`;
  }
  if (minutes < 10) {
    minutes = `0${minutes}`;
  }


  return `${hours}:${minutes}:${seconds}`;
}

function setRemainingPathColor(timeLeft) {
  const { alert, warning, info } = COLOR_CODES;
  if (timeLeft <= alert.threshold) {
    document
      .getElementById("base-timer-path-remaining")
      .classList.remove(warning.color);
    document
      .getElementById("base-timer-path-remaining")
      .classList.add(alert.color);
  } else if (timeLeft <= warning.threshold) {
    document
      .getElementById("base-timer-path-remaining")
      .classList.remove(info.color);
    document
      .getElementById("base-timer-path-remaining")
      .classList.add(warning.color);
  }
}

function calculateTimeFraction() {
  const rawTimeFraction = timeLeft / TIME_LIMIT;
  return rawTimeFraction - (1 / TIME_LIMIT) * (1 - rawTimeFraction);
}

function setCircleDasharray() {
  const circleDasharray = `${(
    calculateTimeFraction() * FULL_DASH_ARRAY
  ).toFixed(0)} 283`;
  document
    .getElementById("base-timer-path-remaining")
    .setAttribute("stroke-dasharray", circleDasharray);
}

</script>
