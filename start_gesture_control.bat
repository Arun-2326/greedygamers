@echo off
title Neon Core - AI Gesture Controller
echo =======================================================
echo    NEON CORE: AI ARENA - GESTURE CONTROLLER LAUNCHER
echo =======================================================
echo.

:: Detect Python
set PYTHON_CMD=
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PYTHON_CMD=python
) else (
    where py >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set PYTHON_CMD=py
    )
)

if "%PYTHON_CMD%"=="" (
    echo [!] Python is not currently installed or not found in PATH.
    echo.
    echo [*] Attempting to install Python via Windows Package Manager (winget)...
    winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [X] Automated install failed. Please download and install Python from:
        echo     https://www.python.org/downloads/
        echo     (Make sure to check "Add Python to PATH" during installation)
        echo.
        pause
        exit /b 1
    )
    echo [*] Python installed! Please restart this batch script or command prompt.
    pause
    exit /b 0
)

echo [*] Using Python: %PYTHON_CMD%
echo [*] Checking and installing required packages (opencv, mediapipe, pyautogui)...
%PYTHON_CMD% -m pip install -r requirements.txt --quiet
if %ERRORLEVEL% neq 0 (
    echo [!] Warning: Some dependencies may not have installed cleanly. Attempting launch...
)

echo.
echo [*] Starting AI Vision Gesture Controller...
echo [*] Keep this window running while playing in your browser.
echo.
%PYTHON_CMD% gesture_controller.py
echo.
pause
