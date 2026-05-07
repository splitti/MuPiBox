# Phase-1-Deployment-Wrapper.
#
# Builds a fresh deploy.zip (so spotify-control.js carries the CRIT-8 fix),
# stages the Phase-1 PHP files and BT scripts under a temp dir mirroring
# the on-box layout, scp's everything to /tmp/ on the box, then runs
# scripts/dev/backup_box.sh and scripts/dev/deploy_box.sh remotely.
#
# Usage (from the repo root, in PowerShell):
#
#   .\scripts\dev\deploy_phase1.ps1 -Box dietpi@10.4.22.21
#
# Or skip the build if deploy.zip is already current:
#
#   .\scripts\dev\deploy_phase1.ps1 -Box dietpi@10.4.22.21 -SkipBuild
#
# Flags:
#   -SkipBuild   Reuse src/deploy.zip as-is (debugging / re-runs).
#   -DryRun      Print every step but execute nothing.
#
# This script does NOT push to the box without a backup first — that is
# the deploy_box.sh contract (it requires an existing backup dir as $1).

param(
    [Parameter(Mandatory=$true)]
    [string]$Box,
    [switch]$SkipBuild,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

function Run([string]$desc, [scriptblock]$block) {
    Write-Host ""
    Write-Host "==> $desc" -ForegroundColor Cyan
    if ($DryRun) {
        Write-Host "   (dry-run, would execute):" -ForegroundColor Yellow
        Write-Host "   $($block.ToString().Trim())" -ForegroundColor Yellow
        return
    }
    & $block
    if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
        throw "$desc failed (exit $LASTEXITCODE)"
    }
}

# --- 1. Build deploy.zip ----------------------------------------------------
if (-not $SkipBuild) {
    Run "Build deploy.zip (frontend-box + backend-api + backend-player)" {
        Set-Location (Join-Path $repoRoot 'src')
        if (Test-Path .\deploy)     { Remove-Item .\deploy -Recurse -Force }
        if (Test-Path .\deploy.zip) { Remove-Item .\deploy.zip -Force }

        Push-Location frontend-box
        npm run build
        Pop-Location

        Push-Location backend-api
        npm run build
        Pop-Location

        Push-Location backend-player
        npm run build
        Pop-Location

        # Angular 20 emits to www/browser/ — flatten into www/
        Get-ChildItem .\deploy\www\browser\* -Recurse | Move-Item -Destination .\deploy\www\
        Remove-Item .\deploy\www\browser -Recurse -Force
        Copy-Item .\backend-player\README.md .\deploy\README.md
        Compress-Archive -Path .\deploy\* -DestinationPath .\deploy.zip
        Set-Location $repoRoot
    }
} else {
    Write-Host "==> Build übersprungen (-SkipBuild). src/deploy.zip muss aktuell sein." -ForegroundColor Yellow
    if (-not (Test-Path src/deploy.zip)) {
        throw "src/deploy.zip fehlt. Lass -SkipBuild weg, damit es gebaut wird."
    }
}

# --- 2. Stage Phase-1 files -------------------------------------------------
$staging = Join-Path $env:TEMP "mupibox-phase1-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Run "Stage Phase-1-Dateien in $staging" {
    New-Item -ItemType Directory -Path $staging | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $staging 'admin_phase1') | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $staging 'admin_phase1\includes') | Out-Null

    # 8 PHP files at /var/www/
    $phpRoot = 'AdminInterface\www'
    foreach ($f in 'admin.php','backup.php','fullbackup.php','debug.php','pm2logs.php','support_data.php','backend.php','jsoneditor.php') {
        Copy-Item (Join-Path $phpRoot $f) (Join-Path $staging "admin_phase1\$f")
    }
    # 1 PHP file at /var/www/includes/
    Copy-Item (Join-Path $phpRoot 'includes\header.php') (Join-Path $staging 'admin_phase1\includes\header.php')

    # 2 BT scripts at /usr/local/bin/mupibox/
    Copy-Item 'scripts\bluetooth\pair_bt.sh'   (Join-Path $staging 'pair_bt.sh')
    Copy-Item 'scripts\bluetooth\remove_bt.sh' (Join-Path $staging 'remove_bt.sh')

    Get-ChildItem $staging -Recurse -File | Select-Object FullName, Length | Format-Table
}

# --- 3. Backup + scp + deploy ------------------------------------------------
$backupScript = (Join-Path $repoRoot 'scripts\dev\backup_box.sh') -replace '\\','/'
$deployScript = (Join-Path $repoRoot 'scripts\dev\deploy_box.sh') -replace '\\','/'

Run "Backup auf der Box anlegen" {
    # backup_box.sh prints the backup-dir as its last line — capture it.
    # Using bash -s with stdin redirection avoids needing rsync the script onto the box.
    $backupOutput = Get-Content $backupScript -Raw | & ssh $Box 'bash -s'
    Write-Host $backupOutput
    # backup_box.sh's last line is "   /home/dietpi/mupibox-backup-<TS>" — match
    # whole-line so we don't pick up "4.0K\t/home/..." from `du -sh` etc.
    $script:backupDir = ($backupOutput -split "`n" | Where-Object { $_ -match '^\s*/home/dietpi/mupibox-backup-\S+\s*$' } | Select-Object -Last 1).Trim()
    if (-not $script:backupDir) {
        throw "Konnte Backup-Pfad nicht aus backup_box.sh-Output extrahieren"
    }
    Write-Host "   Backup: $script:backupDir" -ForegroundColor Green
}

Run "scp deploy.zip + admin_phase1/ + BT-Skripte → ${Box}:/tmp/" {
    & scp (Join-Path $repoRoot 'src\deploy.zip') "${Box}:/tmp/deploy.zip"
    & scp -r (Join-Path $staging 'admin_phase1')  "${Box}:/tmp/"
    & scp (Join-Path $staging 'pair_bt.sh')   "${Box}:/tmp/pair_bt.sh"
    & scp (Join-Path $staging 'remove_bt.sh') "${Box}:/tmp/remove_bt.sh"
}

Run "Remote: deploy_box.sh $script:backupDir" {
    Get-Content $deployScript -Raw | & ssh $Box "bash -s -- $script:backupDir"
}

Run "Cleanup Staging $staging" {
    Remove-Item $staging -Recurse -Force
}

Write-Host ""
Write-Host "==> Phase-1-Deployment fertig." -ForegroundColor Green
Write-Host "Verifikation auf der Box (siehe Phase-1-Plan):"
Write-Host "  1. curl -i http://$($Box.Split('@')[1])/backup.php       # ohne Login → Login-Form / 403"
Write-Host "  2. curl -i 'http://$($Box.Split('@')[1])/admin.php?hshutdown=1'  # darf Box NICHT ausschalten"
Write-Host "  3. ssh $Box '/usr/local/bin/mupibox/pair_bt.sh \"; echo PWNED\"'  # → Error: invalid MAC"
Write-Host "  4. Browser: jsoneditor.php → Form ohne csrf_token POSTen → ❌-Fehler"
Write-Host "  5. Echtes BT-Pairing mit gültiger MAC funktioniert weiter"
Write-Host ""
Write-Host "Bei Problemen Rollback auf der Box:"
Write-Host "  bash restore_box.sh $script:backupDir"
