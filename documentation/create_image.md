# Create image

## Final setup steps

1. Set Swap to auto: ```sudo /boot/dietpi/func/dietpi-set_swapfile 1```
1. Delete autosetup.log: ```sudo rm autosetup.log```
1. Delete Wifi: ```dietpi-config```
1. Control: ```sudo cat /etc/wpa_supplicant/wpa_supplicant.conf```
1. Delete history: ```history -c```
1. Shutdown: ```sudo shutdown -h now && history -c```

## Create image

### OS Linux

#### Prepare Linux

1. Get pishrink:
```wget https://raw.githubusercontent.com/Drewsif/PiShrink/master/pishrink.sh```
```chmod +x pishrink.sh```
1. Install gparted and pigz:
```sudo apt install gparted pigz```

#### Create image

1. Find USB:
```sudo lsblk -e 1,7 -o NAME,FSTYPE,SIZE,VENDOR,MOUNTPOINT```
1. Check if USB is mounted
1. Create Image:
```sudo dd if=/dev/sdc of=mupibox.img status=progess```
1. Shrink Image:
```sudo pishrink.sh ~/<IMAGE>.img```

