#!/bin/bash
#
# Test of scripts/mupibox/sleep_timer.sh (the box's power-off timer) - on a box (systemd), as root:
#   sudo bash scripts/tests/sleep_timer_test.sh [path/to/sleep_timer.sh]
# NEVER a real shutdown: its own unit name, state folder, a file standing in for the mixer and a "poweroff" that only
# writes a line. The box's own timer (unit mupi-sleep-timer, /run/mupibox) is not touched.

SCRIPT="$(readlink -f "${1:-$(dirname "$0")/../mupibox/sleep_timer.sh}")"
T=$(mktemp -d /tmp/sleep-timer-test.XXXXXX)
chmod 755 "${T}"
export UNIT="mupi-sleep-timer-test-$$"
export STATE_DIR="${T}/state"
export COMPAT_FILE="${T}/time2sleep"
export VOLUME_FILE="${T}/volume"
export PLAYER_STOP_URL=""
export FADE=4
export POWEROFF_CMD="${T}/poweroff"
printf '#!/bin/bash\necho "poweroff $(date +%%s)" >> %s/poweroff.log\n' "${T}" > "${POWEROFF_CMD}"
chmod 755 "${POWEROFF_CMD}"

pass=0; fail=0
ok() { if eval "$2"; then echo "OK   $1"; pass=$((pass + 1)); else echo "FAIL $1   ($2)"; fail=$((fail + 1)); fi; }
st() { bash "${SCRIPT}" status | /usr/bin/jq -r ".$1"; }
offs() { [ -f "${T}/poweroff.log" ] && wc -l < "${T}/poweroff.log" || echo 0; }
running() { systemctl is-active --quiet "${UNIT}"; }
cleanup() { systemctl stop "${UNIT}" >/dev/null 2>&1; systemctl reset-failed "${UNIT}" >/dev/null 2>&1; rm -rf "${T}"; }
trap cleanup EXIT
echo 80 > "${VOLUME_FILE}"

# 1 start 30 min
bash "${SCRIPT}" start 1800 >/dev/null; rc=$?
ok "1 start: exit 0" "[ ${rc} = 0 ]"
ok "1 start: active, ~1800 s left" "[ \"\$(st active)\" = true ] && (( \$(st remaining_s) >= 1798 ))"
ok "1 start: countdown unit runs" "running"
sleep 2
ok "1 start: /tmp/.time2sleep (compat) written" "[ -s \"${COMPAT_FILE}\" ]"
id1=$(/usr/bin/jq -r .id "${STATE_DIR}/sleep_timer.json")

# 2 replace with 60 min
bash "${SCRIPT}" start 3600 >/dev/null
ok "2 replace: ~3600 s left" "(( \$(st remaining_s) >= 3598 ))"
ok "2 replace: a new id" "[ \"\$(/usr/bin/jq -r .id ${STATE_DIR}/sleep_timer.json)\" != \"${id1}\" ]"
ok "2 replace: one unit only" "[ \$(systemctl list-units --all --plain --no-legend \"${UNIT}*\" | wc -l) = 1 ]"

# 3 a replaced short timer does not switch off
bash "${SCRIPT}" start 3 >/dev/null
bash "${SCRIPT}" start 600 >/dev/null
sleep 6
ok "3 replaced 3 s timer did not shut down" "[ \$(offs) = 0 ]"

# 4 stop, twice
bash "${SCRIPT}" stop >/dev/null; r1=$?
bash "${SCRIPT}" stop >/dev/null; r2=$?
ok "4 stop twice: both exit 0" "[ ${r1} = 0 ] && [ ${r2} = 0 ]"
ok "4 stop: inactive, unit gone, compat file gone" "[ \"\$(st active)\" = false ] && ! running && [ ! -e \"${COMPAT_FILE}\" ]"

# 5 concurrent starts and stops of several callers
for i in 1 2 3 4 5 6; do
	if (( i % 2 )); then bash "${SCRIPT}" start $((600 + i)) >/dev/null & else bash "${SCRIPT}" stop >/dev/null & fi
done
wait
a=$(st active)
ok "5 concurrent: state and unit agree" "{ [ \"${a}\" = true ] && running; } || { [ \"${a}\" = false ] && ! running; }"
ok "5 concurrent: at most one unit" "(( \$(systemctl list-units --plain --no-legend \"${UNIT}*\" | wc -l) <= 1 ))"
bash "${SCRIPT}" stop >/dev/null

# 6 stop during the fade: volume back
echo 80 > "${VOLUME_FILE}"
bash "${SCRIPT}" start 4 >/dev/null
sleep 2.5
v_fade=$(cat "${VOLUME_FILE}")
bash "${SCRIPT}" stop >/dev/null
ok "6 fade lowers the volume" "(( v_fade < 80 ))"
ok "6 stop in the fade: volume back to 80" "[ \"\$(cat ${VOLUME_FILE})\" = 80 ]"
ok "6 no shutdown" "[ \$(offs) = 0 ]"

# 6b replace during the fade: volume back, new timer runs
bash "${SCRIPT}" start 4 >/dev/null
sleep 2.5
bash "${SCRIPT}" start 600 >/dev/null
ok "6b replace in the fade: volume back to 80, new timer ~600 s" "[ \"\$(cat ${VOLUME_FILE})\" = 80 ] && (( \$(st remaining_s) >= 598 ))"
bash "${SCRIPT}" stop >/dev/null

# 9 the countdown killed: started again, same deadline
bash "${SCRIPT}" start 600 >/dev/null
dl=$(st deadline)
systemctl kill -s KILL "${UNIT}"
sleep 4
ok "9 killed countdown is started again" "running"
ok "9 same deadline afterwards" "[ \"\$(st deadline)\" = \"${dl}\" ]"

# 10 overdue deadline when it is started again: shuts down at once (once)
tmp="${STATE_DIR}/sleep_timer.json.t"
/usr/bin/jq ".deadline = $(( $(date +%s) - 5 ))" "${STATE_DIR}/sleep_timer.json" > "${tmp}" && mv "${tmp}" "${STATE_DIR}/sleep_timer.json"
systemctl kill -s KILL "${UNIT}"
sleep 6
ok "10 overdue deadline: shut down once" "[ \$(offs) = 1 ]"
ok "10 then: active with phase shutdown, 0 s" "[ \"\$(st phase)\" = shutdown ] && [ \"\$(st remaining_s)\" = 0 ]"
bash "${SCRIPT}" stop >/dev/null; rs=$?
bash "${SCRIPT}" start 60 >/dev/null; rst=$?
ok "10 stop/start while shutting down: refused (exit 3), no false success" "[ ${rs} = 3 ] && [ ${rst} = 3 ]"
rm -f "${STATE_DIR}/sleep_timer.json" "${T}/poweroff.log"

# 7 running out: fade, playback stop, volume back, one shutdown - and none afterwards
echo 50 > "${VOLUME_FILE}"
bash "${SCRIPT}" start 3 >/dev/null
sleep 7
ok "7 ran out: shut down once" "[ \$(offs) = 1 ]"
ok "7 volume set back to 50 for the next start" "[ \"\$(cat ${VOLUME_FILE})\" = 50 ]"
sleep 4
ok "11 no second shutdown afterwards" "[ \$(offs) = 1 ] && ! running"
rm -f "${STATE_DIR}/sleep_timer.json"

# 12 wrong input: no change
bash "${SCRIPT}" start 600 >/dev/null
dl=$(st deadline)
for bad in 0 -5 abc 86401 1.5 ''; do bash "${SCRIPT}" start "${bad}" >/dev/null 2>&1; [ $? = 2 ] || echo "  (no exit 2 for '${bad}')"; done
ok "12 wrong seconds: exit 2, timer unchanged" "[ \"\$(st deadline)\" = \"${dl}\" ]"

# 13 the call of before ("sleep_timer.sh <seconds>")
bash "${SCRIPT}" 900 >/dev/null
ok "13 old call form starts (replaces)" "(( \$(st remaining_s) >= 898 ))"

# 14 a state file left behind without its countdown counts as none
bash "${SCRIPT}" stop >/dev/null
printf '{"id":"x","deadline":%s,"seconds":600,"ends_at":"","phase":"running"}' $(( $(date +%s) + 600 )) > "${STATE_DIR}/sleep_timer.json"
ok "14 file without countdown: inactive" "[ \"\$(st active)\" = false ]"

echo "${pass} passed, ${fail} failed"
[ ${fail} = 0 ]
