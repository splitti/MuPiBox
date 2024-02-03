# ~/.bashrc: executed by bash(1) for non-login shells.

export LS_OPTIONS='--color=auto'
eval "$(dircolors)"
alias ls='ls $LS_OPTIONS'
alias ll='ls $LS_OPTIONS -l'
alias l='ls $LS_OPTIONS -lA'
alias tf='tail -f'
alias cls='clear'
alias md='mkdir'
alias apt-get='sudo apt-get'
alias diskspace="du -S | sort -n -r |more"
alias folders='du -h --max-depth=1'
alias folderssort='find . -maxdepth 1 -type d -print0 | xargs -0 du -sk | sort -rn'
alias tree='tree -CAhF --dirsfirst'
alias treed='tree -CAFd'
alias mountedinfo='df -hT'
alias grep='/usr/bin/grep --color=auto'

#mupibox aliases
alias mupi-update-stable='cd; curl -L https://raw.githubusercontent.com/splitti/MuPiBox/main/update/start_mupibox_update.sh | sudo bash  -s -- stable'
alias mupi-update-beta='cd; curl -L https://raw.githubusercontent.com/splitti/MuPiBox/main/update/start_mupibox_update.sh | sudo bash  -s -- beta'
alias mupi-update-dev='cd; curl -L https://raw.githubusercontent.com/splitti/MuPiBox/main/update/start_mupibox_update.sh | sudo bash  -s -- dev'
alias mupi-show-conf='sudo cat /etc/mupibox/mupiboxconfig.json | jq . -r -C'
alias mupi-show-data='sudo cat /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json | jq . -r -C'
alias mupi-show-network='sudo cat /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json | jq . -r -C'
alias mupi-restart-chrome='/usr/local/bin/mupibox/./restart_kiosk.sh'

#dietpi aliases
alias dietpi-letsencrypt='/boot/dietpi/dietpi-letsencrypt'
alias dietpi-autostart='/boot/dietpi/dietpi-autostart'
alias dietpi-cron='/boot/dietpi/dietpi-cron'
alias dietpi-launcher='/boot/dietpi/dietpi-launcher'
alias dietpi-cleaner='/boot/dietpi/dietpi-cleaner'
alias dietpi-morsecode='/boot/dietpi/dietpi-morsecode'
alias dietpi-sync='/boot/dietpi/dietpi-sync'
alias dietpi-backup='/boot/dietpi/dietpi-backup'
alias dietpi-bugreport='/boot/dietpi/dietpi-bugreport'
alias dietpi-services='/boot/dietpi/dietpi-services'
alias dietpi-config='/boot/dietpi/dietpi-config'
alias dietpi-software='/boot/dietpi/dietpi-software'
alias dietpi-update='/boot/dietpi/dietpi-update'
alias dietpi-drive_manager='/boot/dietpi/dietpi-drive_manager'
alias dietpi-logclear='/boot/dietpi/func/dietpi-logclear'
alias dietpi-survey='/boot/dietpi/dietpi-survey'
alias dietpi-explorer='/boot/dietpi/dietpi-explorer'
alias dietpi-banner='/boot/dietpi/func/dietpi-banner'
alias dietpi-justboom='/boot/dietpi/misc/dietpi-justboom'
alias dietpi-led_control='/boot/dietpi/dietpi-led_control'
alias dietpi-wifidb='/boot/dietpi/func/dietpi-wifidb'
alias dietpi-optimal_mtu='/boot/dietpi/func/dietpi-optimal_mtu'
alias cpu='/boot/dietpi/dietpi-cpuinfo'

# Expand the history size
export HISTFILESIZE=10000
export HISTSIZE=500

# Don't put duplicate lines in the history and do not add lines that start with a space
export HISTCONTROL=erasedups:ignoredups:ignorespace

# Causes bash to append to history instead of overwriting it so if you start a new terminal, you have old session history
shopt -s histappend
PROMPT_COMMAND='history -a'

# Set the default editor
export EDITOR=nano
export VISUAL=nano

export PS1="\[\e[38;5;226m\]\u\[\e[38;5;160m\]@\[\e[38;5;46m\]\h \[\e[38;5;14m\]\w \[\033[0m\]$ "

# Reset
Color_Off='\033[0m'       # Text Reset

# Regular Colors
Black='\033[0;30m'        # Black
Red='\033[0;31m'          # Red
Green='\033[0;32m'        # Green
Yellow='\033[0;33m'       # Yellow
Blue='\033[0;34m'         # Blue
Purple='\033[0;35m'       # Purple
Cyan='\033[0;36m'         # Cyan
White='\033[0;37m'        # White

# Bold
BBlack='\033[1;30m'       # Black
BRed='\033[1;31m'         # Red
BGreen='\033[1;32m'       # Green
BYellow='\033[1;33m'      # Yellow
BBlue='\033[1;34m'        # Blue
BPurple='\033[1;35m'      # Purple
BCyan='\033[1;36m'        # Cyan
BWhite='\033[1;37m'       # White

# Underline
UBlack='\033[4;30m'       # Black
URed='\033[4;31m'         # Red
UGreen='\033[4;32m'       # Green
UYellow='\033[4;33m'      # Yellow
UBlue='\033[4;34m'        # Blue
UPurple='\033[4;35m'      # Purple
UCyan='\033[4;36m'        # Cyan
UWhite='\033[4;37m'       # White

# Background
On_Black='\033[40m'       # Black
On_Red='\033[41m'         # Red
On_Green='\033[42m'       # Green
On_Yellow='\033[43m'      # Yellow
On_Blue='\033[44m'        # Blue
On_Purple='\033[45m'      # Purple
On_Cyan='\033[46m'        # Cyan
On_White='\033[47m'       # White

# High Intensity
IBlack='\033[0;90m'       # Black
IRed='\033[0;91m'         # Red
IGreen='\033[0;92m'       # Green
IYellow='\033[0;93m'      # Yellow
IBlue='\033[0;94m'        # Blue
IPurple='\033[0;95m'      # Purple
ICyan='\033[0;96m'        # Cyan
IWhite='\033[0;97m'       # White

# Bold High Intensity
BIBlack='\033[1;90m'      # Black
BIRed='\033[1;91m'        # Red
BIGreen='\033[1;92m'      # Green
BIYellow='\033[1;93m'     # Yellow
BIBlue='\033[1;94m'       # Blue
BIPurple='\033[1;95m'     # Purple
BICyan='\033[1;96m'       # Cyan
BIWhite='\033[1;97m'      # White

# High Intensity backgrounds
On_IBlack='\033[0;100m'   # Black
On_IRed='\033[0;101m'     # Red
On_IGreen='\033[0;102m'   # Green
On_IYellow='\033[0;103m'  # Yellow
On_IBlue='\033[0;104m'    # Blue
On_IPurple='\033[0;105m'  # Purple
On_ICyan='\033[0;106m'    # Cyan
On_IWhite='\033[0;107m'   # White

OS=$(source /etc/os-release ; echo $PRETTY_NAME)
RASPI=$(cat /sys/firmware/devicetree/base/model)
clear
echo -e "${On_IRed}   ${On_IYellow}   ${On_IGreen}   ${On_IBlue}   ${On_ICyan}   ${On_IPurple}   ${On_IRed}   ${On_IYellow}   ${On_IGreen}   ${On_IBlue}   ${On_ICyan}   ${On_IPurple}   ${On_IRed}   ${On_IYellow}   ${On_IGreen}   ${On_IBlue}   ${On_ICyan}   ${On_IPurple}   ${Color_Off}"
echo -e "  ${BCyan}Hostname:         ${BGreen}$(hostname)${Color_Off}"
echo -e "  ${BCyan}User:             ${BGreen}$(whoami)${Color_Off}"
echo -e "  ${BCyan}IP-Address:       ${BGreen}$(hostname -I)${Color_Off}"
echo -e "  ${BCyan}OS:               ${BGreen}${OS}${Color_Off}"
echo -e "  ${BCyan}RasPi:            ${BGreen}${RASPI}${Color_Off}"
echo -e "  ${BCyan}Architecture:     ${BGreen}$(uname -m)${Color_Off}"
echo -e "  ${BCyan}MuPiBox-Version:  ${BGreen}$(cat /etc/mupibox/mupiboxconfig.json | jq -r .mupibox.version)${Color_Off}"
echo -e "${Color_Off}"
echo -e "  ${BCyan}Admin-UI:         ${BYellow}http://$(hostname)${Color_Off}"
echo -e "  ${BCyan}Web-UI:           ${BYellow}http://$(hostname):8200${Color_Off}"
echo -e "${Color_Off}"
echo -e "  ${BCyan}visit MuPiBox:    ${BRed}https://mupibox.de${Color_Off}"
echo -e "  ${BCyan}Latest-Version:   ${BRed}$(curl -s https://raw.githubusercontent.com/splitti/MuPiBox/main/version.json | jq -r .release.stable[-1].version)${Color_Off}"
echo -e "${On_IRed}   ${On_IYellow}   ${On_IGreen}   ${On_IBlue}   ${On_ICyan}   ${On_IPurple}   ${On_IRed}   ${On_IYellow}   ${On_IGreen}   ${On_IBlue}   ${On_ICyan}   ${On_IPurple}   ${On_IRed}   ${On_IYellow}   ${On_IGreen}   ${On_IBlue}   ${On_ICyan}   ${On_IPurple}   ${Color_Off}"
echo -e "${Color_Off}"
unset OS
unset RASPI
