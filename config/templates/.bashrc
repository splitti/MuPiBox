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