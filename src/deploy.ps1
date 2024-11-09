if (Test-Path .\deploy) {
    Remove-Item .\deploy -Recurse -Confirm:$false
}
if (Test-Path .\deploy.zip) {
    Remove-Item .\deploy.zip -Confirm:$false
}

npm run build

Get-ChildItem .\deploy\www\browser\* -Recurse | Move-Item -Destination .\deploy\www\
Remove-Item .\\deploy\www\browser -Recurse -Confirm:$false
Copy-Item .\backend-player\README.md .\deploy\README.md -Confirm:$false
Compress-Archive -Path .\deploy\* -DestinationPath .\deploy.zip

Write-Host "----------------------------------"
Write-Host "----------------------------------"
Write-Host "----------------------------------"
$confirmation = Read-Host "Deploy to bin-folder y(es) or n(o)"
if ($confirmation -eq 'y') {
    Remove-Item ..\bin\nodejs\deploy.zip -Confirm:$false
    Copy-Item .\deploy.zip ..\bin\nodejs\deploy.zip -Confirm:$false
    Remove-Item .\deploy.zip -Confirm:$false
    Write-Host "Finished with copy, removed local zip."
}
else {
    Write-Host "Finished without copy"
}
Remove-Item .\deploy -Recurse -Confirm:$false
