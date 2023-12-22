# Create image

## Final setup steps

1. Create File in boot: ```sudo touch /boot/mupi.install```
1. Delete Windows directory: ```sudo rm -R /boot/System\ Volume\ Information/```
1. Set Swap to auto: ```sudo /boot/dietpi/func/dietpi-set_swapfile 1```
1. Delete autosetup.log: ```sudo rm /boot/autosetup.log```
1. Delete Wifi: ```sudo dietpi-wifidb```
1. Control: ```sudo cat /etc/wpa_supplicant/wpa_supplicant.conf```
1. Clean dietpi-wifi: ``````
1. Delete history: ```history -c```
1. Shutdown: ```sudo shutdown -h now && history -c```

## Create image

### OS Linux

#### Prepare Linux

1. Get pishrink:
```wget https://raw.githubusercontent.com/Drewsif/PiShrink/master/pishrink.sh && chmod +x pishrink.sh```
1. Install gparted and pigz:
```apt install gparted pigz pv```

#### Create image

1. Find USB:
```lsblk -e 1,7 -o NAME,FSTYPE,SIZE,VENDOR,MOUNTPOINT```
1. Mount: ```mkdir /mnt/pi_usb && mount /dev/sdc1 /mnt/pi_usb```
1. Check if USB is mounted ```findmnt -lo source,target,fstype,label,used,size -t ext4,vfat```
1. Create Image (Example for 64GB USB-Drive):
```dd if=/dev/sdc | pv -s 64G | dd of=mupibox_3.1.7-dietpi_bookworm_V8_64b.img```
1. Shrink Image:
```pishrink.sh -a -Z mupibox.img```

#### Another Shrink

1. 7zip
1. Compress Level: Ultra
1. Method: LZMA2
1. Dictonary Size: 256MB