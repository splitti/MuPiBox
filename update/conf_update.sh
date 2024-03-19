#!/bin/bash
#

#https://raw.githubusercontent.com/friebi/MuPiBox/main
#SRC="https://mupibox.de/version/latest"
CONFIG="/etc/mupibox/mupiboxconfig.json"

# 1.0.8
/usr/bin/cat <<< $(/usr/bin/jq 'del(.mupibox.googlettslanguages)' ${CONFIG}) > ${CONFIG}
/usr/bin/cat <<< $(/usr/bin/jq 'del(.mupibox.mediaCheckTimer)' ${CONFIG}) > ${CONFIG}
/usr/bin/cat <<< $(/usr/bin/jq 'del(.mupibox.AudioDevices)' ${CONFIG}) > ${CONFIG}

# 1.0.8
/usr/bin/cat <<< $(/usr/bin/jq '.mupibox.googlettslanguages = [{"iso639-1": "ar", "Language": "Arabic"},{"iso639-1": "zh", "Language": "Chinese"},{"iso639-1": "cs","Language": "Czech"},{"iso639-1": "da","Language": "Danish"},{"iso639-1": "nl","Language": "Dutch"},{"iso639-1": "en","Language": "English"},{"iso639-1": "fi","Language": "Finnish"},{"iso639-1": "fr","Language": "French"},{"iso639-1": "de","Language": "German"},{"iso639-1": "el","Language": "Greek"},{"iso639-1": "hi","Language": "Hindi"},{"iso639-1": "it","Language": "Italian"},{"iso639-1": "ja","Language": "Japanese"},{"iso639-1": "no","Language": "Norwegian"},{"iso639-1": "pl","Language": "Polish"},{"iso639-1": "pt","Language": "Portuguese"},{"iso639-1": "ru","Language": "Russian"},{"iso639-1": "es","Language": "Spanish, Castilian"},{"iso639-1": "sv","Language": "Swedish"},{"iso639-1": "tr","Language": "Turkish"},{"iso639-1": "uk","Language": "Ukrainian"}]' ${CONFIG}) >  ${CONFIG}

# 1.0.8
DEVICE=$(/usr/bin/jq -r .spotify.physicalDevice ${CONFIG})
if [ "$DEVICE" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "hifiberry-dac" '.mupibox.physicalDevice = $v' ${CONFIG}) >  ${CONFIG}
fi

# 1.0.8
MAXVOL=$(/usr/bin/jq -r .mupibox.maxVolume ${CONFIG})
if [ "$MAXVOL" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "100" '.mupibox.maxVolume = $v' ${CONFIG}) >  ${CONFIG}
fi

# 2.0.0
XMAS=$(/usr/bin/cat ${CONFIG} | grep xmas)
if [[ -z ${XMAS} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "xmas" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi
IMAN=$(/usr/bin/cat ${CONFIG} | grep ironman)
if [[ -z ${IMAN} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "ironman" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi
CAP=$(/usr/bin/cat ${CONFIG} | grep captainamerica)
if [[ -z ${CAP} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "captainamerica" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi
WOOD=$(/usr/bin/cat ${CONFIG} | grep wood)
if [[ -z ${WOOD} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "wood" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi
MATRIX=$(/usr/bin/cat ${CONFIG} | grep matrix)
if [[ -z ${MATRIX} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "matrix" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi
MINT=$(/usr/bin/cat ${CONFIG} | grep mint)
if [[ -z ${MINT} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "mint" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi
DANGER=$(/usr/bin/cat ${CONFIG} | grep danger)
if [[ -z ${DANGER} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "danger" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi
CINEMA=$(/usr/bin/cat ${CONFIG} | grep cinema)
if [[ -z ${CINEMA} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "cinema" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi

#2.1.0
LEDMAX=$(/usr/bin/jq -r .shim.ledBrightnessMax ${CONFIG})
if [ "$LEDMAX" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "100" '.shim.ledBrightnessMax = $v' ${CONFIG}) >  ${CONFIG}
fi

LEDMIN=$(/usr/bin/jq -r .shim.ledBrightnessMin ${CONFIG})
if [ "$LEDMIN" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "10" '.shim.ledBrightnessMin = $v' ${CONFIG}) >  ${CONFIG}
fi

#3.0.0
PM2RAMLOG=$(/usr/bin/jq -r .pm2.ramlog ${CONFIG})
if [ "$PM2RAMLOG" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "0" '.pm2.ramlog = $v' ${CONFIG}) >  ${CONFIG}
fi

EARTH=$(/usr/bin/cat ${CONFIG} | grep earth)
if [[ -z ${EARTH} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "earth" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi

STEAMPUNK=$(/usr/bin/cat ${CONFIG} | grep steampunk)
if [[ -z ${STEAMPUNK} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "steampunk" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi

FANTASY_BUTTERFLIES=$(/usr/bin/cat ${CONFIG} | grep fantasybutterflies)
if [[ -z ${FANTASY_BUTTERFLIES} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "fantasybutterflies" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi

LINES=$(/usr/bin/cat ${CONFIG} | grep lines)
if [[ -z ${LINES} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "lines" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi

#3.0.2
TELEGRAM=$(/usr/bin/cat ${CONFIG} | grep telegram)
if [[ -z ${TELEGRAM} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "" '.telegram.token = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq '.telegram.active = false' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "" '.telegram.chatId = $v' ${CONFIG}) >  ${CONFIG}
fi

#3.0.2
WLED=$(/usr/bin/cat ${CONFIG} | grep wled)
if [[ -z ${WLED} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.wled.active = false' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "" '.wled.startup_id = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "" '.wled.main_id = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "" '.wled.shutdown_id = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "255" '.wled.brightness_default = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "128" '.wled.brightness_dimmed = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "true" '.wled.boot_active = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "true" '.wled.shutdown_active = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "115200" '.wled.baud_rate = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "/dev/ttyUSB0" '.wled.com_port = $v' ${CONFIG}) >  ${CONFIG}
fi

#3.2.6
IPCONTROL=$(/usr/bin/cat ${CONFIG} | grep ip_control_backend)
if [[ -z ${IPCONTROL} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "false" '.mupibox.ip_control_backend = $v' ${CONFIG}) >  ${CONFIG}
fi
/usr/bin/cat <<< $(/usr/bin/jq 'del(.wled.ip)' ${CONFIG}) > ${CONFIG}
WLED=$(/usr/bin/cat ${CONFIG} | grep com_port)

if [[ -z ${WLED} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "" '.wled.startup_id = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "255" '.wled.brightness_default = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "128" '.wled.brightness_dimmed = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "true" '.wled.boot_active = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "true" '.wled.shutdown_active = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "115200" '.wled.baud_rate = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "/dev/ttyUSB0" '.wled.com_port = $v' ${CONFIG}) >  ${CONFIG}

fi

#3.3.4
GPU=$(/usr/bin/jq -r .chromium.gpu ${CONFIG})
if [ "$GPU" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.chromium.gpu = false' ${CONFIG}) >  ${CONFIG}
fi
SCROLLANI=$(/usr/bin/jq -r .chromium.sccrollanimation ${CONFIG})
if [ "$SCROLLANI" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.chromium.sccrollanimation = false' ${CONFIG}) >  ${CONFIG}
fi
CACHEPATH=$(/usr/bin/jq -r .chromium.cachepath ${CONFIG})
if [ "$CACHEPATH" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "/home/dietpi/.mupibox/chromium_cache" '.chromium.cachepath = $v' ${CONFIG}) >  ${CONFIG}
fi
CACHESIZE=$(/usr/bin/jq -r .chromium.cachesize ${CONFIG})
if [ "$CACHESIZE" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "128" '.chromium.cachesize = $v' ${CONFIG}) >  ${CONFIG}
fi
KIOSKMODE=$(/usr/bin/jq -r .chromium.kiosk ${CONFIG})
if [ "$KIOSKMODE" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.chromium.kiosk = true' ${CONFIG}) >  ${CONFIG}
fi
MAXCACHE=$(/usr/bin/jq -r .spotify.maxcachesize ${CONFIG})
if [ "$MAXCACHE" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "1073741824" '.spotify.maxcachesize = $v' ${CONFIG}) >  ${CONFIG}
fi
CACHEPATH=$(/usr/bin/jq -r .spotify.cachepath ${CONFIG})
if [ "$CACHEPATH" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "/home/dietpi/.cache/spotifyd" '.spotify.cachepath = $v' ${CONFIG}) >  ${CONFIG}
fi
CACHESTATE=$(/usr/bin/jq -r .spotify.cachestate ${CONFIG})
if [ "$CACHESTATE" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.spotify.cachestate = true' ${CONFIG}) >  ${CONFIG}
fi

MQTTDEBUG=$(/usr/bin/jq -r .mqtt.debug ${CONFIG})
if [ "$MQTTDEBUG" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.mqtt.debug = false' ${CONFIG}) >  ${CONFIG}
fi
MQTTACTIVE=$(/usr/bin/jq -r .mqtt.active ${CONFIG})
if [ "$MQTTACTIVE" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.mqtt.active = false' ${CONFIG}) >  ${CONFIG}
fi
MQTTBROKER=$(/usr/bin/jq -r .mqtt.broker ${CONFIG})
if [ "$MQTTBROKER" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "mqtt-example-broker.com" '.mqtt.broker = $v' ${CONFIG}) >  ${CONFIG}
fi
MQTTPORT=$(/usr/bin/jq -r .mqtt.port ${CONFIG})
if [ "$MQTTPORT" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "1883" '.mqtt.port = $v' ${CONFIG}) >  ${CONFIG}
fi
MQTTTOPIC=$(/usr/bin/jq -r .mqtt.topic ${CONFIG})
if [ "$MQTTTOPIC" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "MuPiBox/Boxname" '.mqtt.topic = $v' ${CONFIG}) >  ${CONFIG}
fi
MQTTBOXNAME=$(/usr/bin/jq -r .mqtt.clientId ${CONFIG})
if [ "$MQTTBOXNAME" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "Boxname" '.mqtt.clientId = $v' ${CONFIG}) >  ${CONFIG}
fi
MQTTUSERNAME=$(/usr/bin/jq -r .mqtt.username ${CONFIG})
if [ "$MQTTUSERNAME" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "username" '.mqtt.username = $v' ${CONFIG}) >  ${CONFIG}
fi
MQTTPASSWORD=$(/usr/bin/jq -r .mqtt.password ${CONFIG})
if [ "$MQTTPASSWORD" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "password" '.mqtt.password = $v' ${CONFIG}) >  ${CONFIG}
fi
MQTTREFRESH=$(/usr/bin/jq -r .mqtt.refresh ${CONFIG})
if [ "$MQTTREFRESH" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "5" '.mqtt.refresh = $v' ${CONFIG}) >  ${CONFIG}
fi
MQTTREFRESHIDLE=$(/usr/bin/jq -r .mqtt.refreshIdle ${CONFIG})
if [ "$MQTTREFRESHIDLE" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "30" '.mqtt.refreshIdle = $v' ${CONFIG}) >  ${CONFIG}
fi
MQTTTIMEOUT=$(/usr/bin/jq -r .mqtt.timeout ${CONFIG})
if [ "$MQTTTIMEOUT" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "60" '.mqtt.timeout = $v' ${CONFIG}) >  ${CONFIG}
fi

HA_MQTT=$(/usr/bin/jq -r .mqtt.ha_topic ${CONFIG})
if [ "$HA_MQTT" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.mqtt.ha_active = false' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "homeassistant" '.mqtt.ha_topic = $v' ${CONFIG}) >  ${CONFIG}
fi

BATTERYCONFIG=$(/usr/bin/jq -r .mupihat.selected_battery ${CONFIG})
if [ "$BATTERYCONFIG" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "ENERpower 2S2P 10.000mAh" '.mupihat.selected_battery = $v' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq '. += {"mupihat": { "battery_types": [{ "name": "Ansmann 2S1P", "config": { "v_100": "8100", "v_75": "7800", "v_50": "7400", "v_25": "7000", "v_0": "6700", "th_warning": "7000", "th_shutdown": "6800" }}, { "name": "ENERpower 2S2P 10.000mAh", "config": {	"v_100": "8000", "v_75": "7700", "v_50": "7300", "v_25": "6900", "v_0": "6000", "th_warning": "6500", "th_shutdown": "6150" }}, { "name": "USB-C mode (no battery)", "config": { "v_100": "1", "v_75": "1", "v_50": "1", "v_25": "1", "v_0": "1", "th_warning": "0", "th_shutdown": "0"}}, { "name": "Custom", "config": { "v_100": "8100", "v_75": "7800", "v_50": "7400", "v_25": "7000", "v_0": "6700", "th_warning": "7000", "th_shutdown": "6800"}}], "ENERpower 2S2P 10.000mAh" }}' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq '.mupihat.hat_active = false' ${CONFIG}) >  ${CONFIG}
fi

LINES=$(/usr/bin/cat ${CONFIG} | grep lines)
if [[ -z ${LINES} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "lines" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi

HAT_ACTIVE=$(/usr/bin/jq -r .mupihat.hat_active ${CONFIG})
if [ "$HAT_ACTIVE" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.mupihat.hat_active = false' ${CONFIG}) >  ${CONFIG}
fi

FAN_ACTIVE=$(/usr/bin/jq -r .fan.fan_active ${CONFIG})
if [ "$FAN_ACTIVE" == "null" ]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.fan.fan_active = false' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq '.fan.fan_gpio = "13"' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq '.fan.fan_temp_100 = "75"' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq '.fan.fan_temp_75 = "65"' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq '.fan.fan_temp_50 = "55"' ${CONFIG}) >  ${CONFIG}
	/usr/bin/cat <<< $(/usr/bin/jq '.fan.fan_temp_25 = "45"' ${CONFIG}) >  ${CONFIG}
fi

FORMS=$(/usr/bin/cat ${CONFIG} | grep forms)
if [[ -z ${FORMS} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "forms" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi

COMIC=$(/usr/bin/cat ${CONFIG} | grep comic)
if [[ -z ${COMIC} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "comic" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi

MYSTIC=$(/usr/bin/cat ${CONFIG} | grep mystic)
if [[ -z ${MYSTIC} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq --arg v "mystic" '.mupibox.installedThemes? += [$v]' ${CONFIG}) >  ${CONFIG}
fi

RESUME=$(/usr/bin/cat ${CONFIG} | grep resume)
if [[ -z ${RESUME} ]]; then
	/usr/bin/cat <<< $(/usr/bin/jq '.mupibox.resume = 9' ${CONFIG}) >  ${CONFIG}
fi

#/usr/bin/cat <<< $(/usr/bin/jq '.mupibox.AudioDevices += [{"tname": "MAX98357A bcm2835-i2s-HiFi HiFi-0","ufname": "MAX98357A bcm2835-i2s-HiFi HiFi-0"},{"tname": "rpi-bcm2835-3.5mm","ufname": "Onboard 3.5mm output"},{"tname": "rpi-bcm2835-hdmi","ufname": "Onboard HDMI output"},{"tname": "hifiberry-amp","ufname": "HifiBerry AMP / AMP+"},{"tname": "hifiberry-dac","ufname": "HifiBerry DAC / MiniAmp"},{"tname": "hifiberry-dacplus","ufname": "HifiBerry DAC+ / DAC+ Pro / AMP2"},{"tname": "usb-dac","ufname": "Any USB Audio DAC (Auto detection)"}]' ${CONFIG}) >  ${CONFIG}
/usr/bin/cat <<< $(/usr/bin/jq '.mupibox.AudioDevices = [{"tname": "MAX98357A bcm2835-i2s-HiFi HiFi-0","ufname": "MAX98357A bcm2835-i2s-HiFi HiFi-0"},{"tname": "rpi-bcm2835-3.5mm","ufname": "Onboard 3.5mm output"},{"tname": "rpi-bcm2835-hdmi","ufname": "Onboard HDMI output"},{"tname": "allo-boss-dac-pcm512x-audio","ufname": "Allo Boss DAC"},{"tname": "allo-boss2-dac-audio","ufname": "Allo Boss2 DAC"},{"tname": "allo-digione","ufname": "Allo DigiOne"},{"tname": "allo-katana-dac-audio","ufname": "Allo Katana DAC"},{"tname": "allo-piano-dac-pcm512x-audio","ufname": "Allo Piano DAC"},{"tname": "allo-piano-dac-plus-pcm512x-audio","ufname": "Allo Piano DAC 2.1"},{"tname": "applepi-dac","ufname": "ApplePi DAC (Orchard Audio)"},{"tname": "dionaudio-loco","ufname": "Dion Audio LOCO"},{"tname": "dionaudio-loco-v2","ufname": "Dion Audio LOCO V2"},{"tname": "googlevoicehat-soundcard","ufname": "Google AIY voice kit"},{"tname": "hifiberry-amp","ufname": "HifiBerry AMP / AMP+"},{"tname": "hifiberry-dac","ufname": "HifiBerry DAC / MiniAmp"},{"tname": "hifiberry-dacplus","ufname": "HifiBerry DAC+ / DAC+ Pro / AMP2"},{"tname": "hifiberry-dacplusadc","ufname": "HifiBerry DAC+ADC"},{"tname": "hifiberry-dacplusadcpro","ufname": "HifiBerry DAC+ADC Pro"},{"tname": "hifiberry-dacplusdsp","ufname": "HifiBerry DAC+DSP"},{"tname": "hifiberry-dacplushd","ufname": "HifiBerry DAC+ HD"},{"tname": "hifiberry-digi","ufname": "HifiBerry Digi / Digi+"},{"tname": "hifiberry-digi-pro","ufname": "HifiBerry Digi+ Pro"},{"tname": "i-sabre-q2m","ufname": "AudioPhonics I-Sabre ES9028Q2M / ES9038Q2M"},{"tname": "iqaudio-codec","ufname": "IQaudIO Pi-Codec HAT"},{"tname": "iqaudio-dac","ufname": "IQaudIO DAC audio card"},{"tname": "iqaudio-dacplus","ufname": "Pi-DAC+, Pi-DACZero, Pi-DAC+ Pro, Pi-DigiAMP+"},{"tname": "iqaudio-digi-wm8804-audio","ufname": "Pi-Digi+"},{"tname": "usb-dac","ufname": "Any USB Audio DAC (Auto detection)"}]' ${CONFIG}) >  ${CONFIG}
