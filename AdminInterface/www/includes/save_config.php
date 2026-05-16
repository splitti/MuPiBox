<?php
// M5: request-scoped reader for /etc/mupibox/mupiboxconfig.json. Within a
// single PHP request, header.php + downstream PHP can read the config many
// times -- SD cards bill those at 5-20 ms each. Static $cache inside the
// function persists for the duration of the PHP request, so subsequent
// reads come from RAM.
//
// pass $forceReread = true at call sites that follow an external mutation
// (exec("sudo conf_update.sh"), backup-restore unzip, etc.) -- those need
// fresh state since the cached snapshot pre-dates the external write.
function mupibox_config(bool $forceReread = false): array {
    static $cache = null;
    if ($cache === null || $forceReread) {
        $raw = @file_get_contents('/etc/mupibox/mupiboxconfig.json');
        $cache = $raw === false ? [] : (json_decode($raw, true) ?? []);
    }
    return $cache;
}

// B8: centralized writer for /etc/mupibox/mupiboxconfig.json with flock
// serialisation. Replaces ~13 copies of the same pattern in admin.php,
// mupi.php, mupihat.php, spotify.php and smart.php:
//
//   $save_rc = file_put_contents('/tmp/.mupiboxconfig.json', $json_object);
//   exec("sudo mv /tmp/.mupiboxconfig.json /etc/mupibox/mupiboxconfig.json");
//
// Two problems with the old pattern:
//   1. Two admin tabs hitting Save simultaneously both write to the same
//      /tmp/.mupiboxconfig.json then both `sudo mv` -- the second clobbers
//      the first's data with the in-flight buffer of whichever PHP request
//      happened to finish writing slower.
//   2. No flock on either side means concurrent writes from different
//      pages (mupihat + spotify save buttons) interleave at the
//      file-system level, occasionally leaving a half-written JSON that
//      breaks the backend's next read.
//
// Helper: acquire LOCK_EX on a dedicated lock file, write the data to a
// per-call random tmp path, sudo-mv it into place, release the lock.
// Returns true on success, false on any failure (with a descriptive
// message via the optional &$errorOut byref).

function save_mupiboxconfig(array $data, ?string &$errorOut = null): bool {
    $errorOut = '';
    $lockPath = '/tmp/.mupiboxconfig.lock';
    $lockFh = @fopen($lockPath, 'c');
    if (!$lockFh) {
        $errorOut = 'could not open lock file';
        return false;
    }
    if (!flock($lockFh, LOCK_EX)) {
        fclose($lockFh);
        $errorOut = 'could not acquire flock';
        return false;
    }
    try {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json === false) {
            $errorOut = 'json_encode failed: ' . json_last_error_msg();
            return false;
        }
        // Per-call random tmp path so two writers waiting on the same flock
        // don't share a fixed-name tmp file (defence in depth -- flock
        // already serialises them, but this also covers any caller that
        // bypasses the helper).
        $tmp = '/tmp/.mupiboxconfig.' . bin2hex(random_bytes(8)) . '.json';
        $bytes = @file_put_contents($tmp, $json);
        if ($bytes === false) {
            $errorOut = 'tmp write failed';
            return false;
        }
        $cmd = 'sudo mv ' . escapeshellarg($tmp) . ' /etc/mupibox/mupiboxconfig.json 2>&1';
        $output = [];
        $rc = 0;
        exec($cmd, $output, $rc);
        if ($rc !== 0) {
            @unlink($tmp);
            $errorOut = 'sudo mv failed (rc=' . $rc . '): ' . implode("\n", $output);
            return false;
        }
        return true;
    } finally {
        flock($lockFh, LOCK_UN);
        fclose($lockFh);
    }
}
