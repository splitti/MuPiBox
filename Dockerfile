# A production-like MuPiBox for testing a freshly built bin/nodejs/deploy.zip and AdminInterface/release/www.zip:
# the same files in the same places as autosetup.sh puts them on a box, run by pm2 and lighttpd.
# Build and run: npm run docker:build, npm run docker:start (see package.json). No audio device, no hardware:
# the player starts but cannot play, and the scripts that touch WiFi, GPIO or the display fail.

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Node.js 22 from NodeSource, as autosetup.sh installs it. curl and the certificates have to be there before the
# NodeSource script can run (with Debian's own nodejs 18 the esbuild bundles, built for node22, would not be a test
# of what the box runs). NodeSource's nodejs brings npm with it.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends \
    sudo \
    whiptail \
    wget \
    cron \
    jq \
    mpv \
    nodejs \
    git \
    unzip \
    socat \
    && rm -rf /var/lib/apt/lists/*

# The user the box runs everything as.
RUN groupadd -r dietpi && useradd -r -g dietpi -d /home/dietpi -m dietpi
RUN groupadd -r gpio

# The parts of the repository the installation needs (the release zips and the templates, scripts, themes).
ARG mupisrc=/home/dietpi/MuPiBoxSource
COPY ./AdminInterface $mupisrc/AdminInterface
COPY ./bin  $mupisrc/bin
COPY ./config  $mupisrc/config
COPY ./media  $mupisrc/media
COPY ./scripts  $mupisrc/scripts
COPY ./themes  $mupisrc/themes

WORKDIR /home/dietpi

# pm2 runs the two Node servers, as on the box (no "pm2 startup": there is no systemd in the container, the
# entrypoint starts them).
RUN npm install -g pm2

# Directories, as in autosetup.sh "Clean and create directories".
RUN mkdir -p \
    /home/dietpi/.mupibox/chromium_cache \
    /home/dietpi/MuPiBox/tts_files \
    /home/dietpi/MuPiBox/sysmedia/sound \
    /home/dietpi/MuPiBox/sysmedia/images \
    /home/dietpi/.cache/spotify \
    /home/dietpi/MuPiBox/media/audiobook \
    /home/dietpi/MuPiBox/media/music \
    /home/dietpi/MuPiBox/media/other \
    /home/dietpi/MuPiBox/media/NAS \
    /home/dietpi/MuPiBox/media/cover \
    /home/dietpi/MuPiBox/themes \
    /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config \
    /home/dietpi/.mupibox/spotifycontroller-main/config \
    /usr/local/bin/mupibox \
    /etc/mupibox \
    /var/log/mupibox

# The box's config, the scripts the servers call, the themes.
RUN cp $mupisrc/config/templates/mupiboxconfig.json /etc/mupibox/mupiboxconfig.json && \
    chown root:www-data /etc/mupibox/mupiboxconfig.json && \
    chmod 775 /etc/mupibox/mupiboxconfig.json && \
    cp -r $mupisrc/scripts/mupibox/. /usr/local/bin/mupibox/ && \
    chmod +x /usr/local/bin/mupibox/* && \
    cp -r $mupisrc/themes/. /home/dietpi/MuPiBox/themes/ && \
    cp $mupisrc/media/images/goodbye.png /home/dietpi/MuPiBox/sysmedia/images/goodbye.png && \
    cp $mupisrc/media/sound/startup.wav $mupisrc/media/sound/shutdown.wav /home/dietpi/MuPiBox/sysmedia/sound/

# Display, backend-api and backend-player: the bundles of deploy.zip, installed as autosetup.sh does it. The player's
# spotify-control.js (the mpv wrapper is bundled into it) comes from the same zip; the separate
# spotifycontroller and mplayer-wrapper downloads of before are gone since the sources moved to src/ (2024-10).
RUN unzip -q $mupisrc/bin/nodejs/deploy.zip -d /home/dietpi/.mupibox/Sonos-Kids-Controller-master/ && \
    cp $mupisrc/config/templates/www.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json && \
    cp $mupisrc/config/templates/monitor.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json && \
    cp /home/dietpi/.mupibox/Sonos-Kids-Controller-master/spotify-control.js /home/dietpi/.mupibox/spotifycontroller-main/spotify-control.js && \
    cp $mupisrc/config/templates/spotifycontroller.json /home/dietpi/.mupibox/spotifycontroller-main/config/config.json && \
    ln -sf /etc/mupibox/mupiboxconfig.json /home/dietpi/.mupibox/spotifycontroller-main/config/mupiboxconfig.json && \
    ln -sf /home/dietpi/MuPiBox/themes/blue.css /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css && \
    ln -sf /var/www/images/mupif.png /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/mupi.png

# The themes' pictures and fonts: a theme's CSS loads them from /theme-data/<theme>/, which autosetup.sh fills from
# themes/<theme>/ (without it the display's catch-all answers index.html for them, and a theme has no background).
RUN for d in $mupisrc/themes/*/; do t=$(basename "$d"); \
      mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/$t && \
      cp -f "$d"* /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/$t/ 2>/dev/null; \
    done && \
    mkdir -p /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/custom && \
    ln -sf /home/dietpi/MuPiBox/themes/custom-bg.jpg /home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/custom/custom-bg.jpg

# Binaries.
RUN cp $mupisrc/bin/fbv/fbv_64 /usr/bin/fbv && chmod 755 /usr/bin/fbv

# Admin interface: PHP behind lighttpd, and lighttpd passing /app, /api, ... on to the Node server (port 8201),
# as on the box (config/lighttpd).
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    php-cgi \
    lighttpd \
    && rm -rf /var/lib/apt/lists/*
RUN rm -rf /var/www/* && \
    unzip -q $mupisrc/AdminInterface/release/www.zip -d /var/www/html && \
    ln -s /var/www/html/images /var/www/images && \
    ln -s /home/dietpi/MuPiBox/media/cover /var/www/cover && \
    ln -s /home/dietpi/MuPiBox/media/cover /var/www/html/cover && \
    cp $mupisrc/config/lighttpd/90-mupibox-app.conf $mupisrc/config/lighttpd/99-mupibox-media-noexec.conf /etc/lighttpd/conf-enabled/ && \
    lighty-enable-mod proxy fastcgi fastcgi-php

# Rights etc. for www-data and dietpi (the admin interface runs the box's scripts with sudo).
RUN echo "www-data ALL=(ALL:ALL) NOPASSWD: ALL" | tee /etc/sudoers.d/www-data && \
    chown -R www-data:www-data /var/www/ && \
    chmod -R 755 /var/www/ && \
    chown -R dietpi:dietpi /home/dietpi/.mupibox /home/dietpi/MuPiBox && \
    chown -R dietpi:www-data /home/dietpi/MuPiBox/media/cover

EXPOSE 8200
EXPOSE 5005
EXPOSE 80

WORKDIR /
COPY ./docker/entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]
