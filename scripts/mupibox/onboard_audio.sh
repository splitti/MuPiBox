#!/bin/bash
#
# The board's own audio (3.5 mm jack, HDMI sound) next to the box's sound card - the switches "Kopfhörerbuchse" and
# "HDMI-Ton" in the app (Einstellungen > Audio > Soundkarte). DietPi switches the onboard audio off whenever a sound
# card other than the onboard one is chosen (a block of the driver in modprobe.d, dtparam=audio=off).
#
#   on       the jack: DietPi's block away, dtparam=audio=on where it counts, no snd_bcm2835.enable_headphones=0 on the
#            kernel command line - and the box's own card stays card 0 (/etc/asound.conf, the card's repair in the
#            server and DietPi's tools all mean card 0): the onboard driver may not take that slot
#   off      back as DietPi has it for a card other than the onboard one
#   hdmi-on  HDMI sound as a sound card of its own. With the firmware's display (the default of the box, also with
#            vc4-fkms-v3d) the onboard driver does it, on every model: like the jack, plus snd_bcm2835.enable_hdmi=1
#            and hdmi_drive=2, so a monitor in DVI mode does not leave the sound out. With full KMS (vc4-kms-v3d) the
#            display driver brings the sound card by itself: an overlay with "noaudio" only loses that word. Pi 5: KMS
#            is always there, nothing to write.
#   hdmi-off the lines written for it away again (each one has the comment "# mupibox-hdmi-audio" above it)
#   reapply  "on" again for what is set in mupibox.onboardAudio / mupibox.hdmiAudio (after DietPi switched the sound
#            card, which writes its block anew - from the app, the MuPiHAT scripts and at the server's start)
#   sync     both switches exactly as mupibox.onboardAudio / mupibox.hdmiAudio say, off included (a restored backup:
#            reapply left a jack or HDMI sound of the box before it on when the backup has them off)
#   status / hdmi-status   on / off: what is written for the jack / HDMI (it applies after a restart)
#
# (mupibox.onboardAudio and mupibox.hdmiAudio themselves are the server's to write: it holds the lock on the
# configuration.) Prints "changed" when something was written: it applies after a restart of the box. Nothing is
# written that is already right, and nothing at all while the onboard card is the box's sound card.
# CONFIG / BOOT_DIR / MODEL / MODPROBE_DIR for a test on copies.

set -u

CONFIG="${CONFIG:-/etc/mupibox/mupiboxconfig.json}"
if [ -z "${BOOT_DIR:-}" ]; then
	if [ -f /boot/firmware/config.txt ]; then
		BOOT_DIR=/boot/firmware
	else
		BOOT_DIR=/boot
	fi
fi
MODPROBE_DIR="${MODPROBE_DIR:-/etc/modprobe.d}"
BOOT_CONFIG="${BOOT_DIR}/config.txt"
BOOT_CMDLINE="${BOOT_DIR}/cmdline.txt"
BLACKLIST="${MODPROBE_DIR}/dietpi-disable_rpi_audio.conf"
ORDER="${MODPROBE_DIR}/mupibox-card-order.conf"
MARK="# mupibox-hdmi-audio"
MARK_KMS="# mupibox-hdmi-audio: noaudio taken from vc4-kms-v3d"
CHANGED=0

physical=$(/usr/bin/jq -r '.mupibox.physicalDevice // ""' "${CONFIG}" 2>/dev/null)
# what is switched on in the app (the server writes these before it calls this script)
WANT_JACK=$(/usr/bin/jq -r '.mupibox.onboardAudio // false' "${CONFIG}" 2>/dev/null)
WANT_HDMI=$(/usr/bin/jq -r '.mupibox.hdmiAudio // false' "${CONFIG}" 2>/dev/null)
MODEL="${MODEL:-$(tr -d '\0' < /proc/device-tree/model 2>/dev/null)}"

# The Pi 5 and the Zero have no 3.5 mm output: nothing to switch there
no_jack() { case "${MODEL}" in *"Raspberry Pi 5"* | *"Raspberry Pi 500"* | *"Compute Module 5"* | *"Raspberry Pi Zero"*) return 0 ;; esac; return 1; }
pi5_model() { case "${MODEL}" in *"Raspberry Pi 5"* | *"Raspberry Pi 500"* | *"Compute Module 5"*) return 0 ;; esac; return 1; }
# On a Pi 1, 2, 3 and Zero the 3.5 mm output and the status LED's hardware PWM (dtoverlay=pwm on GPIO 12/13, see
# led_control.py) use the same PWM unit (PWM0) - on a Pi 4 the jack has PWM1 of its own. Only these models listed:
# any other (Pi 4, 400, CM4, unknown) keeps the LED on the hardware PWM.
pwm_shared() {
	case "${MODEL}" in
		*"Raspberry Pi 3"* | *"Raspberry Pi 2"* | *"Raspberry Pi Zero"* | *"Raspberry Pi Model"* | *"Compute Module 3"* | *"Compute Module Rev"*) return 0 ;;
	esac
	return 1
}
LED_PIN=$(/usr/bin/jq -r '.shim.ledPin // empty' "${CONFIG}" 2>/dev/null)

# dtparam=audio=<on|off> in the lines that count for every Pi (before the first [section] and under [all]); added at
# the end (under an [all] of its own after another section) when there is none
set_dtparam() {
	local want="dtparam=audio=$1" tmp
	tmp=$(mktemp) || return 1
	awk -v want="${want}" '
		{ t = $0; sub(/^[[:space:]]+/, "", t) }
		t ~ /^\[/ { sec = t; sub(/\].*$/, "]", sec); print; next }
		(sec == "" || sec == "[all]") && t ~ /^dtparam=audio=/ { print want; found = 1; next }
		{ print }
		END { if (!found) { if (sec != "" && sec != "[all]") print "[all]"; print want } }
	' "${BOOT_CONFIG}" > "${tmp}" || { rm -f "${tmp}"; return 1; }
	if cmp -s "${tmp}" "${BOOT_CONFIG}"; then
		rm -f "${tmp}"
		return 0
	fi
	cp -p "${BOOT_CONFIG}" "${BOOT_CONFIG}.bak-audio"
	# (written in place: the file keeps its owner and mode, on the FAT boot partition too)
	cat "${tmp}" > "${BOOT_CONFIG}" && CHANGED=1
	rm -f "${tmp}"
}

# snd_bcm2835.<name>=<value> on the kernel command line (one line): exactly this value once, or written anew at the end
set_cmdline() {
	local name="$1" value="$2" cur
	[ -f "${BOOT_CMDLINE}" ] || return 0
	cur=$(grep -oE "snd_bcm2835\.${name}=[^[:space:]]*" "${BOOT_CMDLINE}" | sort -u | tr '\n' ' ')
	[ "${cur}" = "snd_bcm2835.${name}=${value} " ] && return 0
	sed -i -E "s/[[:space:]]*snd_bcm2835\.${name}=[^[:space:]]*//g; 1 s/[[:space:]]*\$/ snd_bcm2835.${name}=${value}/" "${BOOT_CMDLINE}" && CHANGED=1
}

# a line for the boot configuration, with the comment above that lets hdmi-off find it again; where it counts for every
# Pi (an [all] of its own after another section)
add_marked() {
	local last
	cp -p "${BOOT_CONFIG}" "${BOOT_CONFIG}.bak-audio"
	last=$(sed -n 's/^[[:space:]]*\(\[[^]]*\]\).*/\1/p' "${BOOT_CONFIG}" | tail -n 1)
	[ -z "${last}" ] || [ "${last}" = "[all]" ] || echo '[all]' >> "${BOOT_CONFIG}"
	{ echo "${MARK}"; echo "$1"; } >> "${BOOT_CONFIG}" && CHANGED=1
}

# the LED back on the hardware PWM (as the update sets it: GPIO 12/13 and the analog audio off)
led_pwm_back() {
	if pwm_shared && { [ "${LED_PIN}" = "12" ] || [ "${LED_PIN}" = "13" ]; } && ! grep -q '^dtoverlay=pwm' "${BOOT_CONFIG}"; then
		echo "dtoverlay=pwm,pin=${LED_PIN},func=4" >> "${BOOT_CONFIG}" && CHANGED=1
	fi
}

audio_on() {
	if [ -f "${BLACKLIST}" ]; then
		# (modprobe reads only *.conf: the renamed file is kept and blocks nothing)
		mv -f "${BLACKLIST}" "${BLACKLIST}.removed" && CHANGED=1
	fi
	set_dtparam on
	if [ "${WANT_JACK}" = "true" ]; then
		if grep -q 'snd_bcm2835\.enable_headphones=0' "${BOOT_CMDLINE}" 2>/dev/null; then
			sed -i -E 's/[[:space:]]*snd_bcm2835\.enable_headphones=0//g' "${BOOT_CMDLINE}" && CHANGED=1
		fi
		# the LED's hardware PWM off on the models where it shares the jack's PWM unit: led_control.py falls back to
		# the software PWM by itself (a little CPU)
		if pwm_shared && grep -q '^dtoverlay=pwm,' "${BOOT_CONFIG}"; then
			sed -i '/^dtoverlay=pwm,/d' "${BOOT_CONFIG}" && CHANGED=1
		fi
	elif ! no_jack; then
		# the driver for HDMI only: the jack stays out (it came along as a card of its own, and on a Pi 1-3 it took
		# the LED's PWM unit - free again then)
		set_cmdline enable_headphones 0
		led_pwm_back
	fi
	# ("!": slot 0 is not for this module - the box's own card takes it, the onboard cards the next free ones)
	if [ "$(cat "${ORDER}" 2>/dev/null)" != "options snd slots=!snd_bcm2835" ]; then
		echo "options snd slots=!snd_bcm2835" > "${ORDER}" && CHANGED=1
	fi
}

audio_off() {
	if [ ! -f "${BLACKLIST}" ]; then
		if [ -f "${BLACKLIST}.removed" ]; then
			mv -f "${BLACKLIST}.removed" "${BLACKLIST}"
		else
			echo "blacklist snd_bcm2835" > "${BLACKLIST}"
		fi
		CHANGED=1
	fi
	set_dtparam off
	if [ -f "${ORDER}" ]; then
		rm -f "${ORDER}" && CHANGED=1
	fi
	led_pwm_back
}

# --- HDMI sound ----------------------------------------------------------------------------------------------------

# full KMS (dtoverlay=vc4-kms-v3d): the display driver brings the HDMI sound card (with the firmware's display, also
# vc4-fkms-v3d, it does not)

# The model filters of config.txt this Pi answers to ([pi4] on a Pi 4, [pi400] and [pi4] on a Pi 400 ...): a KMS line
# under [pi4] does nothing on a Pi 3 - it was taken for full KMS there, and the HDMI sound got no driver.
model_filters() {
	case "${MODEL}" in
		*"Raspberry Pi 500"*) echo "[pi500] [pi5]" ;;
		*"Compute Module 5"*) echo "[cm5] [pi5]" ;;
		*"Raspberry Pi 5"*) echo "[pi5]" ;;
		*"Raspberry Pi 400"*) echo "[pi400] [pi4]" ;;
		*"Compute Module 4S"*) echo "[cm4s] [pi4]" ;;
		*"Compute Module 4"*) echo "[cm4] [pi4]" ;;
		*"Raspberry Pi 4"*) echo "[pi4]" ;;
		*"Raspberry Pi Zero 2"*) echo "[pi02] [pi0]" ;;
		*"Raspberry Pi Zero W"*) echo "[pi0w] [pi0]" ;;
		*"Raspberry Pi Zero"*) echo "[pi0]" ;;
		*"Raspberry Pi 3 Model"*"Plus"*) echo "[pi3+] [pi3]" ;;
		*"Compute Module 3"*) echo "[cm3] [pi3]" ;;
		*"Raspberry Pi 3"*) echo "[pi3]" ;;
		*"Raspberry Pi 2"*) echo "[pi2]" ;;
		*"Raspberry Pi Model"* | *"Compute Module Rev"*) echo "[pi1]" ;;
	esac
}

# The KMS lines in force on this Pi: before the first [section], under [all], or under a model filter of this model.
# Every other condition ([EDID=...], [gpio4=1], [hdmi:0], [0x...] ...) cannot be told from here: from it on until [all]
# a KMS line is no proof of full KMS and is not changed (an [EDID=other monitor] line was taken for KMS, the onboard
# driver was switched off and the HDMI sound had none). Conditions of different kinds add up in config.txt, so a model
# filter after such a condition does not lift it; [none] ends everything until [all].
#   kms_lines has      a KMS line is in force
#   kms_lines noaudio  ... and it has "noaudio"
#   kms_lines strip    prints the file with "noaudio" taken from those lines
#   kms_lines add      prints the file with "noaudio" added to those lines
kms_lines() {
	awk -v mode="$1" -v filters=" $(model_filters) " '
		function on_this_pi() { return model_ok && !none && !unknown }
		BEGIN { model_ok = 1; none = 0; unknown = 0; found = 0 }
		{
			t = $0; sub(/^[[:space:]]+/, "", t)
			if (t ~ /^\[/) {
				sec = t; sub(/\].*$/, "]", sec)
				lsec = tolower(sec)
				if (lsec == "[all]") { model_ok = 1; none = 0; unknown = 0 }
				else if (lsec == "[none]") none = 1
				else if (lsec ~ /^\[(pi[0-9]+[a-z+]*|cm[0-9]+[a-z]*)\]$/) model_ok = index(filters, " " lsec " ") > 0
				else unknown = 1
				if (mode == "strip" || mode == "add") print
				next
			}
			kms = on_this_pi() && t ~ /^dtoverlay=vc4-kms-v3d([,[:space:]]|$)/
			if (kms) {
				found = 1
				if (t ~ /[,[:space:]]noaudio([,[:space:]]|$)/) has_noaudio = 1
				if (mode == "strip") gsub(/,noaudio/, "")
				if (mode == "add" && $0 !~ /[,[:space:]]noaudio([,[:space:]]|$)/) sub(/[[:space:]]*$/, ",noaudio")
			}
			if (mode == "strip" || mode == "add") print
		}
		END {
			if (mode == "has") exit !found
			if (mode == "noaudio") exit !has_noaudio
		}' "${BOOT_CONFIG}"
}

# config.txt rewritten with the KMS lines changed (strip / add); only when something changes
kms_rewrite() {
	local tmp
	tmp=$(mktemp) || return 1
	kms_lines "$1" > "${tmp}" || { rm -f "${tmp}"; return 1; }
	if [ -s "${tmp}" ] && ! cmp -s "${tmp}" "${BOOT_CONFIG}"; then
		cp -p "${BOOT_CONFIG}" "${BOOT_CONFIG}.bak-audio"
		# (written in place: the file keeps its owner and mode, on the FAT boot partition too)
		cat "${tmp}" > "${BOOT_CONFIG}" && CHANGED=1
	fi
	rm -f "${tmp}"
}

# an earlier version of this script wrote vc4-fkms-v3d for the Pi 4: gone again (the line with its comment)
drop_fkms() {
	if grep -A1 "^${MARK}\$" "${BOOT_CONFIG}" | grep -q '^dtoverlay=vc4-fkms-v3d'; then
		cp -p "${BOOT_CONFIG}" "${BOOT_CONFIG}.bak-audio"
		sed -i "/^${MARK}\$/{N;/dtoverlay=vc4-fkms-v3d/d}" "${BOOT_CONFIG}" && CHANGED=1
	fi
}

hdmi_on() {
	drop_fkms
	if pi5_model; then
		:
	elif kms_lines has; then
		# (full KMS: "noaudio" would hide the HDMI sound card - noted with a comment of its own, so hdmi-off puts it back;
		# never MARK, whose next line hdmi-off removes)
		if kms_lines noaudio; then
			kms_rewrite strip
			grep -q "^${MARK_KMS}\$" "${BOOT_CONFIG}" || echo "${MARK_KMS}" >> "${BOOT_CONFIG}"
		fi
	else
		# the onboard driver: HDMI sound on its command line, HDMI mode (not DVI) for a monitor that has none by itself
		set_cmdline enable_hdmi 1
		if ! grep -Eq '^[[:space:]]*hdmi_drive=' "${BOOT_CONFIG}"; then
			add_marked "hdmi_drive=2"
		fi
	fi
}

hdmi_off() {
	drop_fkms
	# the lines written for it (the comment above each one finds them)
	if grep -q "^${MARK}\$" "${BOOT_CONFIG}"; then
		cp -p "${BOOT_CONFIG}" "${BOOT_CONFIG}.bak-audio"
		sed -i "/^${MARK}\$/{N;d}" "${BOOT_CONFIG}" && CHANGED=1
	fi
	if grep -q 'snd_bcm2835\.enable_hdmi=1' "${BOOT_CMDLINE}" 2>/dev/null; then
		set_cmdline enable_hdmi 0
	fi
	# full KMS: "noaudio" back where hdmi-on took it away
	if grep -q "^${MARK_KMS}\$" "${BOOT_CONFIG}"; then
		kms_rewrite add
		sed -i "/^${MARK_KMS}\$/d" "${BOOT_CONFIG}" && CHANGED=1
	fi
}

# does the system have the HDMI sound written: on / off
hdmi_state() {
	if pi5_model; then
		echo "on"
	elif kms_lines has; then
		if kms_lines noaudio; then echo "off"; else echo "on"; fi
	elif [ ! -f "${BLACKLIST}" ] && ! grep -q 'snd_bcm2835\.enable_hdmi=0' "${BOOT_CMDLINE}" 2>/dev/null && grep -q 'snd_bcm2835\.enable_hdmi=1' "${BOOT_CMDLINE}" 2>/dev/null; then
		echo "on"
	else
		echo "off"
	fi
}

# the onboard driver is needed for the jack, and for HDMI sound unless full KMS does it
needs_driver() {
	{ [ "${WANT_JACK}" = "true" ] && ! no_jack; } && return 0
	[ "${WANT_HDMI}" = "true" ] && ! pi5_model && ! kms_lines has && return 0
	return 1
}

# everything as the two switches say: the driver (DietPi's block, dtparam, the order of the cards) while it is needed,
# and the HDMI lines
apply() {
	if needs_driver; then audio_on; else audio_off; fi
	if [ "${WANT_HDMI}" = "true" ]; then hdmi_on; else hdmi_off; fi
}

case "${physical}" in
	rpi-bcm2835-*)
		# the onboard output is the box's sound card: DietPi has it on, nothing to do here - but it must be card 0 then
		case "${1:-}" in status | hdmi-status) echo "on"; exit 0 ;; esac
		if [ -f "${ORDER}" ]; then
			rm -f "${ORDER}" && echo "changed"
		fi
		exit 0
		;;
esac

case "${1:-}" in
	on)
		no_jack && exit 0
		WANT_JACK=true
		apply
		;;
	off)
		no_jack && exit 0
		WANT_JACK=false
		apply
		;;
	hdmi-on)
		WANT_HDMI=true
		apply
		;;
	hdmi-off)
		WANT_HDMI=false
		apply
		;;
	reapply)
		no_jack && WANT_JACK=false
		{ [ "${WANT_JACK}" = "true" ] || [ "${WANT_HDMI}" = "true" ]; } || exit 0
		apply
		;;
	sync)
		no_jack && WANT_JACK=false
		# (both off and nothing of ours written: DietPi's state stays untouched - no block written anew)
		if [ "${WANT_JACK}" != "true" ] && [ "${WANT_HDMI}" != "true" ] && [ ! -f "${ORDER}" ] && [ ! -f "${BLACKLIST}.removed" ] &&
			! grep -Eq "^(${MARK}|${MARK_KMS})\$" "${BOOT_CONFIG}" && ! grep -q 'snd_bcm2835\.enable_hdmi=1' "${BOOT_CMDLINE}" 2>/dev/null; then
			exit 0
		fi
		apply
		;;
	status)
		no_jack && { echo "off"; exit 0; }
		if [ ! -f "${BLACKLIST}" ] && [ -f "${ORDER}" ] && ! grep -q 'snd_bcm2835\.enable_headphones=0' "${BOOT_CMDLINE}" 2>/dev/null; then echo "on"; else echo "off"; fi
		exit 0
		;;
	hdmi-status)
		hdmi_state
		exit 0
		;;
	*)
		echo "usage: $0 on|off|hdmi-on|hdmi-off|reapply|sync|status|hdmi-status" >&2
		exit 2
		;;
esac

[ "${CHANGED}" = "1" ] && echo "changed"
exit 0
