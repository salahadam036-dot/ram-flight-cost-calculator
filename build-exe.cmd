@echo off
REM ===========================================================================
REM  build-exe.cmd - Lanceur double-cliquable de build-exe.ps1
REM ===========================================================================
REM  Double-cliquez ce fichier pour incrementer la version et generer
REM  l'installeur .exe dans dist-exe\.
REM
REM  En ligne de commande, les options de build-exe.ps1 sont transmises :
REM      build-exe.cmd -NoBump
REM      build-exe.cmd -Version 1.2.0
REM      build-exe.cmd -KeepBuildDir
REM
REM  La fenetre reste ouverte a la fin pour afficher le resultat.
REM ===========================================================================

setlocal
pushd "%~dp0"

echo.
echo === RAM Flight Cost Calculator - generation de l'installeur ===
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-exe.ps1" %*
set "CODE_ERREUR=%ERRORLEVEL%"

echo.
if not "%CODE_ERREUR%"=="0" (
    echo *** ECHEC du build ^(code %CODE_ERREUR%^) ***
) else (
    echo *** Build termine avec succes. ***
)

popd
echo.
pause
exit /b %CODE_ERREUR%
