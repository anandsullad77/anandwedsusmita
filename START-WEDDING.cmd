@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  call npm.cmd install
  if errorlevel 1 (
    echo Could not install dependencies. Please check your internet connection.
    pause
    exit /b 1
  )
)
call npm.cmd run dev -- --open
if errorlevel 1 pause
