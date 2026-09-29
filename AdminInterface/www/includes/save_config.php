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
    // In $GLOBALS rather than a static: save_mupiboxconfig() uses it as the baseline to find out
    // what a page actually changed, and refreshes it after a save.
    if (!isset($GLOBALS['__mupibox_config_cache']) || $forceReread) {
        $raw = @file_get_contents('/etc/mupibox/mupiboxconfig.json');
        $GLOBALS['__mupibox_config_cache'] = $raw === false ? [] : (json_decode($raw, true) ?? []);
    }
    return $GLOBALS['__mupibox_config_cache'];
}

// Applies what a page changed ($baseline -> $changed) onto the config as it is on disk now
// ($current). Keys the page did not touch keep their current value - a Spotify token refreshed
// or a parents' setting saved by the backend since this page read the file is no longer
// overwritten with the page's old copy. Objects are merged key by key, lists and scalars are
// replaced as a whole, keys the page removed are removed.
function mupibox_merge_changes($baseline, $changed, $current) {
    if (!is_array($changed) || !is_array($baseline) || !is_array($current)
        || array_is_list($changed) || array_is_list($baseline) || array_is_list($current)) {
        return $changed;
    }
    $result = $current;
    foreach ($changed as $key => $value) {
        $had = array_key_exists($key, $baseline);
        if ($had && $baseline[$key] === $value) {
            continue;
        }
        $result[$key] = ($had && array_key_exists($key, $current))
            ? mupibox_merge_changes($baseline[$key], $value, $current[$key])
            : $value;
    }
    foreach ($baseline as $key => $value) {
        if (!array_key_exists($key, $changed)) {
            unset($result[$key]);
        }
    }
    return $result;
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
    $lockCreated = !file_exists($lockPath);
    // 'r' is enough for flock if the backend (user dietpi) created the file
    $lockFh = @fopen($lockPath, 'c') ?: @fopen($lockPath, 'r');
    if (!$lockFh) {
        $errorOut = 'could not open lock file';
        return false;
    }
    if ($lockCreated) {
        @chmod($lockPath, 0666); // the backend (user dietpi) takes the same lock
    }
    if (!flock($lockFh, LOCK_EX)) {
        fclose($lockFh);
        $errorOut = 'could not acquire flock';
        return false;
    }
    try {
        // Under the lock: merge this page's changes onto the file as it is now (the backend may
        // have written it since the page read it), instead of writing the page's whole old copy.
        $baseline = $GLOBALS['__mupibox_config_cache'] ?? null;
        $rawNow = @file_get_contents('/etc/mupibox/mupiboxconfig.json');
        $current = $rawNow === false ? null : json_decode($rawNow, true);
        if (is_array($baseline) && is_array($current)) {
            $data = mupibox_merge_changes($baseline, $data, $current);
        }
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
        // /tmp is a RAM disk and /etc on the SD card: a plain mv would copy into the target in
        // place and a reader could see half a file. Copy next to it, then rename on the same
        // filesystem.
        // First keep the version being replaced: mupiboxconfig.json.bak and, on the first save of a day, a copy in
        // /etc/mupibox/backup/ (the last 7 days). Same as the backend does (src/backend-api/src/file-backup.ts);
        // a failing backup never stops the save.
        $backup = '{ f=/etc/mupibox/mupiboxconfig.json; d=/etc/mupibox/backup; day=$(date +%F);'
                . ' sudo cp -p "$f" "$f.bak";'
                . ' if [ ! -e "$d/mupiboxconfig-$day.json" ]; then sudo mkdir -p "$d" && sudo cp -p "$f" "$d/mupiboxconfig-$day.json"'
                . ' && ls -1 "$d"/mupiboxconfig-????-??-??.json | sort -r | tail -n +8 | xargs -r sudo rm -f; fi; } 2>/dev/null || true; ';
        $cmd = $backup . 'sudo cp ' . escapeshellarg($tmp) . ' /etc/mupibox/mupiboxconfig.json.new'
             . ' && sudo mv -f /etc/mupibox/mupiboxconfig.json.new /etc/mupibox/mupiboxconfig.json 2>&1';
        $output = [];
        $rc = 0;
        exec($cmd, $output, $rc);
        @unlink($tmp);
        if ($rc !== 0) {
            @unlink($tmp);
            $errorOut = 'sudo mv failed (rc=' . $rc . '): ' . implode("\n", $output);
            return false;
        }
        // what is on disk now is the baseline for a further save in this request
        $GLOBALS['__mupibox_config_cache'] = $data;
        return true;
    } finally {
        flock($lockFh, LOCK_UN);
        fclose($lockFh);
    }
}

/**
 * Removes a cache directory (or only its contents) from the config - but only when the path
 * really is a directory below /home/dietpi/. The callers used to run `sudo rm -R <path>` on the
 * raw config value: an empty value made that `rm -R /*`, and the value is editable in the JSON
 * editor, so it was also a way into a root shell.
 */
function remove_config_cache_dir(string $path, bool $contentsOnly = false): bool {
	$real = realpath($path);
	// /tmp/chromium_cache: the kiosk's disk cache in RAM (see chromium-autostart.sh)
	$allowed = $real !== false && (
		(strpos($real, '/home/dietpi/') === 0 && substr_count($real, '/') >= 3)
		|| $real === '/tmp/chromium_cache'
	);
	if (!$allowed || !is_dir($real)) {
		error_log("MuPiBox admin: refusing to delete cache path '" . $path . "'");
		return false;
	}
	if ($contentsOnly) {
		exec("sudo find " . escapeshellarg($real) . " -mindepth 1 -delete");
	} else {
		exec("sudo rm -R " . escapeshellarg($real));
	}
	return true;
}
