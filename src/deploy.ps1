
Remove-Item .\deploy -Recurse -Confirm:$false
Remove-Item .\www -Recurse -Confirm:$false
Remove-Item .\deploy.zip -Confirm:$false

npm run build

Compress-Archive -Path .\deploy\* -DestinationPath .\deploy.zip

Write-Host "----------------------------------"
Write-Host "----------------------------------"
Write-Host "----------------------------------"
$confirmation = Read-Host "Deploy to bin-folder y(es) or n(o)"
if ($confirmation -eq 'y') {
    Remove-Item ..\..\bin\nodejs\deploy.zip -Confirm:$false
    Copy-Item .\deploy.zip ..\bin\nodejs\deploy.zip -Confirm:$false
    Write-Host "Finished with copy"
    }
else
    {
    Write-Host "Finished without copy"
    }
