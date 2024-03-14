#!/usr/bin/env python3
"""
License
-------
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>
"""

__author__ = "Olaf Splitt"
__license__ = "GPLv3"
__version__ = "1.0.0"
__email__ = "splitti@mupibox.de"
__status__ = "stable"

import alsaaudio
import base64
import datetime
import fcntl
import json
import netifaces as ni
import os
import paho.mqtt.client as mqtt
import platform
import re
import socket
import struct
import subprocess
import requests
import time

pid = os.getpid()
with open("/run/mupi_mqtt.pid", "w") as pid_file:
    pid_file.write(str(pid))

config = "/etc/mupibox/mupiboxconfig.json"
playerstate = "/tmp/playerstate"
fan = "/tmp/fan.json"
mupihat = "/tmp/mupihat.json"
data = "/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"

# Load MQTT configuration from JSON file
with open(config) as file:
    jsonconfig = json.load(file)

previous_content_local = ""
previous_content_state = ""

# Extract MQTT configuration parameters
mqtt_name = jsonconfig['mqtt']['name']
mqtt_topic = jsonconfig['mqtt']['topic'] + "/" + jsonconfig['mqtt']['clientId']
mqtt_clientId = jsonconfig['mqtt']['clientId']
mqtt_active = jsonconfig['mqtt']['active']
mqtt_broker = jsonconfig['mqtt']['broker']
mqtt_port = int(jsonconfig['mqtt']['port'])
mqtt_username = jsonconfig['mqtt']['username']
mqtt_password = jsonconfig['mqtt']['password']
mqtt_refresh = int(jsonconfig['mqtt']['refresh'])
mqtt_refreshIdle = int(jsonconfig['mqtt']['refreshIdle'])
mqtt_timeout = int(jsonconfig['mqtt']['timeout'])
mqtt_debug = jsonconfig['mqtt']['debug']
mqtt_ha_topic = jsonconfig['mqtt']['ha_topic']
mqtt_ha_active = jsonconfig['mqtt']['ha_active']
mupi_version = jsonconfig['mupibox']['version']
mupi_host = jsonconfig['mupibox']['host']


def mqtt_publish_ha():
    # Publish image
    image_data = {
        "name": "Screenshot",
        "image_topic": mqtt_topic + '/' + mqtt_clientId + '/screenshot',
        "content_type": "image/png",
        "image_encoding": "b64",
        "unique_id": mqtt_clientId + '_mupibox_screenshot',
        "device_class": "image",
        "icon": "mdi:image",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/image/" + mqtt_clientId + "_state/config", json.dumps(image_data), qos=0, retain=True)


    # Publish on/off state entity
    state_info = {
        "name": "State",
        "payload_on": "online",
        "payload_off": "offline",
        "expire_after": "300",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/state',
        "unique_id": mqtt_clientId + '_mupibox_state',
        "device_class": "connectivity",
        "icon": "mdi:power",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/binary_sensor/" + mqtt_clientId + "_state/config", json.dumps(state_info), qos=0, retain=True)

    # Publish version
    play_state = {
        "name": "Current playback",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/play_text',
        "unique_id": mqtt_clientId + '_mupibox_play_text',
        "icon": "mdi:playlist-play",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_play_text/config", json.dumps(play_state), qos=0, retain=False)

    # Publish version
    version_info = {
        "name": "Version",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/version',
        "unique_id": mqtt_clientId + '_mupibox_version',
        "icon": "mdi:information",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_version/config", json.dumps(version_info), qos=0, retain=True)


    # Publish OS Info
    os_info = {
        "name": "Operating system",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/os',
        "unique_id": mqtt_clientId + '_mupibox_os',
        "icon": "mdi:penguin",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_os/config", json.dumps(os_info), qos=0, retain=True)

    # Publish Raspberry Info
    raspi_info = {
        "name": "Raspberry Pi",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/raspi',
        "unique_id": mqtt_clientId + '_mupibox_raspi',
        "icon": "mdi:raspberry-pi",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_raspi/config", json.dumps(raspi_info), qos=0, retain=True)


    # Publish CPU Temperature state entity
    temp_info = {
        "name": "CPU temperature",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/temperature',
        "unique_id": mqtt_clientId + '_mupibox_temperature',
        "device_class": "temperature",
        "unit_of_measurement": "°C",
        "suggested_display_precision": "1",
        "icon": "mdi:thermometer",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_temperature/config", json.dumps(temp_info), qos=0, retain=False)

    # Publish CPU Temperature state entity
    fan_info = {
        "name": "Fan speed",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/fan',
        "unique_id": mqtt_clientId + '_mupibox_fan',
        "unit_of_measurement": "%",
        "icon": "mdi:fan",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/fan/" + mqtt_clientId + "_fan/config", json.dumps(fan_info), qos=0, retain=False)


    # Publish Hostname
    hostname_info = {
        "name": "Hostname",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/hostname',
        "unique_id": mqtt_clientId + '_mupibox_hostname',
        "icon": "mdi:dns",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_hostname/config", json.dumps(hostname_info), qos=0, retain=True)

    # Publish IP
    ip_info = {
        "name": "IP-Address",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/ip',
        "unique_id": mqtt_clientId + '_mupibox_ip',
        "icon": "mdi:ip",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_ip/config", json.dumps(ip_info), qos=0, retain=True)



    # Publish Play Button
    play_button = {
        "name": "Play",
        "availability_topic": mqtt_topic + '/' + mqtt_clientId + '/state',
        "unique_id": mqtt_clientId + '_mupibox_play',
        "command_template": "play",
        "command_topic": mqtt_topic + '/' + mqtt_clientId + '/play/set',
        "icon": "mdi:play",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/button/" + mqtt_clientId + "_play/config", json.dumps(play_button), qos=0, retain=False)

    # Publish Pause Button
    pause_button = {
        "name": "Pause",
        "availability_topic": mqtt_topic + '/' + mqtt_clientId + '/state',
        "unique_id": mqtt_clientId + '_mupibox_pause',
        "command_template": "pause",
        "command_topic": mqtt_topic + '/' + mqtt_clientId + '/pause/set',
        "icon": "mdi:pause",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/button/" + mqtt_clientId + "_pause/config", json.dumps(pause_button), qos=0, retain=False)

    # Publish Screenshot Button
    take_screenshot = {
        "name": "Take screenshot",
        "availability_topic": mqtt_topic + '/' + mqtt_clientId + '/state',
        "unique_id": mqtt_clientId + '_mupibox_take_screenshot',
        "command_template": "take_screenshot",
        "command_topic": mqtt_topic + '/' + mqtt_clientId + '/take_screenshot/set',
        "icon": "mdi:monitor-screenshot",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/button/" + mqtt_clientId + "_take_screenshot/config", json.dumps(take_screenshot), qos=0, retain=False)

    # Publish Shutdown Button
    power_button = {
        "name": "Shutdown",
        "availability_topic": mqtt_topic + '/' + mqtt_clientId + '/state',
        "unique_id": mqtt_clientId + '_mupibox_power',
        "command_template": "shutdown",
        "command_topic": mqtt_topic + '/' + mqtt_clientId + '/power/set',
        "icon": "mdi:power",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/button/" + mqtt_clientId + "_power/config", json.dumps(power_button), qos=0, retain=False)

    reboot_button = {
        "name": "Reboot",
        "availability_topic": mqtt_topic + '/' + mqtt_clientId + '/state',
        "command_template": "reboot",
        "command_topic": mqtt_topic + '/' + mqtt_clientId + '/reboot/set',
        "unique_id": mqtt_clientId + '_mupibox_reboot',
        "topic": mqtt_topic + '/' + mqtt_clientId + '/state',
        "icon": "mdi:power",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/button/" + mqtt_clientId + "_reboot/config", json.dumps(reboot_button), qos=0, retain=False)


    # Publish Architecture
    architecture_info = {
        "name": "Architecture",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/architecture',
        "unique_id": mqtt_clientId + '_mupibox_architecture',
        "icon": "mdi:cpu-64-bit",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_architecture/config", json.dumps(architecture_info), qos=0, retain=False)

    # Publish MAC
    mac_info = {
        "name": "MAC-Address",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/mac',
        "unique_id": mqtt_clientId + '_mupibox_mac',
        "icon": "mdi:network-pos",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_mac/config", json.dumps(mac_info), qos=0, retain=True)

    # Publish Volume
    volume_info = {
        "name": "Volume",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/volume',
        "unique_id": mqtt_clientId + '_mupibox_volume',
        "command_topic": mqtt_topic + '/' + mqtt_clientId + '/volume/set',
        "availability_topic": mqtt_topic + '/' + mqtt_clientId + '/state',
        "unit_of_measurement": "%",
        "value_template": "{{ value|int }}",
        "icon": "mdi:volume-high",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/number/" + mqtt_clientId + "_volume/config", json.dumps(volume_info), qos=0)

    # Publish SSID
    ssid_info = {
        "name": "WIFI SSID",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/ssid',
        "unique_id": mqtt_clientId + '_mupibox_ssid',
        "icon": "mdi:wifi",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_ssid/config", json.dumps(ssid_info), qos=0, retain=False)

    # Publish WIFI SIGNAL STRENGTH
    signal_strength_info = {
        "name": "WIFI signal strength",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/signal_strength',
        "unique_id": mqtt_clientId + '_mupibox_signal_strength',
        "icon": "mdi:wifi",
        "unit_of_measurement": "dBm",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_signal_strength/config", json.dumps(signal_strength_info), qos=0, retain=False)

    # Publish WIFI SIGNAL QUALITY
    signal_quality_info = {
        "name": "WIFI signal quality",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/signal_quality',
        "unique_id": mqtt_clientId + '_mupibox_signal_quality',
        "icon": "mdi:wifi",
        "unit_of_measurement": "%",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_signal_quality/config", json.dumps(signal_quality_info), qos=0, retain=False)

    # Publish HAT bat_type
    bat_type_info = {
        "name": "HAT battery type",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/bat_type',
        "unique_id": mqtt_clientId + '_mupibox_bat_type',
        "icon": "mdi:battery",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_bat_type/config", json.dumps(bat_type_info), qos=0)


    # Publish HAT bat_stat
    bat_stat_info = {
        "name": "HAT battery status",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/bat_stat',
        "unique_id": mqtt_clientId + '_mupibox_bat_stat',
        "icon": "mdi:battery",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_bat_stat/config", json.dumps(bat_stat_info), qos=0)


    # Publish HAT bat_soc
    bat_soc_info = {
        "name": "HAT battery level",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/bat_soc',
        "unique_id": mqtt_clientId + '_mupibox_bat_soc',
        "device_class": "battery",
        "icon": "mdi:battery",
        "unit_of_measurement": "%",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_bat_soc/config", json.dumps(bat_soc_info), qos=0, retain=True)


    hat_temp_info = {
        "name": "HAT temperature",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/hat_temp',
        "unique_id": mqtt_clientId + '_mupibox_hat_temp',
        "command_topic": mqtt_topic + '/' + mqtt_clientId + '/hat_temp/set',
        "device_class": "temperature",
        "unit_of_measurement": "°C",
        "suggested_display_precision": "1",
        "icon": "mdi:thermometer",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_hat_temp/config", json.dumps(hat_temp_info), qos=0)

    BatteryConnected_info = {
        "name": "HAT Battery connected",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/battery_connected',
        "unique_id": mqtt_clientId + '_mupibox_battery_connected',
        "value_template": "{{ value|int }}",
        "icon": "mdi:battery",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_battery_connected/config", json.dumps(BatteryConnected_info), qos=0)

    ibus_info = {
        "name": "HAT Ibus (charger)",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/ibus',
        "unique_id": mqtt_clientId + '_mupibox_ibus',
        "unit_of_measurement": "mA",
        "value_template": "{{ value|int }}",
        "icon": "mdi:usb-c-port",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_ibus/config", json.dumps(ibus_info), qos=0)


    ibat_info = {
        "name": "HAT Ibat (charge to battery)",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/ibat',
        "unique_id": mqtt_clientId + '_mupibox_ibat',
        "command_topic": mqtt_topic + '/' + mqtt_clientId + '/ibat/set',
        "unit_of_measurement": "mA",
        "value_template": "{{ value|int }}",
        "icon": "mdi:battery-charging-50",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_ibat/config", json.dumps(ibat_info), qos=0)


    vbus_info = {
        "name": "HAT Vbus (charger)",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/vbus',
        "unique_id": mqtt_clientId + '_mupibox_vbus',
        "command_topic": mqtt_topic + '/' + mqtt_clientId + '/vbus/set',
        "unit_of_measurement": "mV",
        "value_template": "{{ value|int }}",
        "icon": "mdi:usb-c-port",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_vbus/config", json.dumps(vbus_info), qos=0)


    # Publish HAT vbat
    vbat_info = {
        "name": "HAT Vbat (battery)",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/vbat',
        "unique_id": mqtt_clientId + '_mupibox_vbat',
        "command_topic": mqtt_topic + '/' + mqtt_clientId + '/vbat/set',
        "unit_of_measurement": "mV",
        "value_template": "{{ value|int }}",
        "icon": "mdi:battery",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_vbat/config", json.dumps(vbat_info), qos=0)


    # Publish HAT charger status
    charger_status_info = {
        "name": "HAT charger status",
        "state_topic": mqtt_topic + '/' + mqtt_clientId + '/charger_status',
        "unique_id": mqtt_clientId + '_mupibox_charger_status',
        "icon": "mdi:battery",
        "platform": "mqtt",
        "device": {
            "identifiers": mqtt_clientId + "_mupibox",
            "name": mqtt_name,
            "manufacturer": "MuPiBox.de",
            "model": "Your MuPiBox: " + mupi_host,
            "sw_version": mupi_version,
            "configuration_url":"http://" + mupi_host
        }
    }
    client.publish(mqtt_ha_topic + "/sensor/" + mqtt_clientId + "_charger_status/config", json.dumps(charger_status_info), qos=0)



def get_ip_address(interface):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        ip_address = socket.inet_ntoa(fcntl.ioctl(
            s.fileno(),
            0x8915,  # SIOCGIFADDR
            struct.pack('256s', interface[:15].encode())
        )[20:24])
        return ip_address
    except Exception as e:
        print("Exception: ", e)
        return None

def mqtt_systeminfo():
    with open('/etc/os-release', 'r') as file:
        os_release_content = file.read()
    match = re.search(r'PRETTY_NAME="(.+?)"', os_release_content)
    if match:
        pretty_name = match.group(1)
        os_name = pretty_name.split('"')[-1]
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/os', os_name, qos=0, retain=False)
    else:
        print("PRETTY_NAME not found in /etc/os-release")
        
    raspi = subprocess.check_output(["cat", "/sys/firmware/devicetree/base/model"]).decode("utf-8")
    client.publish(mqtt_topic + '/' + mqtt_clientId + '/raspi', raspi, qos=0, retain=False)
    hostname = subprocess.check_output(["hostname"]).decode("utf-8")
    client.publish(mqtt_topic + '/' + mqtt_clientId + '/hostname', hostname, qos=0, retain=False)
    ip = get_ip_address('wlan0')
    client.publish(mqtt_topic + '/' + mqtt_clientId + '/ip', ip, qos=0, retain=False)
    architecture = subprocess.check_output(["uname", "-m"]).decode("utf-8")
    client.publish(mqtt_topic + '/' + mqtt_clientId + '/architecture', architecture, qos=0, retain=False)
    client.publish(mqtt_topic + '/' + mqtt_clientId + '/mac', get_mac_address('wlan0'), qos=0, retain=False)
    client.publish(mqtt_topic + '/' + mqtt_clientId + '/version', mupi_version, qos=0)  

# Callback function for when the client receives a CONNACK response from the server.
def on_connect(client, userdata, flags, rc):
    print("Connected to MQTT broker with result code: " + str(rc))

# Callback function for when the client is disconnected from the broker
def on_disconnect(client, userdata, rc):
    print("Disconnected from MQTT broker with result code: " + str(rc))
    # Send "off" message to device topic on disconnect
    client.publish(mqtt_topic + '/' + mqtt_clientId + '/state', "offline", qos=0)
    client.publish(mqtt_topic + '/' + mqtt_clientId + '/power', "off", qos=0)
    client.publish(mqtt_topic + '/' + mqtt_clientId + '/reboot', "off", qos=0)


def playback_info():
    url = 'http://127.0.0.1:5005/state'
    state = requests.get(url).json()
    return state

def player_active():
    output = subprocess.check_output(["head", "-n1", playerstate], universal_newlines=True)
    if output.strip() == "play":
        return True
    else:
        return False

def get_cputemp():
    cpu_temp = subprocess.check_output(["vcgencmd", "measure_temp"]).decode("utf-8")
    temp = cpu_temp.strip().split('=')[1].strip("'C") #.replace('.', ',')
    return temp

def get_wifi():
    #ssid = subprocess.check_output(["iwgetid", "-r"]).decode("utf-8")
    try:
        result = subprocess.check_output(['iwconfig', 'wlan0'], universal_newlines=True)
        ssid_match = re.search(r'ESSID:"(.+?)"', result)
        ssid = ssid_match.group(1) if ssid_match else None
        signal_strength_match = re.search(r'Signal level=(-\d+)', result)
        signal_strength = int(signal_strength_match.group(1)) if signal_strength_match else None
        signal_quality = int(subprocess.check_output("sudo iwconfig wlan0 | awk '/Link Quality/{split($2,a,\"=|/\");print int((a[2]/a[3])*100)\"\"}' | tr -d '%'", shell=True))
        
        return ssid, signal_strength, signal_quality
    except subprocess.CalledProcessError as e:
        print("Command error iwconfig:", e)
        return None, None, None

def get_volume():
    mixer = alsaaudio.Mixer()
    volume = mixer.getvolume()[0]
    return volume

def get_mac_address(interface):
    try:
        mac = ni.ifaddresses(interface)[ni.AF_LINK][0]['addr']
        return mac
    except ValueError:
        return None    

def get_fan():
    try:
        with open(fan) as file:
            fan_data = json.load(file)
        return int(fan_data["speed"])
    except:
        return None

def get_mupihat():
    try:
        with open(mupihat) as file:
            mupihat_data = json.load(file)
        return mupihat_data["Charger_Status"], mupihat_data["Vbat"], mupihat_data["Vbus"], mupihat_data["Ibat"], mupihat_data["IBus"], mupihat_data["Temp"], mupihat_data["Bat_SOC"].replace("%", ""), mupihat_data["Bat_Stat"], mupihat_data["Bat_Type"], mupihat_data["BatteryConnected"]
    except:
        return None, None, None, None, None, None, None, None, None, None

def send_play_information():
    try:
        global previous_content_local, previous_content_state, previous_content_episode
        url = 'http://127.0.0.1:5005/local'
        local = requests.get(url).json()
        url = 'http://127.0.0.1:5005/state'
        state = requests.get(url).json()
        url = 'http://127.0.0.1:5005/episode'
        episode = requests.get(url).json()
        play_text = "<idle>"

        if local and state:
            if local != previous_content_local or state != previous_content_state:
                if local['currentPlayer'] == "spotify":
                    #currently_playing_type = state['currently_playing_type']
                    if state['currently_playing_type'] == 'episode':
                        url = 'http://127.0.0.1:5005/episode'
                        episode = requests.get(url).json()
                        play_text = episode['show']['name'] + "\n" + episode['name']
                    else:
                        play_text = state['item']['album']['name'] + "\n" + state['item']['name'] + "\nTrack: " + str(state['item']['track_number']) + "/" + str(state['item']['album']['total_tracks'])
                elif local['currentType'] == "local" and local['playing']:
                    play_text = local['album'] + "\n" + local['currentTrackname'] + "\nTrack: " + str(local['currentTracknr']) + "/" + str(local['totalTracks'])
                elif local['currentType'] == "radio" and local['playing']:
                    with open(data) as f:
                        data_json = json.load(f)
                    for media in data_json:
                        if media.get('id') == local['currentTrackname']:
                            play_text = media.get('title')
                            break
                previous_content_local = local
                previous_content_state = state
                screenshot = get_screenshot()
                client.publish(mqtt_topic + '/' + mqtt_clientId + '/screenshot', screenshot, qos=0)
                client.publish(mqtt_topic + '/' + mqtt_clientId + '/play_text', play_text, qos=0)
    except Exception as e:
        print("Exception: ", e)
 #       return None, None, None, None, None, None, None, None, None, None

def get_screenshot():   
    try:
        with open("/tmp/mqtt_screen.png", "rb") as f:
            img_bytes = f.read()
        img_base64 = base64.b64encode(img_bytes).decode("utf-8")
        return img_base64        
    except Exception as e:
        print("Exception: ", e)
        return null


def on_message(client, flags, msg):
    #print("Topic: " + msg.topic)
    #print("Message: " + str(msg.payload.decode("utf-8")))
    if msg.topic == mqtt_topic + '/' + mqtt_clientId + '/reboot/set' and str(msg.payload.decode("utf-8")) == "reboot":
        print("Button: reboot")
        os.system("reboot")
    if msg.topic == mqtt_topic + '/' + mqtt_clientId + '/power/set' and str(msg.payload.decode("utf-8")) == "shutdown":
        print("Button: shutdown")
        os.system("/usr/local/bin/mupibox/./mupi_shutdown.sh")
        os.system("poweroff")
    if msg.topic == mqtt_topic + '/' + mqtt_clientId + '/volume/set':
        print("Volume: " + msg.payload.decode("utf-8") + "%")
        os.system("/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ " + msg.payload.decode("utf-8") + "%")
    if msg.topic == mqtt_topic + '/' + mqtt_clientId + '/pause/set' and str(msg.payload.decode("utf-8")) == "pause":
        print("Button: pause")
        url = 'http://' + jsonconfig['mupibox']['host'] + ':5005/pause'
        requests.get(url)
    if msg.topic == mqtt_topic + '/' + mqtt_clientId + '/play/set' and str(msg.payload.decode("utf-8")) == "play":
        print("Button: play")
        url = 'http://' + jsonconfig['mupibox']['host'] + ':5005/play'
        requests.get(url)
    if msg.topic == mqtt_topic + '/' + mqtt_clientId + '/take_screenshot/set' and str(msg.payload.decode("utf-8")) == "take_screenshot":
        screenshot = get_screenshot()
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/screenshot', screenshot, qos=0)


###############################################################################################################

# Create an MQTT client instance
client = mqtt.Client()

# Set the username and password for the MQTT connection if they are provided
if mqtt_username and mqtt_password:
    client.username_pw_set(mqtt_username, mqtt_password)

# Set the callback functions
client.on_connect = on_connect
client.on_disconnect = on_disconnect
client.on_message = on_message
#mqtt_topics = (mqtt_topic + '/' + mqtt_clientId + '/'), (mqtt_ha_topic + "/switch/" + mqtt_clientId + "_state/")

# Connect to the MQTT broker
client.connect(mqtt_broker, mqtt_port, mqtt_timeout)
client.subscribe(mqtt_topic + '/' + mqtt_clientId + '/power/set')
client.subscribe(mqtt_topic + '/' + mqtt_clientId + '/volume/set')
client.subscribe(mqtt_topic + '/' + mqtt_clientId + '/reboot/set')
client.subscribe(mqtt_topic + '/' + mqtt_clientId + '/pause/set')
client.subscribe(mqtt_topic + '/' + mqtt_clientId + '/play/set')

# Start the MQTT loop
client.loop_start()
if mqtt_ha_active:
    mqtt_publish_ha()
    time.sleep(2)
mqtt_systeminfo()
client.publish(mqtt_topic + '/' + mqtt_clientId + '/state', "online", qos=0)
client.publish(mqtt_topic + '/' + mqtt_clientId + '/power', "on", qos=0)
client.publish(mqtt_topic + '/' + mqtt_clientId + '/reboot', "off", qos=0)

try:
    while True:
        ssid, signal_strength, signal_quality = get_wifi()
        charger_status, vbat, vbus, ibat, ibus, temp, bat_soc, bat_stat, bat_type, battery_connected = get_mupihat()
        
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/state', "online", qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/temperature', float(get_cputemp()), qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/volume', int(get_volume()), qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/ssid', ssid, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/signal_strength', signal_strength, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/signal_quality', signal_quality, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/fan', get_fan(), qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/charger_status', charger_status, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/vbat', vbat, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/vbus', vbus, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/ibat', ibat, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/ibus', ibus, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/hat_temp', temp, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/bat_soc', bat_soc, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/bat_stat', bat_stat, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/bat_type', bat_type, qos=0)
        client.publish(mqtt_topic + '/' + mqtt_clientId + '/battery_connected', battery_connected, qos=0)
        send_play_information()

        subprocess.run(["sudo", "rm", "/tmp/mqtt_screen.png"])
        subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/mqtt_screen.png"])

        if player_active():
            sleeptime = mqtt_refresh
            test = playback_info()
        else:
            sleeptime = mqtt_refreshIdle
        time.sleep(sleeptime)
except KeyboardInterrupt:
    # Stop the MQTT loop and clean up
    client.loop_stop()
    # Send "off" message to device topic on script exit
    client.publish(mqtt_topic + '/' + mqtt_clientId + '/state', "offline", qos=0)
