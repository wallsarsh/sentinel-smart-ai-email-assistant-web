@echo off
rem Double-click or run from cmd. Passes any options through, e.g.  install.cmd -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
if errorlevel 1 pause
