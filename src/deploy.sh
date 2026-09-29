#!/bin/bash

rm -rf ./deploy
npm run build

# Pause execution to see if the build process worked
read -p "Press Enter to resume ..."

# Fix folder structure and add readme.
mv ./deploy/www/browser/* ./deploy/www
cp ./backend-player/README.md ./deploy/

# Archive.
cd deploy
zip -r ../deploy.zip .
cd ..

# Deploy to bin folder.
cp -f deploy.zip ../bin/nodejs/deploy.zip

# Cleanup
rm -rf deploy
rm -rf deploy.zip
