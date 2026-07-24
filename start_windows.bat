@echo off
setlocal
cd /d "%~dp0"
set "PYTHON_CMD="
where py >nul 2>&1 && set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD where python >nul 2>&1 && set "PYTHON_CMD=python"
if not defined PYTHON_CMD where python3 >nul 2>&1 && set "PYTHON_CMD=python3"
if not defined PYTHON_CMD goto no_python

echo Starting PromptForge Nexus Studio by Shark...
start "PromptForge Local Server" /min cmd /c "%PYTHON_CMD% -m http.server 5500"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:5500
exit /b 0

:no_python
echo Python was not found. Install Python 3 or open index.html directly.
pause
exit /b 1
