/* MC Hosting Panel - Frontend */

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

// ---- Toast --------------------------------------------------------------
let toastTimer;
function toast(msg, kind = "") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 3200);
}

// ---- Estado / status ----------------------------------------------------
const LABELS = {
  stopped: "Detenido",
  starting: "Iniciando…",
  running: "En marcha",
  stopping: "Deteniendo…",
};

function applyStatus(info) {
  const s = info.status || "stopped";
  $("statusText").textContent = LABELS[s] || s;
  $("statusDot").className = "dot " + s;

  $("startBtn").disabled = s === "running" || s === "starting" || !info.installed;
  $("stopBtn").disabled = s === "stopped" || s === "stopping";

  if (info.installed) {
    $("installedInfo").textContent = `✓ Instalado: ${info.type} ${info.version}`;
  } else {
    $("installedInfo").textContent = "Aún no hay servidor instalado.";
  }

  // Info de conexión
  const port = $("p_port").value || "25565";
  $("connInfo").innerHTML =
    s === "running"
      ? `Conéctate en Minecraft a: <code>localhost:${port}</code><br>` +
        `Otros en tu red local usan tu IP local. Para internet necesitas abrir el puerto ${port} en tu router.`
      : "Inicia el servidor para poder conectarte.";
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
  // EventSource se reconecta solo; no necesitamos onerror manual.
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
}

// ---- Propiedades --------------------------------------------------------
async function loadProperties() {
  try {
    const p = await api("/api/properties");
    $("p_motd").value = p["motd"] ?? "";
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
  } catch (e) {
    toast("No se pudieron cargar las propiedades.", "err");
  }
}

async function saveProperties() {
  const body = {
    "motd": $("p_motd").value,
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
  } catch (e) {
    toast(e.message, "err");
  }
}

// ---- Acciones -----------------------------------------------------------
$("serverType").addEventListener("change", fillVersions);

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

$("saveBtn").addEventListener("click", saveProperties);

$("startBtn").addEventListener("click", async () => {
  // Guardamos la config antes de iniciar para aplicar cambios
  await saveProperties();
  const ram = parseInt($("p_ram").value, 10) || 2048;
  try {
    await api("/api/start", { method: "POST", body: JSON.stringify({ ram }) });
  } catch (e) {
    toast(e.message, "err");
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
  await Promise.all([loadVersions(), loadProperties(), refreshStatus()]);
})();
