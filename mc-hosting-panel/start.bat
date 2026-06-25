@echo off
title MC Hosting Panel
color 0A
cd /d "%~dp0"

echo ==================================================
echo            MC HOSTING PANEL - Inicio
echo ==================================================
echo.

REM --- Comprobar Node.js ---
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No se ha encontrado Node.js.
    echo Descargalo e instalalo desde: https://nodejs.org
    echo Luego vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node.js %%v detectado.

REM --- Comprobar Java (necesario para el servidor de Minecraft) ---
where java >nul 2>nul
if %errorlevel% neq 0 (
    echo [AVISO] No se ha encontrado Java.
    echo El panel se abrira igual, pero NECESITAS Java para iniciar el
    echo servidor de Minecraft. Descargalo desde: https://adoptium.net
    echo.
) else (
    echo [OK] Java detectado.
)

echo.
echo [OK] Cero dependencias: no hace falta npm install.
echo.
echo [..] Iniciando el panel en http://localhost:8080
echo.

REM --- Abrir el navegador despues de un breve retardo ---
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8080"

REM --- Arrancar el servidor (esta ventana queda como consola del panel) ---
node server.js

echo.
echo El panel se ha detenido.
pause
