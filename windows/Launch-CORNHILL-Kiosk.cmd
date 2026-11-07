@echo off
setlocal
title CORNHILL School Kiosk Launcher

rem Launch the existing CORNHILL website in a full-screen browser kiosk.
rem This does not install, uninstall, or change the school's PWA registration.
set "CORN_HILL_URL=https://cornhill-school-cypher-projects1.vercel.app/"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --kiosk "%CORN_HILL_URL%" --edge-kiosk-type=fullscreen --no-first-run
  exit /b 0
)

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if exist "%CHROME%" (
  start "" "%CHROME%" --kiosk --app="%CORN_HILL_URL%" --no-first-run
  exit /b 0
)

echo CORNHILL could not find Microsoft Edge or Google Chrome.
echo Install or repair an approved browser, then run this launcher again.
pause
exit /b 1
