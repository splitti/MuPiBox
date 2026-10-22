#!/bin/bash
#
# Two settings for a faster and lighter start, set by the install and the update (as root) - each only when nothing
# was chosen for it before:
#
# - initial_turbo=30 in the Pi's config.txt: the CPU runs at full speed for the first 30 s of a start instead of
#   ramping up (the old admin interface's "Initial Turbo" switch; it writes initial_turbo=0 when it is switched off -
#   any initial_turbo line stays as it is).
# - zram swap on a Pi with 1 GB (or less): the swap lives compressed in the RAM instead of a file on the card or stick.
#   With 1 GB the box swaps while it starts (the RAM is full after about a minute), and a swap file on a slow medium
#   held the start up for minutes (IO wait up to 92 %, seen on a Pi 4 with its system on a USB stick: start page after
#   170 s, with zram after 28 s). DietPi's own tool sets it up (50 % of the RAM, kept in dietpi.txt); a swap switched
#   off on purpose (AUTO_SETUP_SWAPFILE_SIZE=0, the old admin interface's switch) stays off.

BOOT_CONFIG="/boot/config.txt"
[ -f /boot/firmware/config.txt ] && BOOT_CONFIG="/boot/firmware/config.txt"
DIETPI_TXT="/boot/dietpi.txt"
SET_SWAP="/boot/dietpi/func/dietpi-set_swapfile"

# --- initial_turbo (Raspberry Pi only: a board without config.txt is left alone)
if [ -f "${BOOT_CONFIG}" ] && ! grep -qE '^[[:blank:]]*initial_turbo[[:blank:]]*=' "${BOOT_CONFIG}"; then
	# (in its own [all] section: the line was appended after whatever section ends the file, e.g. [pi4])
	printf '\n[all]\n# MuPiBox: full CPU speed for the first 30 s of a start\ninitial_turbo=30\n' >> "${BOOT_CONFIG}"
	echo "initial_turbo=30 set in ${BOOT_CONFIG}"
fi

# --- zram swap with 1 GB of RAM or less (a 1 GB Pi reports about 900 MB)
mem_kb=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
rc=0
if [ -n "${mem_kb}" ] && [ "${mem_kb}" -le 1100000 ] && [ -x "${SET_SWAP}" ] && [ -f "${DIETPI_TXT}" ]; then
	size=$(sed -n 's/^[[:blank:]]*AUTO_SETUP_SWAPFILE_SIZE=//p' "${DIETPI_TXT}" | head -n 1)
	location=$(sed -n 's/^[[:blank:]]*AUTO_SETUP_SWAPFILE_LOCATION=//p' "${DIETPI_TXT}" | head -n 1)
	# The swap as it is now, to put it back if zram fails (DietPi's tool switches every swap off and takes all of them out
	# of fstab before it sets up zram). Only a single swap file is switched over: with several swap areas, a swap
	# partition, or a path /proc/swaps prints masked (a space as \040) nothing is changed - putting such a setup back is
	# not safe. The size is the file's own (rounded up to MiB; /proc/swaps counts without its header page) and never 1,
	# which DietPi's tool reads as "choose a size". Without an active swap the values of dietpi.txt.
	swaps=$(awk 'NR > 1' /proc/swaps | wc -l)
	read -r prev_path prev_type < <(awk 'NR > 1 { print $1, $2; exit }' /proc/swaps)
	prev_size=""
	unsafe=""
	if [ "${swaps}" -gt 1 ]; then
		unsafe="several swap areas"
	elif [ "${swaps}" -eq 1 ] && [ "${prev_path}" != "/dev/zram0" ]; then
		if [ "${prev_type}" != "file" ]; then
			unsafe="a swap ${prev_type} (${prev_path})"
		elif [[ ${prev_path} == *\\* ]] || [ ! -f "${prev_path}" ]; then
			unsafe="a swap file whose path is not plain (${prev_path})"
		else
			bytes=$(stat -c %s -- "${prev_path}")
			prev_size=$(((bytes + 1048575) / 1048576))
			[ "${prev_size}" -lt 2 ] && prev_size=2
		fi
	elif [ "${swaps}" -eq 0 ]; then
		prev_path=""
		if [[ ${location} == /* ]] && [[ ${size} =~ ^[0-9]+$ ]]; then
			prev_path=${location}
			prev_size=${size}
		fi
	fi
	if [ "${size}" = "0" ]; then
		echo "swap is switched off on purpose - no zram"
	elif [ "${location}" = "zram" ] || [ "${location}" = "zram0" ] || [ "${location}" = "/dev/zram0" ] || grep -q '^/dev/zram0[[:blank:]]' /proc/swaps; then
		: # zram already
	elif [ -n "${unsafe}" ]; then
		echo "${unsafe} - the swap stays as it is, no zram"
	elif ! modprobe zram 2>/dev/null; then
		# (DietPi's tool switches the old swap off and deletes its file before it loads the module: without the module
		# the box was left without any swap)
		echo "no zram module for this kernel - the swap stays as it is"
	else
		echo "1 GB of RAM: swap as zram instead of ${prev_path:-no swap file}"
		if ! "${SET_SWAP}" 1 zram || ! grep -q '^/dev/zram0[[:blank:]]' /proc/swaps; then
			if [ -n "${prev_path}" ] && [ "${prev_size:-0}" -gt 0 ]; then
				echo "zram could not be set up - the swap as before (${prev_size} MiB, ${prev_path})"
				if ! "${SET_SWAP}" "${prev_size}" "${prev_path}" || ! P="${prev_path}" awk 'NR > 1 && $1 == ENVIRON["P"] { found = 1 } END { exit !found }' /proc/swaps; then
					echo "ERROR: the swap could not be put back (${prev_size} MiB, ${prev_path}) - the box runs without swap" >&2
					rc=1
				fi
			else
				echo "ERROR: zram could not be set up, and there was no swap file before" >&2
				rc=1
			fi
		fi
	fi
fi
exit "${rc}"
