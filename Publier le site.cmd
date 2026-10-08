@echo off
chcp 65001 >nul
title LOYNA - publier le site
cd /d "%~dp0"
echo 1/2 Construction du site (contenus Builder.io inclus)...
call npx astro build || (echo La construction a echoue, rien n'a ete publie. & pause & exit /b 1)
echo.
echo 2/2 Envoi vers loyna.fr...
"%LOCALAPPDATA%\Programs\Python\Python313\python.exe" "%~dp0tools\deploy.py" publier
echo.
pause
