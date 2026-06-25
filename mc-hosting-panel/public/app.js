/* MC Hosting Panel v0.1 - Frontend */

const $ = (id) => document.getElementById(id);
const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
};

let lastInfo = {};       // ultimo estado del servidor
let javaInfo = null;     // ultima deteccion de Java

// ---- Toast --------------------------------------------------------------
let toastTimer;
function toast(msg, kind = "") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 4500);
}

// ---- Compatibilidad Java/Minecraft (igual que en el backend) ------------
function requiredJavaFor(mcVersion) {
  if (!mcVersion) return 17;
  const p = String(mcVersion).split(".").map((n) => parseInt(n, 10) || 0);
  const minor = p[1] || 0, patch = p[2] || 0;
  if (minor >= 21) return 21;
  if (minor === 20) return patch >= 5 ? 21 : 17;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

// ---- Estado / status ----------------------------------------------------
const LABELS = {
  stopped: "Detenido",
  starting: "Iniciando…",
  running: "En marcha",
  stopping: "Deteniendo…",
};

function applyStatus(info) {
  lastInfo = info || {};
  const s = info.status || "stopped";
  $("statusText").textContent = LABELS[s] || s;
  $("statusDot").className = "dot " + s;
  if (info.panelVersion) $("panelVer").textContent = "v" + info.panelVersion;

  $("startBtn").disabled = s === "running" || s === "starting" || !info.installed;
  $("stopBtn").disabled = s === "stopped" || s === "stopping";

  $("installedInfo").textContent = info.installed
    ? `✓ Instalado: ${info.type} ${info.version}`
    : "Aún no hay servidor instalado.";

  if (typeof info.autoJava === "boolean" && $("autoJava")) $("autoJava").checked = info.autoJava;

  updateConnInfo();
  updateJavaHint();
}

function updateConnInfo() {
  const s = lastInfo.status || "stopped";
  const port = $("p_port").value || "25565";
  const ip = lastInfo.lanIp;
  if (s === "running") {
    $("connInfo").innerHTML =
      `Conéctate en Minecraft a:<br>` +
      `&nbsp;&nbsp;• <code>localhost:${port}</code> (en este PC)<br>` +
      `&nbsp;&nbsp;• <code>127.0.0.1:${port}</code> (IP numérica local)<br>` +
      (ip ? `&nbsp;&nbsp;• <code>${ip}:${port}</code> (otros en tu red / LAN)<br>` : "") +
      `Para internet: abre el puerto ${port} en tu router o usa un túnel (playit.gg).`;
  } else {
    $("connInfo").innerHTML = "Inicia el servidor para poder conectarte.";
  }
}

// ---- Consola ------------------------------------------------------------
const consoleEl = () => $("console");
function appendLine(entry) {
  const div = document.createElement("span");
  div.className = "l " + (entry.kind || "out");
  div.textContent = entry.line;
  const c = consoleEl();
  const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
  c.appendChild(div);
  if (atBottom) c.scrollTop = c.scrollHeight;
}

// ---- SSE (Server-Sent Events) ------------------------------------------
function connectStream() {
  const es = new EventSource("/api/stream");
  es.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "history") {
      consoleEl().innerHTML = "";
      msg.log.forEach(appendLine);
      if (msg.info) applyStatus(msg.info);
    } else if (msg.type === "console") {
      appendLine(msg.entry);
    } else if (msg.type === "status") {
      applyStatus(msg.info);
    }
  };
}

// ---- Java ---------------------------------------------------------------
async function loadJava() {
  try {
    javaInfo = await api("/api/java");
    const el = $("javaStatus");
    if (javaInfo.ok) {
      el.className = "java-status ok";
      el.innerHTML = `✓ Java <b>${javaInfo.major}</b> detectado<br><code>${javaInfo.raw || javaInfo.bin}</code>`;
      $("javaPath").value = javaInfo.configuredPath && javaInfo.configuredPath !== "java" ? javaInfo.configuredPath : "";
    } else {
      el.className = "java-status bad";
      el.innerHTML = `✗ No se detectó Java en <code>${javaInfo.configuredPath || "java"}</code>.<br>` +
        `Instálalo desde <a href="https://adoptium.net" target="_blank" rel="noopener">adoptium.net</a> o indica la ruta abajo.`;
    }
    updateJavaHint();
  } catch (e) {
    $("javaStatus").className = "java-status bad";
    $("javaStatus").textContent = "No se pudo comprobar Java.";
  }
}

function updateJavaHint() {
  const hint = $("javaHint");
  const version = $("serverVersion").value;
  if (!version || version === "Cargando…" || version === "Sin datos") { hint.textContent = ""; return; }
  const need = requiredJavaFor(version);
  const auto = $("autoJava") ? $("autoJava").checked : true;
  if (!javaInfo || !javaInfo.ok) {
    hint.className = "hint warn";
    hint.innerHTML = `Minecraft ${version} requiere <b>Java ${need}+</b>.` +
      (auto ? ` El panel lo descargará automáticamente al iniciar.` : ` (No se ha detectado Java.)`);
    return;
  }
  if (javaInfo.major < need) {
    if (auto) {
      hint.className = "hint ok";
      hint.innerHTML =
        `Minecraft ${version} requiere <b>Java ${need}+</b> y tienes Java ${javaInfo.major}.<br>` +
        `✓ No te preocupes: el panel descargará Java ${need} automáticamente al pulsar Iniciar.`;
    } else {
      hint.className = "hint warn";
      hint.innerHTML =
        `⚠ Minecraft ${version} requiere <b>Java ${need}+</b> y tienes Java ${javaInfo.major}.<br>` +
        `Activa la descarga automática de Java, o elige una versión compatible con Java ${javaInfo.major}.`;
    }
  } else {
    hint.className = "hint ok";
    hint.innerHTML = `✓ Minecraft ${version} requiere Java ${need}+ · tienes Java ${javaInfo.major}. Compatible.`;
  }
}

// ---- Versiones ----------------------------------------------------------
let VERSIONS = { vanilla: [], paper: [] };
async function loadVersions() {
  try {
    VERSIONS = await api("/api/versions");
    fillVersions();
  } catch (e) {
    $("serverVersion").innerHTML = "<option>Error de red</option>";
    toast("No se pudieron cargar las versiones: " + e.message, "err");
  }
}
function fillVersions() {
  const type = $("serverType").value;
  const list = VERSIONS[type] || [];
  $("serverVersion").innerHTML = list.length
    ? list.map((v) => `<option value="${v}">${v}</option>`).join("")
    : "<option>Sin datos</option>";
  updateJavaHint();
}

// ---- Propiedades --------------------------------------------------------
async function loadProperties() {
  try {
    const p = await api("/api/properties");
    $("p_motd").value = p["motd"] ?? "";
    $("p_ip").value = p["server-ip"] ?? "";
    $("p_port").value = p["server-port"] ?? "25565";
    $("p_gamemode").value = p["gamemode"] ?? "survival";
    $("p_difficulty").value = p["difficulty"] ?? "easy";
    $("p_maxplayers").value = p["max-players"] ?? "20";
    $("p_viewdistance").value = p["view-distance"] ?? "10";
    $("p_seed").value = p["level-seed"] ?? "";
    $("p_pvp").checked = p["pvp"] !== "false";
    $("p_online").checked = p["online-mode"] !== "false";
    $("p_whitelist").checked = p["white-list"] === "true";
    $("p_flight").checked = p["allow-flight"] === "true";
    $("p_cmdblock").checked = p["enable-command-block"] === "true";
    updateConnInfo();
  } catch (e) {
    toast("No se pudieron cargar las propiedades.", "err");
  }
}

async function saveProperties() {
  const body = {
    "motd": $("p_motd").value,
    "server-ip": $("p_ip").value.trim(),
    "server-port": $("p_port").value,
    "gamemode": $("p_gamemode").value,
    "difficulty": $("p_difficulty").value,
    "max-players": $("p_maxplayers").value,
    "view-distance": $("p_viewdistance").value,
    "level-seed": $("p_seed").value,
    "pvp": $("p_pvp").checked ? "true" : "false",
    "online-mode": $("p_online").checked ? "true" : "false",
    "white-list": $("p_whitelist").checked ? "true" : "false",
    "allow-flight": $("p_flight").checked ? "true" : "false",
    "enable-command-block": $("p_cmdblock").checked ? "true" : "false",
  };
  try {
    await api("/api/properties", { method: "POST", body: JSON.stringify(body) });
    toast("Configuración guardada ✓", "ok");
    updateConnInfo();
  } catch (e) {
    toast(e.message, "err");
  }
}

// ---- Acciones -----------------------------------------------------------
$("serverType").addEventListener("change", fillVersions);
$("serverVersion").addEventListener("change", updateJavaHint);

$("installBtn").addEventListener("click", async () => {
  const type = $("serverType").value;
  const version = $("serverVersion").value;
  $("installBtn").disabled = true;
  $("installBtn").textContent = "Descargando… (puede tardar)";
  try {
    await api("/api/install", { method: "POST", body: JSON.stringify({ type, version }) });
    toast("Servidor instalado ✓", "ok");
    await loadProperties();
    await refreshStatus();
  } catch (e) {
    toast(e.message, "err");
  } finally {
    $("installBtn").disabled = false;
    $("installBtn").textContent = "Descargar e instalar";
  }
});

$("eulaBtn").addEventListener("click", async () => {
  try {
    await api("/api/eula", { method: "POST", body: JSON.stringify({ accept: $("eulaCheck").checked }) });
    toast($("eulaCheck").checked ? "EULA aceptado ✓" : "EULA desactivado", "ok");
  } catch (e) {
    toast(e.message, "err");
  }
});

$("javaBtn").addEventListener("click", async () => {
  try {
    const r = await api("/api/java", { method: "POST", body: JSON.stringify({ javaPath: $("javaPath").value.trim() }) });
    toast(`Java ${r.major} configurado ✓`, "ok");
    await loadJava();
  } catch (e) {
    toast(e.message, "err");
    await loadJava();
  }
});

$("autoJava").addEventListener("change", async () => {
  try {
    await api("/api/java/auto", { method: "POST", body: JSON.stringify({ enabled: $("autoJava").checked }) });
    updateJavaHint();
  } catch (e) { toast(e.message, "err"); }
});

$("javaDownloadBtn").addEventListener("click", async () => {
  const need = requiredJavaFor($("serverVersion").value) || 21;
  const btn = $("javaDownloadBtn");
  btn.disabled = true;
  btn.textContent = `Descargando Java ${need}…`;
  toast(`Descargando Java ${need}… puede tardar 1-3 min. Mira la consola.`, "");
  try {
    const r = await api("/api/java/download", { method: "POST", body: JSON.stringify({ major: need }) });
    toast(`Java ${r.major} portable listo ✓`, "ok");
    await loadJava();
  } catch (e) {
    toast(e.message, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Descargar Java ahora";
  }
});

$("saveBtn").addEventListener("click", saveProperties);

$("startBtn").addEventListener("click", async () => {
  await saveProperties();
  const ram = parseInt($("p_ram").value, 10) || 2048;
  const btn = $("startBtn");
  btn.disabled = true;
  btn.textContent = "Preparando…";
  try {
    await api("/api/start", { method: "POST", body: JSON.stringify({ ram }) });
  } catch (e) {
    toast(e.message, "err");
  } finally {
    btn.textContent = "▶ Iniciar";
    // el estado real lo repone applyStatus via SSE
  }
});

$("stopBtn").addEventListener("click", async () => {
  try {
    await api("/api/stop", { method: "POST" });
  } catch (e) {
    toast(e.message, "err");
  }
});

$("cmdForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const input = $("cmdInput");
  const command = input.value.trim();
  if (!command) return;
  try {
    await api("/api/command", { method: "POST", body: JSON.stringify({ command }) });
    input.value = "";
  } catch (e) {
    toast(e.message, "err");
  }
});

async function refreshStatus() {
  try {
    const info = await api("/api/status");
    applyStatus(info);
    $("eulaCheck").checked = info.eula;
  } catch {}
}

// ---- Init ---------------------------------------------------------------
(async function init() {
  connectStream();
  await Promise.all([loadVersions(), loadProperties(), refreshStatus(), loadJava()]);
})();
