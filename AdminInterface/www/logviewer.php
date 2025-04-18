<?php
	include ('includes/header.php');

	// Auswahlmenü
	$options = [
		'log:idle_shutdown'   => 'Log: idle_shutdown.log',
		'log:shutdown_control'   => 'Log: shutdown_control.log',
		'log:server-error' => 'PM2-Log: server-error.log',
		'log:server-out'   => 'PM2-Log: server-out.log',
		'log:spotify-control-error'   => 'PM2-Log: spotify-control-error.log',
		'log:spotify-control-out'   => 'PM2-Log: spotify-control-out.log',
		'status:mupi_autoconnect_bt.service'   => 'Status: mupi_autoconnect_bt.service',
		'status:mupi_autoconnect-wifi.service'   => 'Status: mupi_autoconnect-wifi.service',
		'status:mupi_check_internet.service'   => 'Status: mupi_check_internet.service',
		'status:mupi_check_monitor.service'   => 'Status: mupi_check_monitor.service',
		'status:mupi_fan.service'   => 'Status: mupi_fan.service',
		'status:mupi_hat_control.service'   => 'Status: mupi_hat_control.service',
		'status:mupi_hat.service'   => 'Status: mupi_hat.service',
		'status:mupi_idle_shutdown.service'   => 'Status: mupi_idle_shutdown.service',
		'status:mupi_mqtt.service'   => 'Status: mupi_mqtt.service',
		'status:mupi_novnc.service'   => 'Status: mupi_novnc.service',
		'status:mupi_powerled.service'   => 'Status: mupi_powerled.service',
		'status:mupi_splash.service'   => 'Status: mupi_splash.service',
		'status:mupi_startstop.service'   => 'Status: mupi_startstop.service',
		'status:mupi_telegram.service'   => 'Status: mupi_telegram.service',
		'status:mupi_vnc.service'   => 'Status: mupi_vnc.service',
		'status:mupi_wifi.service'   => 'Status: mupi_wifi.service',
		'status:pm2-dietpi.service'   => 'Status: pm2-dietpi.service',
		'status:proftpd.service.service'   => 'Status: proftpd.service.service',
		'status:samba-ad-dc.service'   => 'Status: samba-ad-dc.service'
	];

?>
<form class="appnitro" onsubmit="return false;">
    <h2>Log- & Service-Monitor</h2>

        <ul>
            <li>
                Show Log- or Service-Status:
                <select id="view-select" class="select medium">
                    <?php foreach ($options as $value => $label): ?>
                        <option value="<?= $value ?>"><?= $label ?></option>
                    <?php endforeach; ?>
                </select>
            </li>
            <li id="search-row">
                <label class="description"><i class="fa-solid fa-magnifying-glass"></i> Search (grep):</label>
                <input type="text" id="search" class="text medium" placeholder="Keyword...">
            </li>
        </ul>

    <div class="buttons-row" style="margin-bottom: 10px;">
        <input type="button" class="button_text" value="Refresh manually" onclick="loadData(true)">
        <input type="button" class="button_text_red" value="Pause" id="pauseBtn" onclick="togglePause()">
        <input type="button" class="button_text_green" value="Download" id="dlBtn" onclick="downloadData()">
    </div>

    <div id="output"><i class="fa-solid fa-hourglass-start"></i> Loading data...</div>
    </form>

<script>
let paused = false;
let interval = setInterval(loadData, 1500);

const select = document.getElementById("view-select");
const output = document.getElementById("output");
const search = document.getElementById("search");
const searchRow = document.getElementById("search-row");
const pauseBtn = document.getElementById("pauseBtn");
const dlBtn = document.getElementById("dlBtn");

select.addEventListener("change", () => {
    const val = select.value;
    const isLog = val.startsWith("log:");
    searchRow.style.display = isLog ? "block" : "none";
    dlBtn.style.display = isLog ? "inline-block" : "none";
    loadData(true);
});
search.addEventListener("input", () => loadData(true));

function loadData(force = false) {
    if (paused && !force) return;

    const val = select.value;
    const grep = search.value;
    const [type, key] = val.split(":");

    fetch(`backend.php?mode=${type}&key=${key}&grep=${encodeURIComponent(grep)}`)
        .then(res => res.text())
        .then(text => {
            const html = text
                .replace(/(ERROR|Error|Exception)/g, '<span class="error">$1</span>')
                .replace(/(WARN|Warning)/g, '<span class="warn">$1</span>');
            output.innerHTML = html;
            output.scrollTop = output.scrollHeight;
        });
}

function togglePause() {
    paused = !paused;
    pauseBtn.value = paused ? "Continue" : "Pause";
}

function downloadData() {
    const val = select.value;
    const grep = search.value;
    const [type, key] = val.split(":");
    window.open(`backend.php?mode=download&key=${key}&grep=${encodeURIComponent(grep)}`, "_blank");
}

loadData();
</script>

<?php
 include ('includes/footer.php');
?>
