<?php
	include ('includes/header.php');

	// Parental settings (moved here from mupi.php): sleep timer and idle shutdown, daily playtime limit and quiet
	// hours. $change: 2 = save the configuration, 3 = only show the message.

	if($_POST['stop_sleeptimer'] == "Stop running timer")
		{
		$command = "sudo pkill -f \"sleep_timer.sh\"";
		exec($command);
		$command = "sudo rm /tmp/.time2sleep";
		exec($command);
		$change=3;
		$CHANGE_TXT=$CHANGE_TXT."<li>Sleeptimer stopped</li>";
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
			$change=3;
			}
		}

 if($_POST['idletime'])
  {
  $data["timeout"]["idlePiShutdown"]=$_POST['idlePiShutdown'];
  $CHANGE_TXT=$CHANGE_TXT."<li>Idle Shutdown Time is set to ".$data["timeout"]["idlePiShutdown"]." minutes</li>";
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

<form class="appnitro" name="parental" method="post" action="parental.php" id="form">
<div class="description">
<h2>Parental settings</h2>
<p>Sleep timer, idle shutdown, daily playtime limit and quiet hours of your MuPiBox. The texts the child sees on the display are set in MuPi-Conf (Display texts).</p>
</div>

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

// the running sleep timer as a countdown (only while one runs: then the page has #app)
if (document.getElementById("app")) {
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
}

</script>
