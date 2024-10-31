#!/bin/bash

#cleanup
rm -rf deploy
rm -rf www

# Build the Angular app.
npm run build

# Pause execution to see if the build process worked
read -p "Press Enter to resume ..."

# copy everything to deploy directory
mkdir deploy
# Move browser sub-folder to top-folder as with webpack.
mv www/browser/* www/
rm www/browser
# Copy Angular frontend app.
cp -Rp www deploy/
# Copy network.json.
mkdir -p deploy/server/config
cp -p server/config/network.json  deploy/server/config/
# Copy the backend-js app.
cp -p server.js deploy/
cp -p package-deploy.json deploy/package.json
cp -p README.md deploy/

# archive
cd deploy
zip -r ../../deploy.zip .
cd ..

# Deploy to bin folder.
cp ../deploy.zip ../../bin/nodejs/deploy.zip -f

#cleanup
rm -rf deploy
