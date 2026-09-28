#!/bin/bash
#

systemctl stop mupi_startstop # (systemctl, not service: for stop, service asks every socket unit of the system first - 2.3 s)
systemctl --no-block stop mupi_powerled # (--no-block: the LED's goodbye animation takes about 2 s and runs on while the box shuts down)
poweroff