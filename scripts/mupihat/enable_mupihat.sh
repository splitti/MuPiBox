#!/bin/bash

sudo sed -zi '/#--------MuPiHAT--------/!s/$/\n#--------MuPiHAT--------/' /boot/config.txt
sudo sed -zi '/dtparam=i2c_arm=on/!s/$/\ndtparam=i2c_arm=on/' /boot/config.txt
sudo sed -zi '/dtparam=i2c1=on/!s/$/\ndtparam=i2c1=on/' /boot/config.txt
sudo sed -zi '/dtparam=i2c_arm_baudrate=50000/!s/$/\ndtparam=i2c_arm_baudrate=50000/' /boot/config.txt
sudo sed -zi '/dtoverlay=max98357a,sdmode-pin=16/!s/$/\ndtoverlay=max98357a,sdmode-pin=16/' /boot/config.txt
sudo sed -zi '/dtoverlay=i2s-mmap/!s/$/\ndtoverlay=i2s-mmap/' /boot/config.txt
sudo sed -zi '/i2c-dev/!s/$/\ni2c-dev/' /etc/modules
sudo sed -zi '/i2c-bcm2708/!s/$/\ni2c-bcm2708/' /etc/modules
sudo modprobe i2c-dev
sudo modprobe i2c-bcm2708
sudo systemctl enable mupi_hat.service
sudo service mupi_hat start
sudo systemctl enable mupi_hat_control.service
sudo service mupi_hat_control start
sudo echo "/boot/dietpi/func/dietpi-set_hardware soundcard 'MAX98357A bcm2835-i2s-HiFi HiFi-0' && reboot" | sudo tee /boot/run_once.sh
