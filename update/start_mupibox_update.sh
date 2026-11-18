#!/bin/bash
#

#https://raw.githubusercontent.com/splitti/MuPiBox/main

if [ "$1" = "dev" ] || [ "$1" = "beta" ] || [ "$1" = "stable" ]; then
	RELEASE="$1"
elif [ "$1" = "branch" ]; then
  RELEASE="dev"
  BRANCH="$2"
  if [ -z "$BRANCH" ]; then
    echo "Error: Branch name is required when using branch install"
    exit 1
  fi
  # Optional 3rd/4th args let this install from a fork instead of splitti/MuPiBox,
  # and give the resulting install a custom version label (e.g. "DEV 5.0.0")
  # instead of the auto-generated "DEV <branch> <date>" string.
  REPO="${3:-splitti/MuPiBox}"
  VERSION_LABEL="$4"
  BRANCH_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/${REPO}/branches/${BRANCH})
  if [ "$BRANCH_EXISTS" != "200" ]; then
    echo "Error: Branch '${BRANCH}' does not exist on GitHub repo '${REPO}'"
    exit 1
  fi
  # A box with the folders of 5.1 takes a branch only when it knows them too (scripts/mupibox/mupi_paths.sh, there from
  # 5.1 on): the program of an older branch was put in server/ and player/ and looked for its data where 5.1 does not
  # keep it - the library empty, the settings gone. Unlike a release (its tag), a branch is not handed to its own update
  # script, so it stops here, before anything is changed. (Could it not be asked - no network, GitHub not answering: it
  # stops too, nothing is known.)
  if [ -L /home/dietpi/.mupibox/Sonos-Kids-Controller-master ] || [ -e /home/dietpi/.mupibox/.layout-moving ]; then
    PATHS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 30 "https://raw.githubusercontent.com/${REPO}/${BRANCH}/scripts/mupibox/mupi_paths.sh")
    if [ "$PATHS_CODE" = "404" ]; then
      echo "Error: branch '${BRANCH}' of '${REPO}' is a version before 5.1 - this box has the folders of 5.1, and an older branch cannot be installed on it. Nothing was changed. Back to an older version only by a channel (stable, beta or dev)."
      exit 1
    elif [ "$PATHS_CODE" != "200" ]; then
      echo "Error: could not check whether branch '${BRANCH}' of '${REPO}' is 5.1 or later (answer ${PATHS_CODE:-none}) - nothing was changed, please try again."
      exit 1
    fi
  fi
else
	RELEASE="stable"
fi

# One update at a time: two of them (one from the terminal while the app's or the admin interface's still ran) took each
# other's download away (both use /home/dietpi/mupibox.zip) and replaced the installation at the same time. The one
# running writes "<pid> <start time of that process>" here (/run: gone at the next start of the box; the start time:
# a process that ended without removing it - killed - is told from a new one that got its number).
UPDATE_LOCK=/run/mupibox-update.pid
# (a process's start time: the 22nd field of its stat, counted after the name in brackets - a name may hold spaces)
proc_start() { sed 's/^.*) //' "/proc/$1/stat" 2>/dev/null | cut -d' ' -f20; }
# the pid of the update that runs, nothing when none does
update_lock_holder() {
	local pid start
	read -r pid start 2>/dev/null < "${UPDATE_LOCK}" || return 0
	case "${pid}" in '' | *[!0-9]*) return 0 ;; esac
	[ -n "${start}" ] && [ "$(proc_start "${pid}")" = "${start}" ] && echo "${pid}"
}
# 75: another update runs - this one stops before it changes anything (whoever started it starts nothing again either:
# the display and the server belong to the update that runs)
UPDATE_BUSY=75
# The lock is held for the process given in MUPIBOX_UPDATE_LOCK_FOR when one started this script and restarts the box
# after it (the app's update unit, the handover of the admin interface): held until that restart - this script ending
# well before it left a few seconds in which another update began and was cut off by that restart. It goes when that
# process ends (a process that is gone holds nothing).
take_update_lock() {
	local me=$$
	case "${MUPIBOX_UPDATE_LOCK_FOR:-}" in
		'' | *[!0-9]*) ;;
		*) [ -d "/proc/${MUPIBOX_UPDATE_LOCK_FOR}" ] && me=${MUPIBOX_UPDATE_LOCK_FOR} ;;
	esac
	# Checked and written under a short flock (not one held for the whole update: every program it starts - pm2, the
	# display - would keep holding it on, past the update): two updates starting at the same moment, or both finding a
	# lock that was left behind, one of them gets it.
	( flock -w 30 9 || exit 2
	  holder=$(update_lock_holder)
	  if [ -n "${holder}" ]; then
		# (the one the lock is for, or the update that holds it started this one - a version switch: it goes on under it)
		if [ "${holder}" = "${me}" ] || [ "${holder}" = "${MUPIBOX_UPDATE_LOCK_OWNER:-}" ]; then exit 0; fi
		exit 1
	  fi
	  # (written next to it, then renamed: never a cut one)
	  printf '%s %s\n' "${me}" "$(proc_start "${me}")" > "${UPDATE_LOCK}.new" && mv -f "${UPDATE_LOCK}.new" "${UPDATE_LOCK}" || exit 2
	) 9> /run/lock/mupibox-update.guard || return 1
	export MUPIBOX_UPDATE_LOCK_OWNER=$(update_lock_holder)
	# (held for this script itself: gone at its end - one held for the caller goes with the caller)
	[ "${MUPIBOX_UPDATE_LOCK_OWNER}" = "$$" ] && trap 'release_update_lock' EXIT
	return 0
}
release_update_lock() {
	# (replaced only once its holder is gone: while this one runs, nothing else writes it)
	[ "$(update_lock_holder)" = "$$" ] && rm -f "${UPDATE_LOCK}"
	return 0
}
update_busy_message() {
	local holder
	holder=$(update_lock_holder)
	if [ -n "${holder}" ]; then
		echo "Another MuPiBox update is running already (process ${holder}) - nothing was changed. Wait until it is done: the box restarts at its end (started in the terminal: it says \"Update finished\")."
	else
		echo "The update could not check whether another one runs - nothing was changed. Please try again in a moment."
	fi
}

# A download, tried up to four times: $1 the address, $2 the file, $3 the time for one try in seconds. curl's own --retry
# leaves out a connection cut in the middle ("curl: (18) Transferred a partial file" - the update stopped at once on a
# weak WiFi); --retry-all-errors would, but older curl (before 7.71) does not know it. A failed try leaves no file.
fetch_retry() {
	local i
	for i in 1 2 3 4; do
		if curl -fsSL --connect-timeout 20 -m "$3" -o "$2" "$1"; then
			return 0
		fi
		rm -f "$2"
		[ "$i" -lt 4 ] && sleep 5
	done
	return 1
}

# Started by the admin interface of 4.x (its update buttons run "curl ... | sudo bash" inside the PHP request): there
# is no terminal for whiptail (the update stopped at its first step), the update stops php-fpm on the way (the admin
# interface is off by default since 5.0.12 - the update, a child of php-fpm, went down with it), and the admin
# interface restarts the box 5 s after the call returns (footer.php: restart.sh). So the update is handed over to a
# systemd unit of its own, as the app runs it: the request returns at once, restart.sh is held until the update is
# done, and the unit restarts the box at its end. The display shows the maintenance screen meanwhile.
started_by_php() {
	local pid=$PPID comm i
	for i in 1 2 3 4 5 6 7 8; do
		[ -n "${pid}" ] && [ "${pid}" -gt 1 ] 2>/dev/null || return 1
		comm=$(cat /proc/${pid}/comm 2>/dev/null)
		case "${comm}" in php-fpm*|php-cgi*|php[0-9]*) return 0 ;; esac
		# (the parent: the field after the ")" that ends the command's name)
		pid=$(sed 's/.*) //' /proc/${pid}/stat 2>/dev/null | cut -d' ' -f2)
	done
	return 1
}
# The hold of restart.sh while a handed-over update runs: the admin interface of 4.x calls restart.sh 5 s after every
# update click (footer.php, whatever the click answered) - also when it only heard "an update is running already". The
# hold is put in at the handover and again right after the update installed its new scripts (they include restart.sh);
# restart.sh of 5.0.13 and later also checks for the unit itself.
HOLD_MARK='MUPIBOX-UPDATE-HOLD'
# $1 put in as $2: written next to it, on the card, then renamed - a power cut leaves the old file or the new one,
# never a cut one (restart.sh is what the box restarts with). Always executable: the restart.sh kept right after the
# update moved its scripts in is not yet (the update makes them executable a step later) - put back as it was, the
# box's restart button did nothing ("command not found").
put_atomic() {
	cp -p "$1" "$2.mupibox-new" && chmod 755 "$2.mupibox-new" && sync "$2.mupibox-new" && mv -f "$2.mupibox-new" "$2" && sync "$(dirname "$2")"
}
hold_restart() {
	# $1: where the real restart.sh is kept meanwhile
	local held=/usr/local/bin/mupibox/restart.sh
	[ -f "${held}" ] || return 0
	if ! grep -q "${HOLD_MARK}" "${held}"; then
		put_atomic "${held}" "$1" || return 1
	fi
	# (holds while the handover prepares - its lock is held - and while the unit runs; left behind - the power went off
	# during the update - it restarts as before: the lock is in /run, gone at the start)
	# (every step checked: success only with the whole placeholder written, read back and in place as restart.sh - a cut
	# one, put in whole, would hold nothing; the first and the last line are looked for)
	local tmp="${held}.mupibox-hold"
	if ! printf '#!/bin/sh\n# %s: an update runs (mupibox-update-admin) - the box restarts when it is done\nif systemctl is-active --quiet mupibox-update-admin || ! flock -n /run/lock/mupibox-update-admin.lock true 2>/dev/null \\\n   || { read -r upid ustart 2>/dev/null < /run/mupibox-update.pid \\\n        && [ -n "$ustart" ] && [ "$(sed "s/^.*) //" "/proc/$upid/stat" 2>/dev/null | cut -d" " -f20)" = "$ustart" ]; }; then\n\tlogger -t mupibox "restart held: an update runs (mupibox-update-admin)"\n\texit 0\nfi\nif [ -f %s ]; then\n\texec /bin/bash %s "$@"\nfi\nexec reboot\n' "${HOLD_MARK}" "$1" "$1" > "${tmp}" \
	   || [ "$(head -n 1 "${tmp}")" != '#!/bin/sh' ] || [ "$(tail -n 1 "${tmp}")" != 'exec reboot' ] \
	   || ! chmod 755 "${tmp}" || ! put_atomic "${tmp}" "${held}"; then
		rm -f "${tmp}" "${held}.mupibox-new"
		return 1
	fi
	rm -f "${tmp}"
	# (in place: the one that is restart.sh now)
	grep -q "${HOLD_MARK}" "${held}" && [ "$(tail -n 1 "${held}")" = 'exec reboot' ]
}
if [ -z "${MUPIBOX_UPDATE_HANDED_OVER:-}" ] && [ ! -t 1 ] && started_by_php; then
	HD=/var/lib/mupibox-update-admin
	HUNIT=mupibox-update-admin
	HELD=/usr/local/bin/mupibox/restart.sh
	# one handover at a time (two clicks, two admin sessions): checking, preparing and starting under one lock - a second
	# one waits for it and then finds the unit running. (Waiting runs out only while the first holds the lock - and that
	# one holds restart.sh before anything that takes long: the admin interface's restart after the second click does
	# nothing either.)
	exec 8> /run/lock/mupibox-update-admin.lock
	flock -w 120 8 || { echo "Another update is being started - please wait a moment and look again."; exit 0; }
	if systemctl is-active --quiet ${HUNIT}; then
		# (not touching restart.sh: it is held for the running update)
		echo "An update is running already (${HUNIT}) - the box restarts when it is done."
		exit 0
	fi
	# (one started elsewhere - the terminal, the app: nothing handed over. The admin interface still calls restart.sh in
	# 5 s: the one of 5.0.15 and later waits for that update itself; an older one - that update has not put its scripts in
	# yet - is held: the placeholder waits for it too, and goes when that update puts in the new restart.sh; one that
	# stops before leaves it, and it restarts as the old one after the update)
	if [ -n "$(update_lock_holder)" ]; then
		if [ -f ${HELD} ] && ! grep -q "${HOLD_MARK}" ${HELD} && ! grep -q 'mupibox-update.pid' ${HELD}; then
			mkdir -p ${HD}
			if ! hold_restart ${HD}/restart.sh.held; then
				# (not held - no space left?: the admin interface restarts only after this call returned (footer.php, in the
				# same request) - it returns when that update is done. That update stops php-fpm on its way: the request
				# ends with it, without the restart. The handover's lock is let go meanwhile: a further click waiting for
				# it 120 s returned "being started" - and its restart came.)
				exec 8>&-
				while [ -n "$(update_lock_holder)" ]; do sleep 5; done
				echo "Another MuPiBox update was running - it is done now, nothing was changed by this one."
				exit 0
			fi
		fi
		update_busy_message
		exit 0
	fi
	# restart.sh held at once, before the download (which may take minutes): see hold_restart
	mkdir -p ${HD}/bin
	HOLD_MINE=0
	if [ -f ${HELD} ] && ! grep -q "${HOLD_MARK}" ${HELD}; then
		if ! hold_restart ${HD}/restart.sh.held; then
			# (the admin interface restarts the box in 5 s - nothing is started that it would cut off)
			echo "Error: the update could not be prepared (no space left?) - nothing was changed."
			exit 1
		fi
		HOLD_MINE=1
	fi
	# (nothing started: only the hold this call put in goes again)
	unhold_mine() {
		if [ "${HOLD_MINE}" = "1" ] && ! systemctl is-active --quiet ${HUNIT} && [ -f ${HD}/restart.sh.held ]; then
			put_atomic ${HD}/restart.sh.held ${HELD}
		fi
	}
	# (MUPIBOX_UPDATE_SCRIPT_URL: another copy of this script, to test one before it is on main: without it the handed-over
	# run was always the one from main, whatever the admin interface had started)
	if ! fetch_retry "${MUPIBOX_UPDATE_SCRIPT_URL:-https://raw.githubusercontent.com/splitti/MuPiBox/main/update/start_mupibox_update.sh}" ${HD}/start_mupibox_update.sh 120 \
	   || ! bash -n ${HD}/start_mupibox_update.sh; then
		unhold_mine
		echo "Error: the update script could not be downloaded - nothing was changed. Please try again."
		exit 1
	fi
	# (whiptail's progress bar has no terminal here: its input is only read away)
	printf '#!/bin/sh\ncat > /dev/null\n' > ${HD}/bin/whiptail
	chmod 755 ${HD}/bin/whiptail
	cat > ${HD}/run.sh <<'HANDOVER'
#!/bin/bash
# The update handed over by the admin interface of 4.x (see start_mupibox_update.sh): $@ = its arguments
HD=/var/lib/mupibox-update-admin
HELD=/usr/local/bin/mupibox/restart.sh
exec > ${HD}/output.txt 2>&1
# (the admin interface saves its settings right after the call returned: they are written before the update starts)
sleep 20
systemctl stop mupi_idle_shutdown 2>/dev/null
cd /home/dietpi
# (the update's lock held for this run: up to the restart at its end - see take_update_lock)
MUPIBOX_UPDATE_LOCK_FOR=$$ MUPIBOX_UPDATE_HANDED_OVER=1 PATH="${HD}/bin:${PATH}" bash ${HD}/start_mupibox_update.sh "$@"
RC=$?
# restart.sh back - the one the update installed, or the one before when it stopped earlier (written next to it, on
# the card, then renamed: see put_atomic in start_mupibox_update.sh). Not when another update runs (75): the placeholder
# waits for that one too, and goes to the one kept here after it - the one before knows nothing of it (4.x) and
# restarted the box in the middle of it at the admin interface's next update click.
if [ "${RC}" != "75" ] && grep -q 'MUPIBOX-UPDATE-HOLD' ${HELD} 2>/dev/null && [ -f ${HD}/restart.sh.held ]; then
	cp -p ${HD}/restart.sh.held ${HELD}.mupibox-new && chmod 755 ${HELD}.mupibox-new && sync ${HELD}.mupibox-new && mv -f ${HELD}.mupibox-new ${HELD} && sync /usr/local/bin/mupibox
fi
if [ "${RC}" = "0" ] && [ ! -e /tmp/mupibox-update-nostart ]; then
	echo "Update finished - the box restarts."
	sleep 5
	systemctl reboot
elif [ "${RC}" = "75" ]; then
	# (another update ran - started after the check above: this one changed nothing, the display and the idle shutdown
	# belong to that one)
	echo "Another update is running - this one changed nothing."
elif [ -e /tmp/mupibox-update-nostart ]; then
	# (the way back did not complete: nothing is started on that installation - the next start of the box finishes it)
	echo "The update stopped and the way back is not complete - restart the box (see /boot/mupibox_update.log)."
else
	echo "The update did not finish (code ${RC}) - see /boot/mupibox_update.log; the box goes on with the version before."
	systemctl start mupi_idle_shutdown 2>/dev/null
	# the display back (the update ended Chromium at its start) - unless the update already started it again
	if ! pgrep -x chromium >/dev/null && ! pgrep -x chromium-browse >/dev/null; then
		sudo -i -u dietpi bash -c "setsid nohup /usr/local/bin/mupibox/restart_kiosk.sh >/dev/null 2>&1 < /dev/null &"
	fi
fi
HANDOVER
	chmod 755 ${HD}/run.sh
	if ! systemd-run --unit=${HUNIT} --collect --quiet /bin/bash ${HD}/run.sh "$@"; then
		unhold_mine
		echo "Error: the update could not be started in the background - nothing was changed."
		exit 1
	fi
	echo "The update runs in the background (${HUNIT}, log ${HD}/output.txt) - the box restarts when it is done (up to 30 minutes)."
	exit 0
fi

# (before anything of the box is touched - the display, the update log, the download)
if ! take_update_lock; then
	update_busy_message
	exit ${UPDATE_BUSY}
fi

# The Pi's boot files: /boot/firmware/ on newer DietPi (v10, Debian 13 "Trixie"), /boot/ before (as autosetup.sh)
BOOT_CONFIG="/boot/config.txt"
BOOT_CMDLINE="/boot/cmdline.txt"
[ -f /boot/firmware/config.txt ] && BOOT_CONFIG="/boot/firmware/config.txt"
[ -f /boot/firmware/cmdline.txt ] && BOOT_CMDLINE="/boot/firmware/cmdline.txt"

# Preflight: this update replaces jq with a freshly downloaded binary and rewrites the
# configuration with jq. Download it FIRST, so a network problem (e.g. a
# DNS failure) stops the update before anything on the box has been changed. Before,
# a failed download left an empty /usr/bin/jq behind, which then wiped the config files.
PREFLIGHT_DIR=$(mktemp -d /tmp/mupibox-preflight.XXXXXX)
if [ `getconf LONG_BIT` == 32 ]; then
  JQ_ARCH="armhf"
else
  JQ_ARCH="arm64"
fi
if ! fetch_retry https://github.com/jqlang/jq/releases/download/jq-1.8.1/jq-linux-${JQ_ARCH} ${PREFLIGHT_DIR}/jq 180 \
   || ! chmod 755 ${PREFLIGHT_DIR}/jq || ! ${PREFLIGHT_DIR}/jq --version > /dev/null 2>&1; then
  echo "Error: could not download jq (no internet / DNS problem?). Nothing was changed - please try again."
  rm -rf ${PREFLIGHT_DIR}
  exit 1
fi

# A version before 5.1 is installed by its own update script (from its tag): this one comes from main and puts a
# version into the folders of 5.1 (server/, player/, data/, cache/ - scripts/mupibox/migrate_layout.sh), which the
# programs before 5.1 do not know. A box of 5.1 goes back only to 5.0.14 or a later 5.0.x (the stable version before
# 5.1, made for it): older ones do not know what 5.1 changed (the folders, no PHP; before 5.0.3 not even the app) - they
# are installed anew. Going back, the box keeps its folders: the older update finds all of it under the names of before
# (links), and the next update of 5.1 takes over what the older version wrote meanwhile. A box that never had 5.1 goes to
# any version as before. (A branch is taken for one of 5.1 or later.)
#
# The web server as 5.0.14 needs it: 5.1 took PHP off (remove_legacy_admin.sh) and sends every .php address to the app
# (92-mupibox-no-php.conf); the older update brings its PHP pages back (www.zip), not PHP. Before its update - all of it
# fine for 5.1 meanwhile (no PHP pages left in /var/www; cut off, or its update failed: 5.1 goes on, its next update
# takes it off again):
#   - PHP working: installed when it is not (DietPi's software 89, as their installer has it), php-fpm on and lighttpd's
#     PHP modules in, checked - 1 when it is not: then nothing of the rest, the redirect stays and 5.0.14 goes on
#     without its admin interface (the app does it all)
#   - its switch "off" (92-mupibox-admin-off.conf in place of 92-mupibox-no-php.conf - the same redirect - and
#     mupibox.legacyAdmin false): its update switches it off its way and keeps the modules for the switch in the app
#     (legacy_admin.sh)
# The right of its PHP pages to run commands as root (sudoers.d/www-data) is not written here: that version's own
# update gives it, once it is in place - written before, a power cut or an update that stopped left it on 5.1.
# older_web_server_undo takes it back (the step after it failed).
older_web_fpm_units() { systemctl list-unit-files 'php*-fpm.service' --no-legend 2>/dev/null | awk '{print $1}'; }
older_web_server() {
  local cfg=/etc/mupibox/mupiboxconfig.json E=/etc/lighttpd/conf-enabled unit mod tmp running=""
  OLDER_WEB_UNITS="" OLDER_WEB_MODS="" OLDER_WEB_SWITCH=""
  if ! dpkg-query -W -f='${Status}\n' 'php*-fpm' 2>/dev/null | grep -q 'install ok installed'; then
    echo "PHP is installed again for ${1} (its admin interface)..."
    G_INTERACTIVE=0 timeout 900 /boot/dietpi/dietpi-software install 89 > /dev/null 2>&1
  fi
  for unit in $(older_web_fpm_units); do
    systemctl is-enabled -q "${unit}" && systemctl is-active -q "${unit}" && continue
    systemctl enable --now "${unit}" > /dev/null 2>&1
    OLDER_WEB_UNITS="${OLDER_WEB_UNITS} ${unit}"
  done
  for mod in fastcgi fastcgi-php-fpm; do
    ls ${E}/[0-9][0-9]-${mod}.conf > /dev/null 2>&1 && continue
    lighty-enable-mod "${mod}" > /dev/null 2>&1
    OLDER_WEB_MODS="${OLDER_WEB_MODS} ${mod}"
  done
  # (working: php-fpm runs, and lighttpd hands .php to it)
  for unit in $(older_web_fpm_units); do
    systemctl is-active -q "${unit}" && running=1
  done
  if [ -z "${running}" ] || ! ls ${E}/[0-9][0-9]-fastcgi-php-fpm.conf > /dev/null 2>&1; then
    older_web_server_undo
    return 1
  fi
  if [ -e ${E}/92-mupibox-no-php.conf ]; then
    OLDER_WEB_SWITCH=$(${PREFLIGHT_DIR}/jq -c '.mupibox.legacyAdmin' "${cfg}" 2>/dev/null)
    [ -n "${OLDER_WEB_SWITCH}" ] || OLDER_WEB_SWITCH=null
    mv -f ${E}/92-mupibox-no-php.conf ${E}/92-mupibox-admin-off.conf
    if [ -s "${cfg}" ] && tmp=$(mktemp /etc/mupibox/.cfg.XXXXXX); then
      ${PREFLIGHT_DIR}/jq '.mupibox.legacyAdmin = false' "${cfg}" > "${tmp}" 2>/dev/null && [ -s "${tmp}" ] \
        && chown --reference="${cfg}" "${tmp}" && chmod --reference="${cfg}" "${tmp}" && mv -f "${tmp}" "${cfg}"
      rm -f "${tmp}"
    fi
  fi
  sync
  systemctl restart lighttpd > /dev/null 2>&1
  return 0
}
older_web_server_undo() {
  local cfg=/etc/mupibox/mupiboxconfig.json E=/etc/lighttpd/conf-enabled unit mod tmp
  if [ -n "${OLDER_WEB_SWITCH}" ]; then
    mv -f ${E}/92-mupibox-admin-off.conf ${E}/92-mupibox-no-php.conf
    if [ -s "${cfg}" ] && tmp=$(mktemp /etc/mupibox/.cfg.XXXXXX); then
      ${PREFLIGHT_DIR}/jq --argjson v "${OLDER_WEB_SWITCH}" 'if $v == null then del(.mupibox.legacyAdmin) else .mupibox.legacyAdmin = $v end' "${cfg}" > "${tmp}" 2>/dev/null \
        && [ -s "${tmp}" ] && chown --reference="${cfg}" "${tmp}" && chmod --reference="${cfg}" "${tmp}" && mv -f "${tmp}" "${cfg}"
      rm -f "${tmp}"
    fi
  fi
  for mod in ${OLDER_WEB_MODS}; do
    lighty-disable-mod "${mod}" > /dev/null 2>&1
  done
  for unit in ${OLDER_WEB_UNITS}; do
    systemctl disable --now "${unit}" > /dev/null 2>&1
  done
  OLDER_WEB_UNITS="" OLDER_WEB_MODS="" OLDER_WEB_SWITCH=""
  systemctl restart lighttpd > /dev/null 2>&1
}
if [ -z "$BRANCH" ]; then
  TARGET_URL=$(curl -fsSL --retry 3 --retry-delay 3 -m 60 https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json | ${PREFLIGHT_DIR}/jq -r ".release.${RELEASE}[-1].url // empty" 2>/dev/null)
  TARGET_TAG=$(printf '%s' "${TARGET_URL}" | sed -nE 's#^https://github.com/splitti/MuPiBox/archive/refs/tags/([A-Za-z0-9._-]+)\.zip$#\1#p')
  if [ -z "${TARGET_TAG}" ]; then
    echo "Error: the ${RELEASE} version could not be read from version.json - nothing was changed, please try again."
    rm -rf ${PREFLIGHT_DIR}
    exit 1
  fi
  if [ "$(printf '%s\n' "${TARGET_TAG#v}" 5.1 | sort -V | head -n 1)" != "5.1" ]; then
    # (a box of 5.1, or one whose move to it was cut off - or an older version put on one, which keeps the folders)
    BOX_5_1=""
    { [ -L /home/dietpi/.mupibox/Sonos-Kids-Controller-master ] || [ -e /home/dietpi/.mupibox/.layout-moving ]; } && BOX_5_1=1
    if [ -n "${BOX_5_1}" ] && [ "$(printf '%s\n' "${TARGET_TAG#v}" 5.0.14 | sort -V | head -n 1)" != "5.0.14" ]; then
      echo "Error: from MuPiBox 5.1 the way back goes only to 5.0.14 - ${TARGET_TAG} (${RELEASE}) does not know the box of 5.1. To use ${TARGET_TAG}, install it anew. Nothing was changed."
      rm -rf ${PREFLIGHT_DIR}
      exit 1
    fi
    OWN_SCRIPT=$(mktemp /tmp/mupibox-update-${TARGET_TAG}.XXXXXX)
    if curl -fsSL --retry 3 --retry-delay 3 -m 120 -o "${OWN_SCRIPT}" "https://raw.githubusercontent.com/splitti/MuPiBox/${TARGET_TAG}/update/start_mupibox_update.sh" \
       && bash -n "${OWN_SCRIPT}"; then
      if [ -n "${BOX_5_1}" ]; then
        # (an update that stopped before - its mark on the card: undone or finished first, by this version's own way
        # back, which knows its mark - left there, the start after the older version would find it, and that version's
        # update does not know it)
        if [ -e /home/dietpi/.mupibox/update-state ]; then
          if [ ! -x /usr/local/bin/mupibox/restore_interrupted_update.sh ] \
             || ! /usr/local/bin/mupibox/restore_interrupted_update.sh --no-restart \
             || [ -e /home/dietpi/.mupibox/update-state ]; then
            echo "Error: an update that stopped before could not be finished - nothing was changed; restart the box and try again."
            rm -f "${OWN_SCRIPT}"
            rm -rf ${PREFLIGHT_DIR}
            exit 1
          fi
        fi
        older_web_server "${TARGET_TAG}" \
          || echo "Note: PHP could not be installed again - ${TARGET_TAG} runs without its admin interface (the app does it all)."
        # (the move to the folders of 5.1 finished, and what that version looks for elsewhere than its update leaves
        # it - see migrate_layout.sh)
        if ! bash /usr/local/bin/mupibox/migrate_layout.sh --for-older; then
          older_web_server_undo
          echo "Error: the folders could not be made ready for ${TARGET_TAG} - nothing was changed, please try again."
          rm -f "${OWN_SCRIPT}"
          rm -rf ${PREFLIGHT_DIR}
          exit 1
        fi
      fi
      # (pm2 by the old names before that update runs: a 5.1 box set up before this script may have the real paths
      # saved - server/, player/ - and the older update only restarts by name, so it would start the program of 5.1 it
      # leaves beside its own. Registered as at the end of an update, see there.)
      if [ -n "${BOX_5_1}" ]; then
        sudo -H -u dietpi bash -c "pm2 delete server >/dev/null 2>&1; pm2 start /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server.js --name server --cwd /home/dietpi/.mupibox/Sonos-Kids-Controller-master" > /dev/null 2>&1
        sudo -H -u dietpi bash -c "pm2 delete spotify-control >/dev/null 2>&1; pm2 start /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js --name spotify-control --cwd /home/dietpi/.mupibox/spotifycontroller-main" > /dev/null 2>&1
        sudo -H -u dietpi bash -c "pm2 save" > /dev/null 2>&1
      fi
      echo "MuPiBox ${TARGET_TAG} is installed by its own update script"
      # (run by this one, not in its place: when it stopped before its version was in place - its download, a check,
      # its own way back - the box is still 5.1, and what was made ready for it goes again (PHP on, its switch). 5.1 is
      # still there as long as its link is: that update moves it aside and puts its own folder there. All of it in this
      # block: that update replaces this script's file meanwhile.)
      bash "${OWN_SCRIPT}" "$@"
      rc=$?
      if [ -n "${BOX_5_1}" ] && [ -L /home/dietpi/.mupibox/Sonos-Kids-Controller-master ]; then
        older_web_server_undo
        echo "Note: ${TARGET_TAG} was not installed - the box stays on this version, as it was before."
      fi
      rm -f "${OWN_SCRIPT}"
      rm -rf ${PREFLIGHT_DIR}
      exit ${rc}
    fi
    echo "Error: the update script of ${TARGET_TAG} could not be downloaded - nothing was changed, please try again."
    rm -f "${OWN_SCRIPT}"
    rm -rf ${PREFLIGHT_DIR}
    exit 1
  fi
fi

killall -s 9 -w -q -r chromium
# The display's console in graphics mode from here on: in text mode its driver (fbcon) draws over the maintenance picture
# now and then (the console's blue in stripes across it, whenever the cursor blinks or a line is written to tty1).
python3 -c 'import fcntl,os;fcntl.ioctl(os.open("/dev/tty1",os.O_RDWR|os.O_NOCTTY),0x4B3A,1)' 2>/dev/null

CONFIG="/etc/mupibox/mupiboxconfig.json"

# Keep a copy of the current settings and media list (only if they are intact), so a
# failed update can never leave the box without a way back.
if ${PREFLIGHT_DIR}/jq . ${CONFIG} > /dev/null 2>&1; then
  cp ${CONFIG} /home/dietpi/mupiboxconfig.json.pre-update
fi
# (an empty library never replaces a copy that has one: an update started again after one that stopped halfway - the
# library empty then - kept only the empty list here)
PRE_DATA=/home/dietpi/.mupibox/data/library/data.json
# (a box before the folders of 5.1: there - moved by this update, see "Folders of 5.1")
[ -L /home/dietpi/.mupibox/Sonos-Kids-Controller-master ] || PRE_DATA=/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json
pre_entries() { ${PREFLIGHT_DIR}/jq 'if type == "array" then length else 0 end' "$1" 2>/dev/null | head -n 1 | grep -E '^[0-9]+$' || echo 0; }
if ${PREFLIGHT_DIR}/jq . "${PRE_DATA}" > /dev/null 2>&1; then
  if [ "$(pre_entries "${PRE_DATA}")" -gt 0 ] || [ "$(pre_entries /home/dietpi/data.json.pre-update)" -eq 0 ]; then
    cp "${PRE_DATA}" /home/dietpi/data.json.pre-update
  fi
fi
LOG="/boot/mupibox_update.log"
exec 3>${LOG}

# The display back after an abort before anything was replaced (the download or the archive): the maintenance screen
# ended Chromium at the start, and only the app brought it back afterwards - in a terminal or with systemd-run it stayed
# on the maintenance screen until the box was restarted. Only when it is not running (the app's unit checks the same).
display_back() {
	pgrep -x chromium > /dev/null || pgrep -x chromium-browse > /dev/null \
		|| sudo -i -u dietpi bash -c "setsid nohup /usr/local/bin/mupibox/restart_kiosk.sh >/dev/null 2>&1 < /dev/null &" >&3 2>&3
}

# H5: previously the script ran the destructive `rm -R Sonos-Kids-
# Controller-master/` BEFORE verifying that the downloaded archive was
# usable. A flaky internet-dropout, a 404 response, or a corrupted
# unzip would leave the box with no installation and no rollback path.
# Add fail_update() to bail BEFORE any destructive op when a pre-flight
# check fails, plus an atomic-swap pattern around the rm so a failure
# at extract time can restore the previous install.
# fail_update <message> [nostart]
fail_update() {
	local msg=$1
	echo "## UPDATE ABORTED: ${msg}" >&3 2>&3
	# (the box's programs are stopped before the backup of the user data: started again, so the box goes on running;
	# the idle shutdown too, it was stopped for the update) - not with "nostart": the installation is not in a state to
	# run (a way back that did not complete - the next start of the box takes it up, before pm2 starts them)
	if [ "${2:-}" = "nostart" ]; then
		echo "## (the box's server and player stay stopped - restart the box: the way back goes on at the start)" >&3 2>&3
		# (for whoever started the update - the app's update unit: it starts nothing afterwards either)
		touch /tmp/mupibox-update-nostart
	else
		echo "## (your installation is as it was before the update)" >&3 2>&3
		sudo -H -u dietpi bash -c "pm2 start server; pm2 start spotify-control" >&3 2>&3
		# the display too: the update ended Chromium at its start, and it stayed off (also from the app or the terminal)
		sudo -i -u dietpi bash -c "setsid nohup /usr/local/bin/mupibox/restart_kiosk.sh >/dev/null 2>&1 < /dev/null &" >&3 2>&3
	fi
	service mupi_idle_shutdown start >&3 2>&3
	# (the exit below ends only the part in the progress bar - the script after it reads this and ends with an error
	# too, so a caller - the admin interface, curl | bash - sees it failed instead of "Update finished")
	echo "Update aborted: ${msg}" > /tmp/mupibox-update-failed
	# Surface to dialog/whiptail so the user actually sees the failure
	echo -e "XXX\n100\nUpdate aborted: ${msg}\nXXX"
	exit 1
}

# An update in progress, for one that stops halfway (power cut): set before the old installation is moved aside, gone
# only after the very last step. restore_interrupted_update.sh finds it at the next start (and the next update) and
# brings the old installation back, whole. Written next to it, checked, on the card - and only then the update goes
# on (1 when any of it failed: the caller stops the update before it touches anything).
UPDATE_STATE=/home/dietpi/.mupibox/update-state
# (a second word on the next line: what the start still has to do after "done" - read by restore_interrupted_update.sh
# of 5.1; the older ones read only the first line)
mark_update() {
	local next="${UPDATE_STATE}.new"
	rm -f "${next}"
	if printf '%s\n' "$1" ${2:+"$2"} > "${next}" && [ "$(head -n 1 "${next}" 2>/dev/null)" = "$1" ] \
		&& { sync "${next}" 2>/dev/null || sync; } && mv -f "${next}" "${UPDATE_STATE}" && sync; then
		return 0
	fi
	rm -f "${next}"
	return 1
}
clear_update_mark() {
	rm -f "${UPDATE_STATE}" "${UPDATE_STATE}.new"
	sync
}
rm -f /tmp/mupibox-update-failed /tmp/mupibox-update-nostart
# (a policy-rc.d an update that stopped halfway left behind - see "Samba, FTP and VNC" below: it kept every service from
# starting when a package is installed)
grep -qs "written by the MuPiBox update" /usr/sbin/policy-rc.d && rm -f /usr/sbin/policy-rc.d
service mupi_idle_shutdown stop
# 2026-09-20: no longer installed (nothing in MuPiBox uses them any more):
#   id3tool - only the ID3 converter used it; that converter was removed from the admin
#   python3-gpiozero - no script imports gpiozero (GPIO is done with RPi.GPIO / pigpio / gpiod)
#   mesa-utils - only diagnostic tools (glxinfo); nothing calls them
#   libsdl2-dev - no SDL code is built or used (fbv ships as a prebuilt binary)
#   python3-smbus - unused; the mupihat scripts use python3-smbus2
#   i2c-tools - no script calls i2cdetect/i2cget/i2cset (I2C is used through python3-smbus2)
#   autoconf - only needed to compile fbv (dev/compile_scripts/fbv.sh); fbv ships prebuilt in bin/fbv
#   automake - only needed to compile fbv (dev/compile_scripts/fbv.sh); fbv ships prebuilt in bin/fbv
# One list for every channel (stable and beta kept the list of before until 5.0.10 - without xdotool, which the display's
# window and the goodbye picture need, and with the packages above that nothing uses).
# libwidevinecdm0 stays: the display plays Spotify through the Web Playback SDK in Chromium, which needs Widevine
packages2install="lighttpd-mod-openssl gpiod git mpv pulseaudio-module-bluetooth python3-pip bluez zip rrdtool scrot net-tools wireless-tools bc build-essential python3-rpi.gpio python3-lgpio python3-serial python3-requests python3-paho-mqtt python3-smbus2 python3-alsaaudio python3-netifaces libwidevinecdm0 python3-flask python3-pil librsvg2-bin feh xdotool rfkill x11-utils x11-xserver-utils"
# packages the update removes (apt-get remove, only when installed) - none at the moment; Debian's jq goes where the
# update puts its own jq (see "Copy binaries")
packages2remove=""
# apt without questions and with patience: an installation asking about a changed config file waited for an answer
# nobody gives (no terminal), and the package lock held by DietPi's or Debian's own updates (often right after the
# start) made every apt-get here give up at once - mpv among them, so the box played nothing but Spotify afterwards
export DEBIAN_FRONTEND=noninteractive
apt-get() { command apt-get -o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold "$@"; }
STEP=0
VER_JSON="/tmp/version.json"
OS=$(grep -E '^(VERSION_CODENAME)=' /etc/os-release)  >&3 2>&3
OS=${OS:17}  >&3 2>&3
ARCH=$(uname -m) >&3 2>&3	

# maintenance screen of the box (boot screen scene, text in the box's language); the old picture without one
if [ -x /usr/local/bin/mupibox/maintenance_screen.sh ]; then
	/usr/local/bin/mupibox/maintenance_screen.sh update >&3 2>&3
elif [ -s /home/dietpi/MuPiBox/sysmedia/images/installation.jpg ]; then
	# (on the display's terminal: fbv shows nothing without one, and the handed-over update has none)
	/usr/bin/fbv /home/dietpi/MuPiBox/sysmedia/images/installation.jpg </dev/tty1 >/dev/tty1 2>&3 &
fi

if [ -z "$BRANCH" ]; then
  wget -q -O ${VER_JSON} https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json >&3 2>&3
  VERSION=$(/usr/bin/jq -r .release.${RELEASE}[-1].version ${VER_JSON})  >&3 2>&3
  MUPIBOX_URL=$(/usr/bin/jq -r .release.${RELEASE}[-1].url ${VER_JSON})  >&3 2>&3
else
  MUPIBOX_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip"
fi

USER=$(/usr/bin/whoami) >&3 2>&3
RASPPI=$(/usr/bin/cat /sys/firmware/devicetree/base/model | tr -d '\0' ) >&3 2>&3

if [ -n "$BRANCH" ]; then
	MUPI_SRC="/home/dietpi/MuPiBox-${BRANCH}" >&3 2>&3
elif [ "$RELEASE" = "dev" ]; then
	MUPI_SRC="/home/dietpi/MuPiBox-main" >&3 2>&3
else
	MUPI_SRC="/home/dietpi/MuPiBox-${VERSION}" >&3 2>&3
fi

# The date of a dev version from the GitHub API: without an answer (no network, or more than 60 questions an hour from
# the home network - GitHub then answers with an error) it was "null" and stood so in the app ("DEV 5.0.14 null").
# Only a real date is taken, else the day of the update.
github_date() {
  local d
  d=$(curl -s -m 20 "$1" | jq -r "$2" 2>/dev/null | cut -d'T' -f1)
  case "$d" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) echo "$d" ;; *) date +%F ;; esac
}
if [ -n "$BRANCH" ]; then
  if [ -n "$VERSION_LABEL" ]; then
    VERSION_LONG="${VERSION_LABEL}"
  else
    VERSION_LONG="DEV ${BRANCH} $(github_date "https://api.github.com/repos/${REPO}/branches/${BRANCH}" '.commit.commit.committer.date')"
  fi
elif [ "$RELEASE" = "dev" ]; then
	VERSION_LONG="DEV ${VERSION} $(github_date "https://api.github.com/repos/splitti/MuPiBox" '.pushed_at')"
else
	VERSION_LONG="${VERSION} ${RELEASE}"
fi
NODEJS=$(nodejs --version) >&3 2>&3

echo "==========================================================================================" >&3 2>&3
echo "= OS:               ${OS}" >&3 2>&3
echo "= RasPi:            ${RASPPI}" >&3 2>&3
echo "= Architecture:     ${ARCH}" >&3 2>&3
echo "= Node.js:          ${NODEJS}" >&3 2>&3
echo "= User:             ${USER}" >&3 2>&3
echo "= Parameter:        $1" >&3 2>&3
echo "= Release:          ${RELEASE}" >&3 2>&3
echo "= Version:          ${VERSION_LONG}" >&3 2>&3
echo "= Update-URL:       ${MUPIBOX_URL}" >&3 2>&3
echo "= Unzip-Directory:  ${MUPI_SRC}" >&3 2>&3
echo "==========================================================================================" >&3 2>&3

# The percent of the progress (whiptail's bar, the app, the display's bar): by the part of the update and the share of
# the time it took - not the count of the steps, of which the 30 checks of the packages are over in seconds (the bar
# was at 30 % after half a minute and went from 57 % to 100 at the end). Measured on a Pi 4 (12.11.2026, an update
# with nothing to install, 5.5 minutes): package list 9 %, packages 1 %, download 16 %, unzipping 33 %, programs 15 %,
# copying 6 %, services 11 %, settings 5 %. Another Pi takes longer or shorter, the shares stay near enough. The
# percent never goes back; an abort and the end keep theirs.
weigh_progress() {
	local total n=0 at=0 line pct text l
	total=$(echo ${packages2install} | wc -w)
	while IFS= read -r line; do
		if [ "${line}" != "XXX" ]; then
			printf '%s\n' "${line}"
			continue
		fi
		IFS= read -r pct
		# (the step's text: up to the closing XXX - one line, or more for a long reason of an abort)
		text=""
		while IFS= read -r l && [ "${l}" != "XXX" ]; do text="${text:+${text} }${l}"; done
		case "${pct}" in '' | *[!0-9]*) pct=${at} ;; esac
		case "${text}" in
			"Update aborted"* | "Installation complete"*) at=${pct} ;;
			*)
				case "${text}" in
					"Prepare"*) pct=0 ;;
					"Update package-list"*) pct=2 ;;
					"Update Node.js"*) pct=9 ;;
					"Install package"* | "Install python3-dev"*) pct=16 ;;
					"Install LED"*) pct=81 ;;
					"Install "*)
						n=$((n + 1))
						pct=$((9 + 6 * n / (total > 0 ? total : 1)))
						[ "${pct}" -gt 15 ] && pct=15
						;;
					"Remove the previous admin"*) pct=98 ;;
					"Update Chromium"* | "Remove "*) pct=15 ;;
					"Setup DietPi-Dashboard"*) pct=16 ;;
					"Download MuPiBox"*) pct=17 ;;
					"Unzip"*) pct=33 ;;
					"Folders of 5.1"*) pct=50 ;;
					"Update frontend"*) pct=60 ;;
					"Copy MuPiBox-Files"*) pct=75 ;;
					"Copy binaries"*) pct=78 ;;
					"Copy some media"*) pct=79 ;;
					"Restarting Services"*) pct=82 ;;
					"Uninstall Pi-Blaster"*) pct=92 ;;
					"Set environment"* | "Download OnOffShim"*) pct=93 ;;
					"Update Config-File"*) pct=94 ;;
					"Network optimization"*) pct=95 ;;
					"Activate SSL"*) pct=96 ;;
					"Finalizing"*) pct=97 ;;
					*) pct=${at} ;;
				esac
				[ "${pct}" -lt "${at}" ] && pct=${at}
				at=${pct}
				;;
		esac
		printf 'XXX\n%s\n%s\nXXX\n' "${at}" "${text}"
	done
}

# The progress where whiptail has no terminal (started with systemd-run, as in the instructions for testing a branch):
# whiptail quits at once, and every step after it was "printf: write error: broken pipe" in the journal. What whiptail
# left unread is written here as lines ("33% Unzip"), so the journal shows how far the update is. After a whiptail that
# ran to the end there is nothing left to read.
progress_lines() {
	local line pct text l
	while IFS= read -r line; do
		if [ "${line}" != "XXX" ]; then
			printf '%s\n' "${line}"
			continue
		fi
		IFS= read -r pct
		text=""
		while IFS= read -r l && [ "${l}" != "XXX" ]; do text="${text:+${text} }${l}"; done
		printf '%s%% %s\n' "${pct}" "${text}"
	done
}

rm -f /tmp/mupibox-update-failed
{
	###############################################################################################

	echo -e "XXX\n0\nPrepare Update... \nXXX"	 >&3 2>&3
	systemctl stop mupi_idle_shutdown.service >&3 2>&3

	mkdir -p /home/dietpi/.mupibox/chromium_cache >&3 2>&3	
	mkdir -p /home/dietpi/MuPiBox/media/{audiobook,music,other,cover,youtube-dl} >&3 2>&3
	if [ "$RELEASE" = "dev" ]; then
		mkdir /home/dietpi/MuPiBox/media/NAS >&3 2>&3
	fi

	chown dietpi:dietpi /home/dietpi/MuPiBox/media/{audiobook,music,other,cover,youtube-dl} >&3 2>&3

	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nUpdate package-list\nXXX"
	before=$(date +%s)
	# a dpkg stopped halfway before (power gone during an installation) makes apt refuse every package until it is
	# finished, and dependencies left broken by that as well
	dpkg --configure -a >&3 2>&3
	# (whether the lists are fresh: with old ones an upgrade finds nothing newer and still succeeds - see Chromium below.
	# A list it could not fetch - a DNS error, the server away - leaves the old one with a warning, and apt-get still
	# ends with 0: so its words are read, too.)
	apt_lists_update() {
		local out rc
		# (in English: its words are read - with another language of the box they are other ones)
		out=$(LC_ALL=C apt-get update 2>&1)
		rc=$?
		printf '%s\n' "${out}" >&3
		[ ${rc} -eq 0 ] && ! printf '%s\n' "${out}" | grep -qE '^(Err:|W: (Failed to fetch|Some index files failed))'
	}
	APT_LISTS_FRESH=""
	apt_lists_update && APT_LISTS_FRESH=1
	apt-get --yes -f install >&3 2>&3
	after=$(date +%s)

	echo -e "## apt-get update ##  finished after $((after - $before)) seconds" >&3 2>&3

	###############################################################################################

	echo -e "XXX\n${STEP}\nUpdate Node.js\nXXX"
	before=$(date +%s)
	if [[ "$NODEJS" == "v22."* ]]; then
		echo "Node.js already at v22.*" >&3 2>&3
	else
		# Node.js 22 from NodeSource, installed over the one there is. It is no longer removed first: when the download or
		# the installation failed (no internet for a moment, NodeSource not answering), the box was left without Node.js -
		# the app, the display and the player no longer ran. The old one stays until the new one is in.
		if curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh >&3 2>&3 && bash /tmp/nodesource_setup.sh >&3 2>&3; then
			apt-get install -y nodejs >&3 2>&3
		fi
		rm -f /tmp/nodesource_setup.sh
		NODEJS=$(nodejs --version 2>/dev/null)
		if [[ "$NODEJS" != "v22."* ]]; then
			echo "## WARNING: Node.js 22 could not be installed (still ${NODEJS:-none}) ##" >&3 2>&3
			command -v node >/dev/null 2>&1 || fail_update "Node.js could not be installed (internet?) - please start the update again"
		fi
	fi
	after=$(date +%s)

	echo -e "## apt-get update ##  finished after $((after - $before)) seconds" >&3 2>&3


	###############################################################################################
	
	for package in ${packages2install}
	do
		before=$(date +%s)
		STEP=$(($STEP + 1))
		echo -e "XXX\n${STEP}\nInstall ${package}\nXXX"
		#apt-get install ${package} -y >&3 2>&3
		PKG_OK=$(dpkg -l ${package} 2>/dev/null | egrep '^ii' | wc -l) >&3 2>&3
		if [ ${PKG_OK} -eq 0 ]; then
		  apt-get --yes install ${package} >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## apt-get install ${package}  ##  finished after $((after - $before)) seconds" >&3 2>&3
	done

	# The display's Chromium up to date with every update (the box itself is rarely updated otherwise): the 4.2.4 image
	# brought 122 (early 2024) and nothing updated it since - on it a list of covers could not be swiped any more once it
	# was drawn anew, and its security updates were missing. Nothing is loaded when it is current. Only the browser's
	# package (chromium-browser of Raspberry Pi OS on Debian 12, chromium on 13) and Widevine with it when it is there
	# (Spotify plays through it). Its files in /etc/chromium.d as they are (keep the changed ones, no question - there is
	# no terminal here). Failed twice (the second time with fresh package lists): the update goes on, the display with
	# the Chromium it had.
	CHROMIUM_PKG=""
	for p in chromium-browser chromium; do
		if dpkg-query -W -f='${Status}' "${p}" 2>/dev/null | grep -q "install ok installed"; then
			CHROMIUM_PKG=${p}
			break
		fi
	done
	if [ -n "${CHROMIUM_PKG}" ]; then
		CHROMIUM_BEFORE=$(dpkg-query -W -f='${Version}' "${CHROMIUM_PKG}" 2>/dev/null)
		echo -e "XXX\n${STEP}\nUpdate Chromium\nXXX"
		before=$(date +%s)
		CHROMIUM_UPGRADE="${CHROMIUM_PKG}"
		dpkg-query -W -f='${Status}' libwidevinecdm0 2>/dev/null | grep -q "install ok installed" && CHROMIUM_UPGRADE="${CHROMIUM_UPGRADE} libwidevinecdm0"
		chromium_upgrade() {
			DEBIAN_FRONTEND=noninteractive apt-get --yes -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
				--only-upgrade install ${CHROMIUM_UPGRADE} >&3 2>&3
		}
		# (the lists fetched again first when that failed at the start: with old lists the upgrade "succeeds" on the old
		# version; a failed upgrade is tried once more with fresh ones)
		[ -n "${APT_LISTS_FRESH}" ] || { apt_lists_update && APT_LISTS_FRESH=1; }
		if ! chromium_upgrade; then
			apt-get update >&3 2>&3
			chromium_upgrade || echo "Chromium could not be updated (${CHROMIUM_PKG} ${CHROMIUM_BEFORE}) - the display goes on with it" >&3
		fi
		after=$(date +%s)
		echo -e "## Chromium ${CHROMIUM_BEFORE} -> $(dpkg-query -W -f='${Version}' "${CHROMIUM_PKG}" 2>/dev/null) ##  finished after $((after - before)) seconds" >&3 2>&3
	fi

	# What a part of the box needs (the list of scripts/mupibox/install_missing.sh - mpv plays everything but Spotify,
	# mplayer is gone; rsvg-convert and Pillow put the start pictures together; xdotool and feh the goodbye picture):
	# asked once more with fresh package lists when the loop above could not install it
	MISSING_NOW=""
	for p in mpv librsvg2-bin python3-pil xdotool feh x11-utils; do
		dpkg-query -W -f='${Status}' "${p}" 2>/dev/null | grep -q "install ok installed" || MISSING_NOW="${MISSING_NOW} ${p}"
	done
	if [ -n "${MISSING_NOW}" ]; then
		dpkg --configure -a >&3 2>&3
		apt-get update >&3 2>&3
		apt-get --yes -f install >&3 2>&3
		apt-get --yes install ${MISSING_NOW} >&3 2>&3 || echo "## WARNING: not installed:${MISSING_NOW} (the app offers to install it) ##" >&3 2>&3
	fi

	# pinctrl for the OnOff SHIM with libgpiod 2 (Debian 13 "Trixie", see scripts/OnOffShim): in raspi-utils-core of the
	# Raspberry Pi archive (the name raspberrypi-utils written here before is only the source package - nothing was
	# installed, poweroff.sh fell back to a gpioset in the background). Not with libgpiod 1 (Bookworm): it keeps the
	# tools of gpiod, and raspi-utils-core would replace its libraspberrypi-bin there.
	if gpioset --version 2>/dev/null | grep -q ' v2\.' && ! command -v pinctrl >/dev/null && apt-cache show raspi-utils-core >/dev/null 2>&1; then
		apt-get --yes install raspi-utils-core >&3 2>&3
	fi
	# avahi for the Home Assistant API (scripts/mupibox/ha_mdns.sh): installed, but running only while the API is switched
	# on in the app - its install starts it, so it is switched off again here unless the API is on
	if ! dpkg -l avahi-daemon 2>/dev/null | grep -q '^ii'; then
		apt-get --yes install --no-install-recommends avahi-daemon >&3 2>&3
	fi
	if [ "$(/usr/bin/jq -r '.homeAssistant.enabled // false' ${CONFIG} 2>/dev/null)" != "true" ]; then
		systemctl disable --now avahi-daemon.socket avahi-daemon >&3 2>&3
	fi

	for package in ${packages2remove}
	do
		before=$(date +%s)
		STEP=$(($STEP + 1))
		echo -e "XXX\n${STEP}\nRemove ${package}\nXXX"
		PKG_OK=$(dpkg -l ${package} 2>/dev/null | egrep '^ii' | wc -l) >&3 2>&3
		# (only an installed one: this was "-eq 0" - it tried to remove what was not there, and removed nothing)
		if [ ${PKG_OK} -gt 0 ]; then
		  apt-get --yes remove ${package} >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## apt-get remove ${package}  ##  finished after $((after - $before)) seconds" >&3 2>&3
	done

	STEP=$(($STEP + 1))
	if [ $OS == "bullseye" ]; then
		# (requests and pyserial come from the package list: python3-requests, python3-serial; mutagen is not used)
		STEP=$(($STEP + 1))
	else
		echo -e "XXX\n${STEP}\nInstall package python3-dev\nXXX"
		# (python3-dev: pip may have to build a part of telepot; python3-mutagen is not used by anything)
		packages2install="python3-dev"
		for package in ${packages2install}
		do		
			before=$(date +%s)
			echo -e "XXX\n${STEP}\nInstall ${package}\nXXX"
			PKG_OK=$(dpkg -l ${package} 2>/dev/null | egrep '^ii' | wc -l) >&3 2>&3
			if [ ${PKG_OK} -eq 0 ]; then
			  apt-get --yes install ${package} >&3 2>&3
			fi
			after=$(date +%s)
			STEP=$(($STEP + 1))
			echo -e "## apt-get install ${package}  ##  finished after $((after - $before)) seconds" >&3 2>&3
		done
		echo -e "XXX\n${STEP}\nInstall package pip telepot\nXXX"
		before=$(date +%s)
		installed=$(pip list | grep telepot)
		if [ ${#installed} = 0 ]; then
			pip install telepot --break-system-packages >&3 2>&3
		fi
		after=$(date +%s)
		echo -e "## pip install telepot  ##  finished after $((after - $before)) seconds" >&3 2>&3
		STEP=$(($STEP + 1))
	fi

	###############################################################################################

#	echo -e "XXX\n${STEP}\nSetup docker and container... \nXXX"	
#	before=$(date +%s)
#	if [ ! -f /usr/bin/docker ]; then
#		sudo bash < <(curl -fsSL https://get.Docker.com) >&3 2>&3
#	fi
#	sudo docker rm youtube-dl >&3 2>&3
#	sudo docker run --name youtube-dl -d --restart unless-stopped -p 8081:8081 -v /home/dietpi/MuPiBox/media/youtube-dl:/downloads ghcr.io/alexta69/metube >&3 2>&3
#	sudo docker image prune -a -f  >&3 2>&3
#	sudo apt-get --yes remove docker   >&3 2>&3
#	after=$(date +%s)
#	echo -e "## Setup docker and container  ##  finished after $((after - $before)) seconds" >&3 2>&3
#	STEP=$(($STEP + 1))
	
	###############################################################################################

	echo -e "XXX\n${STEP}\nSetup DietPi-Dashboard... \nXXX"	
	before=$(date +%s)
	mkdir -p /opt/dietpi-dashboard >&3 2>&3
	# Download to a temporary file first and replace the installed program only if that worked
	# (before, a failed download - e.g. a DNS problem - left the dashboard without its program).
	# A fixed version, program and config.toml of the same release (as autosetup.sh): from v0.7.0 on the dashboard is two
	# programs (backend, frontend) with another config - "latest" would pair a new program with the old config.
	DD_VERSION="v0.6.2"
	DD_TMP=$(mktemp /tmp/dietpi-dashboard.XXXXXX)
	DD_URL="https://github.com/nonnorm/DietPi-Dashboard/releases/download/${DD_VERSION}/dietpi-dashboard-$(uname -m)"
	if curl -fL --retry 3 --retry-delay 3 -m 180 -o "${DD_TMP}" "${DD_URL}" >&3 2>&3 && [ "$(head -c 4 "${DD_TMP}" | od -An -c | tr -d ' ')" = "177ELF" ]; then
		install -m 755 "${DD_TMP}" /opt/dietpi-dashboard/dietpi-dashboard >&3 2>&3
	else
		echo "DietPi-Dashboard download failed - keeping the installed version" >&3 2>&3
	fi
	rm -f "${DD_TMP}"
	# (its config.toml is written by dietpi_dashboard.sh further down - the release's default had no password, see there)
	after=$(date +%s)
	echo -e "## Setup DietPi-Dashboard  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nDownload MuPiBox Version ${VERSION_LONG}... \nXXX"
	before=$(date +%s)
	# The source archive is large and a dropped connection leaves a truncated file, which
	# used to be unpacked anyway (nothing) while the update went on emptying the install.
	# Check the archive, retry, and stop BEFORE anything gets replaced if it stays broken.
	DOWNLOAD_OK=0
	for attempt in 1 2 3 4 5
	do
		rm -f /home/dietpi/mupibox.zip
		wget -q -O /home/dietpi/mupibox.zip ${MUPIBOX_URL} >&3 2>&3
		if unzip -tq /home/dietpi/mupibox.zip >&3 2>&3; then
			DOWNLOAD_OK=1
			break
		fi
		echo "Download attempt ${attempt} failed or is incomplete, retrying..." >&3 2>&3
		sleep 5
	done
	if [ ${DOWNLOAD_OK} -ne 1 ]; then
		echo "Error: could not download a complete MuPiBox archive - the update was stopped before anything was replaced." >&3 2>&3
		cp ${PREFLIGHT_DIR}/jq /usr/bin/jq >&3 2>&3
		chmod 755 /usr/bin/jq >&3 2>&3
		rm -f /home/dietpi/mupibox.zip
		systemctl start mupi_idle_shutdown.service >&3 2>&3
		display_back
		touch /tmp/mupibox-update-failed
		exit 1
	fi
	after=$(date +%s)
	echo -e "## MuPiBox Download  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nUnzip MuPiBox Version ${VERSION_LONG}... \nXXX"
	before=$(date +%s)
	# The folder the archive unpacks to depends on where it comes from (a branch archive is
	# "MuPiBox-<branch>", a tag archive "MuPiBox-<tag>", ...). Read it from the archive instead of
	# guessing it: a wrong guess sent every following step (scripts, services, admin interface,
	# after /var/www had been emptied) to a folder that does not exist.
	UNPACKED_DIR=$(unzip -Z1 /home/dietpi/mupibox.zip 2>/dev/null | head -n 1 | cut -d/ -f1)
	unzip -q -o -d /home/dietpi /home/dietpi/mupibox.zip >&3 2>&3
	rm /home/dietpi/mupibox.zip >&3 2>&3
	if [ -n "${UNPACKED_DIR}" ]; then
		MUPI_SRC="/home/dietpi/${UNPACKED_DIR}"
	fi
	# H5: verify the source dir + the inner deploy.zip exist before we
	# wipe the live install. If either is missing the user gets a
	# clean abort instead of a half-installed box.
	[ -d "${MUPI_SRC}" ] || fail_update "Expected source directory ${MUPI_SRC} not found after unzip"
	[ -s "${MUPI_SRC}/bin/nodejs/deploy.zip" ] || fail_update "Backend deploy.zip missing or empty in update package"
	# a box without the maintenance screen (4.x, it has at most the old picture, the 4.0.4 image not even that): the new one
	# from the package, as soon as it is there; the old picture only from a package without it (stable 4.2.4)
	if [ ! -x /usr/local/bin/mupibox/maintenance_screen.sh ]; then
		if [ -s "${MUPI_SRC}/media/bootscreens/prerendered/en/maintenance-karte-update.png" ]; then
			pkill -x fbv >&3 2>&3
			/usr/bin/fbv "${MUPI_SRC}/media/bootscreens/prerendered/en/maintenance-karte-update.png" </dev/tty1 >/dev/tty1 2>&3 &
		elif [ ! -s /home/dietpi/MuPiBox/sysmedia/images/installation.jpg ] && [ -s "${MUPI_SRC}/media/images/installation.jpg" ]; then
			/usr/bin/fbv "${MUPI_SRC}/media/images/installation.jpg" </dev/tty1 >/dev/tty1 2>&3 &
		fi
	fi
	# a version with the app (its source in the package) must have it in deploy.zip too - else the box is left without it
	if [ -d "${MUPI_SRC}/src/backend-api/src/mupi-app" ]; then
		unzip -l "${MUPI_SRC}/bin/nodejs/deploy.zip" 2>/dev/null | grep -q " mupi-app/index.html$" || fail_update "The app (mupi-app) is missing in deploy.zip of the update package"
	fi

	# Everything the update copies must be there before anything is replaced. If not, stop here:
	# a half update (admin interface removed, scripts missing) is worse than no update.
	SOURCE_OK=1
	for required in scripts/mupibox config/services config/templates update/conf_update.sh themes/previews bin/nodejs/deploy.zip
	do
		if [ ! -e "${MUPI_SRC}/${required}" ]; then
			echo "Error: ${MUPI_SRC}/${required} is missing in the downloaded MuPiBox archive." >&3 2>&3
			SOURCE_OK=0
		fi
	done
	if [ ${SOURCE_OK} -ne 1 ]; then
		echo "Error: the downloaded MuPiBox archive is incomplete or has an unexpected layout - the update was stopped before anything was replaced." >&3 2>&3
		cp ${PREFLIGHT_DIR}/jq /usr/bin/jq >&3 2>&3
		chmod 755 /usr/bin/jq >&3 2>&3
		[ -n "${UNPACKED_DIR}" ] && rm -rf "/home/dietpi/${UNPACKED_DIR}"
		systemctl start mupi_idle_shutdown.service >&3 2>&3
		display_back
		touch /tmp/mupibox-update-failed
		exit 1
	fi
	after=$(date +%s)
	echo -e "## Unzip Mupibox Download  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nFolders of 5.1... \nXXX" >&3 2>&3
	before=$(date +%s)
	# The box's programs stop first: nothing writes the library while the folders change or the program is exchanged
	sudo -H -u dietpi bash -c "pm2 stop server; pm2 stop spotify-control" >&3 2>&3
	# An update that stopped before (a power cut while it ran): undone or finished first (restore_interrupted_update.sh;
	# it runs at every start of the box too)
	if [ -f "${MUPI_SRC}/scripts/mupibox/restore_interrupted_update.sh" ]; then
		bash "${MUPI_SRC}/scripts/mupibox/restore_interrupted_update.sh" --no-restart >&3 2>&3 			|| fail_update "An update that stopped before could not be undone (see the log) - nothing was changed, the backups are kept; restart the box: it goes on with it at the start" nostart
	fi
	# ... and in place, with what it needs, before the installation is touched: should this update stop halfway, the next
	# start undoes or finishes it (mupi_update_recover.service runs it before pm2) - also on the first update that brings it
	if [ -f "${MUPI_SRC}/scripts/mupibox/restore_interrupted_update.sh" ] && [ -f "${MUPI_SRC}/config/services/mupi_update_recover.service" ]; then
		mkdir -p /usr/local/bin/mupibox >&3 2>&3
		for script in restore_interrupted_update.sh migrate_layout.sh mupi_paths.sh; do
			tr -d '\r' < "${MUPI_SRC}/scripts/mupibox/${script}" > "/usr/local/bin/mupibox/${script}" && chmod 755 "/usr/local/bin/mupibox/${script}"
		done
		cp -f "${MUPI_SRC}/config/services/mupi_update_recover.service" /etc/systemd/system/mupi_update_recover.service >&3 2>&3
		systemctl daemon-reload >&3 2>&3
		systemctl enable mupi_update_recover.service >&3 2>&3
	fi
	# The folders of 5.1 (server/, player/, data/, cache/ - see scripts/mupibox/migrate_layout.sh): a box before them has
	# its program, its data and its cache moved there - the program still the one of before, which goes on running in
	# them (it finds all of it under the names of before: links). The data is no longer copied away and put back: the
	# update replaces the program only. A move that fails takes the whole run back - nothing is changed then.
	[ -s /usr/local/bin/mupibox/migrate_layout.sh ] && [ -s /usr/local/bin/mupibox/mupi_paths.sh ] \
		|| fail_update "The scripts for the folders of 5.1 are missing in the update package - nothing was changed"
	NO_PM2=1 bash /usr/local/bin/mupibox/migrate_layout.sh >&3 2>&3 \
		|| fail_update "The folders of 5.1 could not be made (see the log) - nothing was changed"
	. /usr/local/bin/mupibox/mupi_paths.sh
	after=$(date +%s)
	echo -e "## Folders of 5.1  ##  finished after $((after - $before)) seconds" >&3 2>&3

	STEP=$(($STEP + 1))

	###############################################################################################


	echo -e "XXX\n${STEP}\nUpdate frontend, backend-api, and backend-player ... \nXXX"
	before=$(date +%s)
	# Exchanged with a way back: the old program moved aside (server.upd-bak), the new one unpacked into server/; if that
	# fails, the old one comes back and the box goes on as before. The data stays where it is (data/, cache/).
	BAK_DIR="${MUPI_SERVER}.upd-bak"
	# (the old program of an update that could not go back stays, under its own name)
	[ -e "${BAK_DIR}" ] && mv "${BAK_DIR}" "${BAK_DIR}.$(date +%Y%m%d-%H%M%S)" >&3 2>&3
	# (from here on until the very last step a power cut brings the old installation back at the next start)
	mark_update unpacking || fail_update "The update's state could not be written (card full?) - nothing was changed"
	if [ -d "${MUPI_SERVER}" ]; then
		mv "${MUPI_SERVER}" "${BAK_DIR}" >&3 2>&3 || \
			{ clear_update_mark; fail_update "Could not move old install aside (filesystem full?)"; }
	fi
	mkdir -p "${MUPI_SERVER_CONFIG}" >&3 2>&3
	if ! unzip ${MUPI_SRC}/bin/nodejs/deploy.zip -d "${MUPI_SERVER}/" >&3 2>&3 \
		|| [ ! -s "${MUPI_SERVER}/server.js" ] \
		|| [ ! -s "${MUPI_WWW}/index.html" ]; then
		# Rollback: remove the partially-extracted dir and restore the backup.
		rm -rf "${MUPI_SERVER}" >&3 2>&3
		[ -d "${BAK_DIR}" ] && mv "${BAK_DIR}" "${MUPI_SERVER}" >&3 2>&3
		clear_update_mark
		fail_update "deploy.zip extraction failed — rolled back to previous install"
	fi
	sync
	# (the old program goes at the very end of the update, see "Finish the update")
	mv ${MUPI_SRC}/config/templates/monitor.json "${MUPI_SERVER_CONFIG}/monitor.json" >&3 2>&3
	mv ${MUPI_SRC}/config/templates/www.json "${MUPI_SERVER_CONFIG}/config.json" >&3 2>&3
	# the theme the display shows, until setting_update.sh sets it again below
	[ -L "${BAK_DIR}/www/active_theme.css" ] && cp -a "${BAK_DIR}/www/active_theme.css" "${MUPI_WWW}/active_theme.css" >&3 2>&3
	chown dietpi:dietpi -R "${MUPI_WWW}" >&3 2>&3
	cp "${MUPI_SERVER}/spotify-control.js" "${MUPI_PLAYER}/spotify-control.js" >&3 2>&3
	# The links in the new program's folder (server/config/network.json to /tmp, the names of before): without them the
	# update is not complete - it goes back to the old program at its end
	if NO_PM2=1 bash /usr/local/bin/mupibox/migrate_layout.sh >&3 2>&3; then
		INSTALL_DONE=1
	else
		echo "## The links of the folders of 5.1 could not be made - the update goes back to the previous version at its end" >&3 2>&3
	fi
	after=$(date +%s)
	echo -e "## Update Kids-Controller  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy MuPiBox-Files... \nXXX"	
	# MuPiBox
	before=$(date +%s)
	
	# km themes (children's themes of one design): pictures per theme, shared fonts, and the list with their names
	# (the admin interface shows those). New ones: add the id here, in conf_update.sh and in autosetup.sh.
	KM_THEMES="kuschelmond moosnest sonnenhof pferdehof fussball fahrzeuge buecherregal kassettenrekorder unterwasser bastelpapier prinzessin einhorn feenschloss weltraum dinoland piratenbucht tagundnacht feuerwehr ritterburg eisenbahn roboter heldenstadt safari eiswelt zirkus meerjungfrau ballett kaetzchen zuckerland schmetterlinge"
	
	# the old themes in the km layout (legacy in km-themes.json): their pictures, fonts, mascots and cover placeholders;
	# coverflow stays as it is
	KM_LEGACY_THEMES="axolotl blue captainamerica chocolate cinema winamp clone-wars comic custom danger dark darkred deepblue dinosaur earth enterprise fantasybutterflies forms green ironman light lines matrix mint mystic orange pikachu pink purple red spiderman steampunk supermario unicorn vintage wall-e wood xmas"
	
	for theme in ${KM_THEMES} ${KM_LEGACY_THEMES} _fonts; do
		mkdir -p ${MUPI_WWW}/theme-data/${theme} >&3 2>&3
		cp -f ${MUPI_SRC}/themes/${theme}/* ${MUPI_WWW}/theme-data/${theme}/ >&3 2>&3
	done
	#CUSTOM
	ln -s /home/dietpi/MuPiBox/themes/custom-bg.jpg ${MUPI_WWW}/theme-data/custom/custom-bg.jpg
	# what the user put into theme-data (pictures and fonts of an own theme) comes over from the old program (-n: nothing
	# the update ships is replaced) - should that fail, the old one is kept in data/kept-<time>/ (see "Finish the update")
	THEME_DATA_KEPT=1
	if [ -d "${BAK_DIR}/www/theme-data" ] && [ ! -L "${BAK_DIR}/www/theme-data" ]; then
		cp -an "${BAK_DIR}/www/theme-data/." "${MUPI_WWW}/theme-data/" >&3 2>&3 || THEME_DATA_KEPT=0
	fi

	# the name fonts these themes had before (their licenses do not allow passing them on as part of MuPiBox)
	rm -f ${MUPI_WWW}/theme-data/supermario/NewSuperMarioFontU.ttf ${MUPI_WWW}/theme-data/steampunk/akaPosse.ttf >&3 2>&3
	
	# (after the copies above: the theme pictures are dietpi's too)
	chown dietpi:dietpi -R "${MUPI_SERVER}/" >&3 2>&3
	cp -f ${MUPI_SRC}/themes/km-themes.json /home/dietpi/MuPiBox/themes/km-themes.json >&3 2>&3
	mv ${MUPI_SRC}/themes/*.css /home/dietpi/MuPiBox/themes/ >&3 2>&3
	# the pictures of the theme tiles in the app (tools/theme-preview; until 5.1 in the admin interface's /var/www/images)
	mkdir -p /home/dietpi/MuPiBox/themes/previews >&3 2>&3
	cp -f ${MUPI_SRC}/themes/previews/*.png /home/dietpi/MuPiBox/themes/previews/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/chromium-autostart.sh /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	# full colours in the display on a Pi with 2 GB or more: takes DietPi's "low-end device mode" out again (see the file)
	# (not in stable 4.x)
	if [ -f ${MUPI_SRC}/config/chromium/zz-mupibox ]; then
		mkdir -p /etc/chromium.d && tr -d '\r' < ${MUPI_SRC}/config/chromium/zz-mupibox > /etc/chromium.d/zz-mupibox && chmod 644 /etc/chromium.d/zz-mupibox
	fi
	# PulseAudio keeps no volume of a program's stream for its next one (see the file; issue #191) - from the next start
	# of PulseAudio (the restart after the update). system.pa reads system.pa.d (PulseAudio 15 and later).
	if [ -f ${MUPI_SRC}/config/pulse/mupibox-stream-volume.pa ] && [ -f /etc/pulse/system.pa ]; then
		if grep -q 'system.pa.d' /etc/pulse/system.pa; then
			mkdir -p /etc/pulse/system.pa.d && tr -d '\r' < ${MUPI_SRC}/config/pulse/mupibox-stream-volume.pa > /etc/pulse/system.pa.d/mupibox-stream-volume.pa \
				&& chmod 644 /etc/pulse/system.pa.d/mupibox-stream-volume.pa
		else
			echo "## PulseAudio does not read system.pa.d - the volume of a program's stream is still kept" >&3 2>&3
		fi
	fi
	# restart.sh held (the placeholder of hold_restart in place - a handover, or a click in the admin interface of 4.x
	# while this update ran, from the terminal too): the new restart.sh goes behind it, the placeholder stays. Moved in
	# over it, the restart.sh of a version without the update's lock (4.x) restarted the box at that click's restart,
	# in the middle of this update. (The placeholder goes to it once no update runs.)
	# (under the lock the admin interface's call holds while it puts the placeholder in: one coming in at the same
	# moment puts it in before the look below or after the scripts are in - not in between, where the new one went over
	# it unheld; not got in 120 s - a call holding it that long: done all the same)
	exec 7> /run/lock/mupibox-update-admin.lock
	flock -w 120 7 || echo "## WARNING: the admin interface's lock was not free - scripts put in without it" >&3 2>&3
	HOLD_KEPT=/var/lib/mupibox-update-admin/restart.sh.held
	WAS_HELD=0
	if grep -q "${HOLD_MARK}" /usr/local/bin/mupibox/restart.sh 2>/dev/null && grep -qF "${HOLD_KEPT}" /usr/local/bin/mupibox/restart.sh; then
		WAS_HELD=1
		if [ -f ${MUPI_SRC}/scripts/mupibox/restart.sh ]; then
			if put_atomic ${MUPI_SRC}/scripts/mupibox/restart.sh ${HOLD_KEPT}; then
				rm -f ${MUPI_SRC}/scripts/mupibox/restart.sh
			else
				# (not over the placeholder that works: the box restarts with the restart.sh of before - the one behind it -
				# until the next update)
				rm -f ${HOLD_KEPT}.mupibox-new
				mv -f ${MUPI_SRC}/scripts/mupibox/restart.sh ${MUPI_SRC}/restart.sh.not-put-in >&3 2>&3
				echo "## WARNING: the new restart.sh could not be put behind its hold (no space left?) - the one before stays" >&3 2>&3
			fi
		fi
	fi
	mv ${MUPI_SRC}/scripts/mupibox/* /usr/local/bin/mupibox/ >&3 2>&3
	# (handed over by the admin interface of 4.x, or held before: the new restart.sh is held too, when it was moved in
	# above all the same - see hold_restart at the top)
	if { [ -n "${MUPIBOX_UPDATE_HANDED_OVER:-}" ] || [ "${WAS_HELD}" = "1" ]; } && ! grep -q "${HOLD_MARK}" /usr/local/bin/mupibox/restart.sh 2>/dev/null; then
		# (not held: logged - stopping here would harm more; restart.sh of 5.0.13 and later checks for the unit itself)
		hold_restart /var/lib/mupibox-update-admin/restart.sh.held \
			|| echo "## WARNING: restart.sh could not be held again - a restart click now cuts the update off" >&3 2>&3
	fi
	exec 7>&-
	mv ${MUPI_SRC}/scripts/bluetooth/* /usr/local/bin/mupibox/ >&3 2>&3
	# The battery of Bluetooth headphones (display and app, issue #176): BlueZ 5.66 takes it from PulseAudio only with
	# its experimental interfaces (BatteryProviderManager1). Applies after the restart.
	if [ -f /etc/bluetooth/main.conf ] && ! grep -qE '^[[:space:]]*Experimental[[:space:]]*=[[:space:]]*true' /etc/bluetooth/main.conf; then
	  sed -i -E 's/^#?[[:space:]]*Experimental[[:space:]]*=.*/Experimental = true/' /etc/bluetooth/main.conf >&3 2>&3
	  grep -qE '^Experimental = true' /etc/bluetooth/main.conf || sed -i '/^\[General\]/a Experimental = true' /etc/bluetooth/main.conf >&3 2>&3
	fi
	mv ${MUPI_SRC}/scripts/wled/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/telegram/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/config/templates/.bashrc /home/dietpi/.bashrc >&3 2>&3
	# cp -rf instead of mv: mv cannot replace the existing, non-empty templates folder ("Directory not empty"),
	# so the MuPiHAT templates were never updated
	cp -rf ${MUPI_SRC}/scripts/mupihat/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/fan/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/wifi/* /usr/local/bin/mupibox/ >&3 2>&3
	mv ${MUPI_SRC}/scripts/mqtt/* /usr/local/bin/mupibox/ >&3 2>&3
	# (the app's backup restore runs it from here, as the admin interface does)
	cp ${MUPI_SRC}/update/conf_update.sh /usr/local/bin/mupibox/conf_update.sh >&3 2>&3

	chown dietpi:dietpi /home/dietpi/.bashrc >&3 2>&3
	chmod 755 /usr/local/bin/mupibox/* >&3 2>&3
	chmod 755 /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh >&3 2>&3
	# the WiFi guard in front of Debian's wpa_action (a late "disconnected" took a working WiFi down at the start)
	/usr/local/bin/mupibox/mupi_wpa_guard.sh install >&3 2>&3 || echo "## WiFi guard not installed - Debian's wpa_action stays as it was ##" >&3 2>&3
	after=$(date +%s)
	echo -e "## Copy MuPiBox-Files  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy binaries... \nXXX"	
	before=$(date +%s)
	# Debian's own jq off the box (the update puts jq 1.8.1 into /usr/bin a few lines below; with Debian's package
	# left, an "apt upgrade" put its older one back over it) - with dpkg, which refuses when another package depends on
	# it (apt-get --yes would remove that one too); the file goes in any case
	if dpkg -s jq >/dev/null 2>&1; then
		dpkg -r jq >&3 2>&3 || echo "## Debian's jq stays installed (another package needs it) ##" >&3 2>&3
	fi
	rm -f /usr/bin/jq >&3 2>&3
	
	service spotifyd stop >&3 2>&3
	systemctl disable spotifyd >&3 2>&3
	# preload (a desktop daemon that preloads programs it saw started; no longer installed since 5.0.10): off where a
	# box has it - the box starts the same few programs, which stay in memory anyway, and it only took memory and wrote
	# its state to the SD card. The package stays, only switched off.
	if [ -e /etc/init.d/preload ] || systemctl cat preload.service >/dev/null 2>&1; then
		systemctl disable --now preload >&3 2>&3
	fi
	if systemctl cat librespot.service > /dev/null 2>&1; then
		systemctl disable --now librespot.service >&3 2>&3
	fi

	# Binaries
	cp ${PREFLIGHT_DIR}/jq /usr/bin/jq >&3 2>&3
	if [ `getconf LONG_BIT` == 32 ]; then
		mv ${MUPI_SRC}/bin/fbv/fbv /usr/bin/fbv >&3 2>&3
	else
		mv ${MUPI_SRC}/bin/fbv/fbv_64 /usr/bin/fbv >&3 2>&3
	fi
	chmod 755 /usr/bin/fbv /usr/bin/jq >&3 2>&3
	# librespot is gone: the display's player (Web Playback SDK) is the box's device in the Spotify app. Its service,
	# settings and program go, and its cache (its login and up to maxcachesize of audio) - only below ~/.cache.
	rm -f /etc/systemd/system/librespot.service /usr/bin/librespot >&3 2>&3
	rm -rf /etc/librespot >&3 2>&3
	SPOTIFY_CACHE=$(/usr/bin/jq -r '.spotify.cachepath // empty' ${CONFIG} 2>/dev/null)
	case "${SPOTIFY_CACHE}" in
	/home/dietpi/.cache/?*) rm -rf "${SPOTIFY_CACHE}" >&3 2>&3 ;;
	esac
	systemctl daemon-reload >&3 2>&3

	after=$(date +%s)
	echo -e "## Copy binaries  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))
	
	###############################################################################################

	echo -e "XXX\n${STEP}\nCopy some media files... \nXXX"
	# Splash and Media
	before=$(date +%s)
	# The initramfs splash of older installers and updates ("initramfs initramfs.img" with splash.txt beside it) showed
	# the old blue start picture at the kernel's start, before the chosen one (issue #177). The box starts without an
	# initramfs (DietPi, root drivers in the kernel); the start pictures come from fbv (splash_screen.sh). Switched off
	# - only exactly this line with splash.txt beside it; a system initramfs (auto_initramfs, initramfs8, an initrd with
	# followkernel) stays - and its image and settings file go once nothing loads them.
	BOOT_DIR="$(dirname "${BOOT_CONFIG}")"
	if [ -f "${BOOT_DIR}/splash.txt" ] && grep -qE '^[[:space:]]*initramfs[[:space:]]+initramfs\.img[[:space:]]*$' "${BOOT_CONFIG}"; then
		cp -p "${BOOT_CONFIG}" "${BOOT_CONFIG}.bak-splash" >&3 2>&3
		sed -i -E 's/^[[:space:]]*initramfs[[:space:]]+initramfs\.img[[:space:]]*$/#initramfs initramfs.img  # old start picture (initramfs-splash), switched off by the MuPiBox update/' "${BOOT_CONFIG}" >&3 2>&3
	fi
	if ! grep -qE '^[[:space:]]*initramfs[[:space:]]+initramfs\.img' "${BOOT_CONFIG}" 2>/dev/null; then
		rm -f "${BOOT_DIR}/initramfs.img" "${BOOT_DIR}/splash.txt" >&3 2>&3
	fi
	cp ${MUPI_SRC}/media/images/goodbye.png /home/dietpi/MuPiBox/sysmedia/images/goodbye.png >&3 2>&3
	#mv ${MUPI_SRC}/media/images/splash.png /boot/splash.png >&3 2>&3
	#cp ${MUPI_SRC}/media/images/MuPiLogo.jpg /home/dietpi/MuPiBox/sysmedia/images/MuPiLogo.jpg >&3 2>&3
	#cp ${MUPI_SRC}/media/sound/shutdown.wav /home/dietpi/MuPiBox/sysmedia/sound/shutdown.wav >&3 2>&3
	#cp ${MUPI_SRC}/media/sound/startup.wav /home/dietpi/MuPiBox/sysmedia/sound/startup.wav >&3 2>&3
	cp ${MUPI_SRC}/media/sound/button_shutdown.wav /home/dietpi/MuPiBox/sysmedia/sound/button_shutdown.wav >&3 2>&3
	cp ${MUPI_SRC}/media/sound/low.wav /home/dietpi/MuPiBox/sysmedia/sound/low.wav >&3 2>&3
	cp ${MUPI_SRC}/media/images/installation.jpg /home/dietpi/MuPiBox/sysmedia/images/installation.jpg >&3 2>&3
	cp ${MUPI_SRC}/media/images/battery_low.jpg /home/dietpi/MuPiBox/sysmedia/images/battery_low.jpg >&3 2>&3
	# boot and maintenance screens (scenes, texts, tool; the pictures are put together at the end of the update)
	rm -rf /home/dietpi/MuPiBox/sysmedia/bootscreens >&3 2>&3
	cp -r ${MUPI_SRC}/media/bootscreens /home/dietpi/MuPiBox/sysmedia/bootscreens >&3 2>&3
	# the maintenance screen once more, with the new scripts and pictures: a Touch Display 2 had none from 5.0.13's fbv_options.sh
	if [ -x /usr/local/bin/mupibox/maintenance_screen.sh ]; then
		pkill -x fbv >&3 2>&3
		/usr/local/bin/mupibox/maintenance_screen.sh update >&3 2>&3
	fi
	mkdir -p /usr/local/share/fonts/mupibox >&3 2>&3
	cp ${MUPI_SRC}/themes/_fonts/Fredoka-Variable.ttf /usr/local/share/fonts/mupibox/ >&3 2>&3
	fc-cache -f >&3 2>&3

	after=$(date +%s)
	echo -e "## Copy media files  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nInstall LED Control... \nXXX"	
	
	before=$(date +%s)
	# (led_control.py drives the LED; the C program of old is no longer built, and goes from a box that still has it)
	rm -f /usr/local/bin/mupibox/led_control >&3 2>&3
	after=$(date +%s)
	echo -e "## LED-Control  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nRestarting Services... \nXXX"
	before=$(date +%s)
	mv -f ${MUPI_SRC}/config/services/mupi_idle_shutdown.service /etc/systemd/system/mupi_idle_shutdown.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_splash.service /etc/systemd/system/mupi_splash.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/pulseaudio.service /etc/systemd/system/pulseaudio.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_startstop.service /etc/systemd/system/mupi_startstop.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_wifi.service /etc/systemd/system/mupi_wifi.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_check_internet.service /etc/systemd/system/mupi_check_internet.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_check_monitor.service /etc/systemd/system/mupi_check_monitor.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_autoconnect_bt.service /etc/systemd/system/mupi_autoconnect_bt.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_vnc.service /etc/systemd/system/mupi_vnc.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_novnc.service /etc/systemd/system/mupi_novnc.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_powerled.service /etc/systemd/system/mupi_powerled.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_telegram.service /etc/systemd/system/mupi_telegram.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/dietpi-dashboard.service /etc/systemd/system/dietpi-dashboard.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_hat.service /etc/systemd/system/mupi_hat.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_fan.service /etc/systemd/system/mupi_fan.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_tls.service /etc/systemd/system/mupi_tls.service >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_tls.timer /etc/systemd/system/mupi_tls.timer >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_hat_control.service /etc/systemd/system/mupi_hat_control.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_autoconnect-wifi.service /etc/systemd/system/mupi_autoconnect-wifi.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_mqtt.service /etc/systemd/system/mupi_mqtt.service  >&3 2>&3
	mv -f ${MUPI_SRC}/config/services/mupi_rotary.service /etc/systemd/system/mupi_rotary.service  >&3 2>&3
	# TIDAL (unofficial, see scripts/mupibox/tidal_service.py): on only when switched on in the app (below)
	if [ -f ${MUPI_SRC}/config/services/mupi_tidal.service ]; then
		mv -f ${MUPI_SRC}/config/services/mupi_tidal.service /etc/systemd/system/mupi_tidal.service >&3 2>&3
	fi
	# LAN without waiting at boot, and an address at once when a cable is plugged in (see scripts/mupibox/mupi_ethernet.sh)
	if [ -f ${MUPI_SRC}/config/services/mupi_ethernet.service ]; then
		mv -f ${MUPI_SRC}/config/services/mupi_ethernet.service /etc/systemd/system/mupi_ethernet.service >&3 2>&3
		mkdir -p "/etc/systemd/system/ifup@eth0.service.d" >&3 2>&3
		cp -f "${MUPI_SRC}/config/services/ifup@eth0.service.d/mupibox.conf" "/etc/systemd/system/ifup@eth0.service.d/mupibox.conf" >&3 2>&3
		MUPI_ETHERNET=1
	fi
	# the goodbye picture until the power is off (see config/services/mupi_goodbye.service)
	if [ -f ${MUPI_SRC}/config/services/mupi_goodbye.service ]; then
		mv -f ${MUPI_SRC}/config/services/mupi_goodbye.service /etc/systemd/system/mupi_goodbye.service >&3 2>&3
		MUPI_GOODBYE=1
	fi
	# No DietPi banner (logo, system data, "Running warm...") on the display's console while the box starts: DietPi shows
	# it at the autologin unless ~/.hushlogin exists - for dietpi, and for root, who logs in there on DietPi 10 / Debian 13
	touch /home/dietpi/.hushlogin /root/.hushlogin >&3 2>&3
	# The display's autologin without the 5 s Type=idle wait (see config/services/getty@tty1.service.d/mupibox.conf)
	if [ -f "${MUPI_SRC}/config/services/getty@tty1.service.d/mupibox.conf" ]; then
		mkdir -p "/etc/systemd/system/getty@tty1.service.d" >&3 2>&3
		cp -f "${MUPI_SRC}/config/services/getty@tty1.service.d/mupibox.conf" "/etc/systemd/system/getty@tty1.service.d/mupibox.conf" >&3 2>&3
	fi
	# Admin interface, Samba share and DietPi dashboard after the display shows the start page, one after the other: not
	# needed for the display, which they were competing with (was: 45 s after the start, see
	# scripts/mupibox/install_start_order.sh)
	if [ -f /usr/local/bin/mupibox/install_start_order.sh ]; then
		bash /usr/local/bin/mupibox/install_start_order.sh >&3 2>&3
	fi
	# initial_turbo for a faster start, and zram swap on a Pi with 1 GB - each only when nothing was chosen for it (see
	# scripts/mupibox/boot_tuning.sh)
	if [ -f /usr/local/bin/mupibox/boot_tuning.sh ]; then
		bash /usr/local/bin/mupibox/boot_tuning.sh >&3 2>&3
	fi
	# Samba, FTP and VNC on a box that does not have them yet (issue #178): installed and set up, but off - the app's
	# switches (app-api/services.ts) then only start and stop them, at once and without internet; a fresh installation
	# does the same. Only what is missing: a service that is there is left as it is (one that is on stays on), and an
	# own smb.conf, proftpd.conf or Samba password is never replaced. Debian's packages start their service when they are installed -
	# policy-rc.d keeps them from it meanwhile (else proftpd ran for a moment with Debian's own config, which lets the
	# box's user log in). Nothing of it stops the update: what fails is installed by the app's switch as before.
	POLICY_RC=/usr/sbin/policy-rc.d
	POLICY_RC_OURS=0
	if [ ! -e "${POLICY_RC}" ]; then
		printf '#!/bin/sh\n# written by the MuPiBox update while it installs packages: no service starts meanwhile\nexit 101\n' > "${POLICY_RC}" && chmod 755 "${POLICY_RC}" && POLICY_RC_OURS=1
	fi
	# (installed means installed: dpkg -s also answers for a package removed with only its config left - the state the
	# old admin interface's switches left behind with apt-get remove)
	pkg_installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'; }
	# The services the packages bring are masked before they are installed and switched off only after: a power cut in
	# between leaves them unable to start instead of switched on at the next start (the packages enable them). The list
	# on the card tells restore_interrupted_update.sh which ones to unmask and switch off then. Only units that are not
	# there yet - one that is there is left as it is.
	UPDATE_MASKED=/home/dietpi/.mupibox/update-masked
	# (1 when one could not be masked: its package is not installed now)
	mask_new() {
		local u rc=0
		for u in "$@"; do
			[ -e /usr/lib/systemd/system/${u}.service ] || [ -e /lib/systemd/system/${u}.service ] || [ -e /etc/systemd/system/${u}.service ] && continue
			{ echo "${u}" >> "${UPDATE_MASKED}" && sync "${UPDATE_MASKED}" && systemctl mask ${u}.service >&3 2>&3; } || rc=1
		done
		return ${rc}
	}
	# (unmasked first: systemctl ignores switching off a masked unit - the package's links would stay and start it later.
	# One that cannot be switched off is masked again and stays on the list: it cannot start, and the next start tries
	# again - 1 then)
	off_new() {
		local u rc=0
		for u in "$@"; do
			grep -qsx "${u}" "${UPDATE_MASKED}" || continue
			if systemctl unmask ${u}.service >&3 2>&3 \
				&& { ! systemctl cat ${u}.service >/dev/null 2>&1 || systemctl disable --now ${u}.service >&3 2>&3; }; then
				continue
			fi
			systemctl mask ${u}.service >&3 2>&3
			rc=1
		done
		return ${rc}
	}
	SHARES_OFF_OK=1
	# a list left by an update before (a service it could not switch off, and restore_interrupted_update.sh neither):
	# tried again here whatever the packages say - their install below is skipped then, and the list goes at the end
	# only when every service on it is off
	if [ -s "${UPDATE_MASKED}" ]; then
		off_new $(grep -E '^[a-z0-9_-]+$' "${UPDATE_MASKED}" | sort -u) || SHARES_OFF_OK=0
	fi
	# A config comes from the template only while it is none of the user's own: there was none before the install, or
	# it is still the package's (its original, or what ucf wrote and keeps the checksum of). An own smb.conf or
	# proftpd.conf - kept by the apt-get remove of the old switches - stays as it is.
	conf_untouched() {
		cmp -s "$1" "$2" && return 0
		local sum
		sum=$(md5sum < "$1" 2>/dev/null | cut -d' ' -f1)
		[ -n "${sum}" ] && grep -qs "^${sum}  $1\$" /var/lib/ucf/hashfile
	}
	WSD=$(apt-cache show wsdd2 >/dev/null 2>&1 && echo wsdd2 || echo wsdd)
	if ! pkg_installed samba; then
		SMB_CONF_HAD=0
		[ -e /etc/samba/smb.conf ] && SMB_CONF_HAD=1
		SMB_OK=1
		if mask_new smbd nmbd samba-ad-dc wsdd wsdd2; then
			DEBIAN_FRONTEND=noninteractive apt-get --yes install samba ${WSD} >&3 2>&3
			SMB_OK=$?
		fi
		off_new smbd nmbd samba-ad-dc wsdd wsdd2 || SHARES_OFF_OK=0
		if [ "${SMB_OK}" = 0 ]; then
			if [ -f ${MUPI_SRC}/config/templates/smb.conf ] && { [ "${SMB_CONF_HAD}" = 0 ] || conf_untouched /etc/samba/smb.conf /usr/share/samba/smb.conf; }; then
				cp -f ${MUPI_SRC}/config/templates/smb.conf /etc/samba/smb.conf >&3 2>&3
			fi
			# (the first password only for a Samba user that is not there yet: one kept from before keeps its own)
			pdbedit -u dietpi >/dev/null 2>&1 || (echo "mupibox"; echo "mupibox") | smbpasswd -s -a dietpi >&3 2>&3
		else
			echo "## Samba not installed now - the app's switch installs it ##" >&3 2>&3
		fi
	fi
	if ! pkg_installed proftpd-core && ! command -v proftpd >/dev/null 2>&1; then
		FTP_CONF_HAD=0
		[ -e /etc/proftpd/proftpd.conf ] && FTP_CONF_HAD=1
		FTP_OK=1
		if mask_new proftpd; then
			DEBIAN_FRONTEND=noninteractive apt-get --yes install proftpd-core >&3 2>&3
			FTP_OK=$?
		fi
		off_new proftpd || SHARES_OFF_OK=0
		if [ "${FTP_OK}" = 0 ]; then
			if [ -d /etc/proftpd ] && [ -f ${MUPI_SRC}/config/templates/proftpd.conf ] \
				&& { [ "${FTP_CONF_HAD}" = 0 ] || conf_untouched /etc/proftpd/proftpd.conf /usr/share/proftpd/templates/proftpd.conf; }; then
				cp -f ${MUPI_SRC}/config/templates/proftpd.conf /etc/proftpd/proftpd.conf >&3 2>&3
			fi
		else
			echo "## FTP not installed now - the app's switch installs it ##" >&3 2>&3
		fi
	fi
	if [ "${SHARES_OFF_OK}" = 1 ]; then
		rm -f "${UPDATE_MASKED}"
	else
		echo "## a Samba/FTP service could not be switched off - masked until the next start switches it off ##" >&3 2>&3
	fi
	if ! command -v x11vnc >/dev/null 2>&1 || ! command -v websockify >/dev/null 2>&1; then
		DEBIAN_FRONTEND=noninteractive apt-get --yes install x11vnc websockify >&3 2>&3 || echo "## VNC not installed now - the app's switch installs it ##" >&3 2>&3
	fi
	if [ ! -d /usr/share/novnc ]; then
		git clone --depth 1 https://github.com/novnc/noVNC.git /usr/share/novnc >&3 2>&3 && chown -R dietpi:dietpi /usr/share/novnc >&3 2>&3
	fi
	[ "${POLICY_RC_OURS}" = 1 ] && rm -f "${POLICY_RC}"
	# The Samba share is a standalone server (smbd); the Active Directory domain controller came with the package and
	# is not needed
	systemctl disable --now samba-ad-dc.service >&3 2>&3
	# The share's announcement for the Windows network (WS-Discovery, so the box shows up there): wsdd2 (Debian 12 and 13;
	# Debian 13 has no wsdd), a box with wsdd keeps it. Installed when neither is, running together with the share (only when Samba is on).
	WSD=$(apt-cache show wsdd2 >/dev/null 2>&1 && echo wsdd2 || echo wsdd)
	dpkg -s wsdd >/dev/null 2>&1 || dpkg -s wsdd2 >/dev/null 2>&1 || apt-get --yes install ${WSD} >&3 2>&3
	for u in wsdd wsdd2; do
		systemctl cat ${u}.service >/dev/null 2>&1 || continue
		if systemctl is-enabled --quiet smbd.service; then systemctl enable --now ${u}.service >&3 2>&3; else systemctl disable --now ${u}.service >&3 2>&3; fi
	done

	# Tolerant replacement for DietPi's WiFi monitor (see scripts/mupibox/wifi_monitor.sh): the original re-connected at
	# the first lost ping - also while the box roams between access points, 5-15 s without network each time. For
	# every version that ships it (it was only set up for dev versions).
	if [ -f ${MUPI_SRC}/config/services/dietpi-wifi-monitor-override.conf ] && [ -x /usr/local/bin/mupibox/wifi_monitor.sh ]; then
		mkdir -p /etc/systemd/system/dietpi-wifi-monitor.service.d >&3 2>&3
		cp -f ${MUPI_SRC}/config/services/dietpi-wifi-monitor-override.conf /etc/systemd/system/dietpi-wifi-monitor.service.d/override.conf >&3 2>&3
	fi
	# USB WiFi adapter preferred, onboard WiFi as fallback (see scripts/mupibox/mupi_wifi_select.sh): every version
	# that ships the script (the rules were only set up for dev versions - a release got the script, but no rule,
	# and the cable's switch between LAN and WiFi did nothing there)
	if [ -x /usr/local/bin/mupibox/mupi_wifi_select.sh ] && [ -f ${MUPI_SRC}/config/udev/99-mupibox-wifi.rules ]; then
		cp -f ${MUPI_SRC}/config/udev/99-mupibox-wifi.rules /etc/udev/rules.d/99-mupibox-wifi.rules >&3 2>&3
		udevadm control --reload >&3 2>&3
	fi
	# LAN takes over from WiFi again on carrier loss/return of the ethernet cable (same script)
	if [ -x /usr/local/bin/mupibox/mupi_wifi_select.sh ] && [ -f ${MUPI_SRC}/config/udev/99-mupibox-eth.rules ]; then
		cp -f ${MUPI_SRC}/config/udev/99-mupibox-eth.rules /etc/udev/rules.d/99-mupibox-eth.rules >&3 2>&3
		udevadm control --reload >&3 2>&3
	fi
	# the CD drive is an extension now (extensions/cd, installed from the app): its rule comes with it - the one the base used to
	# install is taken away
	if [ -f /etc/udev/rules.d/99-mupibox-cdrom.rules ]; then
		rm -f /etc/udev/rules.d/99-mupibox-cdrom.rules >&3 2>&3
		udevadm control --reload >&3 2>&3
	fi
	systemctl daemon-reload >&3 2>&3
	# remote display: a VNC that is running keeps its old settings (open to the network) until it starts again
	systemctl try-restart mupi_vnc.service mupi_novnc.service >&3 2>&3
	if systemctl list-unit-files dietpi-wifi-monitor.service 2>/dev/null | grep -q dietpi-wifi-monitor; then
		# (try-restart: one the parents switched off in the app stays off)
		systemctl try-restart dietpi-wifi-monitor.service >&3 2>&3
	fi
	systemctl enable mupi_check_internet.service >&3 2>&3
	systemctl start mupi_check_internet.service >&3 2>&3
	systemctl enable mupi_check_monitor.service >&3 2>&3
	systemctl start mupi_check_monitor.service >&3 2>&3
	systemctl enable mupi_powerled.service >&3 2>&3
	systemctl start mupi_powerled.service >&3 2>&3
	# The DietPi-Dashboard behind the app (dietpi_dashboard.sh): a password nobody knows, an inner port, reached through a
	# one-time ticket of the app only - without a password it was a terminal as dietpi (sudo) for everyone in the Wi-Fi.
	# On only when switched on in the app (mupibox.dietpiDashboard): every box that had it open is switched off once.
	if [ -x /opt/dietpi-dashboard/dietpi-dashboard ]; then
		/usr/local/bin/mupibox/dietpi_dashboard.sh setup >&3 2>&3
		if [ "$(/usr/bin/jq -r '.mupibox.dietpiDashboard // false' /etc/mupibox/mupiboxconfig.json 2>/dev/null)" = "true" ]; then
			/usr/local/bin/mupibox/dietpi_dashboard.sh on >&3 2>&3
		else
			/usr/local/bin/mupibox/dietpi_dashboard.sh off >&3 2>&3
		fi
	fi
	if [ "${MUPI_ETHERNET}" = "1" ]; then
		systemctl enable mupi_ethernet.service >&3 2>&3
		systemctl start mupi_ethernet.service >&3 2>&3
	fi
	if [ "${MUPI_GOODBYE}" = "1" ]; then
		systemctl enable --now mupi_goodbye.service >&3 2>&3
	fi
	# TIDAL switched on in the app: its Python brought to the version the box is tested with, and the service started
	# again with the new tidal_service.py (the sign-in stays). Without internet now: it keeps running as it was.
	if [ -x /usr/local/bin/mupibox/tidal_setup.sh ] && [ "$(/usr/bin/jq -r '.tidal.enabled // false' /etc/mupibox/mupiboxconfig.json 2>/dev/null)" = "true" ]; then
		/usr/local/bin/mupibox/tidal_setup.sh on >&3 2>&3 || echo "## WARNING: TIDAL could not be set up - the app's switch tries again ##" >&3 2>&3
	fi
	# The photo display switched on in the app: its programs (heif-convert; ffmpeg with videos on) - a reinstalled box
	# has them again. Without internet now: the app tries again (Einstellungen › Fotos).
	if [ -x /usr/local/bin/mupibox/photos_setup.sh ] && [ "$(/usr/bin/jq -r '.photos.enabled // false' /etc/mupibox/mupiboxconfig.json 2>/dev/null)" = "true" ]; then
		/usr/local/bin/mupibox/photos_setup.sh heif >&3 2>&3 || echo "## WARNING: heif-convert could not be installed - the app tries again ##" >&3 2>&3
		if [ "$(/usr/bin/jq -r '.photos.showVideos // false' /etc/mupibox/mupiboxconfig.json 2>/dev/null)" = "true" ]; then
			/usr/local/bin/mupibox/photos_setup.sh video >&3 2>&3 || echo "## WARNING: ffmpeg could not be installed - the app tries again ##" >&3 2>&3
		fi
	fi
	# The NAS over SMB: cifs-utils (a reinstalled box has it again). Without internet now: the server tries again when
	# it mounts the share.
	if [ -x /usr/local/bin/mupibox/nas_smb.sh ] && [ "$(/usr/bin/jq -r '.nas.protocol // ""' /etc/mupibox/mupiboxconfig.json 2>/dev/null)" = "smb" ]; then
		/usr/local/bin/mupibox/nas_smb.sh install >&3 2>&3 || echo "## WARNING: cifs-utils could not be installed - the box tries again ##" >&3 2>&3
	fi
	after=$(date +%s)
	echo -e "## Restarting services  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))
	
	###############################################################################################
	echo -e "XXX\n${STEP}\nUninstall Pi-Blaster... \nXXX"	
	before=$(date +%s)
	sudo -H -u dietpi bash -c 'cd /home/dietpi/pi-blaster; make uninstall' >&3 2>&3
	rm -R /home/dietpi/pi-blaster >&3 2>&3
	after=$(date +%s)
	echo -e "## Pi-Blaster  ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################


	echo -e "XXX\n${STEP}\nSet environment...  \nXXX"	
	before=$(date +%s)
	/usr/bin/chmod 755 ${MUPI_SRC}/config/templates/crontab.template >&3 2>&3
	/usr/bin/chown dietpi:dietpi ${MUPI_SRC}/config/templates/crontab.template >&3 2>&3
	sudo -H -u dietpi bash -c "/usr/bin/crontab ${MUPI_SRC}/config/templates/crontab.template"  >&3 2>&3

	if grep -q '^dtparam=gpio=on' "${BOOT_CONFIG}"; then
	  echo -e "dtparam=gpio=on already set" >&3 2>&3
	else
	  echo '' | tee -a "${BOOT_CONFIG}" >&3 2>&3
	  echo 'dtparam=gpio=on' | tee -a "${BOOT_CONFIG}" >&3 2>&3
	fi

	# gpio-poweroff only when it is in no dtoverlay line yet (also not in one that loads further overlays, e.g. a
	# display driver: a second line made such boxes hang at shutdown), on the pin set for the OnOff SHIM
	# Not next to a button of its own on gpio-shutdown (issue #175): with gpio-poweroff the Pi no longer woke from it,
	# and every update put the line back after it was taken out
	if grep -qE '^[[:space:]]*dtoverlay=.*gpio-shutdown' "${BOOT_CONFIG}"; then
	  echo -e "dtoverlay=gpio-shutdown set: no gpio-poweroff" >&3 2>&3
	elif grep -qE '^[[:space:]]*dtoverlay=.*gpio-poweroff' "${BOOT_CONFIG}"; then
	  echo -e "dtoverlay=gpio-poweroff already set" >&3 2>&3
	else
	  POWEROFF_PIN=$(/usr/bin/jq -r '.shim.poweroffPin // "4"' ${CONFIG} 2>/dev/null)
	  [[ "${POWEROFF_PIN}" =~ ^[0-9]+$ ]] || POWEROFF_PIN=4
	  echo '' | tee -a "${BOOT_CONFIG}" >&3 2>&3
	  echo "dtoverlay=gpio-poweroff,gpiopin=${POWEROFF_PIN},active_low=1" | tee -a "${BOOT_CONFIG}" >&3 2>&3
	fi

	# Power LED on the Pi's PWM hardware (see led_control.py; the software PWM took about 9 % of a CPU core all the
	# time): only for GPIO 12/13 and with the analog audio off (it uses the same PWM unit). Active from the next start.
	LED_PIN=$(/usr/bin/jq -r '.shim.ledPin // empty' ${CONFIG} 2>/dev/null)
	# (the analog audio shares the PWM unit only on a Pi 1, 2, 3 and Zero - on a Pi 4 or newer the LED gets it also with
	# the 3.5 mm output switched on, see onboard_audio.sh)
	PWM_FREE=0
	grep -q '^dtparam=audio=off' "${BOOT_CONFIG}" && PWM_FREE=1
	case "${RASPPI}" in *"Raspberry Pi 3"* | *"Raspberry Pi 2"* | *"Raspberry Pi Zero"* | *"Raspberry Pi Model"* | *"Compute Module 3"* | *"Compute Module Rev"*) ;; *) PWM_FREE=1 ;; esac
	if { [ "${LED_PIN}" = "12" ] || [ "${LED_PIN}" = "13" ]; } && [ "${PWM_FREE}" = "1" ] && ! grep -q '^dtoverlay=pwm' "${BOOT_CONFIG}"; then
	  echo "dtoverlay=pwm,pin=${LED_PIN},func=4" | tee -a "${BOOT_CONFIG}" >&3 2>&3
	fi

	usermod -aG dialout,cdrom dietpi >&3 2>&3
	after=$(date +%s)
	echo -e "## Set environment	##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))
	
	###############################################################################################

	echo -e "XXX\n${STEP}\nDownload OnOffShim-Scripts... \nXXX"	
	before=$(date +%s)
	# OnOffShim
	mv ${MUPI_SRC}/scripts/OnOffShim/off_trigger.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	mv ${MUPI_SRC}/scripts/OnOffShim/poweroff.sh /usr/lib/systemd/system-shutdown/poweroff.sh >&3 2>&3
	chmod 775 /usr/lib/systemd/system-shutdown/poweroff.sh /var/lib/dietpi/postboot.d/off_trigger.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## OnOff Shim	##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################


	###############################################################################################

	echo -e "XXX\n${STEP}\nUpdate Config-File... \nXXX"	
	before=$(date +%s)
	cd ${MUPI_SRC}/update/	>&3 2>&3
	chmod 755 conf_update.sh >&3 2>&3
	./conf_update.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## Config-File	##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))
	
	
	###############################################################################################

	echo -e "XXX\n${STEP}\nNetwork optimization... \nXXX"	
	before=$(date +%s)

	cd /usr/local/bin/mupibox/	>&3 2>&3
	./optimize_wifi.sh >&3 2>&3
	after=$(date +%s)
	echo -e "## Network optimization ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nActivate SSL... \nXXX"	
	before=$(date +%s)
	
	# The web server's certificate: the box's own, from its small authority for the home network (the app offers it to
	# install on the phones; an own one uploaded in the app stays) - no longer a new self-signed one on every run, which
	# no phone can trust and every browser asked about again. Checked at every start too (mupi_tls.service).
	if [ -x /usr/local/bin/mupibox/tls_cert.sh ]; then
		/usr/local/bin/mupibox/tls_cert.sh ensure >&3 2>&3
		systemctl enable mupi_tls.service >&3 2>&3
		systemctl daemon-reload >&3 2>&3
		systemctl enable --now mupi_tls.timer >&3 2>&3
	elif [ ! -s /etc/lighttpd/server.pem ]; then
		# a version without tls_cert.sh (stable 4.x, from a box that has no certificate yet: the 4.0.4 image): the simple
		# self-signed certificate as before - without one the web server does not start with SSL on
		openssl req -new -x509 -keyout /etc/lighttpd/server.pem -out /etc/lighttpd/server.pem -days 3650 -nodes -subj "/C=DE/CN=mupibox" >&3 2>&3
	fi
	# www-data must be able to pass /home/dietpi to reach the covers (/var/www/cover links below it): a home directory with
	# mode 0700, as newer Debian makes it, answers every /cover/... with 403 - the pictures of radio stations and NFC tags
	chmod o+x /home/dietpi >&3 2>&3
	# no scripts or pages from the media folder behind /cover (see the file)
	cp -f ${MUPI_SRC}/config/lighttpd/99-mupibox-media-noexec.conf /etc/lighttpd/conf-enabled/99-mupibox-media-noexec.conf >&3 2>&3
	# the app on port 80/443 too: / leads to the app at /app (see the file)
	cp -f ${MUPI_SRC}/config/lighttpd/90-mupibox-app.conf /etc/lighttpd/conf-enabled/90-mupibox-app.conf >&3 2>&3
	# no PHP since 5.1: made ready, switched on with the removal of the previous admin interface after "done" (below)
	cp -f ${MUPI_SRC}/config/lighttpd/92-mupibox-no-php.conf /etc/lighttpd/conf-available/92-mupibox-no-php.conf >&3 2>&3
	# only names of the home network: a foreign name pointed at the box gets 403 (DNS rebinding, lighttpd_hosts.sh)
	NO_RESTART=1 /usr/local/bin/mupibox/lighttpd_hosts.sh >&3 2>&3
	lighty-enable-mod proxy  >&3 2>&3
	lighty-enable-mod ssl  >&3 2>&3
	# restart, not reload: new modules and the new certificate (root only) are only taken over by a new start
	systemctl restart lighttpd >&3 2>&3
	after=$(date +%s)
	echo -e "## Network optimization ##  finished after $((after - $before)) seconds" >&3 2>&3
	STEP=$(($STEP + 1))

	###############################################################################################

	echo -e "XXX\n${STEP}\nFinalizing setup... \nXXX"
	chown dietpi:dietpi "${MUPI_SERVER_CONFIG}/config.json" >&3 2>&3
	#cp ${CONFIG} ${CONFIG}_backup  >&3 2>&3
	# The version, written as every other change of the config (conf_update.sh): into a file next to it, then exchanged.
	# Written in place, a jq that failed (the config broken for a moment, a full SD card) left it empty - every setting
	# gone, the Spotify login and the password with them.
	VTMP="${CONFIG}.version.$$"
	if /usr/bin/jq --arg v "${VERSION_LONG}" '.mupibox.version = $v' ${CONFIG} > "${VTMP}" 2>&3 && [ -s "${VTMP}" ]; then
		mv -f "${VTMP}" ${CONFIG}
	else
		rm -f "${VTMP}"
		echo "## WARNING: version not written, the config was left as it is ##" >&3 2>&3
	fi
	chown root:www-data ${CONFIG}
	chmod 775 ${CONFIG}
	#systemctl start mupi_idle_shutdown.service >&3 2>&3
	rm -f "${MUPI_SERVER_CONFIG}/network.json" >&3 2>&3
	ln -s /tmp/network.json "${MUPI_SERVER_CONFIG}/network.json" >&3 2>&3
	systemctl stop mupi_change_checker.service >&3 2>&3
	systemctl disable mupi_change_checker.service >&3 2>&3
	rm /etc/systemd/system/mupi_change_checker.service >&3 2>&3
	/usr/local/bin/mupibox/./m3u_generator.sh >&3 2>&3
	/usr/local/bin/mupibox/./setting_update.sh >&3 2>&3
	# boot and maintenance screens for the settings (box name, scene, language)
	/usr/local/bin/mupibox/bootscreen_update.sh >&3 2>&3

	# Finish the update - only now that everything is installed and set up (the configuration above too): the old program
	# goes, and what the folders of 5.1 left behind - a program folder an older version had put in place
	# (server.before-<time>, player.before-<time>, see migrate_layout.sh) and the parts of the old player nothing uses
	# any more (its own node_modules: the player is one file since 5.0). Only program folders: one with data of its own in
	# it (its library, covers or cache not a link to data/ and cache/) stays. Should anything of it fail, the old program
	# stays and the next start brings it back whole.
	program_only() {
		local d
		for d in "$1/server/config" "$1/www/cover" "$1/www/rss-covers" "$1/cache"; do
			[ -e "${d}" ] && [ ! -L "${d}" ] && return 1
		done
		return 0
	}
	if [ "${INSTALL_DONE:-0}" = 1 ]; then
		FINISH_OK=1
		# The old program stays whole until "done" is on the card: until then a power cut brings it back as it was
		# (restore_interrupted_update.sh). Its theme-data, when what the user added to it could not all be taken over
		# (above), is copied to data/kept-<time>/ before - after "done" the old program goes. (Cut off between the copy
		# and "done": the old program comes back with its theme-data, the copy is one too many.) The whole old program,
		# when it holds data of its own, is kept as server.kept-<time> after "done" (so does the start after a power cut).
		KEEP_STAMP=$(date +%Y%m%d-%H%M%S)
		THEME_KEPT_AT=""
		if [ "${THEME_DATA_KEPT:-1}" != 1 ] && [ -d "${BAK_DIR}/www/theme-data" ] && [ ! -L "${BAK_DIR}/www/theme-data" ]; then
			THEME_KEPT_AT="${MUPI_DATA}/kept-${KEEP_STAMP}/theme-data"
			if mkdir -p "${MUPI_DATA}/kept-${KEEP_STAMP}" && cp -a "${BAK_DIR}/www/theme-data" "${THEME_KEPT_AT}" >&3 2>&3; then
				chown -R dietpi:dietpi "${MUPI_DATA}/kept-${KEEP_STAMP}" >&3 2>&3
			else
				FINISH_OK=0
			fi
		fi
		sync
		# The update counts as done once "done" is on the card: what is left over then is only cleared up - a power cut
		# while the old installation is being deleted must not bring a half deleted one back. ("legacy-admin": the previous
		# admin interface goes after "done", below - cut off, the start does it; a "done" of an older update has no such
		# line, its admin interface stays)
		[ "${FINISH_OK}" = 1 ] && mark_update done legacy-admin || FINISH_OK=0
		if [ "${FINISH_OK}" = 1 ]; then
			[ -n "${THEME_KEPT_AT}" ] && echo "## theme-data of the old program kept in ${THEME_KEPT_AT}: what was added to it could not all be taken over" >&3 2>&3
			# The podcasts' pictures in an old program folder (a way back to a version before 5.1 put them there, see
			# migrate_layout.sh --for-older) into the cache of 5.1 first - else that folder counted as one with data of its
			# own and stayed, after every way back and forth one more. A picture the cache does not have is copied next to
			# its place, written out and only then renamed (a cut off copy never stands under the name). The old folder's
			# pictures go only when every one of them is in the cache with the same content - one that differs there (a
			# newer picture, or a copy a power cut left half) keeps the old folder as it is.
			rss_into_cache() {
				local src="$1/www/rss-covers" dst="${MUPI_CACHE}/rss-covers" f t ok=0
				[ -d "${src}" ] && [ ! -L "${src}" ] || return 0
				# (anything but files and folders in it - a link, to a picture or a folder: not taken over, so the old
				# folder stays)
				[ -z "$(find "${src}" -mindepth 1 ! -type f ! -type d -print -quit)" ] || ok=1
				while IFS= read -r -d '' f; do
					t="${dst}/${f#"${src}"/}"
					if [ ! -e "${t}" ]; then
						mkdir -p "$(dirname "${t}")" && cp -p "${f}" "${t}.mupibox-new" && sync "${t}.mupibox-new" \
							&& mv -f "${t}.mupibox-new" "${t}" || { rm -f "${t}.mupibox-new"; ok=1; }
					fi
					cmp -s "${f}" "${t}" || ok=1
				done < <(find "${src}" -type f -print0)
				[ "${ok}" = 0 ] && sync && rm -rf "${src}"
				return 0
			}
			if [ -d "${MUPI_CACHE}/rss-covers" ] && [ ! -L "${MUPI_CACHE}/rss-covers" ]; then
				for old in "${BAK_DIR}" "${MUPI_HOME}"/server.before-*; do
					rss_into_cache "${old}" >&3 2>&3
				done
				chown -R dietpi:dietpi "${MUPI_CACHE}/rss-covers" >&3 2>&3
			fi
			if [ -d "${BAK_DIR}" ] && ! program_only "${BAK_DIR}"; then
				mv "${BAK_DIR}" "${MUPI_HOME}/server.kept-${KEEP_STAMP}" >&3 2>&3 \
					&& echo "## ${BAK_DIR} kept as ${MUPI_HOME}/server.kept-${KEEP_STAMP}: it holds data of its own" >&3 2>&3
			fi
			for old in "${BAK_DIR}" "${MUPI_HOME}"/server.before-* "${MUPI_HOME}"/player.before-*; do
				[ -d "${old}" ] || continue
				if program_only "${old}"; then
					rm -rf "${old}" >&3 2>&3
				else
					echo "## ${old} kept: it holds data of its own" >&3 2>&3
				fi
			done
			( cd "${MUPI_PLAYER}" && rm -rf node_modules auth.js docker-compose.yml dockerfile package.json package-lock.json .gitignore LICENSE README.md ) >&3 2>&3
			# Since 5.1 there is no previous admin interface (PHP) any more - the app does everything it did. Only now, after
			# "done": until then a way back finds the old version with all it needs (its pages, the theme previews in
			# /var/www/images). Taken off: php-fpm, lighttpd's PHP module, the PHP packages, its pages in /var/www
			# (/var/www/cover stays, the covers of the radio stations); every .php address goes to the app
			# (92-mupibox-no-php.conf, from conf-available - first: no .php file is ever sent as it is meanwhile). Cut off
			# anywhere after "done": the start does it all again (restore_interrupted_update.sh; the mark is cleared after).
			echo -e "XXX\n99\nRemove the previous admin interface... \nXXX"
			/usr/local/bin/mupibox/remove_legacy_admin.sh >&3 2>&3
			chown -h www-data:www-data /var/www/cover >&3 2>&3
			chown -R dietpi:www-data /home/dietpi/MuPiBox/media/cover >&3 2>&3
			systemctl restart lighttpd >&3 2>&3
			echo "## Previous admin interface removed ##" >&3 2>&3
			clear_update_mark
		fi
	fi
	# Not done (the links of the new program not made, the mark not written): back to the previous version at once,
	# before the new one runs and anything is written into it - not only at the next start
	if [ "${INSTALL_DONE:-0}" != 1 ] || [ "${FINISH_OK:-0}" != 1 ]; then
		echo "## The update could not be finished - going back to the previous version" >&3 2>&3
		# (the copy of its theme-data: the old program comes back with it)
		if [ -n "${THEME_KEPT_AT:-}" ]; then
			rm -rf "${THEME_KEPT_AT}" >&3 2>&3
			rmdir "${THEME_KEPT_AT%/*}" >&3 2>&3
		fi
		if bash /usr/local/bin/mupibox/restore_interrupted_update.sh --no-restart >&3 2>&3; then
			fail_update "The update could not be finished (card full?) - the previous version is back, with your data as it was"
		else
			fail_update "The update could not be finished, and going back did not complete either - restart the box: it goes on with it at the start" nostart
		fi
	fi

	mv ${LOG} /boot/$(date +%F)_update_${VERSION}.log >&3 2>&3
	chown dietpi:dietpi ${CONFIG} >&3 2>&3

	# by path: on a fresh box pm2 knows neither process yet ("pm2 start server" looked for a file "server"). By the names
	# of before (links to server/ and player/): an update to a version before 5.1 puts its program there - pm2 then starts
	# that one, not the program of 5.1 it leaves beside it
	# (registered anew every time, script and --cwd given by these names: pm2 keeps the path it started from, and
	# "cd" through the link gave it the real one - server/ - so a later "pm2 restart" ran the program left there after a
	# way back to a version before 5.1, not the one installed under the old name. A box with the real path saved gets
	# the right one here too.)
	sudo -H -u dietpi bash -c "pm2 delete server >/dev/null 2>&1; pm2 start /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server.js --name server --cwd /home/dietpi/.mupibox/Sonos-Kids-Controller-master" >&3 2>&3
	sudo -H -u dietpi bash -c "pm2 delete spotify-control >/dev/null 2>&1; pm2 start /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js --name spotify-control --cwd /home/dietpi/.mupibox/spotifycontroller-main" >&3 2>&3
	sudo -H -u dietpi bash -c "pm2 save" >&3 2>&3
	# the start of server and player made robust: oneshot, tried again when "pm2 resurrect" hangs (seen once: the
	# display showed "503" until it was started by hand; config/services/pm2-dietpi.override.conf). Takes effect at the
	# next start, the running pm2 is not touched.
	if [ -f /etc/systemd/system/pm2-dietpi.service ]; then
		mkdir -p /etc/systemd/system/pm2-dietpi.service.d >&3 2>&3
		cp -f ${MUPI_SRC}/config/services/pm2-dietpi.override.conf /etc/systemd/system/pm2-dietpi.service.d/override.conf >&3 2>&3
		systemctl daemon-reload >&3 2>&3
	fi

	###############################################################################################
	echo -e "XXX\n100\nInstallation complete, please reboot the system... \nXXX"	
	rm -R ${MUPI_SRC} >&3 2>&3
	rm -rf ${PREFLIGHT_DIR} >&3 2>&3
	sleep 5


} | weigh_progress | { whiptail --title "MuPiBox Update ${VERSION_LONG}" --gauge "Please wait while installing" 6 60 0; progress_lines; }

if [ -f /tmp/mupibox-update-failed ]; then
	# (the reason, as fail_update wrote it - this said "the archive could not be downloaded" for every abort before)
	echo "Update FAILED: $(sed 's/^Update aborted: //' /tmp/mupibox-update-failed)"
	echo "See ${LOG} (or the dated update log on the boot partition)."
	rm -f /tmp/mupibox-update-failed
	rm -rf ${PREFLIGHT_DIR}
	exit 1
fi

# Run in a systemd unit of its own without a terminal (systemd-run, as in the instructions for testing a branch): the box
# restarts as after an update from the app - nobody may be at a terminal to do it, and the display kept the maintenance
# screen until then. Not from the app or the admin interface: they restart the box themselves, after their own last
# steps - both put a stand-in for whiptail first in PATH (the app since 5.0.3; MUPIBOX_UPDATE_LOCK_FOR only since
# 5.0.15). And not in a terminal (curl | sudo bash): there the restart is the user's.
own_unit_restart() {
	[ -n "${INVOCATION_ID:-}" ] && [ -z "${MUPIBOX_UPDATE_LOCK_FOR:-}" ] && [ ! -t 1 ] || return 1
	# (done: the log is moved away as the very last step - as the app checks it)
	[ ! -e "${LOG}" ] || return 1
	case "$(command -v whiptail)" in /usr/bin/* | /bin/* | /usr/local/bin/* | "") return 0 ;; esac
	return 1
}
if own_unit_restart; then
	echo "Update finished - the box restarts."
	sleep 5
	systemctl reboot
	exit 0
fi
echo "Update finished - please reboot system now!"
