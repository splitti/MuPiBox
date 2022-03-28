
remove-item .\deploy -Recurse -Confirm:$false
Remove-Item .\deploy.zip -Confirm:$false

# build personal web app
ionic build --prod

# copy everything to deploy directory
mkdir deploy

Copy-Item www .\deploy\ -Recurse -Confirm:$false
Copy-Item server .\deploy\ -Recurse -Confirm:$false

Copy-Item server.js .\deploy\ -Confirm:$false
Copy-Item  package-deploy.json .\deploy\package.json -Confirm:$false
Copy-Item README.md .\deploy\ -Confirm:$false

# archive
Compress-Archive -Path .\deploy\* -DestinationPath .\deploy.zip
