# Create image

## Final setup steps

1. Set Swap to auto: ```sudo /boot/dietpi/func/dietpi-set_swapfile 1```
1. Delete autosetup.log: ```sudo rm autosetup.log```
1. Delete Wifi: ```dietpi-config```
1. Control: ```sudo cat /etc/wpa_supplicant/wpa_supplicant.conf```
1. Delete history: ```history -c```
1. Shutdown: ```sudo shutdown -h now && history -c```

## Create image
