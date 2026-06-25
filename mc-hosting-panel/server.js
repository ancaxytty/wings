/**
 * MC Hosting Panel - Backend (CERO dependencias)
 * --------------------------------------------------------------
 * Servidor Node.js (solo modulos nativos) que gestiona de forma
 * REAL un servidor de Minecraft Java: descarga el .jar oficial
 * (Vanilla o Paper), acepta el EULA, edita server.properties,
 * arranca/detiene el proceso de Java y transmite la consola en
 * vivo mediante Server-Sent Events (SSE).
 *
 * No requiere `npm install`. Solo Node.js 18+.
 * --------------------------------------------------------------
 */

const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const SERVER_DIR = path.join(ROOT, "server");
const PUBLIC_DIR = path.join(ROOT, "public");

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

function publicState() {
  return {
    status: state.status,
    type: state.type,
    version: state.version,
    jar: state.jar,
    startedAt: state.startedAt,
    installed: !!state.jar,
    eula: isEulaAccepted(),
  };
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
  pushLog(`Servidor instalado: ${jarName}`, "panel");
  broadcast({ type: "status", info: publicState() });
  return publicState();
}

function startServer(ram) {
  if (state.status === "running" || state.status === "starting") {
    throw new Error("El servidor ya esta en marcha.");
  }
  if (!state.jar) throw new Error("No hay servidor instalado. Instala una version primero.");
  if (!isEulaAccepted()) throw new Error("Debes aceptar el EULA de Minecraft antes de iniciar.");

  ram = ram || 2048;
  const xmx = `-Xmx${ram}M`;
  const xms = `-Xms${Math.min(ram, 1024)}M`;

  setStatus("starting");
  pushLog(`Iniciando servidor (${xms} ${xmx})...`, "panel");

  const args = [xms, xmx, "-jar", state.jar, "nogui"];
  const child = spawn("java", args, { cwd: SERVER_DIR });
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
    d.toString().split(/\r?\n/).forEach((l) => { if (l.trim()) pushLog(l, "err"); });
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
      startServer(parseInt(b.ram, 10) || 2048);
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
  await ensureServerDir();
  await detectInstalledJar();
  server.listen(PORT, () => {
    const ip = Object.values(os.networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
    console.log("==================================================");
    console.log("  MC Hosting Panel iniciado (cero dependencias)");
    console.log(`  Local:   http://localhost:${PORT}`);
    if (ip) console.log(`  Red:     http://${ip}:${PORT}`);
    console.log("==================================================");
  });
})();

function shutdown() {
  if (state.process) { try { state.process.stdin.write("stop\n"); } catch {} }
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
