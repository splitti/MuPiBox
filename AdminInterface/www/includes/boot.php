<?php
	// The Pi's boot configuration: /boot/firmware/config.txt on newer DietPi (v10, Debian 13 "Trixie"), /boot/config.txt
	// before. The pages read and change it through $bootConfig. (No closing tag: nothing may be sent before the headers.)
	$bootConfig = file_exists('/boot/firmware/config.txt') ? '/boot/firmware/config.txt' : '/boot/config.txt';
