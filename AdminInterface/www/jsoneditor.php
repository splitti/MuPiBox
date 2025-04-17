<?php
	include ('includes/header.php');

// Erlaubte Dateien
$files = [
    'mupiboxconfig' => '/etc/mupibox/mupiboxconfig.json',
    'data' => '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json',
    'config' => '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json',
    'resume' => '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/resume.json',
    'monitor' => '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/resume.json',
    'offline_resume' => '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/offline_resume.json',
    'offline_monitor' => '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/offline_resume.json'
];

$key = $_GET['file'] ?? 'mupiboxconfig';
$file = $files[$key] ?? null;

if (!$file || !file_exists($file)) {
    die("❌ Invalid file.");
}

// Speichern
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $json = $_POST['jsondata'] ?? '';
    $decoded = json_decode($json, true);
    if (json_last_error() === JSON_ERROR_NONE) {
        file_put_contents($file, json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $message = "✅ File saved.";
    } else {
        $message = "❌ Error in JSON: " . json_last_error_msg();
    }
}

$current = file_get_contents($file);
$pretty = json_encode(json_decode($current, true), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
?>

<div class="appnitro">
	<div class="description">
		<h2>JSON Editor</h2>
		<p>Changing files may cause the box to no longer function properly. It's even possible that the box will need to be reinstalled. Be careful.</p>
	</div>
    <div id="file-nav">
        <a href="?file=mupiboxconfig" class="<?= $key === 'mupiboxconfig' ? 'active' : '' ?>">mupiboxconfig.json</a>
        <a href="?file=data" class="<?= $key === 'data' ? 'active' : '' ?>">data.json</a>
        <a href="?file=config" class="<?= $key === 'config' ? 'active' : '' ?>">config.json</a>
        <a href="?file=resume" class="<?= $key === 'resume' ? 'active' : '' ?>">resume.json</a>
        <a href="?file=monitor" class="<?= $key === 'monitor' ? 'active' : '' ?>">monitor.json</a>
        <a href="?file=offline_resume" class="<?= $key === 'offline_resume' ? 'active' : '' ?>">offline_resume.json</a>
        <a href="?file=offline_monitor" class="<?= $key === 'offline_monitor' ? 'active' : '' ?>">offline_monitor.json</a>


    </div>

    <h3>Current File	: <?= htmlspecialchars(basename($file)) ?></h3>

    <?php if (isset($message)) echo "<div class='message'>$message</div>"; ?>

    <form method="post" onsubmit="return validateJSON();">
        <textarea id="jsoneditor" name="jsondata"><?= htmlspecialchars($pretty) ?></textarea>
        <div class="buttons">
            <input type="submit" class="button_text_green" value="💾 Save file" />
        </div>
    </form>
</div>

<script>
    var editor = CodeMirror.fromTextArea(document.getElementById("jsoneditor"), {
        lineNumbers: true,
        mode: { name: "javascript", json: true },
        matchBrackets: true,
        autoCloseBrackets: true,
        theme: "eclipse",
        tabSize: 2
    });

    function validateJSON() {
        try {
            JSON.parse(editor.getValue());
            return true;
        } catch (e) {
            alert("❌ Error in JSON:\n\n" + e.message);
            return false;
        }
    }
</script>

<?php
 include ('includes/footer.php');
?>
