#!/bin/bash
#
# The options for fbv (start, maintenance and goodbye picture) on a display that runs with KMS and is turned (see
# display_rotation.sh): the framebuffer is not turned by the X server - the pictures came up in the panel's own way up
# (a Touch Display 2: small and upright in the middle). Turned like the X server, covering the screen (a few percent
# of the edges cut, nothing stretched). Nothing for the official 7" of the 1st generation (the firmware turns), and
# nothing for a mirrored display (displayMirror, rotation 0): fbv cannot mirror, the pictures stay as they are.
#
#   FBV_OPTS=$(/usr/local/bin/mupibox/fbv_options.sh)

ROT=$(/usr/bin/jq -r '.mupibox.displayRotation // 0' /etc/mupibox/mupiboxconfig.json 2>/dev/null)
kms_dsi=0
for c in /sys/class/drm/card*-DSI-*/status; do
	[ -e "${c}" ] && [ "$(cat "${c}")" = "connected" ] && kms_dsi=1
done
[ "${kms_dsi}" = "1" ] || exit 0
case "${ROT}" in
	90) echo "-o 1 -x 10" ;;
	180) echo "-o 2 -x 10" ;;
	270) echo "-o 3 -x 10" ;;
esac
