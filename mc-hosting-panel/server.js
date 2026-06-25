/**
 * MC Hosting Panel v0.1 - Backend (CERO dependencias)
 * --------------------------------------------------------------
 * Servidor Node.js (solo modulos nativos) que gestiona de forma
 * REAL un servidor de Minecraft Java: descarga el .jar oficial
 * (Vanilla o Paper), acepta el EULA, edita server.properties,
 * detecta la version de Java instalada, arranca/detiene el
 * proceso y transmite la consola en vivo mediante SSE.
 *
 * No requiere `npm install`. Solo Node.js 18+.
 * --------------------------------------------------------------
 */

const http = require("http");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const VERSION = "0.1";
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0"; // escucha en todas las interfaces (localhost + IP de red)
const ROOT = __dirname;
const SERVER_DIR = path.join(ROOT, "server");
const PUBLIC_DIR = path.join(ROOT, "public");
const CONFIG_PATH = path.join(ROOT, "panel-config.json");

const state = {
  process: null,
  status: "stopped", // stopped | starting | running | stopping
  jar: null,
  type: null,
  version: null,
  startedAt: null,
  log: [],
};
const LOG_LIMIT = 1000;

// Configuracion persistente del panel (ruta de Java, RAM)
let config = { javaPath: "java", ram: 2048 };
function loadConfig() {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch { /* usa valores por defecto */ }
}
async function saveConfig() {
  await fsp.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ---------------------------------------------------------------------------
// SSE: clientes conectados para recibir consola/estado en vivo
// ---------------------------------------------------------------------------
const sseClients = new Set();

function sseSend(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}
function broadcast(obj) {
  for (const res of sseClients) {
    try { sseSend(res, obj); } catch { /* cliente caido */ }
  }
}

function pushLog(line, kind = "out") {
  const entry = { t: Date.now(), kind, line };
  state.log.push(entry);
  if (state.log.length > LOG_LIMIT) state.log.shift();
  broadcast({ type: "console", entry });
}

function setStatus(status) {
  state.status = status;
  broadcast({ type: "status", info: publicState() });
}

// IP local (LAN) para conexiones desde otros equipos
function getLanIp() {
  return (
    Object.values(os.networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal)?.address || null
  );
}

function publicState() {
  return {
    panelVersion: VERSION,
    status: state.status,
    type: state.type,
    version: state.version,
    jar: state.jar,
    startedAt: state.startedAt,
    installed: !!state.jar,
    eula: isEulaAccepted(),
    lanIp: getLanIp(),
    javaPath: config.javaPath,
  };
}

// ---------------------------------------------------------------------------
// Deteccion de Java y compatibilidad con Minecraft
// ---------------------------------------------------------------------------
function detectJava(javaPath) {
  const bin = javaPath || config.javaPath || "java";
  return new Promise((resolve) => {
    execFile(bin, ["-version"], (err, stdout, stderr) => {
      const out = `${stderr || ""}${stdout || ""}`;
      if (err && !out) {
        return resolve({ ok: false, error: err.message, bin });
      }
      // Ejemplos:  java version "1.8.0_381"  |  openjdk version "17.0.10"  |  "21.0.2"
      const m = out.match(/version "(\d+)(?:\.(\d+))?[^"]*"/);
      let major = null;
      if (m) {
        major = parseInt(m[1], 10);
        if (major === 1 && m[2]) major = parseInt(m[2], 10); // 1.8 -> 8
      }
      resolve({
        ok: !!major,
        major,
        raw: out.split(/\r?\n/)[0].trim(),
        bin,
      });
    });
  });
}

// Minecraft (Java Edition) requiere distintas versiones de Java
function requiredJavaFor(mcVersion) {
  if (!mcVersion) return 17;
  const parts = String(mcVersion).split(".").map((n) => parseInt(n, 10) || 0);
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  if (minor >= 21) return 21;
  if (minor === 20) return patch >= 5 ? 21 : 17;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

// Traduce "class file version 65.0" -> version de Java (65 -> 21)
function classFileToJava(classMajor) {
  return classMajor - 44;
}

// ---------------------------------------------------------------------------
// Utilidades de archivos / deteccion
// ---------------------------------------------------------------------------
async function ensureServerDir() {
  await fsp.mkdir(SERVER_DIR, { recursive: true });
}

function isEulaAccepted() {
  try {
    return /eula\s*=\s*true/i.test(
      fs.readFileSync(path.join(SERVER_DIR, "eula.txt"), "utf8")
    );
  } catch { return false; }
}

async function detectInstalledJar() {
  try {
    const files = await fsp.readdir(SERVER_DIR);
    const jar = files.find((f) => f.endsWith(".jar"));
    if (jar) {
      state.jar = jar;
      try {
        const meta = JSON.parse(
          await fsp.readFile(path.join(SERVER_DIR, "panel-meta.json"), "utf8")
        );
        state.type = meta.type || null;
        state.version = meta.version || null;
      } catch { /* sin metadatos */ }
    }
  } catch { /* dir no existe */ }
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
}

// ---------------------------------------------------------------------------
// server.properties
// ---------------------------------------------------------------------------
const PROPS_PATH = () => path.join(SERVER_DIR, "server.properties");

function parseProperties(text) {
  const obj = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    obj[line.slice(0, idx).trim()] = line.slice(idx + 1);
  }
  return obj;
}
function serializeProperties(obj) {
  const header = `# Minecraft server properties\n# Editado por MC Hosting Panel - ${new Date().toISOString()}\n`;
  return header + Object.entries(obj).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
}
const DEFAULT_PROPERTIES = {
  "server-ip": "",            // vacio = escucha en localhost Y en la IP de red
  "server-port": "25565",
  "motd": "Servidor creado con MC Hosting Panel",
  "gamemode": "survival",
  "difficulty": "easy",
  "max-players": "20",
  "online-mode": "true",
  "pvp": "true",
  "white-list": "false",
  "allow-nether": "true",
  "spawn-protection": "16",
  "view-distance": "10",
  "level-name": "world",
  "level-seed": "",
  "enable-command-block": "false",
  "allow-flight": "false",
};

// ---------------------------------------------------------------------------
// Logica de negocio (handlers)
// ---------------------------------------------------------------------------
async function getVersions() {
  const result = { vanilla: [], paper: [] };
  try {
    const man = await fetch(
      "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"
    ).then((r) => r.json());
    result.vanilla = man.versions
      .filter((v) => v.type === "release")
      .slice(0, 40)
      .map((v) => v.id);
  } catch (e) { result.vanillaError = e.message; }
  try {
    const paper = await fetch("https://api.papermc.io/v2/projects/paper").then((r) => r.json());
    result.paper = (paper.versions || []).slice(-40).reverse();
  } catch (e) { result.paperError = e.message; }
  return result;
}

async function installServer(type, version) {
  if (state.status !== "stopped") throw new Error("Deten el servidor antes de reinstalar.");
  if (!type || !version) throw new Error("Falta 'type' o 'version'.");

  await ensureServerDir();
  pushLog(`Buscando ${type} ${version}...`, "panel");

  let url;
  if (type === "vanilla") {
    const man = await fetch(
      "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"
    ).then((r) => r.json());
    const entry = man.versions.find((v) => v.id === version);
    if (!entry) throw new Error(`Version vanilla ${version} no encontrada.`);
    const meta = await fetch(entry.url).then((r) => r.json());
    url = meta.downloads?.server?.url;
    if (!url) throw new Error("Esa version no tiene servidor descargable.");
  } else if (type === "paper") {
    const builds = await fetch(
      `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`
    ).then((r) => r.json());
    const list = builds.builds || [];
    if (!list.length) throw new Error("No hay builds para esa version de Paper.");
    const last = list[list.length - 1];
    const jarName = last.downloads.application.name;
    url = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${last.build}/downloads/${jarName}`;
  } else {
    throw new Error("Tipo no soportado (usa vanilla o paper).");
  }

  const old = (await fsp.readdir(SERVER_DIR)).filter((f) => f.endsWith(".jar"));
  for (const f of old) await fsp.unlink(path.join(SERVER_DIR, f));

  const jarName = `${type}-${version}.jar`;
  const dest = path.join(SERVER_DIR, jarName);
  pushLog(`Descargando ${url}`, "panel");
  await downloadFile(url, dest);

  state.jar = jarName;
  state.type = type;
  state.version = version;
  await fsp.writeFile(
    path.join(SERVER_DIR, "panel-meta.json"),
    JSON.stringify({ type, version, jar: jarName }, null, 2)
  );
  if (!fs.existsSync(PROPS_PATH())) {
    await fsp.writeFile(PROPS_PATH(), serializeProperties(DEFAULT_PROPERTIES));
  }

  // Aviso de compatibilidad de Java
  const need = requiredJavaFor(version);
  const java = await detectJava();
  if (java.ok && java.major < need) {
    pushLog(
      `AVISO: Minecraft ${version} necesita Java ${need}+, pero tienes Java ${java.major}. ` +
      `Instala Java ${need}+ (https://adoptium.net) o elige una version de Minecraft compatible con Java ${java.major}.`,
      "err"
    );
  } else if (java.ok) {
    pushLog(`Java ${java.major} detectado: compatible con Minecraft ${version} (requiere ${need}+).`, "panel");
  }

  pushLog(`Servidor instalado: ${jarName}`, "panel");
  broadcast({ type: "status", info: publicState() });
  return publicState();
}

async function startServer(ram) {
  if (state.status === "running" || state.status === "starting") {
    throw new Error("El servidor ya esta en marcha.");
  }
  if (!state.jar) throw new Error("No hay servidor instalado. Instala una version primero.");
  if (!isEulaAccepted()) throw new Error("Debes aceptar el EULA de Minecraft antes de iniciar.");

  // Verificar Java y compatibilidad ANTES de arrancar (para dar un error claro)
  const need = requiredJavaFor(state.version);
  const java = await detectJava();
  if (!java.ok) {
    throw new Error(
      `No se encontro Java ejecutable en "${config.javaPath}". Instala Java ${need}+ desde https://adoptium.net ` +
      `o configura la ruta de Java en el panel.`
    );
  }
  if (java.major < need) {
    throw new Error(
      `Tu Java es la version ${java.major}, pero Minecraft ${state.version} necesita Java ${need} o superior ` +
      `(este es el error "class file version" que viste). Soluciones: 1) Instala Java ${need}+ desde ` +
      `https://adoptium.net y reinicia. 2) Indica la ruta a un Java ${need}+ en el panel. ` +
      `3) Instala una version de Minecraft compatible con Java ${java.major} (p. ej. 1.20.4 para Java 17).`
    );
  }

  ram = ram || config.ram || 2048;
  config.ram = ram;
  await saveConfig();
  const xmx = `-Xmx${ram}M`;
  const xms = `-Xms${Math.min(ram, 1024)}M`;

  setStatus("starting");
  pushLog(`Iniciando con ${java.raw} (${xms} ${xmx})...`, "panel");

  const args = [xms, xmx, "-jar", state.jar, "nogui"];
  const child = spawn(config.javaPath || "java", args, { cwd: SERVER_DIR });
  state.process = child;
  state.startedAt = Date.now();

  child.stdout.on("data", (d) => {
    d.toString().split(/\r?\n/).forEach((l) => {
      if (l.trim()) {
        pushLog(l, "out");
        if (/Done \([\d.]+s\)!/i.test(l) || /For help, type "help"/i.test(l)) setStatus("running");
      }
    });
  });
  child.stderr.on("data", (d) => {
    d.toString().split(/\r?\n/).forEach((l) => {
      if (!l.trim()) return;
      pushLog(l, "err");
      // Detectar y explicar el error de version de Java
      const cm = l.match(/class file version (\d+)\.\d+/);
      if (cm) {
        const neededJava = classFileToJava(parseInt(cm[1], 10));
        pushLog(
          `>> Este .jar necesita Java ${neededJava}+. Instala Java ${neededJava}+ desde https://adoptium.net ` +
          `(o indica su ruta en el panel) y vuelve a iniciar.`,
          "panel"
        );
      }
    });
  });
  child.on("error", (err) => {
    pushLog(`No se pudo iniciar Java: ${err.message}. Esta Java instalado y en el PATH?`, "err");
    state.process = null;
    setStatus("stopped");
  });
  child.on("close", (code) => {
    pushLog(`El servidor se ha detenido (codigo ${code}).`, "panel");
    state.process = null;
    state.startedAt = null;
    setStatus("stopped");
  });
}

function stopServer() {
  if (!state.process) throw new Error("El servidor no esta en marcha.");
  setStatus("stopping");
  pushLog("Enviando comando 'stop'...", "panel");
  try { state.process.stdin.write("stop\n"); }
  catch { try { state.process.kill(); } catch {} }
}

function sendCommand(cmd) {
  cmd = (cmd || "").trim();
  if (!state.process || state.status !== "running") throw new Error("El servidor no esta en marcha.");
  if (!cmd) throw new Error("Comando vacio.");
  state.process.stdin.write(cmd + "\n");
  pushLog(`> ${cmd}`, "cmd");
}

// ---------------------------------------------------------------------------
// Servidor HTTP (router + estaticos)
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
  });
}

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("Prohibido"); }
  try {
    const data = await fsp.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("No encontrado");
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  try {
    // ---- SSE ----
    if (url === "/api/stream" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("retry: 2000\n\n");
      sseSend(res, { type: "history", log: state.log, info: publicState() });
      sseClients.add(res);
      const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 25000);
      req.on("close", () => { clearInterval(ping); sseClients.delete(res); });
      return;
    }

    // ---- API ----
    if (url === "/api/status" && req.method === "GET") {
      return sendJSON(res, 200, publicState());
    }
    if (url === "/api/java" && req.method === "GET") {
      const java = await detectJava();
      return sendJSON(res, 200, {
        ...java,
        configuredPath: config.javaPath,
        requiredFor: state.version ? requiredJavaFor(state.version) : null,
        mcVersion: state.version,
      });
    }
    if (url === "/api/java" && req.method === "POST") {
      const b = await readBody(req);
      const newPath = (b.javaPath || "").trim() || "java";
      const java = await detectJava(newPath);
      if (!java.ok) {
        return sendJSON(res, 400, { error: `No se pudo ejecutar Java en "${newPath}".`, ...java });
      }
      config.javaPath = newPath;
      await saveConfig();
      pushLog(`Ruta de Java configurada: ${newPath} (Java ${java.major}).`, "panel");
      broadcast({ type: "status", info: publicState() });
      return sendJSON(res, 200, { ok: true, ...java });
    }
    if (url === "/api/versions" && req.method === "GET") {
      return sendJSON(res, 200, await getVersions());
    }
    if (url === "/api/install" && req.method === "POST") {
      const b = await readBody(req);
      const info = await installServer(b.type, b.version);
      return sendJSON(res, 200, { ok: true, info });
    }
    if (url === "/api/eula" && req.method === "POST") {
      const b = await readBody(req);
      await ensureServerDir();
      const accept = b.accept === true;
      await fsp.writeFile(
        path.join(SERVER_DIR, "eula.txt"),
        `# Aceptado mediante MC Hosting Panel ${new Date().toISOString()}\neula=${accept}\n`
      );
      pushLog(`EULA establecido a ${accept}.`, "panel");
      return sendJSON(res, 200, { ok: true, eula: accept });
    }
    if (url === "/api/properties" && req.method === "GET") {
      let props = { ...DEFAULT_PROPERTIES };
      if (fs.existsSync(PROPS_PATH())) props = parseProperties(await fsp.readFile(PROPS_PATH(), "utf8"));
      return sendJSON(res, 200, props);
    }
    if (url === "/api/properties" && req.method === "POST") {
      const incoming = await readBody(req);
      await ensureServerDir();
      let current = { ...DEFAULT_PROPERTIES };
      if (fs.existsSync(PROPS_PATH())) current = parseProperties(await fsp.readFile(PROPS_PATH(), "utf8"));
      const merged = { ...current, ...incoming };
      await fsp.writeFile(PROPS_PATH(), serializeProperties(merged));
      pushLog("server.properties guardado.", "panel");
      return sendJSON(res, 200, { ok: true, properties: merged });
    }
    if (url === "/api/start" && req.method === "POST") {
      const b = await readBody(req);
      await startServer(parseInt(b.ram, 10) || config.ram || 2048);
      return sendJSON(res, 200, { ok: true });
    }
    if (url === "/api/stop" && req.method === "POST") {
      stopServer();
      return sendJSON(res, 200, { ok: true });
    }
    if (url === "/api/command" && req.method === "POST") {
      const b = await readBody(req);
      sendCommand(b.command);
      return sendJSON(res, 200, { ok: true });
    }

    // ---- Estaticos ----
    if (req.method === "GET") return serveStatic(req, res);

    res.writeHead(404);
    res.end("No encontrado");
  } catch (e) {
    sendJSON(res, 500, { error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
(async () => {
  loadConfig();
  await ensureServerDir();
  await detectInstalledJar();
  server.listen(PORT, HOST, async () => {
    const ip = getLanIp();
    const java = await detectJava();
    console.log("==================================================");
    console.log(`  MC Hosting Panel v${VERSION} (cero dependencias)`);
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  IP num.: http://127.0.0.1:${PORT}`);
    if (ip) console.log(`  Red:     http://${ip}:${PORT}`);
    console.log(java.ok ? `  Java:    ${java.raw} (v${java.major})` : "  Java:    NO detectado (instala https://adoptium.net)");
    console.log("==================================================");
  });
})();

function shutdown() {
  if (state.process) { try { state.process.stdin.write("stop\n"); } catch {} }
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
