#!/bin/bash
#

service mupi_startstop stop
systemctl --no-block stop mupi_powerled # (--no-block: the LED's goodbye animation takes about 2 s and runs on while the box shuts down)
reboot