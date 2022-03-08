#!/bin/bash
#

sudo /usr/bin/rm /tmp/bt_scan
sudo /usr/bin/touch /tmp/bt_scan
sudo /usr/bin/chmod 777 /tmp/bt_scan
sudo /usr/bin/hcitool scan > /tmp/bt_scan
#sudo /usr/bin/tail -n +2 /tmp/scan > /tmp/bt_scan

/usr/bin/cat /tmp/bt_scan
