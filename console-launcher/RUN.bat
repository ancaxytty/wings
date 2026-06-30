@echo off
setlocal EnableDelayedExpansion
REM ===================================================================
REM   NEXUS GAME CENTER  -  Ejecutar la app (sin generar .exe)
REM   Util para probar rapido. Crea el entorno la primera vez.
REM ===================================================================
cd /d "%~dp0"

set "PYEXE="
py -3 --version >nul 2>&1 && set "PYEXE=py -3"
if not defined PYEXE ( python --version >nul 2>&1 && set "PYEXE=python" )
if not defined PYEXE (
    echo [ERROR] No se encontro Python. Instalalo desde https://www.python.org/downloads/
    echo y marca "Add python.exe to PATH".
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo Creando entorno virtual...
    !PYEXE! -m venv .venv
    ".venv\Scripts\python.exe" -m pip install --upgrade pip
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)

echo Iniciando Nexus Game Center...
".venv\Scripts\python.exe" main.py
if errorlevel 1 pause
