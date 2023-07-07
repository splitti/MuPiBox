<?php
 $change=0;
 $CHANGE_TXT="<div id='lbinfo'><ul id='lbinfo'>";
 include ('includes/header.php');


	if( $_POST['generate_chatId'] )
		{
		$command="sudo bash -c '/usr/local/bin/mupibox/./telegram_set_deviceid.sh'";
		exec($command, $output);		
		$data["telegram"]["chatId"]=$output[0];
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Telegram Chat ID generation finished...</li>";
		}

	if( $_POST['change_telegram'] )
		{
		if($_POST['telegram_active'])
			{
			$data["telegram"]["active"]=true;
			$command="sudo su dietpi -c '/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py \"Telegram enabled\"'";
			exec($command);
			$command="sudo systemctl enable mupi_telegram.service";
			exec($command);
			$command="sudo systemctl restart mupi_telegram.service";
			exec($command);
			}
		else
			{
			$data["telegram"]["active"]=false;
			$command="sudo su dietpi -c '/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py \"Telegram disabled\"'";
			exec($command);
			$command="sudo systemctl stop mupi_telegram.service";
			exec($command);
			$command="sudo systemctl disable mupi_telegram.service";
			exec($command);
			}
		$data["telegram"]["chatId"]=$_POST['telegram_chatId'];
		$data["telegram"]["token"]=$_POST['telegram_token'];
		$CHANGE_TXT=$CHANGE_TXT."<li>Telegram configuration saved...</li>";
		$change=3;
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
 if( $change == 3 )
  {
	$json_object = json_encode($data);
	$save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
	exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
	$command="sudo su dietpi -c 'pm2 restart spotify-control'";
	exec($command);
	}
$CHANGE_TXT=$CHANGE_TXT."</ul></div>";
?>


<form class="appnitro" name="mupi" method="post" action="smart.php" id="form">
<div class="description">
<h2>Smart settings</h2>
<p>Share box information...</p>
</div>

 <details>
  <summary><i class="fa-brands fa-telegram"></i> Telegram</summary>
    <ul>
   <li id="li_1" >

                <h2>Telegram configuration</h2>
                <p>Coming soon...</p>
   </li>

   <li id="li_1" ><div>
     <label class="labelchecked" for="telegram_active">Telegram activation state:&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; <input type="checkbox" id="telegram_active"  name="telegram_active" <?php
     if( $data["telegram"]["active"] )
      {
      print "checked";
      }
?> /></label></div>
   </li>

   <li id="li_1" >
                <label class="description" for="telegram_token">Telegram token</label>
                <div>
                        <input id="telegram_token" name="telegram_token" class="element text medium" type="text" maxlength="255" value="<?php
                        print $data["telegram"]["token"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please enter your telegram token.</small></p>
   </li>

   <li id="li_1" >
                <label class="description" for="telegram_chatId">Telegram ChatID</label>
                <div>
                        <input id="telegram_chatId" name="telegram_chatId" class="element text medium" type="text" maxlength="255" value="<?php
                        print $data["telegram"]["chatId"];
?>"/>
                </div><p class="guidelines" id="guide_1"><small>Please enter your telegram ChatId.</small></p>
   </li>


   <li class="buttons">
    <input id="saveForm" class="button_text" type="submit" name="change_telegram" value="Save Telegram Configuration" />
    <input id="saveForm" class="button_text" type="submit" name="generate_chatId" value="Generate Telegram Chat ID" />
   </li>
  </ul>
 </details>

</form><p>

<?php
 include ('includes/footer.php');
?>
