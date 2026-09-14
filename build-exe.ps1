# =============================================================================
#  build-exe.ps1 - Genere l'application desktop RAM (.exe) vers dist-exe\
# =============================================================================
#  Usage (PowerShell) :
#    .\build-exe.ps1
#
#  Ce script :
#    1. Copie les sources dans un dossier Windows natif (sans node_modules).
#    2. Installe les dependances et construit le frontend (API -> :8000).
#    3. Telecharge le binaire Electron puis empaquette l'installeur .exe.
#    4. Recopie l'installeur dans <projet>\dist-exe\ (emplacement fixe).
#
#  Le .exe se connecte au backend FastAPI expose par Docker (port 8000) :
#  Docker doit tourner ("docker compose up -d") avant d'ouvrir l'application.
# =============================================================================

$ErrorActionPreference = "Stop"

$NodeDir     = Join-Path $env:USERPROFILE "nodejs"
$Npm         = Join-Path $NodeDir "npm.cmd"
$ProjectSrc  = "\\wsl.localhost\Ubuntu-26.04\home\saad\SaadProjects\ram_v2"
$BuildDir    = Join-Path $env:USERPROFILE "ram_v2_build"
$OutDir      = Join-Path $ProjectSrc "dist-exe"

# Rendre Node/npm disponibles (y compris pour les sous-processus cmd.exe
# appeles par les scripts postinstall).
$env:Path = "$NodeDir;$env:Path"

function Step($msg) { Write-Host ""; Write-Host $msg -ForegroundColor Cyan }

Step "=== RAM Flight Cost Calculator - build .exe ==="

# 1) Verifier Node
Step "[1/5] Verification de Node.js..."
if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
    Write-Host "ERREUR : Node introuvable dans $NodeDir" -ForegroundColor Red
    exit 1
}
Write-Host ("Node " + (& (Join-Path $NodeDir "node.exe") --version)) -ForegroundColor Green

# 2) Copier les sources (node_modules exclus, ils sont reinstalles)
Step "[2/5] Copie des sources vers $BuildDir ..."
if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
robocopy "$ProjectSrc\frontend" "$BuildDir\frontend" /E /XD node_modules dist .vite /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy "$ProjectSrc\desktop"  "$BuildDir\desktop"  /E /XD node_modules release /NFL /NDL /NJH /NJS /NP | Out-Null
Write-Host "OK" -ForegroundColor Green

# 3) Construire le frontend
Step "[3/5] Construction du frontend..."
Push-Location (Join-Path $BuildDir "frontend")
try {
    & $Npm ci | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm ci (frontend) a echoue" }
    & $Npm run build
    if ($LASTEXITCODE -ne 0) { throw "build frontend a echoue" }
} finally { Pop-Location }

# 4) Empaqueter l'application Electron (.exe)
Step "[4/5] Empaquetage Electron (.exe)..."
Push-Location (Join-Path $BuildDir "desktop")
try {
    & $Npm ci | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm ci (desktop) a echoue" }
    # Le postinstall d'electron (telechargement du binaire) est parfois bloque
    # par "allow-scripts" : on le lance explicitement.
    Push-Location "node_modules\electron"
    try {
        if (-not (Test-Path "dist\electron.exe")) {
            & (Join-Path $NodeDir "node.exe") install.js | Out-Null
        }
    } finally { Pop-Location }
    & $Npm exec electron-builder -- --win --x64
    if ($LASTEXITCODE -ne 0) { throw "build Electron a echoue" }
} finally { Pop-Location }

# 5) Recopier l'installeur dans le projet
Step "[5/5] Copie de l'installeur vers $OutDir ..."
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
Get-ChildItem (Join-Path $BuildDir "dist-exe") -Filter "*.exe" -File |
    Where-Object { $_.Name -like "*Setup*" } |
    Copy-Item -Destination $OutDir -Force

Write-Host ""
Write-Host "Termine. Installeur genere dans :" -ForegroundColor Green
Get-ChildItem $OutDir -Filter *.exe | ForEach-Object {
    Write-Host ("  " + $_.FullName) -ForegroundColor White
}
Write-Host ""
Write-Host "Rappel : lancez 'docker compose up -d' avant d'ouvrir l'application." -ForegroundColor Yellow
