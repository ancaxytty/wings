# 🟩 MC Hosting Panel

Panel de **hosting de Minecraft** local con interfaz web profesional. Descarga el
servidor oficial, lo configura y lo controla (iniciar / detener / consola en vivo)
desde tu navegador. Funciona de verdad: levanta un proceso real de Minecraft Java.

![estado](https://img.shields.io/badge/status-funcional-3ba55d)

## ✨ Características

- **Descarga automática** del servidor: Vanilla (oficial de Mojang) o Paper (optimizado).
- **Acepta el EULA** desde la interfaz.
- **Editor de `server.properties`**: puerto, MOTD, modo de juego, dificultad, máx. jugadores,
  PvP, modo online, lista blanca, semilla, RAM, etc.
- **Iniciar / Detener** el servidor con un clic.
- **Consola en vivo** vía WebSocket: ves el log en tiempo real y envías comandos
  (`say`, `op`, `time set day`, `stop`...).
- Indicador de estado en tiempo real (detenido / iniciando / en marcha).

## 📋 Requisitos

1. **Node.js 18 o superior** → https://nodejs.org
2. **Java** → el panel lo **descarga automáticamente** si no lo tienes (o lo tienes
   desactualizado). Si prefieres instalarlo tú: https://adoptium.net
   - Minecraft **1.20.5 / 1.21+** → Java 21+ · **1.18 – 1.20.4** → Java 17+ · **1.17** → 16 · antiguas → 8
3. Conexión a internet la primera vez (para descargar el .jar y, si hace falta, Java).

## ⚠️ Error "UnsupportedClassVersionError / class file version"

Si ves algo como `class file version 65.0 ... only recognizes ... up to 61.0`, significa que el
servidor está compilado para una versión de Java **más nueva** que la que tienes
(clase 65 = Java 21, clase 61 = Java 17).

**Ya no tienes que hacer nada:** el panel trae **descarga automática de Java**. Al pulsar
*Iniciar*, si tu Java no sirve para esa versión de Minecraft, el panel descarga un **Java
portable** (Adoptium Temurin) de la versión correcta y arranca el servidor con él, sin tocar
tu sistema ni el PATH. Lo guarda en la carpeta `runtime/`.

Si prefieres gestionarlo tú, en la tarjeta *Java* puedes:
- Desactivar la descarga automática.
- Indicar la ruta a un Java concreto.
- Pulsar *Descargar Java ahora* para bajarlo por adelantado.

## 🚀 Cómo usarlo

### Windows
Doble clic en **`start.bat`**. Se instalan las dependencias, arranca el panel y se
abre el navegador en `http://localhost:8080`.

### macOS / Linux
```bash
chmod +x start.sh
./start.sh
```

### Manual (cualquier sistema)
```bash
npm install
npm start
```
Luego abre `http://localhost:8080`.

## 🕹️ Pasos dentro del panel

1. **Instalar servidor** → elige tipo (Vanilla/Paper) y versión, pulsa *Descargar e instalar*.
2. **Aceptar EULA** → marca la casilla y guarda.
3. **Configurar** → ajusta puerto, MOTD, modo de juego, RAM, etc. y guarda.
4. **Iniciar** → pulsa ▶. Cuando el estado pase a *En marcha*, conéctate en Minecraft a
   `localhost:25565` (o el puerto que hayas puesto).

## 🌐 Jugar con amigos

- **Misma red local (LAN):** se conectan a `TU_IP_LOCAL:PUERTO`.
- **Por internet:** abre/redirecciona el puerto (por defecto `25565`) en tu router
  hacia tu PC, o usa un servicio de túnel (p. ej. *playit.gg*).

## 📁 Estructura

```
mc-hosting-panel/
├── server.js        # Backend Node.js (API + WebSocket + control del proceso)
├── package.json
├── start.bat        # Lanzador Windows
├── start.sh         # Lanzador macOS/Linux
├── public/          # Interfaz web (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── server/          # (se crea solo) servidor de Minecraft: jar, mundo, properties...
```

## ⚠️ Notas

- El primer arranque del servidor de Minecraft genera el mundo y puede tardar.
- Este panel es para uso **local/personal**; no expongas el puerto 8080 a internet sin
  añadir autenticación.
- Minecraft es propiedad de Mojang/Microsoft. Debes aceptar su EULA para ejecutarlo.
