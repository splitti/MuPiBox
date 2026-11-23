# Display sandbox (no box needed)

Runs the real display app on http://localhost:8200 against a pretend box: a small library with generated covers and a
pretend player on port 5005 (a clock runs through the tracks; volume, pause, seek, skip, repeat and the Winamp
equaliser work; there is no sound). Made for the Winamp theme, which needs a 1920 x 480 display, but it shows any theme.

    # 1. build the display (again after every change; output: src/deploy/www)
    cd src/frontend-box && ../../node_modules/.bin/ng build --configuration production --output-path=../deploy/www

    # 2. start the sandbox, with a skin if the theme is "winamp"
    node tools/winamp-sandbox/server.mjs --skin "C:/path/to/skin.wsz"
    #   --theme <id>   another theme (themes/<id>.css), default winamp
    #   --www <dir>    another build of the display
    #   SANDBOX_LOG=1  prints the player commands

Open http://localhost:8200/home in a browser window of exactly 1920 x 480 pixels (the theme checks the window size when
the page loads; in the Claude Code browser pane: set the size, then reload). The skin is unpacked by the backend's own
code (src/backend-api/src/app-api/winamp-skin.ts), so what works here is what the upload does on the box.

The parents' app is there too: http://localhost:8200/app/ (no login) - its theme page is http://localhost:8200/app/#/theme.
Choosing a theme there changes the display at once; with "Winamp" chosen the skin card appears, and uploading a .wsz
there works for real (the same unpacking the box uses; the display loads the new skin without a reload). Everything else
in the app shows empty pages.

`tools/winamp-preview` is the lighter variant: only the Winamp windows, no app.
