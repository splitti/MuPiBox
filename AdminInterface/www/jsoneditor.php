<?php
	include ('includes/header.php');

// CSRF token: header.php already started the session. Mint one on demand
// and require it on every POST. Without this any other tab the admin has
// open could POST a crafted mupiboxconfig.json and disable interfacelogin
// or change the password hash.
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
$csrfToken = $_SESSION['csrf_token'];

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
    $submittedToken = $_POST['csrf_token'] ?? '';
    if (!hash_equals($csrfToken, $submittedToken)) {
        $message = "❌ CSRF token mismatch — please reload the page and try again.";
    } else {
    $json = $_POST['jsondata'] ?? '';
    $decoded = json_decode($json, true);
    if (json_last_error() === JSON_ERROR_NONE) {
        // interfacelogin pinning: when editing mupiboxconfig.json, refuse to
        // let the editor change `interfacelogin` (state + password hash).
        // Otherwise an attacker who slips a CSRF past us — or a curious admin
        // who clears `state` "to test something" — locks themselves out or,
        // worse, silently re-opens the box. Authentication is managed via
        // the dedicated login.php, not here.
        if ($key === 'mupiboxconfig') {
            $diskRaw = file_get_contents($file);
            $diskCfg = json_decode($diskRaw, true);
            if (isset($diskCfg['interfacelogin'])) {
                $decoded['interfacelogin'] = $diskCfg['interfacelogin'];
            }
        }

        // Two-stage write to survive write_json's permission model:
        // www-data cannot write into /home/dietpi/.mupibox/.../config/
        // (dir is dietpi:dietpi 755), so a same-dir tempfile fails. Instead:
        //   1. file_put_contents to /tmp/<rand>  (always writable for www-data)
        //   2. sudo install -m <orig> -o <orig-owner> -g <orig-group> /tmp/<rand> $file
        // `install` overwrites in-place via copy, then unlinks the source —
        // not a same-fs rename, so the cross-fs window is not strictly atomic,
        // but it matches admin.php's existing write_json() pattern (sudo mv
        // from /tmp) and preserves owner/perms across the swap.
        $tmp = '/tmp/.jsoneditor.' . bin2hex(random_bytes(8)) . '.json';
        $bytes = file_put_contents($tmp, json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        if ($bytes === false) {
            $message = "❌ Could not write temp file (permissions?).";
        } else {
            $stat = stat($file);
            if ($stat === false) {
                @unlink($tmp);
                $message = "❌ Could not stat target file.";
            } else {
                $mode = sprintf('%04o', $stat['mode'] & 0777);
                // Resolve owner/group names — install requires names not numeric ids.
                $ownerInfo = posix_getpwuid($stat['uid']);
                $groupInfo = posix_getgrgid($stat['gid']);
                $owner = $ownerInfo ? $ownerInfo['name'] : 'root';
                $group = $groupInfo ? $groupInfo['name'] : 'root';
                $cmd = 'sudo install -m ' . escapeshellarg($mode)
                     . ' -o ' . escapeshellarg($owner)
                     . ' -g ' . escapeshellarg($group)
                     . ' ' . escapeshellarg($tmp)
                     . ' ' . escapeshellarg($file)
                     . ' 2>&1';
                exec($cmd, $output, $rc);
                @unlink($tmp);
                if ($rc !== 0) {
                    $message = "❌ Could not commit file (install rc=$rc): "
                             . htmlspecialchars(implode("\n", $output));
                } else {
                    $message = "✅ File saved.";
                }
            }
        }
    } else {
        $message = "❌ Error in JSON: " . json_last_error_msg();
    }
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
        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken, ENT_QUOTES) ?>" />
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
