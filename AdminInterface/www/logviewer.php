<?php
	include ('includes/header.php');
	session_start();

	$logfiles = [
		'server-error' => '/home/dietpi/.pm2/logs/server-error.log',
		'server-out' => '/home/dietpi/.pm2/logs/server-out.log',
	];

	$services = ['pm2', 'mupibox', 'nginx'];
?>
    <form class="appnitro">

    <h2>🧰 Live Logs & Dienstemonitor</h2>

    <!-- Log-Auswahl -->
        <ul>
            <li>
                <label class="description">Logdatei wählen:</label>
                <select id="log-select" class="select medium">
                    <?php foreach ($logfiles as $key => $path): ?>
                        <option value="<?= $key ?>"><?= $key ?> (<?= basename($path) ?>)</option>
                    <?php endforeach; ?>
                </select>
            </li>
            <li>
                <label class="description">🔍 Suche (grep):</label>
                <input type="text" id="log-search" class="text medium" placeholder="Fehler, IP, etc.">
            </li>
        </ul>
    </form>

    <!-- Log Buttons -->
    <div class="buttons-row">
        <input type="button" class="button_text" value="🔄 Manuell aktualisieren" onclick="updateLog(true)">
        <input type="button" class="button_text_red" value="⏸ Pause" id="pauseBtn" onclick="togglePause()">
        <input type="button" class="button_text_green" value="📥 Download" onclick="downloadLog()">
    </div>

    <!-- Logausgabe -->
    <div id="logoutput">⏳ Lade Logdaten...</div>

    <hr>

    <h3>⚙️ Dienste überwachen</h3>
    <div class="buttons-row">
        <?php foreach ($services as $service): ?>
            <span><b><?= strtoupper($service) ?></b></span>
            <input type="button" class="button_text_green" value="🔄 Status" onclick="getStatus('<?= $service ?>')">
            <input type="button" class="button_text" value="🔁 Restart" onclick="controlService('<?= $service ?>', 'restart')">
            <input type="button" class="button_text_orange" value="▶️ Start" onclick="controlService('<?= $service ?>', 'start')">
            <input type="button" class="button_text_red" value="⏹ Stop" onclick="controlService('<?= $service ?>', 'stop')">
        <?php endforeach; ?>
    </div>

    <div id="servicestatus" class="status-box">⏳ Dienststatus wird geladen…</div>
</div>

<script>
let paused = false;
let currentLog = document.getElementById("log-select").value;
let interval = setInterval(updateLog, 3000);

document.getElementById("log-select").addEventListener("change", () => {
    currentLog = document.getElementById("log-select").value;
    updateLog(true);
});
document.getElementById("log-search").addEventListener("input", () => updateLog(true));

function updateLog(force = false) {
    if (paused && !force) return;

    const grep = document.getElementById("log-search").value;
    fetch(`backend.php?mode=log&log=${currentLog}&grep=${encodeURIComponent(grep)}`)
        .then(res => res.text())
        .then(text => {
            const html = text
                .replace(/(ERROR|Error|Exception)/g, '<span class="error">$1</span>')
                .replace(/(WARN|Warning)/g, '<span class="warn">$1</span>');
            document.getElementById("logoutput").innerHTML = html;
            document.getElementById("logoutput").scrollTop = document.getElementById("logoutput").scrollHeight;
        });
}

function togglePause() {
    paused = !paused;
    document.getElementById("pauseBtn").value = paused ? "▶️ Fortsetzen" : "⏸ Pause";
}

function downloadLog() {
    const grep = document.getElementById("log-search").value;
    window.open(`backend.php?mode=download&log=${currentLog}&grep=${encodeURIComponent(grep)}`, "_blank");
}

function getStatus(service) {
    fetch(`backend.php?mode=status&service=${service}`)
        .then(res => res.text())
        .then(text => {
            document.getElementById("servicestatus").innerText = text;
        });
}

function controlService(service, action) {
    fetch(`backend.php?mode=control&service=${service}&action=${action}`)
        .then(res => res.text())
        .then(text => {
            document.getElementById("servicestatus").innerText = text;
            setTimeout(() => getStatus(service), 2000); // nach kurzer Zeit Status neu laden
        });
}
</script>
<?php
 include ('includes/footer.php');
?>
