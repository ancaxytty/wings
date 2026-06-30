@echo off
REM ===================================================================
REM   NEXUS GAME CENTER  -  Configurar emuladores (1 sola vez)
REM   Crea las subcarpetas y abre las paginas oficiales de descarga.
REM ===================================================================
cd /d "%~dp0"

if not exist "emulators\duckstation" mkdir "emulators\duckstation"
if not exist "emulators\pcsx2"       mkdir "emulators\pcsx2"
if not exist "emulators\ppsspp"      mkdir "emulators\ppsspp"

cls
echo ============================================================
echo   CONFIGURACION DE EMULADORES
echo ============================================================
echo.
echo  Se abriran las paginas oficiales. Descarga la version
echo  PORTABLE de cada emulador y descomprimela dentro de:
echo.
echo     emulators\duckstation   (PS1)
echo     emulators\pcsx2         (PS2)
echo     emulators\ppsspp        (PSP)
echo.
echo  Luego abre Nexus Game Center: detectara los .exe solo.
echo ============================================================
echo.
pause

start "" "https://www.duckstation.org/"
start "" "https://pcsx2.net/downloads/"
start "" "https://www.ppsspp.org/download/"

echo.
echo Listo. Cuando termines de copiar los emuladores, abre la app.
echo.
pause
