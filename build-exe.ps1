# =============================================================================
#  build-exe.ps1 - Genere l'application desktop RAM (.exe) vers dist-exe\
# =============================================================================
#  Usage (PowerShell, depuis la racine du projet) :
#    .\build-exe.ps1                     # incremente la version puis construit
#    .\build-exe.ps1 -Version 1.2.0      # impose une version
#    .\build-exe.ps1 -NoBump             # reconstruit sans toucher a la version
#    .\build-exe.ps1 -KeepBuildDir       # conserve le dossier de travail Windows
#
#  Ce script :
#    1. Incremente la version de desktop/package.json (1.0.1 -> 1.0.2), ce qui
#       determine le nom de l'installeur genere.
#    2. Copie les sources dans un dossier Windows natif (sans node_modules).
#    3. Installe les dependances et construit le frontend (API -> :8000).
#    4. Telecharge le binaire Electron puis empaquette l'installeur .exe.
#    5. Recopie l'installeur dans <projet>\dist-exe\ et affiche son empreinte.
#
#  Le .exe se connecte au backend FastAPI expose par Docker (port 8000) :
#  Docker doit tourner ("docker compose up -d") avant d'ouvrir l'application.
#
#  dist-exe\ n'est pas versionne : chaque construction produit un installeur
#  d'environ 80 Mo, qu'il vaut mieux regenerer que stocker dans l'historique.
# =============================================================================

param(
    [string]$Version = "",
    [switch]$NoBump,
    [switch]$KeepBuildDir
)

$ErrorActionPreference = "Stop"

$NodeDir     = Join-Path $env:USERPROFILE "nodejs"
$Npm         = Join-Path $NodeDir "npm.cmd"
$ProjectSrc  = $PSScriptRoot
$BuildDir    = Join-Path $env:USERPROFILE "ram_v2_build"
$OutDir      = Join-Path $ProjectSrc "dist-exe"
$PackageJson = Join-Path $ProjectSrc "desktop\package.json"

# Rendre Node/npm disponibles (y compris pour les sous-processus cmd.exe
# appeles par les scripts postinstall).
$env:Path = "$NodeDir;$env:Path"

function Step($msg) { Write-Host ""; Write-Host $msg -ForegroundColor Cyan }

function Lire-Version {
    $texte = [System.IO.File]::ReadAllText($PackageJson)
    $correspondance = [regex]::Match($texte, '"version"\s*:\s*"([^"]+)"')
    if (-not $correspondance.Success) { throw "Champ version introuvable dans $PackageJson" }
    return $correspondance.Groups[1].Value
}

function Incrementer-Version($versionActuelle) {
    $parties = $versionActuelle.Split('.')
    if ($parties.Count -lt 2) { throw "Version inattendue : $versionActuelle" }
    $majeur = $parties[0]
    $mineur = $parties[1]
    # Le troisieme nombre peut porter un suffixe (1.0.1-beta) : on ne garde que les chiffres.
    $correctif = [int]($parties[2] -replace '[^0-9].*$', '')
    return ("{0}.{1}.{2}" -f $majeur, $mineur, ($correctif + 1))
}

function Ecrire-Version($nouvelle) {
    $texte = [System.IO.File]::ReadAllText($PackageJson)
    $nouveau = [regex]::Replace($texte, '("version"\s*:\s*")[^"]+(")', {
            param($m) $m.Groups[1].Value + $nouvelle + $m.Groups[2].Value
        })
    if ($nouveau -eq $texte) { throw "Champ version introuvable dans $PackageJson" }
    # Ecriture sans BOM, comme npm, pour ne pas polluer le fichier.
    [System.IO.File]::WriteAllText($PackageJson, $nouveau, (New-Object System.Text.UTF8Encoding($false)))
}

Step "=== RAM Flight Cost Calculator - build .exe ==="

# 0) Verifier Node et le projet
Step "[1/6] Verification de Node.js..."
if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
    Write-Host "ERREUR : Node introuvable dans $NodeDir" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $PackageJson)) {
    Write-Host "ERREUR : $PackageJson introuvable. Lancez le script depuis la racine du projet." -ForegroundColor Red
    exit 1
}
Write-Host ("Node " + (& (Join-Path $NodeDir "node.exe") --version)) -ForegroundColor Green

# 1) Version
Step "[2/6] Version de l'application..."
if ($NoBump) {
    $versionCible = Lire-Version
    Write-Host "Version inchangee : $versionCible" -ForegroundColor Yellow
} else {
    $versionActuelle = Lire-Version
    if ($Version) {
        if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version invalide : $Version (attendu x.y.z)" }
        $versionCible = $Version
    } else {
        $versionCible = Incrementer-Version $versionActuelle
    }
    Ecrire-Version $versionCible
    Write-Host "Version $versionActuelle -> $versionCible (desktop\package.json)" -ForegroundColor Green
}

# 2) Copier les sources (node_modules exclus, ils sont reinstalles)
Step "[3/6] Copie des sources vers $BuildDir ..."
if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
robocopy "$ProjectSrc\frontend" "$BuildDir\frontend" /E /XD node_modules dist .vite /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy "$ProjectSrc\desktop"  "$BuildDir\desktop"  /E /XD node_modules release /NFL /NDL /NJH /NJS /NP | Out-Null
Write-Host "OK" -ForegroundColor Green

# 3) Construire le frontend
Step "[4/6] Construction du frontend..."
Push-Location (Join-Path $BuildDir "frontend")
try {
    & $Npm ci | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm ci (frontend) a echoue" }
    & $Npm run build
    if ($LASTEXITCODE -ne 0) { throw "build frontend a echoue" }
} finally { Pop-Location }

# 4) Empaqueter l'application Electron (.exe)
Step "[5/6] Empaquetage Electron (.exe)..."
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
Step "[6/6] Copie de l'installeur vers $OutDir ..."
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$installeurs = Get-ChildItem (Join-Path $BuildDir "dist-exe") -Filter "*.exe" -File |
    Where-Object { $_.Name -like "*Setup*" }
if (-not $installeurs) { throw "Aucun installeur trouve dans $BuildDir\dist-exe" }
$installeurs | Copy-Item -Destination $OutDir -Force

# 6) Nettoyer le dossier de travail Windows
if (-not $KeepBuildDir -and (Test-Path $BuildDir)) {
    Remove-Item $BuildDir -Recurse -Force
    Write-Host "Dossier de travail supprime ($BuildDir)." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Termine." -ForegroundColor Green
Get-ChildItem $OutDir -Filter *.exe | ForEach-Object {
    $empreinte = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
    Write-Host ("  " + $_.FullName) -ForegroundColor White
    Write-Host ("    version " + $versionCible + " - " + [math]::Round($_.Length / 1MB, 1) + " Mo") -ForegroundColor Gray
    Write-Host ("    sha256 " + $empreinte) -ForegroundColor Gray
}
Write-Host ""
Write-Host "Rappel : lancez 'docker compose up -d' avant d'ouvrir l'application." -ForegroundColor Yellow
if (-not $NoBump) {
    Write-Host ""
    Write-Host "Pour tracer cette version dans le depot :" -ForegroundColor Yellow
    Write-Host "  git add desktop/package.json && git commit -m ""Version $versionCible du build desktop""" -ForegroundColor Gray
}
