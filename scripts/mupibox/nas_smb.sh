#!/bin/bash
#
# The NAS over SMB (5.1): mounts the share chosen in the app under /run/mupibox/nas, where the box's SMB helper reads
# it (backend-api src/nas/smb.ts). Run as root by the app's server.
#
#   nas_smb.sh install              cifs-utils - only when SMB is chosen (a box that never uses it gets nothing)
#   nas_smb.sh mount <host> <share> the login on stdin, one per line: account, password, domain (may be empty)
#   nas_smb.sh umount
#   nas_smb.sh status               "mounted //host/share" or "not mounted"
#
# A failed mount prints "error=<reason>": unreachable, resolve (name unknown), auth, notfound (no such share),
# smb1 (the NAS only speaks SMB1), install (cifs-utils missing), other.

set -u

MNT=/run/mupibox/nas
OWNER=dietpi
APT="flock -w 120 /tmp/.mupibox.apt.lock"

# one at a time (a login in the app while the server mounts again) - not for status, which only reads /proc/mounts
lock() {
	mkdir -p /run/lock
	exec 9>/run/lock/mupibox-nas-smb.lock
	flock -w 90 9 || { echo "error=other busy"; exit 1; }
}

# (from /proc/mounts: a "mountpoint" or "stat" on a share whose NAS hangs would hang too)
is_mounted() {
	awk -v m="${MNT}" '$2 == m { found = 1 } END { exit !found }' /proc/mounts
}

unmount() {
	is_mounted || return 0
	# -c: no look at the path itself (a hanging NAS); -l: whatever still uses it lets go later
	umount -l -c "${MNT}" 2>/dev/null || umount -f -l -c "${MNT}" 2>/dev/null
}

has_cifs() {
	[ -x /sbin/mount.cifs ] || [ -x /usr/sbin/mount.cifs ]
}

case "${1:-}" in
install)
	lock
	has_cifs && exit 0
	DEBIAN_FRONTEND=noninteractive ${APT} apt-get -o DPkg::Lock::Timeout=600 install -y -q --no-install-recommends cifs-utils >/dev/null 2>&1 || {
		# (the package list may be old - an image of months before: read it once more and try again)
		${APT} apt-get -o DPkg::Lock::Timeout=600 update -q >/dev/null 2>&1
		DEBIAN_FRONTEND=noninteractive ${APT} apt-get -o DPkg::Lock::Timeout=600 install -y -q --no-install-recommends cifs-utils >/dev/null 2>&1
	}
	has_cifs || { echo "error=install"; exit 1; }
	;;
mount)
	lock
	host="${2:-}"
	share="${3:-}"
	# a name or IPv4 address; a share name as Windows allows it
	[[ "${host}" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]{0,252})$ ]] || { echo "error=other address"; exit 2; }
	re_share='^[^/\:*?"<>|[:cntrl:]]{1,80}$'
	[[ "${share}" =~ ${re_share} ]] || { echo "error=other share"; exit 2; }
	IFS= read -r account || account=""
	IFS= read -r password || password=""
	IFS= read -r domain || domain=""
	[ -n "${account}" ] || { echo "error=auth"; exit 2; }
	has_cifs || { echo "error=install"; exit 3; }
	# a name the box cannot look up (a Windows name without DNS): say so, instead of "not reachable"
	if ! [[ "${host}" =~ ^[0-9.]+$ ]]; then
		timeout 10 getent ahosts "${host}" >/dev/null 2>&1 || { echo "error=resolve"; exit 4; }
	fi
	# a NAS that does not answer: said at once - a mount to it can hang in the kernel where no timeout ends it
	timeout 6 bash -c 'exec 3<>"/dev/tcp/$1/445"' _ "${host}" 2>/dev/null || { echo "error=unreachable"; exit 6; }
	unmount
	is_mounted && { echo "error=other busy"; exit 5; }
	mkdir -p "${MNT}"
	chmod 755 /run/mupibox 2>/dev/null
	uid=$(id -u "${OWNER}") && gid=$(id -g "${OWNER}") || { echo "error=other owner"; exit 2; }
	# the login only for the mount, in a file only root reads, gone right after it
	cred=$(mktemp /run/mupibox/.smb.XXXXXX) || { echo "error=other"; exit 2; }
	# (gone in any case - also when the server ends the script: bash runs the trap once the mount has returned)
	trap 'rm -f "${cred}"' EXIT
	trap 'rm -f "${cred}"; exit 143' TERM INT
	chmod 600 "${cred}"
	{
		printf 'username=%s\n' "${account}"
		printf 'password=%s\n' "${password}"
		[ -n "${domain}" ] && printf 'domain=%s\n' "${domain}"
	} >"${cred}"
	# soft + echo_interval 10: a NAS that is gone fails accesses after a while instead of forever; actimeo 30: folder
	# attributes cached half a minute; noserverino: inode numbers of the box's own (some NAS change theirs); no vers=:
	# the newest both speak, SMB 2.1 at least (never SMB1)
	opts="credentials=${cred},uid=${uid},gid=${gid},forceuid,forcegid,file_mode=0644,dir_mode=0755,soft,echo_interval=10,actimeo=30,noserverino,iocharset=utf8,rw,nosuid,nodev,noexec"
	out=$(timeout -s KILL 45 mount -t cifs "//${host}/${share}" "${MNT}" -o "${opts}" 2>&1)
	rc=$?
	rm -f "${cred}"
	unset password
	if [ "${rc}" -eq 0 ]; then
		echo "mounted"
		exit 0
	fi
	code=$(printf '%s' "${out}" | sed -n 's/.*mount error(\([0-9]*\)).*/\1/p' | head -n1)
	case "${code}" in
	13 | 1) echo "error=auth" ;;
	2 | 6) echo "error=notfound" ;;
	95) echo "error=smb1" ;;
	19) echo "error=other cifs module (restart the box)" ;;
	110 | 111 | 112 | 113 | 115 | 101 | 104) echo "error=unreachable" ;;
	*)
		if [ "${rc}" -eq 137 ] || [ "${rc}" -eq 124 ]; then
			echo "error=unreachable"
		elif printf '%s' "${out}" | grep -qi 'could not resolve'; then
			echo "error=resolve"
		else
			echo "error=other ${code:-${rc}}"
		fi
		;;
	esac
	unmount
	exit 1
	;;
umount)
	lock
	unmount
	;;
status)
	if is_mounted; then
		echo "mounted $(awk -v m="${MNT}" '$2 == m { print $1 }' /proc/mounts | head -n1)"
	else
		echo "not mounted"
	fi
	;;
*)
	echo "usage: $0 install|mount <host> <share>|umount|status"
	exit 2
	;;
esac
