
Remove-Item .\deploy -Recurse -Confirm:$false
Remove-Item .\www -Recurse -Confirm:$false
Remove-Item .\deploy.zip -Confirm:$false

# build personal web app
ionic build --prod

# copy everything to deploy directory
mkdir deploy

# Move browser sub-folder to top-folder as with webpack.
Copy-Item www\browser .\www\ -Recurse -Confirm:$false
Remove-Item .\www\browser -Recurse -Confirm:$false
Copy-Item www .\deploy\ -Recurse -Confirm:$false
Copy-Item server .\deploy\ -Recurse -Confirm:$false

Copy-Item server.js .\deploy\ -Confirm:$false
Copy-Item  package-deploy.json .\deploy\package.json -Confirm:$false
Copy-Item README.md .\deploy\ -Confirm:$false

# archive
Compress-Archive -Path .\deploy\* -DestinationPath .\deploy.zip

Write-Host "----------------------------------"
Write-Host "----------------------------------"
Write-Host "----------------------------------"
$confirmation = Read-Host "Deploy to bin-folder y(es) or n(o)"
if ($confirmation -eq 'y') {
    Remove-Item ..\..\bin\nodejs\deploy.zip -Confirm:$false
    Copy-Item .\deploy.zip ..\..\bin\nodejs\deploy.zip -Confirm:$false
    Write-Host "Finished with copy"
    }
else
    {
    Write-Host "Finished without copy"
    }
