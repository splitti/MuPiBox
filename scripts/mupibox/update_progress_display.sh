#!/bin/bash
#
# The progress of an update on the display: $1 = percent, $2 = the step as the update script names it (its whiptail
# lines, English). Called by the app's update for every step (backend-api app-api/updates.ts: the stand-in for whiptail
# and run.sh) - in the background, it never holds the update up. The step becomes one of a few parts with a sentence in
# the box's language (prepare, download, packages, install, settings, done, failed); the maintenance picture is drawn
# with the bar (maintenance_screen.sh update <percent> <part>).
#
# The newest state wins: every call says what is to be shown (want), then whoever has the lock draws what was said
# last - a step that comes while a picture is being drawn is not lost (a fast step before a long one stood there for
# the whole long one). At most a picture every 2 seconds; the end at once.
#
# An abort is shown only when the box stays stopped after it (/tmp/mupibox-update-nostart: the way back is not
# complete, the box has to be restarted). After any other abort the update starts the display again by itself - a
# picture drawn then would only flash while the display starts.

PCT="$1"
STEP="$2"
DIR=/run/mupibox-update-progress
WANT="${DIR}/want"
SHOWN="${DIR}/shown"
LOCK="${DIR}/lock"
SCREEN=/usr/local/bin/mupibox/maintenance_screen.sh

case "${PCT}" in '' | *[!0-9]* | ????*) exit 0 ;; esac
# (the display still shows the box - before the update ends it, or an update of the system that leaves it on: fbv
# would draw over it)
if pgrep -x chromium >/dev/null || pgrep -x chromium-browse >/dev/null; then
	exit 0
fi
# (a maintenance_screen.sh that knows the progress: an update to a version before it moves its own in - that one would
# only show the plain picture once more for every step)
grep -q 'compose_bootscreen.py" fortschritt' "${SCREEN}" 2>/dev/null || exit 0

case "${STEP}" in
	"Update aborted"*) PART=failed ;;
	"Installation complete"*) PART=done ;;
	"Start" | "Prepare"* | "Backup" | "Download") PART=prepare ;;
	"Restarting"* | "Set environment"* | "Download OnOffShim"* | "Update Config"* | "Network"* | "Activate SSL"* | "Finalizing"* | "Remove the previous admin"*) PART=settings ;;
	"Download MuPiBox"* | "Unzip"*) PART=download ;;
	"Update package-list"* | "Update Node.js"* | "Update Chromium"* | "Install package"* | "Remove "* | "Setup DietPi"*) PART=packages ;;
	"Install LED"*) PART=install ;;
	"Install "*) PART=packages ;;
	*) PART=install ;;
esac
if [ "${PART}" = "failed" ]; then
	[ -e /tmp/mupibox-update-nostart ] || exit 0
fi
# (100 % is the end only with the end's step - an abort says 100 too)
[ "${PART}" = "done" ] || [ "${PART}" = "failed" ] || [ "${PCT}" -lt 100 ] || PCT=99

mkdir -p -m 700 "${DIR}" 2>/dev/null || exit 0
# what is to be shown, said one at a time: two steps right after each other are two of these running side by side, and
# the one of the earlier step may come here last - the percent only goes up, so a lower one does not replace a higher
# one; the end (done, failed) stays whatever comes after it
exec 8>"${DIR}/want.lock"
flock -w 5 8 || exit 0
# (an update's first step: what an earlier one left does not count - one that was aborted, the box not restarted since)
[ "${PCT}" = "0" ] && rm -f "${WANT}" "${SHOWN}"
W_PCT= W_PART=
[ -f "${WANT}" ] && read -r W_PCT W_PART < "${WANT}"
case "${W_PART}" in done | failed) exit 0 ;; esac
case "${PART}" in
	done | failed) ;;
	*) [ -n "${W_PCT}" ] && [ "${PCT}" -lt "${W_PCT}" ] && exit 0 ;;
esac
echo "${PCT} ${PART}" > "${WANT}.$$" && mv -f "${WANT}.$$" "${WANT}" || exit 0
exec 8>&-

exec 9>"${LOCK}"
flock -w 30 9 || exit 0
while :; do
	W_PCT= W_PART= S_PCT= S_PART= S_AT=
	read -r W_PCT W_PART < "${WANT}" || break
	[ -f "${SHOWN}" ] && read -r S_PCT S_PART S_AT < "${SHOWN}"
	[ "${W_PCT} ${W_PART}" = "${S_PCT} ${S_PART}" ] && break
	# (the time since the box started: the clock may be set during an update)
	NOW=$(cut -d. -f1 /proc/uptime)
	case "${W_PART}" in
		done | failed) ;;
		*)
			if [ -n "${S_AT}" ] && [ $((NOW - S_AT)) -ge 0 ] && [ $((NOW - S_AT)) -lt 2 ]; then
				sleep $((2 - (NOW - S_AT)))
				continue
			fi
			;;
	esac
	# (the display started again meanwhile - an update that stopped starts it at once: nothing more drawn over it)
	if pgrep -x chromium >/dev/null || pgrep -x chromium-browse >/dev/null; then
		break
	fi
	# (the lock is not handed on: a picture program that stays would keep it)
	"${SCREEN}" update "${W_PCT}" "${W_PART}" 9>&-
	echo "${W_PCT} ${W_PART} $(cut -d. -f1 /proc/uptime)" > "${SHOWN}"
done
exit 0
