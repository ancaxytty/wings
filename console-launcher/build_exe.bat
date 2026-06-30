@echo off
REM ===================================================================
REM  Nexus Game Center - Generador de .EXE (Windows)
REM  Haz DOBLE CLIC en este archivo en tu PC con Windows.
REM  Crea el entorno, instala dependencias y construye el .exe.
REM  El resultado queda en la carpeta  dist\NexusGameCenter.exe
REM ===================================================================

REM Trabajar SIEMPRE en la carpeta donde esta este .bat
REM (evita el error "No such file or directory: requirements.txt")
cd /d "%~dp0"

REM Verificar que estamos en la carpeta correcta del proyecto
if not exist "requirements.txt" (
    echo [ERROR] No se encuentra requirements.txt en:
    echo    %cd%
    echo.
    echo Asegurate de DESCOMPRIMIR el zip y de que este .bat este
    echo dentro de la carpeta "console-launcher" junto a main.py y
    echo requirements.txt. No lo ejecutes desde dentro del .zip.
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Nexus Game Center - Construyendo el .EXE
echo ============================================
echo.

REM 1) Comprobar que Python esta instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No se encontro Python.
    echo Instala Python 3.10+ desde https://www.python.org/downloads/
    echo y marca la casilla "Add Python to PATH" durante la instalacion.
    pause
    exit /b 1
)

REM 2) Crear entorno virtual (si no existe)
if not exist ".venv" (
    echo [1/4] Creando entorno virtual...
    python -m venv .venv
)

REM 3) Instalar dependencias + PyInstaller
echo [2/4] Instalando dependencias...
call ".venv\Scripts\python.exe" -m pip install --upgrade pip
call ".venv\Scripts\python.exe" -m pip install -r requirements.txt pyinstaller
if errorlevel 1 (
    echo [ERROR] Fallo la instalacion de dependencias.
    pause
    exit /b 1
)

REM 4) Construir el ejecutable
echo [3/4] Generando el .exe con PyInstaller...
call ".venv\Scripts\python.exe" -m PyInstaller ^
    --noconsole ^
    --onefile ^
    --name "NexusGameCenter" ^
    --collect-all customtkinter ^
    --collect-all PIL ^
    --clean ^
    --noconfirm ^
    main.py
if errorlevel 1 (
    echo [ERROR] Fallo la construccion del .exe.
    pause
    exit /b 1
)

echo.
echo [4/4] LISTO!
echo Tu ejecutable esta en:  dist\NexusGameCenter.exe
echo.
pause
