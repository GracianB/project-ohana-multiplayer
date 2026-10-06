import { ROSTER } from "./characters/roster.js";
import { drawCharacter } from "./characters/draw.js";
import { WORLDS, renderWorld } from "./worlds/index.js";

const endpoint = "/.netlify/functions/game";
const state = { roomId: "", identity: null, snapshot: null, sequence: 0, keys: new Set(), running: false, lastSend: 0, lastPoll: 0, raf: 0 };
const $ = (id) => document.getElementById(id);
const entry = $("entry"), lobby = $("lobby"), gamePanel = $("game-panel");

function showError(id, message = "") { $(id).textContent = message; }
function acceptSnapshot(snapshot) {
  if (!snapshot) return state.snapshot;
  if (!state.snapshot || snapshot.revision >= state.snapshot.revision) state.snapshot = snapshot;
  const you = state.snapshot.players.find((player) => player.isYou);
  if (you) state.sequence = Math.max(state.sequence, you.lastSequence || 0);
  return state.snapshot;
}
async function api(action, payload = {}) {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ action, roomId: state.roomId, identity: state.identity, ...payload }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || "No se pudo conectar con la sala.");
  return result.data;
}

function persistSession() {
  try { sessionStorage.setItem("ohana-coop-session", JSON.stringify({ roomId: state.roomId, identity: state.identity })); } catch {}
}

function enterLobby(snapshot) {
  acceptSnapshot(snapshot);
  state.roomId = snapshot.roomId;
  state.identity = snapshot.identity || state.identity;
  persistSession();
  entry.hidden = true; lobby.hidden = false; gamePanel.hidden = true;
  $("room-code").textContent = state.roomId;
  renderLobby();
  void pollLoop();
}

function renderLobby() {
  const snap = state.snapshot;
  const cards = $("player-slots"); cards.replaceChildren();
  for (let slot = 0; slot < 2; slot++) {
    const player = snap.players.find((item) => item.slot === slot);
    const card = document.createElement("div"); card.className = "player-slot";
    const character = ROSTER.find((entry) => entry.id === player?.characterId);
    card.innerHTML = `<b>Jugador ${slot + 1}${player?.isYou ? " · Tú" : ""}</b><small>${player?.connected ? (character ? character.name : "Elige personaje") : "Esperando conexión…"}</small>`;
    cards.append(card);
  }
  const grid = $("character-grid"); grid.replaceChildren();
  const you = snap.players.find((player) => player.isYou);
  for (const character of ROSTER) {
    const button = document.createElement("button");
    button.type = "button"; button.className = `character-card${you?.characterId === character.id ? " selected" : ""}`;
    button.setAttribute("aria-label", `Elegir ${character.name}`);
    const img = document.createElement("img"); img.src = `assets/portraits/${character.id}.jpg`; img.alt = ""; img.loading = "lazy";
    const label = document.createElement("span"); label.textContent = character.name;
    button.append(img, label);
    button.addEventListener("click", async () => {
      try { acceptSnapshot(await api("choose", { characterId: character.id })); renderLobby(); }
      catch (error) { showError("lobby-error", error.message); }
    });
    grid.append(button);
  }
  const ready = snap.players.length === 2 && snap.players.every((player) => player.connected && player.characterId);
  $("lobby-status").textContent = ready ? "¡La familia está lista! Cargando Isla Hoku…" : `Sala ${snap.players.length}/2 · Elige personaje y espera a tu compañero.`;
  if (ready) enterGame();
}

async function pollLoop() {
  if (state.running || !state.roomId) return;
  while (!state.running && state.roomId) {
    try {
      acceptSnapshot(await api("poll"));
      if (state.snapshot.phase === "playing") enterGame();
      else renderLobby();
    } catch (error) { showError("lobby-error", error.message); }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}

function enterGame() {
  if (state.running) return;
  state.running = true;
  lobby.hidden = true; gamePanel.hidden = false;
  $("you-label").textContent = state.snapshot.players.find((player) => player.isYou)?.name || "Jugador";
  state.lastPoll = 0;
  state.raf = requestAnimationFrame(drawFrame);
}

function drawFrame(time) {
  if (!state.running) return;
  const canvas = $("arena"), ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, canvas.clientWidth), height = width * 9 / 16;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
  ctx.setTransform(canvas.width / 1280, 0, 0, canvas.height / 720, 0, 0);
  renderWorld(ctx, WORLDS[0], { x: 0, y: 0 }, time, 1280, 720);
  ctx.fillStyle = "#c9964e"; ctx.fillRect(0, 580, 1280, 140);
  ctx.fillStyle = "#6bb86a"; ctx.fillRect(0, 572, 1280, 10);
  for (const player of state.snapshot?.players || []) {
    if (!player.connected || !player.characterId) continue;
    const definition = ROSTER.find((item) => item.id === player.characterId);
    if (!definition) continue;
    const character = { ...definition, x: player.x - definition.w / 2, y: player.y - definition.h, vx: 0, vy: 0, facing: player.facing, grounded: true, evo: 0, phase: time / 42, state: "idle", atk: 0, invuln: 0, hurtFlash: 0, rng: () => 0.5, _land: 0 };
    drawCharacter(ctx, character, { x: 0, y: 0 }, time);
    ctx.fillStyle = "#fff"; ctx.font = "600 17px Outfit"; ctx.textAlign = "center";
    ctx.fillText(`${player.isYou ? "Tú" : "Compañero"} · ${definition.name}`, player.x, player.y - 96);
  }
  if (time - state.lastPoll > 450) {
    state.lastPoll = time;
    void api("poll").then(acceptSnapshot).catch((error) => { showError("lobby-error", error.message); });
  }
  if (state.keys.size && time - state.lastSend > 150) {
    state.lastSend = time;
    const x = (state.keys.has("ArrowRight") || state.keys.has("d") ? 1 : 0) - (state.keys.has("ArrowLeft") || state.keys.has("a") ? 1 : 0);
    const y = (state.keys.has("ArrowDown") || state.keys.has("s") ? 1 : 0) - (state.keys.has("ArrowUp") || state.keys.has("w") ? 1 : 0);
    const sequence = ++state.sequence;
    void api("move", { x, y, sequence, actionId: `${state.identity.playerId}:${sequence}` }).then(acceptSnapshot).catch((error) => { showError("lobby-error", error.message); });
  }
  state.raf = requestAnimationFrame(drawFrame);
}

$("create-room").addEventListener("click", async () => {
  showError("entry-error");
  try { const snapshot = await api("create"); enterLobby(snapshot); }
  catch (error) { showError("entry-error", error.message); }
});
$("join-room").addEventListener("click", async () => {
  showError("entry-error"); state.roomId = $("room-input").value.trim().toUpperCase();
  try { const snapshot = await api("join"); enterLobby(snapshot); }
  catch (error) { showError("entry-error", error.message); }
});
$("copy-code").addEventListener("click", async () => { try { await navigator.clipboard.writeText(state.roomId); $("copy-code").textContent = "Copiado"; } catch { showError("lobby-error", "No se pudo copiar el código."); } });
window.addEventListener("keydown", (event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) event.preventDefault(); if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"].includes(event.key)) state.keys.add(event.key); });
window.addEventListener("keyup", (event) => state.keys.delete(event.key));
window.addEventListener("blur", () => state.keys.clear());
document.querySelectorAll("[data-move]").forEach((button) => {
  const [x, y] = button.dataset.move.split(",").map(Number);
  const press = (event) => { event.preventDefault(); state.keys.add(x < 0 ? "ArrowLeft" : x > 0 ? "ArrowRight" : y < 0 ? "ArrowUp" : "ArrowDown"); };
  const release = () => { state.keys.clear(); };
  button.addEventListener("pointerdown", press); button.addEventListener("pointerup", release); button.addEventListener("pointercancel", release); button.addEventListener("pointerleave", release);
});

window.addEventListener("pagehide", () => {
  if (state.running && state.roomId && state.identity) {
    void fetch(endpoint, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "disconnect", roomId: state.roomId, identity: state.identity }) });
  }
});

try {
  const saved = JSON.parse(sessionStorage.getItem("ohana-coop-session") || "null");
  if (saved?.roomId && saved?.identity?.playerId && saved?.identity?.token) {
    state.roomId = saved.roomId; state.identity = saved.identity;
    void api("join", { identity: state.identity }).then(enterLobby).catch(() => { sessionStorage.removeItem("ohana-coop-session"); state.roomId = ""; state.identity = null; });
  }
} catch {}
