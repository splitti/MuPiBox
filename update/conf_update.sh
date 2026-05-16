#!/bin/bash
#

#https://raw.githubusercontent.com/splitti/MuPiBox/main
#SRC="https://mupibox.de/version/latest"
CONFIG="/etc/mupibox/mupiboxconfig.json"

# H4: Phase-3-Pattern. Every previous update step used
# `cat <<< $(jq <FILTER>) > ${CONFIG}` which truncates CONFIG before jq's
# output is appended. If jq errors (or the script is killed mid-update),
# CONFIG ends up empty/corrupted — and an empty mupiboxconfig.json bricks
# the box. Wrap every write in a tmpfile + atomic mv. Same pattern that
# Phase-3 applied to 12 other scripts; conf_update was missed.
update_config() {
	# Usage: update_config '<jq filter>' [--arg name value ...]
	local filter=$1
	shift
	local tmp="${CONFIG}.tmp.$$"
	if /usr/bin/jq "$@" "$filter" "${CONFIG}" > "${tmp}"; then
		mv "${tmp}" "${CONFIG}"
	else
		rm -f "${tmp}"
		echo "WARN: conf_update jq filter failed: $filter" >&2
	fi
}

# H4: previous theme-insert used `cat ${CONFIG} | grep <theme>` to test
# whether a theme is already installed. That matches anywhere in the
# JSON file as substring — e.g. checking for "matrix" matches the literal
# "matrix" wherever it appears in the config, including inside other
# values. Use jq's array index check against the actual installedThemes
# list instead — exact-match, no false positives.
ensure_theme() {
	local theme=$1
	if /usr/bin/jq -e --arg v "$theme" \
			'(.mupibox.installedThemes // []) | index($v) != null' \
			"${CONFIG}" >/dev/null 2>&1; then
		return 0  # already installed
	fi
	update_config '.mupibox.installedThemes? += [$v]' --arg v "$theme"
}

# 1.0.8
update_config 'del(.mupibox.googlettslanguages)'
update_config 'del(.mupibox.mediaCheckTimer)'
update_config 'del(.mupibox.AudioDevices)'

# 1.0.8
update_config '.mupibox.googlettslanguages = [{"iso639-1": "ar", "Language": "Arabic"},{"iso639-1": "zh", "Language": "Chinese"},{"iso639-1": "cs","Language": "Czech"},{"iso639-1": "da","Language": "Danish"},{"iso639-1": "nl","Language": "Dutch"},{"iso639-1": "en","Language": "English"},{"iso639-1": "fi","Language": "Finnish"},{"iso639-1": "fr","Language": "French"},{"iso639-1": "de","Language": "German"},{"iso639-1": "el","Language": "Greek"},{"iso639-1": "hi","Language": "Hindi"},{"iso639-1": "it","Language": "Italian"},{"iso639-1": "ja","Language": "Japanese"},{"iso639-1": "no","Language": "Norwegian"},{"iso639-1": "pl","Language": "Polish"},{"iso639-1": "pt","Language": "Portuguese"},{"iso639-1": "ru","Language": "Russian"},{"iso639-1": "es","Language": "Spanish, Castilian"},{"iso639-1": "sv","Language": "Swedish"},{"iso639-1": "tr","Language": "Turkish"},{"iso639-1": "uk","Language": "Ukrainian"}]'

# 1.0.8
DEVICE=$(/usr/bin/jq -r .spotify.physicalDevice ${CONFIG})
if [ "$DEVICE" == "null" ]; then
	update_config '.mupibox.physicalDevice = $v' --arg v "hifiberry-dac"
fi

# 1.0.8
MAXVOL=$(/usr/bin/jq -r .mupibox.maxVolume ${CONFIG})
if [ "$MAXVOL" == "null" ]; then
	update_config '.mupibox.maxVolume = $v' --arg v "100"
fi

# 2.0.0
ensure_theme xmas
ensure_theme ironman
ensure_theme captainamerica
ensure_theme wood
ensure_theme matrix
ensure_theme mint
ensure_theme danger
ensure_theme cinema

#2.1.0
LEDMAX=$(/usr/bin/jq -r .shim.ledBrightnessMax ${CONFIG})
if [ "$LEDMAX" == "null" ]; then
	update_config '.shim.ledBrightnessMax = $v' --arg v "100"
fi

LEDMIN=$(/usr/bin/jq -r .shim.ledBrightnessMin ${CONFIG})
if [ "$LEDMIN" == "null" ]; then
	update_config '.shim.ledBrightnessMin = $v' --arg v "10"
fi

#3.0.0
PM2RAMLOG=$(/usr/bin/jq -r .pm2.ramlog ${CONFIG})
if [ "$PM2RAMLOG" == "null" ]; then
	update_config '.pm2.ramlog = $v' --arg v "0"
fi

ensure_theme earth
ensure_theme steampunk
ensure_theme fantasybutterflies
ensure_theme lines

#3.0.2
TELEGRAM=$(/usr/bin/cat ${CONFIG} | grep -E '"telegram"\s*:')
if [[ -z ${TELEGRAM} ]]; then
	update_config '.telegram.token = $v' --arg v ""
	update_config '.telegram.active = false'
	update_config '.telegram.chatId = $v' --arg v ""
fi

#3.0.2
WLED=$(/usr/bin/cat ${CONFIG} | grep -E '"wled"\s*:')
if [[ -z ${WLED} ]]; then
	update_config '.wled.active = false'
	update_config '.wled.startup_id = $v' --arg v ""
	update_config '.wled.main_id = $v' --arg v ""
	update_config '.wled.shutdown_id = $v' --arg v ""
	update_config '.wled.brightness_default = $v' --arg v "255"
	update_config '.wled.brightness_dimmed = $v' --arg v "128"
	update_config '.wled.boot_active = $v' --arg v "true"
	update_config '.wled.shutdown_active = $v' --arg v "true"
	update_config '.wled.baud_rate = $v' --arg v "115200"
	update_config '.wled.com_port = $v' --arg v "/dev/ttyUSB0"
fi

#3.2.6
IPCONTROL=$(/usr/bin/jq -r '.mupibox.ip_control_backend' ${CONFIG})
if [ "$IPCONTROL" == "null" ]; then
	update_config '.mupibox.ip_control_backend = $v' --arg v "false"
fi
update_config 'del(.wled.ip)'
WLED_COM=$(/usr/bin/jq -r '.wled.com_port' ${CONFIG})
if [ "$WLED_COM" == "null" ]; then
	update_config '.wled.startup_id = $v' --arg v ""
	update_config '.wled.brightness_default = $v' --arg v "255"
	update_config '.wled.brightness_dimmed = $v' --arg v "128"
	update_config '.wled.boot_active = $v' --arg v "true"
	update_config '.wled.shutdown_active = $v' --arg v "true"
	update_config '.wled.baud_rate = $v' --arg v "115200"
	update_config '.wled.com_port = $v' --arg v "/dev/ttyUSB0"
fi

#3.3.4
GPU=$(/usr/bin/jq -r .chromium.gpu ${CONFIG})
if [ "$GPU" == "null" ]; then
	update_config '.chromium.gpu = false'
fi
SCROLLANI=$(/usr/bin/jq -r .chromium.sccrollanimation ${CONFIG})
if [ "$SCROLLANI" == "null" ]; then
	update_config '.chromium.sccrollanimation = false'
fi
CACHEPATH=$(/usr/bin/jq -r .chromium.cachepath ${CONFIG})
if [ "$CACHEPATH" == "null" ]; then
	update_config '.chromium.cachepath = $v' --arg v "/home/dietpi/.mupibox/chromium_cache"
fi
CACHESIZE=$(/usr/bin/jq -r .chromium.cachesize ${CONFIG})
if [ "$CACHESIZE" == "null" ]; then
	update_config '.chromium.cachesize = $v' --arg v "128"
fi
KIOSKMODE=$(/usr/bin/jq -r .chromium.kiosk ${CONFIG})
if [ "$KIOSKMODE" == "null" ]; then
	update_config '.chromium.kiosk = true'
fi
MAXCACHE=$(/usr/bin/jq -r .spotify.maxcachesize ${CONFIG})
if [ "$MAXCACHE" == "null" ]; then
	update_config '.spotify.maxcachesize = $v' --arg v "1073741824"
fi
CACHEPATH=$(/usr/bin/jq -r .spotify.cachepath ${CONFIG})
if [ "$CACHEPATH" == "null" ]; then
	update_config '.spotify.cachepath = $v' --arg v "/home/dietpi/.cache/spotifyd"
fi
CACHESTATE=$(/usr/bin/jq -r .spotify.cachestate ${CONFIG})
if [ "$CACHESTATE" == "null" ]; then
	update_config '.spotify.cachestate = true'
fi

MQTTDEBUG=$(/usr/bin/jq -r .mqtt.debug ${CONFIG})
if [ "$MQTTDEBUG" == "null" ]; then
	update_config '.mqtt.debug = false'
fi
MQTTACTIVE=$(/usr/bin/jq -r .mqtt.active ${CONFIG})
if [ "$MQTTACTIVE" == "null" ]; then
	update_config '.mqtt.active = false'
fi
MQTTBROKER=$(/usr/bin/jq -r .mqtt.broker ${CONFIG})
if [ "$MQTTBROKER" == "null" ]; then
	update_config '.mqtt.broker = $v' --arg v "mqtt-example-broker.com"
fi
MQTTPORT=$(/usr/bin/jq -r .mqtt.port ${CONFIG})
if [ "$MQTTPORT" == "null" ]; then
	update_config '.mqtt.port = $v' --arg v "1883"
fi
MQTTTOPIC=$(/usr/bin/jq -r .mqtt.topic ${CONFIG})
if [ "$MQTTTOPIC" == "null" ]; then
	update_config '.mqtt.topic = $v' --arg v "MuPiBox/Boxname"
fi
MQTTBOXNAME=$(/usr/bin/jq -r .mqtt.clientId ${CONFIG})
if [ "$MQTTBOXNAME" == "null" ]; then
	update_config '.mqtt.clientId = $v' --arg v "Boxname"
fi
MQTTUSERNAME=$(/usr/bin/jq -r .mqtt.username ${CONFIG})
if [ "$MQTTUSERNAME" == "null" ]; then
	update_config '.mqtt.username = $v' --arg v "username"
fi
MQTTPASSWORD=$(/usr/bin/jq -r .mqtt.password ${CONFIG})
if [ "$MQTTPASSWORD" == "null" ]; then
	update_config '.mqtt.password = $v' --arg v "password"
fi
MQTTREFRESH=$(/usr/bin/jq -r .mqtt.refresh ${CONFIG})
if [ "$MQTTREFRESH" == "null" ]; then
	update_config '.mqtt.refresh = $v' --arg v "5"
fi
MQTTREFRESHIDLE=$(/usr/bin/jq -r .mqtt.refreshIdle ${CONFIG})
if [ "$MQTTREFRESHIDLE" == "null" ]; then
	update_config '.mqtt.refreshIdle = $v' --arg v "30"
fi
MQTTTIMEOUT=$(/usr/bin/jq -r .mqtt.timeout ${CONFIG})
if [ "$MQTTTIMEOUT" == "null" ]; then
	update_config '.mqtt.timeout = $v' --arg v "60"
fi

HA_MQTT=$(/usr/bin/jq -r .mqtt.ha_topic ${CONFIG})
if [ "$HA_MQTT" == "null" ]; then
	update_config '.mqtt.ha_active = false'
	update_config '.mqtt.ha_topic = $v' --arg v "homeassistant"
fi

# H4: the original mupihat-init blob had a malformed jq filter — a
# trailing string literal `"ENERpower 2S2P 10.000mAh"` inside the object
# that produced a jq parse error. It only fired when selected_battery
# was missing on a fresh box, so existing boxes weren't affected, but
# any new install would trip it and (with the old truncate-race) could
# leave CONFIG empty. Rewrite as a clean nested assign.
BATTERYCONFIG=$(/usr/bin/jq -r .mupihat.selected_battery ${CONFIG})
if [ "$BATTERYCONFIG" == "null" ]; then
	update_config '.mupihat.selected_battery = $v' --arg v "ENERpower 2S2P 10.000mAh"
	update_config '.mupihat.battery_types = [
		{ "name": "Ansmann 2S1P",            "config": { "v_100": "8100", "v_75": "7800", "v_50": "7400", "v_25": "7000", "v_0": "6700", "th_warning": "7000", "th_shutdown": "6800" }},
		{ "name": "ENERpower 2S2P 10.000mAh","config": { "v_100": "8000", "v_75": "7700", "v_50": "7300", "v_25": "6900", "v_0": "6000", "th_warning": "6500", "th_shutdown": "6150" }},
		{ "name": "USB-C mode (no battery)", "config": { "v_100": "1",    "v_75": "1",    "v_50": "1",    "v_25": "1",    "v_0": "1",    "th_warning": "0",    "th_shutdown": "0" }},
		{ "name": "Custom",                  "config": { "v_100": "8100", "v_75": "7800", "v_50": "7400", "v_25": "7000", "v_0": "6700", "th_warning": "7000", "th_shutdown": "6800" }}
	]'
	update_config '.mupihat.hat_active = false'
fi

ensure_theme lines

HAT_ACTIVE=$(/usr/bin/jq -r .mupihat.hat_active ${CONFIG})
if [ "$HAT_ACTIVE" == "null" ]; then
	update_config '.mupihat.hat_active = false'
fi

FAN_ACTIVE=$(/usr/bin/jq -r .fan.fan_active ${CONFIG})
if [ "$FAN_ACTIVE" == "null" ]; then
	update_config '.fan.fan_active = false'
	update_config '.fan.fan_gpio = "13"'
	update_config '.fan.fan_temp_100 = "75"'
	update_config '.fan.fan_temp_75 = "65"'
	update_config '.fan.fan_temp_50 = "55"'
	update_config '.fan.fan_temp_25 = "45"'
fi

ensure_theme forms
ensure_theme comic
ensure_theme mystic

RESUME=$(/usr/bin/jq -r '.mupibox.resume' ${CONFIG})
if [ "$RESUME" == "null" ]; then
	update_config '.mupibox.resume = 9'
fi

ensure_theme clone-wars
ensure_theme enterprise
ensure_theme spiderman
ensure_theme pikachu
ensure_theme supermario
ensure_theme dinosaur
ensure_theme unicorn
ensure_theme axolotl

CUSTOMTHEME=$(/usr/bin/jq -r '.mupibox.customTheme' ${CONFIG})
if [ "$CUSTOMTHEME" == "null" ]; then
	ensure_theme custom
	update_config '.mupibox.customTheme = ""'
fi

ADMININTERFACE=$(/usr/bin/jq -r '.interfacelogin.state' ${CONFIG})
if [ "$ADMININTERFACE" == "null" ]; then
	update_config '.interfacelogin.state = false'
	update_config '.interfacelogin.password = $v' --arg v '$2y$10$tA27/5vXFUPgjfjfi7dpTuk.1yOffsg6kuSDQBGTv4sjpVkRlhd76'
fi


update_config '.mupibox.AudioDevices = [{"tname": "MAX98357A bcm2835-i2s-HiFi HiFi-0","ufname": "MAX98357A bcm2835-i2s-HiFi HiFi-0"},{"tname": "rpi-bcm2835-3.5mm","ufname": "Onboard 3.5mm output"},{"tname": "rpi-bcm2835-hdmi","ufname": "Onboard HDMI output"},{"tname": "allo-boss-dac-pcm512x-audio","ufname": "Allo Boss DAC"},{"tname": "allo-boss2-dac-audio","ufname": "Allo Boss2 DAC"},{"tname": "allo-digione","ufname": "Allo DigiOne"},{"tname": "allo-katana-dac-audio","ufname": "Allo Katana DAC"},{"tname": "allo-piano-dac-pcm512x-audio","ufname": "Allo Piano DAC"},{"tname": "allo-piano-dac-plus-pcm512x-audio","ufname": "Allo Piano DAC 2.1"},{"tname": "applepi-dac","ufname": "ApplePi DAC (Orchard Audio)"},{"tname": "dionaudio-loco","ufname": "Dion Audio LOCO"},{"tname": "dionaudio-loco-v2","ufname": "Dion Audio LOCO V2"},{"tname": "googlevoicehat-soundcard","ufname": "Google AIY voice kit"},{"tname": "hifiberry-amp","ufname": "HifiBerry AMP / AMP+"},{"tname": "hifiberry-dac","ufname": "HifiBerry DAC / MiniAmp"},{"tname": "hifiberry-dacplus","ufname": "HifiBerry DAC+ / DAC+ Pro / AMP2"},{"tname": "hifiberry-dacplusadc","ufname": "HifiBerry DAC+ADC"},{"tname": "hifiberry-dacplusadcpro","ufname": "HifiBerry DAC+ADC Pro"},{"tname": "hifiberry-dacplusdsp","ufname": "HifiBerry DAC+DSP"},{"tname": "hifiberry-dacplushd","ufname": "HifiBerry DAC+ HD"},{"tname": "hifiberry-digi","ufname": "HifiBerry Digi / Digi+"},{"tname": "hifiberry-digi-pro","ufname": "HifiBerry Digi+ Pro"},{"tname": "i-sabre-q2m","ufname": "AudioPhonics I-Sabre ES9028Q2M / ES9038Q2M"},{"tname": "iqaudio-codec","ufname": "IQaudIO Pi-Codec HAT"},{"tname": "iqaudio-dac","ufname": "IQaudIO DAC audio card"},{"tname": "iqaudio-dacplus","ufname": "Pi-DAC+, Pi-DACZero, Pi-DAC+ Pro, Pi-DigiAMP+"},{"tname": "iqaudio-digi-wm8804-audio","ufname": "Pi-Digi+"},{"tname": "usb-dac","ufname": "Any USB Audio DAC (Auto detection)"}]'

# delete old entries
update_config 'del(.spotify.username)'
update_config 'del(.spotify.password)'
