@echo off
rem ============================================================================
rem  datahypotenus - avvio con un doppio clic.
rem  E' questo il file a cui punta l'icona sul desktop.
rem ============================================================================
title datahypotenus - avvio
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js non risulta installato, oppure non e' nel PATH.
  echo   datahypotenus ha bisogno di Node 24 o superiore: https://nodejs.org
  echo.
  pause
  exit /b 1
)

node "scripts\avvia.mjs"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)

rem Un attimo per far comparire il browser, poi questa finestra sparisce:
rem quella che resta e' il server.
timeout /t 2 /nobreak >nul
exit /b 0
