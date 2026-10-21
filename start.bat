@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem المنفذ 3001 افتراضياً حتى لا يتعارض مع مشاريع أخرى على 3000. لتغييره: set PORT=4000 قبل تشغيل هذا الملف.
if "%PORT%"=="" set PORT=3001
start "" http://localhost:%PORT%
node server.js
pause
