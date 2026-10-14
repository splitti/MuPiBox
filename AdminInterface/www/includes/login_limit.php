<?php
// Limit on wrong passwords at the admin interface's login (header.php): at most 5 in a minute from one device and 20
// in a minute from all together - then the password is not checked at all until the minute is over. A wait of one
// second per wrong password was all there was: many requests at once tried passwords as fast as the box could answer.
// The same limit as the app's login (backend-api eltern/routes.ts, ipRateLimit(5)).
//
// Kept in /tmp (in RAM, empty after a restart): no writes to the SD card for it.

const MUPIBOX_LOGIN_FAILS = '/tmp/.mupibox-login-fails.json';
const MUPIBOX_LOGIN_WINDOW = 60;
const MUPIBOX_LOGIN_MAX_PER_IP = 5;
const MUPIBOX_LOGIN_MAX_ALL = 20;

// Runs $change on the list of the last minute's wrong passwords ([[time, ip], ...]) under a lock; what it returns
// as 'fails' is written back, 'result' is handed out. Without the file (not writable): nothing is limited.
function mupibox_login_fails(callable $change)
{
    $fh = @fopen(MUPIBOX_LOGIN_FAILS, 'c+');
    if (!$fh) {
        return $change([])['result'];
    }
    try {
        flock($fh, LOCK_EX);
        $fails = json_decode((string)stream_get_contents($fh), true);
        $since = time() - MUPIBOX_LOGIN_WINDOW;
        $fails = array_values(array_filter(is_array($fails) ? $fails : [], function ($f) use ($since) {
            return is_array($f) && (int)($f[0] ?? 0) > $since;
        }));
        $out = $change($fails);
        if (isset($out['fails'])) {
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, json_encode(array_slice($out['fails'], -200)));
            fflush($fh);
        }
        return $out['result'] ?? null;
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

function mupibox_login_blocked(string $ip): bool
{
    return (bool)mupibox_login_fails(function ($fails) use ($ip) {
        $mine = count(array_filter($fails, function ($f) use ($ip) { return ($f[1] ?? '') === $ip; }));
        return ['result' => $mine >= MUPIBOX_LOGIN_MAX_PER_IP || count($fails) >= MUPIBOX_LOGIN_MAX_ALL];
    });
}

// a wrong password is counted; the right one clears what this device had
function mupibox_login_record(string $ip, bool $ok): void
{
    mupibox_login_fails(function ($fails) use ($ip, $ok) {
        if ($ok) {
            $fails = array_values(array_filter($fails, function ($f) use ($ip) { return ($f[1] ?? '') !== $ip; }));
        } else {
            $fails[] = [time(), $ip];
        }
        return ['fails' => $fails, 'result' => null];
    });
}
