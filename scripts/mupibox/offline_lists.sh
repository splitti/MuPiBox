#!/bin/bash
#
# The library and the resume list without what needs the internet (offline_data.json, offline_resume.json) - sourced by
# check_network.sh and get_network.sh, which both make them.
#
# Before, each of the two had its own copy of this: get_network.sh's had not learnt Audible (offline, its tiles were
# shown and did not play), and both wrote the list in pieces straight into the file ("[", the entries, "]", then sed
# over it) - a reader in between (the display, the server) found half a list, and the two scripts at the same time made
# one list out of two. Now the list is made next to the file, checked, and moved over it; one script at a time.

# Podcasts with episodes on the SD card stay (their list then shows those only, see podcast-offline.ts; a resume tile of
# a kept episode too, by its address); the list is made again when that changes too.
PODCAST_INDEX="/home/dietpi/MuPiBox/podcasts/index.json"

# The entries of a list (the file $1) that work without the internet, one per line
offline_filter() {
	local index="${PODCAST_INDEX}"
	/usr/bin/jq -e 'type == "object"' "${index}" > /dev/null 2>&1 || index=/dev/null
	/usr/bin/jq --slurpfile off "${index}" '([$off[0].files[]?.feed] + [$off[0].files[]?.url]) as $feeds | .[] | select(.type != "spotify" and .type != "radio" and .type != "tidal" and .type != "audible" and (.type != "rss" or (.id as $i | any($feeds[]; . == $i))))' < "$1"
}

# make_empty <list> <lock>: the list made empty when it is missing (a new box), under its lock. The lock is taken only
# then, and only when nobody holds it (set -C) - get_network.sh took it twice a minute with touch, also over the
# server's lock, and removed it afterwards: the server's write then ran without a lock.
make_empty() {
	local file="$1" lock="$2"
	[ -f "${file}" ] && return 0
	if (set -C; : > "${lock}") 2> /dev/null; then
		if [ ! -f "${file}" ]; then
			echo -n "[]" > "${file}"
			chown dietpi:dietpi "${file}" 2> /dev/null
		fi
		rm -f "${lock}"
	fi
}

# offline_list <list> <offline list>: made when it is missing or empty, or older than the list or the podcasts' index.
# A list that cannot be read leaves the offline list as it was.
offline_list() {
	local src="$1" dst="$2"
	local tmp="${dst}.tmp.$$"
	# (both scripts run as dietpi; a lock file left by another user: the lock of /dev/null instead of none)
	local lock=/tmp/.offline-lists.lock
	[ ! -e "${lock}" ] || [ -w "${lock}" ] || lock=/dev/null
	if [ -s "${dst}" ] && [ ! "${src}" -nt "${dst}" ] && [ ! "${PODCAST_INDEX}" -nt "${dst}" ]; then
		return 0
	fi
	(
		set -o pipefail
		flock -w 20 9 || exit 1
		# (the list's time from before it is read, given to the offline list: a change of the list while it was read -
		# the server's write takes a moment with fsync - is newer then, and the offline list is made again next time.
		# With its own time it looked newer than that change and stayed old)
		local ref="${tmp}.ref"
		local was
		was=$(stat -c '%i %y' "${src}" 2> /dev/null) || exit 1
		touch -r "${src}" "${ref}" 2> /dev/null || exit 1
		# (the podcasts' index newer than the list: its time - with the list's the offline list stayed older than the index
		# and was made anew at every round, twice a minute)
		if [ "${PODCAST_INDEX}" -nt "${ref}" ]; then touch -r "${PODCAST_INDEX}" "${ref}" 2> /dev/null || exit 1; fi
		/usr/bin/jq -e 'type == "array"' "${src}" > /dev/null 2>&1 || exit 1
		offline_filter "${src}" | /usr/bin/jq -s -c . > "${tmp}" || exit 1
		/usr/bin/jq -e 'type == "array"' "${tmp}" > /dev/null 2>&1 || exit 1
		# (the list is another file now, or changed: made from what is gone - a switch of the user put another user's
		# library and his offline list in place meanwhile, users.ts. Made again next time)
		[ "$(stat -c '%i %y' "${src}" 2> /dev/null)" = "${was}" ] || exit 1
		touch -r "${ref}" "${tmp}"
		chown dietpi:dietpi "${tmp}" 2> /dev/null
		mv -f "${tmp}" "${dst}"
	) 9>> "${lock}"
	rm -f "${tmp}" "${tmp}.ref"
	# (none could be made and there is none: an empty one - active_data.json may point at it -, dated long ago, so it is
	# made properly at the next round)
	if [ ! -e "${dst}" ]; then
		printf '[]' > "${tmp}" && touch -d '2000-01-01' "${tmp}" && chown dietpi:dietpi "${tmp}" 2> /dev/null
		mv -f "${tmp}" "${dst}" 2> /dev/null || rm -f "${tmp}"
	fi
}
