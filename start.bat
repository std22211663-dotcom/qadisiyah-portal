@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Default port 3001 so it does not clash with other local projects on 3000. To change it: set PORT=4000 before running this file.
if "%PORT%"=="" set PORT=3001
start "" http://localhost:%PORT%
node server.js
pause
