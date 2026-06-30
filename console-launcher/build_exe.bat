@echo off
setlocal EnableDelayedExpansion
REM ===================================================================
REM   NEXUS GAME CENTER  -  Generador de .EXE para Windows
REM   Haz DOBLE CLIC en este archivo (despues de DESCOMPRIMIR el zip).
REM   Crea el .exe en:  dist\NexusGameCenter.exe
REM   Todo el proceso queda registrado en:  build_log.txt
REM ===================================================================

REM Situarse SIEMPRE en la carpeta de este .bat
cd /d "%~dp0"
set "LOG=%cd%\build_log.txt"
echo ============================================================ > "%LOG%"
echo  NEXUS GAME CENTER - Log de construccion >> "%LOG%"
echo  Carpeta: %cd% >> "%LOG%"
echo ============================================================ >> "%LOG%"

cls
echo ============================================================
echo    NEXUS GAME CENTER - Construyendo el ejecutable (.exe)
echo ============================================================
echo  Carpeta de trabajo: %cd%
echo  Log detallado:      build_log.txt
echo ============================================================
echo.

REM --- 0) Verificar archivos del proyecto -------------------------------
if not exist "main.py" goto :NO_PROJECT
if not exist "requirements.txt" goto :NO_PROJECT

REM --- 1) Detectar Python (probamos 'py -3' y luego 'python') -----------
set "PYEXE="
py -3 --version >nul 2>&1 && set "PYEXE=py -3"
if not defined PYEXE (
    python --version >nul 2>&1 && set "PYEXE=python"
)
if not defined PYEXE goto :NO_PYTHON
echo [1/5] Python detectado: !PYEXE!
!PYEXE! --version
!PYEXE! --version >> "%LOG%" 2>&1

REM --- 2) Crear entorno virtual ----------------------------------------
if not exist ".venv\Scripts\python.exe" (
    echo [2/5] Creando entorno virtual .venv ...
    !PYEXE! -m venv .venv >> "%LOG%" 2>&1
)
if not exist ".venv\Scripts\python.exe" goto :VENV_FAIL
set "VPY=.venv\Scripts\python.exe"
echo [2/5] Entorno virtual listo.

REM --- 3) Instalar dependencias ----------------------------------------
echo [3/5] Instalando dependencias (puede tardar 1-2 min)...
"%VPY%" -m pip install --upgrade pip >> "%LOG%" 2>&1
"%VPY%" -m pip install -r requirements.txt pyinstaller >> "%LOG%" 2>&1
if errorlevel 1 goto :PIP_FAIL
echo [3/5] Dependencias instaladas.

REM --- 4) Construir el .exe --------------------------------------------
echo [4/5] Generando el ejecutable con PyInstaller...
set "ICON_ARG="
if exist "app.ico" set "ICON_ARG=--icon app.ico --add-data app.ico;."
"%VPY%" -m PyInstaller --noconsole --onefile --name "NexusGameCenter" ^
    %ICON_ARG% ^
    --collect-all customtkinter ^
    --collect-all PIL ^
    --clean --noconfirm main.py >> "%LOG%" 2>&1
if errorlevel 1 goto :BUILD_FAIL

REM --- 5) Verificar resultado ------------------------------------------
if not exist "dist\NexusGameCenter.exe" goto :BUILD_FAIL
echo [5/5] LISTO!
echo.
echo ============================================================
echo   EXITO  -  Tu ejecutable esta en:
echo   %cd%\dist\NexusGameCenter.exe
echo ============================================================
echo Abriendo la carpeta dist ...
start "" "%cd%\dist"
echo.
pause
exit /b 0


:NO_PROJECT
echo [ERROR] No se encuentran main.py / requirements.txt en esta carpeta:
echo    %cd%
echo.
echo CAUSA MAS COMUN: ejecutaste el .bat sin DESCOMPRIMIR el zip.
echo Solucion: clic derecho en el zip -^> "Extraer todo", entra en la
echo carpeta "console-launcher" extraida y ejecuta este .bat desde ahi.
echo.
pause
exit /b 1

:NO_PYTHON
echo [ERROR] No se encontro Python en el sistema.
echo.
echo Instala Python 3.10 o superior desde:
echo    https://www.python.org/downloads/
echo IMPORTANTE: durante la instalacion marca la casilla
echo    "Add python.exe to PATH"
echo Luego vuelve a ejecutar este archivo.
echo.
pause
exit /b 1

:VENV_FAIL
echo [ERROR] No se pudo crear el entorno virtual.
echo Revisa build_log.txt para ver el detalle.
echo.
pause
exit /b 1

:PIP_FAIL
echo [ERROR] Fallo la instalacion de dependencias.
echo Necesitas conexion a internet para esta parte.
echo Revisa el detalle en: build_log.txt
echo.
pause
exit /b 1

:BUILD_FAIL
echo [ERROR] PyInstaller no pudo generar el .exe.
echo Revisa el detalle del error en: build_log.txt
echo.
pause
exit /b 1
