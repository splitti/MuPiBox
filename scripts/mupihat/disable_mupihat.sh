#!/bin/bash

sudo service mupi_hat_control stop
sudo systemctl disable mupi_hat_control.service
sudo service mupi_hat stop
sudo systemctl disable mupi_hat.service
sudo modprobe -r i2c-dev
sudo modprobe -r i2c-bcm2708
sudo sed -zi '/#--------MuPiHAT--------/!s/$/\n#--------MuPiHAT--------/' /boot/config.txt
sudo sed -zi '/dtparam=i2c_arm=on/!s/$/\ndtparam=i2c_arm=on/' /boot/config.txt
sudo sed -zi '/dtparam=i2c1=on/!s/$/\ndtparam=i2c1=on/' /boot/config.txt
sudo sed -zi '/dtparam=i2c_arm_baudrate=50000/!s/$/\ndtparam=i2c_arm_baudrate=50000/' /boot/config.txt
sudo sed -zi '/dtoverlay=max98357a,sdmode-pin=16/!s/$/\ndtoverlay=max98357a,sdmode-pin=16/' /boot/config.txt
sudo sed -zi '/dtoverlay=i2s-mmap/!s/$/\ndtoverlay=i2s-mmap/' /boot/config.txt
sudo sed -zi '/i2c-dev/!s/$/\ni2c-dev/' /etc/modules
sudo sed -zi '/i2c-bcm2708/!s/$/\ni2c-bcm2708/' /etc/modules
sudo echo "/boot/dietpi/func/dietpi-set_hardware soundcard 'rpi-bcm2835-3.5mm' && reboot" | sudo tee /boot/run_once.sh