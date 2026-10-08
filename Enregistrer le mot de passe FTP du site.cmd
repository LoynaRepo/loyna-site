@echo off
chcp 65001 >nul
title LOYNA - mot de passe FTP du site
echo Enregistrement du mot de passe FTP de l'hebergement loyna.fr (compte loynafb) dans le Gestionnaire d'identifiants Windows.
echo Il n'est ecrit dans aucun fichier et n'est jamais montre a Claude.
echo Mot de passe oublie ? OVH Manager ^> Hebergements ^> loyna.fr ^> FTP-SSH ^> modifier le mot de passe.
echo.
"%LOCALAPPDATA%\Programs\Python\Python313\python.exe" "%~dp0tools\deploy.py" configurer
echo.
pause
