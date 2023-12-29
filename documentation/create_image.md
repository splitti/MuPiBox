# Create image

## Final setup steps

1. Check crontab: ```crontab -l```
1. Check pm2 status: ```pm2 status```
1. Check add_wifi.json ```sudo cat /boot/add_wifi.json```
1. Create File in boot: ```touch /home/dietpi/.mupi.install```
1. Delete Windows directory: ```sudo rm -R /boot/System\ Volume\ Information/```
1. Set Swap to auto: ```sudo /boot/dietpi/func/dietpi-set_swapfile 0```
1. Disable Wait Network: ```sudo /boot/dietpi/func/dietpi-set_software boot_wait_for_network 0```
1. Delete autosetup.log: ```sudo rm /boot/autosetup.log```
1. Delete Wifi: ```sudo dietpi-wifidb```
1. Control and del country: ```sudo cat /etc/wpa_supplicant/wpa_supplicant.conf```
1. Resize after reboot: ```sudo systemctl enable dietpi-fs_partition_resize```
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
```dd if=/dev/sdc | pv -s 59.8G | dd of=mupibox-3.1.9_dietpi-bookworm-V7.img```
1. Shrink Image:
```./pishrink.sh -a -Z mupibox-3.1.9_dietpi-bookworm-V7.img```

#### Another Shrink

1. 7zip
1. Compress Level: Ultra
1. Method: LZMA2
1. Dictonary Size: 256MB