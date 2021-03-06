#!/bin/bash
#

#https://raw.githubusercontent.com/splitti/MuPiBox/main
#SRC="https://mupibox.de/version/latest"
CONFIG="/etc/mupibox/mupiboxconfig.json"

# 1.0.8
/usr/bin/cat <<< $(/usr/bin/jq 'del(.mupibox.googlettslanguages)' ${CONFIG}) > ${CONFIG}
/usr/bin/cat <<< $(/usr/bin/jq 'del(.mupibox.mediaCheckTimer)' ${CONFIG}) > ${CONFIG}
/usr/bin/cat <<< $(/usr/bin/jq 'del(.mupibox.AudioDevices)' ${CONFIG}) > ${CONFIG}

# 1.0.8
/usr/bin/cat <<< $(/usr/bin/jq '.mupibox.googlettslanguages += [{"iso639-1": "ar", "Language": "Arabic"},{"iso639-1": "zh", "Language": "Chinese"},{"iso639-1": "cs","Language": "Czech"},{"iso639-1": "da","Language": "Danish"},{"iso639-1": "nl","Language": "Dutch"},{"iso639-1": "en","Language": "English"},{"iso639-1": "fi","Language": "Finnish"},{"iso639-1": "fr","Language": "French"},{"iso639-1": "de","Language": "German"},{"iso639-1": "el","Language": "Greek"},{"iso639-1": "hi","Language": "Hindi"},{"iso639-1": "it","Language": "Italian"},{"iso639-1": "ja","Language": "Japanese"},{"iso639-1": "no","Language": "Norwegian"},{"iso639-1": "pl","Language": "Polish"},{"iso639-1": "pt","Language": "Portuguese"},{"iso639-1": "ru","Language": "Russian"},{"iso639-1": "es","Language": "Spanish, Castilian"},{"iso639-1": "sv","Language": "Swedish"},{"iso639-1": "tr","Language": "Turkish"},{"iso639-1": "uk","Language": "Ukrainian"}]' ${CONFIG}) >  ${CONFIG}
sleep 1
/usr/bin/cat <<< $(/usr/bin/jq '.mupibox.AudioDevices += [{"tname": "rpi-bcm2835-3.5mm","ufname": "Onboard 3.5mm output"},{"tname": "rpi-bcm2835-hdmi","ufname": "Onboard HDMI output"},{"tname": "hifiberry-amp","ufname": "HifiBerry AMP / AMP+"},{"tname": "hifiberry-dac","ufname": "HifiBerry DAC / MiniAmp"},{"tname": "hifiberry-dacplus","ufname": "HifiBerry DAC+ / DAC+ Pro / AMP2"},{"tname": "usb-dac","ufname": "Any USB Audio DAC (Auto detection)"}]' ${CONFIG}) >  ${CONFIG}

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
