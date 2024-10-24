#!/bin/bash

#cleanup
rm -rf deploy

# Build the Angular app.
npm run build

# Pause execution to see if the build process worked
read -p "Press Enter to resume ..."

# archive
cd deploy
zip -r ../deploy.zip .
cd ..

# Deploy to bin folder.
cp deploy.zip ../bin/nodejs/deploy.zip -f

#cleanup
rm -rf deploy
rm -rf deploy.zip
