# Winamp theme preview

Draws the Winamp windows of the display (`src/frontend-box/src/app/winamp`) from a `.wsz` skin in a plain page, no
box and no Angular needed:

    node tools/winamp-preview/build.mjs "C:/path/to/skin.wsz"
    npx http-server tools/winamp-preview/out -p 8765   # or any static server

then open http://localhost:8765/ . The page is 1920 x 480 like the display it is made for.
