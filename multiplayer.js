import { ROSTER } from "./characters/roster.js";
import { drawCharacter } from "./characters/draw.js";
import { drawEnemy } from "./engine/enemies.js";
import { makeFoe } from "./engine/foes.js";
import { WORLDS, renderWorld } from "./worlds/index.js";
import { CAMPAIGN } from "./multiplayer/mission.js";

const ENDPOINT = "/.netlify/functions/game";
const ARENA = { left: 48, right: 1232, top: 450, floor: 572, exit: 1125 };
const MAX_QUEUED_ACTIONS = 8;
const state = {
  roomId: "", identity: null, snapshot: null, sequence: 0,
  keys: new Set(), touchKeys: new Map(), running: false,
  lastSend: 0, lastPoll: 0, lastHud: 0, lastFrame: 0,
  raf: 0, foeArt: new Map(), playerArt: new Map(), remotePositions: new Map(), localPose: null,
  pendingMove: null, actionQueue: [], mutationSending: false, activeMutation: null, mutationRetryDelay: 0,
  pollInFlight: false, pollFailures: 0, pollDelay: 250, lobbyPolling: false,
  reconnecting: false, lobbySubmitting: false, entrySubmitting: false, networkState: "connected",
  actionPulses: new Map(), seenEvents: new Set(), visualEvents: [],
  damageTexts: [], hurtAt: new Map(), combatEffects: [], bossVisualX: 640,
  queenForeshadowCanvas: null,
  serverOffset: 0, selectedCharacterId: "",
};
const $ = (id) => document.getElementById(id);
const entry = $("entry"), lobby = $("lobby"), gamePanel = $("game-panel");

function showError(id, message = "") { $(id).textContent = message; }
function serverNow() { return Date.now() + state.serverOffset; }

async function api(action, payload = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ action, roomId: state.roomId, identity: state.identity, ...payload }),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result?.error?.message || "No se pudo conectar con la sala.");
      error.status = response.status;
      error.code = result?.error?.code;
      throw error;
    }
    state.networkState = "connected";
    state.pollFailures = 0;
    state.pollDelay = 250;
    return result.data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("El servidor tardó demasiado. Reintentando la conexión.");
      timeoutError.code = "NETWORK_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function rememberEvent(event, snapshot) {
  if (!event || state.seenEvents.has(event.id)) return;
  state.seenEvents.add(event.id);
  if (state.seenEvents.size > 96) state.seenEvents.delete(state.seenEvents.values().next().value);
  const receivedAt = performance.now();
  state.visualEvents.push({ ...event, receivedAt });
  if (state.visualEvents.length > 48) state.visualEvents.shift();

  const actor = snapshot.players.find((player) => player.slot === event.playerSlot);
  if (actor && event.actionKind) {
    state.actionPulses.set(actor.playerId, {
      kind: event.actionKind,
      slot: event.abilitySlot,
      id: event.abilityId,
      startedAt: receivedAt,
      eventId: event.id,
    });
  }
  if (event.damage > 0) {
    state.damageTexts.push({
      targetId: event.targetId || event.enemyId || null,
      targetSlot: event.targetSlot ?? null,
      damage: event.damage,
      at: receivedAt,
    });
    if (event.targetSlot !== undefined) {
      const victim = snapshot.players.find((player) => player.slot === event.targetSlot);
      if (victim) state.hurtAt.set(victim.playerId, receivedAt);
    }
    if (state.damageTexts.length > 14) state.damageTexts.shift();
  }
  if (["enemy-damage", "queen-damage"].includes(event.kind)) {
    state.combatEffects.push({
      kind: "impact", x: event.targetX, y: event.targetY,
      targetId: event.targetId, receivedAt,
      color: event.breakBonus ? "#ffe276" : "#fff4d0",
    });
  } else if (["enemy-hit", "queen-hit"].includes(event.kind)) {
    const victim = snapshot.players.find((player) => player.slot === event.targetSlot);
    if (victim) state.combatEffects.push({ kind: "hurt", x: victim.x, y: victim.y, receivedAt, color: "#ff5365" });
  }
  if (state.combatEffects.length > 24) state.combatEffects.splice(0, state.combatEffects.length - 24);
}

function acceptSnapshot(snapshot) {
  if (!snapshot || (state.snapshot && snapshot.revision < state.snapshot.revision)) return state.snapshot;
  const previous = state.snapshot;
  state.serverOffset = snapshot.updatedAt ? snapshot.updatedAt - Date.now() : state.serverOffset;
  state.snapshot = snapshot;
  for (const event of snapshot.combat?.events || []) rememberEvent(event, snapshot);
  if (previous) {
    for (const player of snapshot.players) {
      const old = previous.players.find((item) => item.playerId === player.playerId);
      if (old && Number.isFinite(old.health) && Number.isFinite(player.health) && player.health < old.health) {
        state.hurtAt.set(player.playerId, performance.now());
      }
    }
  }
  const you = snapshot.players.find((player) => player.isYou);
  if (you) state.sequence = Math.max(state.sequence, you.lastSequence || 0);
  if (you && !state.localPose) state.localPose = { x: you.x, y: you.y };
  return state.snapshot;
}

function persistSession() {
  try {
    const you = state.snapshot?.players?.find((player) => player.isYou);
    sessionStorage.setItem("ohana-coop-session", JSON.stringify({
      roomId: state.roomId,
      identity: state.identity,
      characterId: you?.characterId || state.selectedCharacterId || "",
      selectedCharacterId: you?.characterId || state.selectedCharacterId || "",
      originalEngine: true,
    }));
  } catch {}
}

function drawPortrait(canvas, definition) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(60, 64, 4, 60, 64, 58);
  glow.addColorStop(0, `${definition.color}66`);
  glow.addColorStop(1, "rgba(8,20,35,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const form = definition.forms?.[1] || definition;
  drawCharacter(ctx, {
    ...definition, ...form, id: definition.id,
    x: 40, y: 24, w: 40, h: 68, vx: 0, vy: 0,
    facing: 1, grounded: true, evo: 1, visualScale: 1.35,
    phase: 0, rng: () => 0.5,
  }, { x: 0, y: 0 }, 1, { forceVector: true });
}

function labelForAbility(id) {
  return String(id || "Habilidad").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function enterLobby(snapshot) {
  acceptSnapshot(snapshot);
  state.roomId = snapshot.roomId;
  state.identity = snapshot.identity || state.identity;
  state.networkState = "connected";
  state.pollDelay = 250;
  persistSession();
  entry.hidden = true;
  lobby.hidden = false;
  gamePanel.hidden = true;
  $("room-code").textContent = state.roomId;
  const you = state.snapshot.players.find((player) => player.isYou);
  state.selectedCharacterId = you?.characterId || "";
  renderLobby();
  if (["playing", "won", "lost"].includes(state.snapshot.phase)) enterGame();
  void pollLoop();
}

function renderLobby() {
  const snap = state.snapshot;
  const you = snap.players.find((player) => player.isYou);
  const slots = $("player-slots");
  slots.replaceChildren();
  for (let slot = 0; slot < 2; slot++) {
    const player = snap.players.find((item) => item.slot === slot);
    const character = ROSTER.find((item) => item.id === player?.characterId);
    const card = document.createElement("div");
    card.className = `player-slot${player?.ready ? " ready" : ""}`;
    const title = document.createElement("b");
    title.textContent = `Jugador ${slot + 1}${player?.isYou ? " · Tú" : ""}`;
    const detail = document.createElement("small");
    detail.textContent = !player?.connected ? "Esperando conexión" : character ? `${character.name} · ${player.ready ? "Preparado" : "Eligiendo"}` : "Elige personaje";
    card.append(title, detail);
    slots.append(card);
  }

  const grid = $("character-grid");
  grid.replaceChildren();
  for (const character of ROSTER) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `character-card${state.selectedCharacterId === character.id ? " selected" : ""}`;
    button.setAttribute("aria-label", `Seleccionar a ${character.name}`);
    button.setAttribute("aria-pressed", String(state.selectedCharacterId === character.id));
    button.disabled = !!you?.ready || snap.phase !== "lobby";
    const portrait = document.createElement("canvas");
    portrait.width = 120;
    portrait.height = 112;
    portrait.setAttribute("aria-hidden", "true");
    drawPortrait(portrait, character);
    const label = document.createElement("span");
    label.textContent = character.name;
    const role = document.createElement("small");
    role.textContent = character.role;
    button.append(portrait, label, role);
    button.addEventListener("click", () => {
      state.selectedCharacterId = character.id;
      renderLobby();
    });
    grid.append(button);
  }

  const preview = ROSTER.find((character) => character.id === state.selectedCharacterId);
  if (preview) {
    drawPortrait($("lobby-portrait"), preview);
    $("lobby-character-name").textContent = preview.name;
    $("lobby-character-detail").textContent = `${preview.role} · ${preview.tag} · ${preview.evoNames?.[1] || preview.name}`;
  } else {
    $("lobby-character-name").textContent = "Elige tu personaje";
    $("lobby-character-detail").textContent = "El elenco y sus formas vienen del OHANA original.";
    $("lobby-portrait").getContext("2d").clearRect(0, 0, 160, 160);
  }

  const confirm = $("confirm-character");
  confirm.disabled = !state.selectedCharacterId || snap.phase !== "lobby" || state.lobbySubmitting;
  confirm.textContent = you?.ready ? "Retirar preparación" : "Confirmar personaje";
  const bothReady = snap.players.length === 2 && snap.players.every((player) => player.connected && player.characterId && player.ready);
  $("lobby-status").textContent = bothReady
    ? "Los dos están preparados. La introducción empieza al confirmar la segunda selección."
    : `Sala ${snap.players.length}/2 · Selecciona y confirma tu personaje. Cada jugador elige por su cuenta.`;
  if (["playing", "won", "lost"].includes(snap.phase)) enterGame();
}

async function confirmCharacter() {
  if (state.lobbySubmitting) return;
  state.lobbySubmitting = true;
  renderLobby();
  const you = state.snapshot.players.find((player) => player.isYou);
  try {
    if (!you?.ready && you?.characterId !== state.selectedCharacterId) {
      acceptSnapshot(await api("choose", { characterId: state.selectedCharacterId }));
    }
    acceptSnapshot(await api("ready", { ready: !you?.ready }));
    renderLobby();
  } catch (error) {
    if (error.code === "STALE_SESSION") {
      state.networkState = "session-conflict";
      showError("lobby-error", "Esta sala se reanudó desde otra pestaña. Recarga esta página para recuperar la sesión.");
    } else showError("lobby-error", error.message);
  } finally {
    state.lobbySubmitting = false;
    renderLobby();
  }
}

async function pollLoop() {
  if (state.running || !state.roomId || state.lobbyPolling) return;
  state.lobbyPolling = true;
  let delay = 600;
  try {
    while (!state.running && state.roomId) {
      try {
        acceptSnapshot(await api("poll"));
        state.networkState = "connected";
        state.pollDelay = 250;
        if (["playing", "won", "lost"].includes(state.snapshot.phase)) enterGame();
        else renderLobby();
        delay = 600;
      } catch (error) {
        if (error.code === "DISCONNECTED" && await reconnectSession()) continue;
        if (error.code === "STALE_SESSION") {
          state.networkState = "session-conflict";
          showError("lobby-error", "Esta sala se reanudó desde otra pestaña. Recarga esta página para recuperar la sesión.");
          break;
        }
        state.networkState = "reconnecting";
        showError("lobby-error", "Conexión inestable. Reintentando automáticamente…");
        delay = Math.min(6_000, Math.round(delay * 1.7));
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  } finally {
    state.lobbyPolling = false;
  }
}

async function reconnectSession() {
  if (state.reconnecting || !state.identity || !state.roomId) return false;
  state.reconnecting = true;
  try {
    const snapshot = await api("join", { identity: state.identity });
    if (state.running) {
      state.running = false;
      cancelAnimationFrame(state.raf);
      state.keys.clear();
      state.touchKeys.clear();
    }
    enterLobby(snapshot);
    return true;
  } catch (error) {
    if (error.code === "STALE_SESSION") {
      state.networkState = "session-conflict";
      showError(state.running ? "combat-status" : "lobby-error", "Esta sala se reanudó desde otra pestaña. Recarga esta página para recuperar la sesión.");
    }
    return false;
  } finally {
    state.reconnecting = false;
  }
}

function enterGame() {
  if (state.redirectingToEngine) return;
  state.redirectingToEngine = true;
  persistSession();
  window.location.href = "./index.html?online=1";
}

function stageFloor(ctx, world, t) {
  const top = world?.groundTop || "#56835a";
  const base = world?.ground || "#352d32";
  const edge = world?.edge || "#b8dca6";
  const ground = ctx.createLinearGradient(0, 557, 0, 720);
  ground.addColorStop(0, `${top}bb`);
  ground.addColorStop(0.08, `${base}`);
  ground.addColorStop(1, "#0b121b");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 560, 1280, 160);
  ctx.fillStyle = edge;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(0, 560, 1280, 3);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255,255,255,.13)";
  for (let i = 0; i < 28; i++) {
    const x = (i * 61 + Math.sin(t * 0.03 + i) * 7) % 1280;
    const y = 582 + (i % 8) * 16;
    ctx.fillRect(x, y, 2 + (i % 3), 1.4);
  }
  ctx.fillStyle = "rgba(8,16,23,.30)";
  for (let i = 0; i < 14; i++) {
    const x = i * 100 + (i % 2) * 25;
    ctx.beginPath();
    ctx.ellipse(x, 566 + Math.sin(t * 0.015 + i) * 2, 32 + i % 4 * 5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStageHeader(ctx, stage, combat, t) {
  const index = combat.campaign.stageIndex;
  ctx.save();
  ctx.fillStyle = "rgba(4,12,24,.64)";
  ctx.beginPath();
  ctx.roundRect(28, 26, 346, 84, 15);
  ctx.fill();
  ctx.fillStyle = "#fff3d0";
  ctx.textAlign = "left";
  ctx.font = "800 13px Outfit";
  ctx.fillText(`CAPÍTULO ${index + 1} / ${CAMPAIGN.length}`, 48, 52);
  ctx.font = "700 25px Fredoka";
  ctx.fillText(stage.name, 48, 82);
  ctx.font = "600 13px Outfit";
  ctx.fillStyle = "#d8e9e6";
  ctx.fillText(stage.chapter, 48, 101);
  for (let i = 0; i < CAMPAIGN.length; i++) {
    ctx.beginPath();
    ctx.arc(1220 - i * 25, 48, i === index ? 7 : 4, 0, Math.PI * 2);
    ctx.fillStyle = i < index ? "#8fe0a6" : i === index ? "#ffe27a" : "rgba(255,255,255,.42)";
    ctx.fill();
  }
  if (combat.campaign.exitOpen && !stage.boss) {
    const pulse = 0.65 + (Math.sin(t * 0.12) + 1) * 0.15;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = "#a8ffe0";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(1190, 518, 40, 67, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#efffed";
    ctx.textAlign = "center";
    ctx.font = "800 14px Outfit";
    ctx.fillText("PORTAL · REUNÍOS", 1190, 445);
  }
  ctx.restore();
}

function drawThreat(ctx, x, y, pattern, label, t) {
  const pulse = 1 + Math.sin(t * 0.18) * 0.1;
  ctx.save();
  ctx.fillStyle = "rgba(255,35,55,.18)";
  ctx.strokeStyle = "rgba(255,95,105,.94)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x, y, (pattern === "shockwave" ? 88 : 53) * pulse, 16 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff0de";
  ctx.textAlign = "center";
  ctx.font = "800 14px Outfit";
  ctx.fillText(label, x, y - 32);
  ctx.restore();
}

function drawBoss(ctx, combat, gameTime) {
  const boss = combat.boss;
  if (!boss) return;
  state.bossVisualX += (boss.x - state.bossVisualX) * 0.16;
  const target = state.snapshot.players.find((player) => player.slot === boss.targetSlot);
  if (boss.mode === "telegraph" && target) {
    const patternName = boss.pattern === "shockwave" ? "¡SAL DEL CÍRCULO!" : boss.pattern === "claw" ? "¡GARRA!" : "¡EMBESTIDA!";
    drawThreat(ctx, boss.lockX ?? target.x, boss.lockY ?? target.y, boss.pattern, patternName, gameTime);
    ctx.save();
    ctx.strokeStyle = "rgba(255,92,109,.62)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(state.bossVisualX, 478);
    ctx.lineTo(boss.lockX ?? target.x, boss.lockY ?? target.y);
    ctx.stroke();
    ctx.restore();
  } else if (boss.mode === "charge") {
    ctx.save();
    ctx.strokeStyle = boss.pattern === "shockwave" ? "rgba(255,180,72,.9)" : "rgba(255,62,80,.9)";
    ctx.lineWidth = boss.pattern === "shockwave" ? 8 : 16;
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.moveTo(state.bossVisualX, 476);
    ctx.quadraticCurveTo((state.bossVisualX + (boss.lockX ?? 640)) / 2, 422, boss.lockX ?? 640, boss.lockY ?? ARENA.floor);
    ctx.stroke();
    ctx.restore();
  }
  const art = {
    x: state.bossVisualX - 82,
    y: 404,
    w: 164,
    h: 164,
    kind: "boss",
    boss: true,
    visualScale: 1.55,
    hp: boss.hp,
    max: boss.maxHp,
    phase: boss.phase,
    // Drive the Queen through the poses already supported by OHANA's boss art.
    // The network patterns remain gameplay names; this is only a visual mapping.
    mode: boss.mode === "charge"
      ? boss.pattern === "shockwave" ? "slam" : boss.pattern === "swoop" ? "swoop" : "charge"
      : boss.mode,
    telegraph: boss.mode === "telegraph",
    teleKind: boss.pattern === "shockwave" ? "slam" : boss.pattern === "claw" ? "charge" : boss.pattern,
    facing: boss.facing || -1,
    introT: 0,
    introDrop: 0,
    dying: combat.ending?.kind === "victory" ? 20 : 0,
    flash: 0,
    invuln: 0,
    _hitT: combat.events?.some((event) => event.kind === "queen-damage" && serverNow() - event.at < 180) ? 8 : 0,
    _hitMax: 10,
  };
  drawEnemy(ctx, art, { x: 0, y: 0 }, gameTime);
  if (boss.mode === "break") {
    ctx.save();
    ctx.globalAlpha = 0.65 + Math.sin(gameTime * 0.2) * 0.2;
    ctx.strokeStyle = "#ffe176";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(boss.x, ARENA.floor - 6, 124, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemies(ctx, combat, gameTime) {
  const viewportWidth = Math.max(1, $("arena").clientWidth || 1280);
  // Keep foes readable when the fixed 1280-unit arena is shown in a narrow
  // mobile column. Gameplay hitboxes remain server-owned and unchanged.
  const sizeBoost = Math.max(1.12, Math.min(1.65, 880 / viewportWidth));
  const labelSize = Math.max(15, Math.min(30, 12 * 1280 / viewportWidth));
  const barWidth = Math.max(64, Math.min(126, 54 * 1280 / viewportWidth));
  const barHeight = Math.max(7, Math.min(13, 5 * 1280 / viewportWidth));
  combat.enemies.forEach((enemy, index) => {
    if (!enemy.alive) return;
    let art = state.foeArt.get(enemy.id);
    if (!art) {
      art = makeFoe(enemy.x - 24, enemy.y - 48, enemy.kind, enemy.roomId, index, { baby: false, rng: () => 0.42 });
      state.foeArt.set(enemy.id, art);
    }
    art.x = enemy.x - art.w / 2;
    art.y = enemy.y - art.h;
    art.hp = enemy.hp;
    art.max = enemy.maxHp;
    art.kind = enemy.kind;
    art.telegraph = enemy.mode === "telegraph";
    art.flash = state.visualEvents.some((event) => event.targetId === enemy.id && performance.now() - event.receivedAt < 180) ? 14 : 0;
    ctx.save();
    ctx.translate(enemy.x, enemy.y - art.h / 2);
    ctx.scale(sizeBoost, sizeBoost);
    drawEnemy(ctx, { ...art, x: -art.w / 2, y: -art.h / 2 }, { x: 0, y: 0 }, gameTime);
    ctx.restore();
    const halfBar = barWidth / 2;
    ctx.fillStyle = "rgba(26,8,15,.88)";
    ctx.fillRect(enemy.x - halfBar, enemy.y - art.h * sizeBoost - 16, barWidth, barHeight);
    ctx.fillStyle = enemy.mode === "telegraph" ? "#ffc857" : "#ff806b";
    ctx.fillRect(enemy.x - halfBar, enemy.y - art.h * sizeBoost - 16, barWidth * enemy.hp / enemy.maxHp, barHeight);
    ctx.textAlign = "center";
    ctx.font = `700 ${labelSize}px Outfit`;
    ctx.lineWidth = Math.max(3, labelSize * 0.22);
    ctx.strokeStyle = "rgba(12,14,26,.95)";
    ctx.strokeText(enemy.name, enemy.x, enemy.y - art.h * sizeBoost - 23);
    ctx.fillStyle = "#fffdf2";
    ctx.fillText(enemy.name, enemy.x, enemy.y - art.h * sizeBoost - 23);
    if (enemy.mode === "telegraph") drawThreat(ctx, enemy.lockX, enemy.lockY, "claw", "¡ESQUIVA!", gameTime);
  });
}

function drawQueenForeshadow(ctx, combat, gameTime) {
  // The Queen is a visible presence from the first room, while combat and her
  // shared HP bar stay locked until the final room of the campaign.
  if (combat.boss || combat.campaign.stageIndex >= 3) return;
  if (!state.queenForeshadowCanvas) {
    const canvas = document.createElement("canvas");
    canvas.width = 520;
    canvas.height = 540;
    const silhouette = canvas.getContext("2d");
    const queen = {
      x: 0, y: 0, w: 520, h: 540,
      kind: "boss", boss: true, phase: 1, mode: "idle",
      hp: 1800, max: 1800, visualScale: 1.45,
      facing: -1, introT: 0, introDrop: 0, dying: 0,
    };
    drawEnemy(silhouette, queen, { x: 0, y: 0 }, 0);
    silhouette.globalCompositeOperation = "source-in";
    silhouette.fillStyle = "#251b35";
    silhouette.fillRect(0, 0, canvas.width, canvas.height);
    state.queenForeshadowCanvas = canvas;
  }
  const pulse = 0.38 + Math.sin(gameTime * 0.018) * 0.035;
  ctx.save();
  const glow = ctx.createRadialGradient(1050, 470, 12, 1050, 470, 240);
  glow.addColorStop(0, `rgba(220,70,94,${pulse * 0.48})`);
  glow.addColorStop(1, "rgba(220,70,94,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(810, 230, 480, 310);
  ctx.globalAlpha = pulse;
  ctx.drawImage(state.queenForeshadowCanvas, 900, 245, 360, 374);
  ctx.restore();
}

function drawCampaignSetpieces(ctx, world, stage, cam, t) {
  const W = 1280, H = 720;
  const id = stage?.id || world?.id;
  ctx.save();

  if (id === "hoku") {
    // Palm silhouettes and a bright Hoku landmark give the beach a location.
    for (let i = 0; i < 5; i++) {
      const x = ((i * 330 - cam.x * 0.16 + 80) % 1500 + 1500) % 1500 - 120;
      const sway = Math.sin(t * .018 + i) * 5;
      ctx.strokeStyle = "rgba(34,76,53,.82)";
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(x, 440); ctx.quadraticCurveTo(x - 5, 340, x + sway, 250); ctx.stroke();
      ctx.strokeStyle = "rgba(51,118,70,.92)";
      ctx.lineWidth = 5;
      for (let j = 0; j < 6; j++) {
        const a = -1.35 + j * .42;
        ctx.beginPath(); ctx.moveTo(x + sway, 255); ctx.lineTo(x + Math.cos(a) * 55, 255 + Math.sin(a) * 32); ctx.stroke();
      }
    }
    ctx.fillStyle = "rgba(255,239,170,.22)";
    ctx.beginPath(); ctx.arc(1040, 160, 90 + Math.sin(t*.01)*5, 0, Math.PI*2); ctx.fill();
  } else if (id === "jungle") {
    // Foreground vines frame the arena without hiding combat.
    for (let i = 0; i < 10; i++) {
      const x = ((i * 190 - cam.x * .25) % 1450 + 1450) % 1450 - 90;
      ctx.strokeStyle = i % 2 ? "rgba(19,73,38,.92)" : "rgba(40,107,48,.85)";
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x+25,110,x-35,180,x+20,290); ctx.stroke();
      ctx.fillStyle = "rgba(113,192,78,.62)";
      for (let j=0;j<4;j++) {
        const y=70+j*55+Math.sin(t*.02+i+j)*4;
        ctx.beginPath(); ctx.ellipse(x+(j%2?24:-20),y,34,12,(j%2?.35:-.35),0,Math.PI*2); ctx.fill();
      }
    }
  } else if (id === "caldera") {
    // Volcanic ribs and lava cracks create a readable arena silhouette.
    ctx.fillStyle = "rgba(10,3,5,.52)";
    ctx.beginPath(); ctx.moveTo(0,510); ctx.lineTo(170,360); ctx.lineTo(310,430); ctx.lineTo(470,315); ctx.lineTo(620,420); ctx.lineTo(780,300); ctx.lineTo(960,420); ctx.lineTo(1120,330); ctx.lineTo(1280,440); ctx.lineTo(1280,570); ctx.lineTo(0,570); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,91,34,.58)"; ctx.lineWidth = 3;
    for (let i=0;i<9;i++) {
      const x=80+i*145+Math.sin(t*.01+i)*8;
      ctx.beginPath(); ctx.moveTo(x,560); ctx.lineTo(x+18,520); ctx.lineTo(x-8,485); ctx.lineTo(x+22,450); ctx.stroke();
    }
  } else if (id === "nest" || id === "queen") {
    // Nido is deliberately layered around the boss instead of using boss-bg.png.
    const cx = 820, cy = 405;
    ctx.strokeStyle = "rgba(255,118,83,.24)";
    ctx.lineWidth = 2;
    for (let r=80;r<=250;r+=34) {
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,205,112,.08)";
    ctx.beginPath(); ctx.ellipse(cx,cy+55,290,75,0,0,Math.PI*2); ctx.fill();
  }

  // A subtle foreground depth band grounds every room.
  const fg = ctx.createLinearGradient(0, 470, 0, 610);
  fg.addColorStop(0, "rgba(0,0,0,0)");
  fg.addColorStop(1, id === "hoku" ? "rgba(18,54,64,.20)" : "rgba(20,5,18,.22)");
  ctx.fillStyle = fg;
  ctx.fillRect(0, 450, W, 170);
  ctx.restore();
}

function drawPlayers(ctx, time, gameTime) {
  for (const player of state.snapshot.players) {
    if (!player.connected || !player.characterId) continue;
    const definition = ROSTER.find((item) => item.id === player.characterId);
    if (!definition) continue;
    const evo = Math.max(1, Math.min(4, player.evolution ?? 1));
    const form = definition.forms?.[evo] || definition;
    let x = player.isYou && state.localPose ? state.localPose.x : player.x;
    let y = player.isYou && state.localPose ? state.localPose.y : player.y;
    if (!player.isYou) {
      let remote = state.remotePositions.get(player.playerId);
      if (!remote) {
        remote = { x: player.x, y: player.y };
        state.remotePositions.set(player.playerId, remote);
      }
      remote.x += (player.x - remote.x) * 0.22;
      remote.y += (player.y - remote.y) * 0.22;
      x = remote.x;
      y = remote.y;
    }
    let character = state.playerArt.get(player.playerId);
    if (!character) {
      character = { ...definition, vx: 0, vy: 0, grounded: true, evo, visualScale: 1.72, rng: () => 0.5, _land: 0 };
      state.playerArt.set(player.playerId, character);
    }
    const elapsedMs = Math.max(1, time - (character._lastDrawAt ?? time));
    const vx = ((x - (character._lastVisualX ?? x)) / elapsedMs) * 16.667;
    const vy = ((y - (character._lastVisualY ?? y)) / elapsedMs) * 16.667;
    character._lastDrawAt = time;
    character._lastVisualX = x;
    character._lastVisualY = y;
    Object.assign(character, definition, form, {
      id: definition.id,
      x: x - form.w / 2,
      y: y - form.h,
      vx,
      vy,
      facing: player.facing,
      grounded: true,
      evo,
      phase: time / 42,
      invuln: 0,
      hurtFlash: 0,
    });
    const hurtAge = time - (state.hurtAt.get(player.playerId) ?? -Infinity);
    character.invuln = hurtAge < 420 ? Math.max(0, 26 - hurtAge / 16.667) : 0;
    const pulse = state.actionPulses.get(player.playerId);
    const actionAge = pulse ? time - pulse.startedAt : Infinity;
    const actionDuration = pulse?.kind === "ability" ? 560 : 440;
    if (pulse && actionAge < actionDuration) {
      const remaining = Math.max(1, (actionDuration - actionAge) / 16.667);
      character.melee = pulse.kind === "attack" ? remaining : 0;
      character._cast = pulse.kind === "ability" ? { id: pulse.id, slot: pulse.slot, t: gameTime - actionAge / 16.667 } : null;
    } else {
      character.melee = 0;
      character._cast = null;
      state.actionPulses.delete(player.playerId);
    }
    drawCharacter(ctx, character, { x: 0, y: 0 }, gameTime, { forceVector: true });
    ctx.fillStyle = "#fff8e7";
    ctx.font = "700 14px Outfit";
    ctx.textAlign = "center";
    const formName = definition.evoNames?.[evo] || form.name || definition.name;
    ctx.fillText(`${player.isYou ? "Tú" : "Compañero"} · ${formName}`, x, y - form.h - 12);
  }
}

function drawEffects(ctx, time) {
  state.visualEvents = state.visualEvents.filter((event) => time - event.receivedAt < 1900);
  state.combatEffects = state.combatEffects.filter((effect) => time - effect.receivedAt < 560);
  state.damageTexts = state.damageTexts.filter((item) => time - item.at < 1050);
  for (const effect of state.combatEffects) {
    const age = time - effect.receivedAt;
    const k = age / 560;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 7 - k * 4;
    ctx.beginPath();
    ctx.ellipse(effect.x ?? 640, (effect.y ?? 470) - 30, 20 + k * 46, 16 + k * 27, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + k * 2;
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc((effect.x ?? 640) + Math.cos(a) * (24 + k * 48), (effect.y ?? 470) - 30 + Math.sin(a) * (14 + k * 30), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const item of state.damageTexts) {
    const age = time - item.at;
    let x = 640, y = 430;
    if (item.targetSlot !== null && item.targetSlot !== undefined) {
      const player = state.snapshot.players.find((candidate) => candidate.slot === item.targetSlot);
      if (player) { x = player.x; y = player.y - 88; }
    } else if (item.targetId === "queen-of-the-nest") {
      x = state.bossVisualX;
      y = 385;
    } else {
      const enemy = state.snapshot.combat?.enemies.find((candidate) => candidate.id === item.targetId);
      if (enemy) { x = enemy.x; y = enemy.y - 66; }
    }
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age / 1050);
    ctx.textAlign = "center";
    ctx.font = "900 25px Outfit";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(25,9,15,.92)";
    ctx.fillStyle = "#fff1bd";
    const text = `−${item.damage}`;
    ctx.strokeText(text, x, y - age * 0.035);
    ctx.fillText(text, x, y - age * 0.035);
    ctx.restore();
  }
  for (const event of state.visualEvents) {
    const actionAge = time - event.receivedAt;
    if (event.actionKind === "attack" || event.actionKind === "ability" || event.actionKind === "dodge") {
      const actor = state.snapshot.players.find((candidate) => candidate.slot === event.playerSlot);
      if (actor && actionAge >= 0 && actionAge < 520) {
        const k = Math.min(1, actionAge / 520);
        const x = actor.x, y = actor.y - 54;
        ctx.save();
        ctx.globalAlpha = (1 - k) * .8;
        ctx.strokeStyle = event.actionKind === "dodge" ? "#9be7ff" : event.actionKind === "ability" ? "#ffd36a" : "#fff5cf";
        ctx.lineWidth = event.actionKind === "dodge" ? 5 : 4;
        if (event.actionKind === "dodge") {
          ctx.beginPath();
          ctx.arc(x - actor.facing * (12 + k * 45), y, 22 + k * 30, Math.PI * .15, Math.PI * 1.2);
          ctx.stroke();
        } else {
          const dir = actor.facing || 1;
          ctx.beginPath();
          ctx.arc(x + dir * (28 + k * 42), y - 8, 18 + k * 28, -1.1, 1.1);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + dir * 20, y - 26);
          ctx.lineTo(x + dir * (58 + k * 35), y - 4);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    if ((event.combo || 0) < 2 && (event.teamCombo || 0) < 2) continue;
    const age = time - event.receivedAt;
    if (age > 820) continue;
    const x = event.targetX ?? (event.targetId === "queen-of-the-nest" ? state.bossVisualX : 640);
    const y = (event.targetY ?? 448) - 74 - age * 0.018;
    const label = event.teamCombo >= 2 ? `OHANA ×${event.teamCombo}` : `COMBO ×${event.combo}`;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age / 820);
    ctx.textAlign = "center";
    ctx.font = "900 17px Outfit";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(16,14,28,.84)";
    ctx.fillStyle = event.teamCombo >= 2 ? "#a8f0c0" : "#ffe17e";
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
    ctx.restore();
  }
}

function drawSceneOverlay(ctx, combat, time) {
  const scene = combat.scene;
  if (!scene) return;
  const elapsed = serverNow() - scene.startedAt;
  const progress = Math.max(0, Math.min(1, elapsed / scene.durationMs));
  const fade = Math.min(1, elapsed / 450, (scene.durationMs - elapsed) / 350);
  if (fade <= 0) return;
  const stage = CAMPAIGN[scene.stageIndex] || CAMPAIGN[0];
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade) * 0.84;
  ctx.fillStyle = "#050a14";
  ctx.fillRect(0, 0, 1280, 720);
  ctx.globalAlpha = Math.max(0, fade);
  ctx.fillStyle = "rgba(0,0,0,.56)";
  ctx.fillRect(0, 0, 1280, 116);
  ctx.fillRect(0, 584, 1280, 136);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe9b6";
  ctx.font = "800 18px Outfit";
  ctx.fillText(scene.kind === "opening" ? "PROJECT OHANA" : `WORLD 1 · ${stage.worldId.toUpperCase()}`, 640, 198);
  ctx.fillStyle = "#fffdf5";
  ctx.font = "700 54px Fredoka";
  ctx.fillText(scene.kind === "queen-intro" ? "LA REINA DEL NIDO" : stage.name.toUpperCase(), 640, 270);
  ctx.fillStyle = "#d7e7e6";
  ctx.font = "600 21px Outfit";
  const caption = scene.kind === "opening"
    ? progress < 0.36 ? "Dos caminos. Una familia." : progress < 0.72 ? "Cada sala os hará más fuertes." : "Nadie se queda atrás."
    : scene.kind === "queen-intro" ? "La última puerta conduce al Nido." : stage.hint;
  ctx.fillText(caption, 640, 315);

  if (scene.kind === "opening" || scene.kind === "queen-intro") {
    const queen = { x: 540, y: 372, w: 200, h: 200, kind: "boss", boss: true, phase: 1, mode: "idle", hp: 1800, max: 1800, visualScale: 1.75, facing: -1, introT: 0, dying: 0 };
    ctx.save();
    ctx.globalAlpha = scene.kind === "opening" ? Math.max(0, (progress - 0.48) * 1.8) : Math.min(1, progress * 1.5);
    ctx.translate(640, 465 + Math.sin(time * 0.003) * 5);
    ctx.scale(1 + progress * 0.12, 1 + progress * 0.12);
    ctx.translate(-640, -465);
    drawEnemy(ctx, queen, { x: 0, y: 0 }, time / 16.667);
    ctx.restore();
  }
  ctx.restore();
}

function drawEnding(ctx, combat, time) {
  const ending = combat.ending;
  if (!ending) return;
  const elapsed = Math.max(0, serverNow() - ending.startedAt);
  const progress = Math.max(0, Math.min(1, elapsed / ending.durationMs));
  const win = ending.kind === "victory";
  const veil = ctx.createLinearGradient(0, 0, 0, 720);
  veil.addColorStop(0, win ? "rgba(8,12,29,.38)" : "rgba(35,5,14,.18)");
  veil.addColorStop(1, win ? "rgba(12,22,35,.90)" : "rgba(20,3,12,.38)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, 1280, 720);
  // Defeat should read as a setback, not make the opponents disappear behind
  // a black screen. Redraw survivors clearly above the veil for the retry beat.
  if (!win) drawEnemies(ctx, combat, time / 16.667);
  ctx.save();
  ctx.globalAlpha = Math.min(0.82, progress * 1.2);
  const light = ctx.createRadialGradient(640, 390, 14, 640, 390, 420);
  light.addColorStop(0, win ? "rgba(255,236,169,.66)" : "rgba(255,83,99,.18)");
  light.addColorStop(1, "rgba(255,220,160,0)");
  ctx.fillStyle = light;
  ctx.fillRect(180, 70, 920, 650);
  ctx.restore();
  if (win && elapsed < 4300) {
    const deathProgress = Math.max(0, Math.min(1, elapsed / 3600));
    const queen = {
      x: 540, y: 335, w: 200, h: 200, kind: "boss", boss: true,
      phase: 3, mode: "break", hp: 0, max: 1800, visualScale: 1.72,
      facing: -1, dying: Math.max(1, 120 - elapsed / 30), dyingMax: 120,
    };
    drawEnemy(ctx, queen, { x: 0, y: 0 }, time / 16.667);

    // The Queen's aura breaks apart into ember-like vector fragments.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 18; i++) {
      const angle = (Math.PI * 2 * i) / 18 + 0.11;
      const travel = 28 + deathProgress * (145 + (i % 4) * 14);
      const x = 640 + Math.cos(angle) * travel;
      const y = 416 + Math.sin(angle) * travel * 0.62;
      const fade = Math.max(0, 1 - deathProgress * (0.82 + (i % 3) * 0.07));
      ctx.save();
      ctx.globalAlpha = fade * (0.45 + 0.35 * Math.sin(time * 0.012 + i));
      ctx.fillStyle = i % 3 === 0 ? "#fff2b0" : i % 3 === 1 ? "#ff9b52" : "#ff5c3d";
      ctx.translate(x, y);
      ctx.rotate(angle + deathProgress * 2.2);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 9 + (i % 3) * 2);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  if (elapsed > 650) {
    for (const player of state.snapshot.players) {
      const definition = ROSTER.find((item) => item.id === player.characterId);
      if (!definition) continue;
      const evo = player.evolution ?? 1;
      const form = definition.forms?.[evo] || definition;
      drawCharacter(ctx, {
        ...definition, ...form, id: definition.id,
        x: (player.slot === 0 ? 462 : 748) - form.w / 2,
        y: 480 - form.h, w: form.w, h: form.h,
        vx: 0, vy: 0, facing: player.slot === 0 ? 1 : -1,
        grounded: true, evo, visualScale: 2.1, phase: time / 38,
      }, { x: 0, y: 0 }, time / 16.667, { forceVector: true });
    }
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff4cc";
  ctx.font = "800 18px Outfit";
  ctx.fillText(win ? "LA FAMILIA SIGUE UNIDA" : "LA FAMILIA NO SE RINDE", 640, 165);
  ctx.fillStyle = "#fffdf5";
  ctx.font = "700 62px Fredoka";
  ctx.fillText(win ? "OHANA" : "VOLVED A INTENTARLO", 640, 238);
  ctx.fillStyle = "#e8e5d9";
  ctx.font = "600 21px Outfit";
  ctx.fillText(win ? "La Reina ha caído. Nadie se queda atrás." : "El Nido aún puede superarse juntos.", 640, 280);
  if (elapsed >= ending.durationMs) $("ending-actions").hidden = false;
}

function syncHud(time, combat) {
  if (time - state.lastHud < 160) return;
  state.lastHud = time;
  const stage = CAMPAIGN[combat.campaign.stageIndex] || CAMPAIGN[0];
  $("mission-heading").textContent = `${stage.name} · ${stage.chapter}`;
  $("campaign-counter").textContent = `Sala ${combat.campaign.stageIndex + 1} de ${CAMPAIGN.length}`;
  $("enemy-health-panel").hidden = !!combat.boss;
  $("boss-panel").hidden = !combat.boss;
  if (combat.boss) {
    $("boss-health-fill").style.width = `${Math.max(0, combat.boss.hp / combat.boss.maxHp * 100)}%`;
    $("boss-health-text").textContent = `${combat.boss.hp} / ${combat.boss.maxHp} · Fase ${combat.boss.phase}`;
  } else {
    const remaining = combat.enemies.filter((enemy) => enemy.alive).length;
    const playersAtExit = state.snapshot.players.filter((player) => player.x >= ARENA.exit).length;
    $("enemy-health-text").textContent = combat.campaign.exitOpen
      ? `Portal abierto · ${playersAtExit}/2 en la salida`
      : `${remaining} ${remaining === 1 ? "enemigo" : "enemigos"} en la sala`;
  }
  $("team-health").replaceChildren(...state.snapshot.players.map((player) => {
    const definition = ROSTER.find((item) => item.id === player.characterId);
    const evo = player.evolution ?? 1;
    const next = [0, 55, 140, 260, 420][evo + 1] || 420;
    const previous = [0, 55, 140, 260, 420][evo] || 0;
    const xp = Math.max(0, Math.min(100, (player.experience - previous) / Math.max(1, next - previous) * 100));
    const item = document.createElement("div");
    item.className = "team-life";
    const label = document.createElement("span");
    label.textContent = `J${player.slot + 1} · ${definition?.evoNames?.[evo] || definition?.name || ""} · Forma ${evo + 1}`;
    const hp = document.createElement("b");
    hp.textContent = `${player.health ?? 0} / ${player.maxHealth ?? 0} HP`;
    const xpTrack = document.createElement("i");
    xpTrack.className = "xp-track";
    const xpFill = document.createElement("i");
    xpFill.style.width = `${xp}%`;
    xpTrack.append(xpFill);
    item.append(label, hp, xpTrack);
    return item;
  }));

  const serverTime = serverNow();
  const freshEvent = combat.lastEvent && serverTime - combat.lastEvent.at < 2500;
  const you = state.snapshot.players.find((player) => player.isYou);
  const activeThreat = combat.enemies.find((enemy) => enemy.mode === "telegraph" && enemy.targetSlot === you?.slot);
  let status = freshEvent ? combat.lastEvent.text : stage.hint;
  if (combat.scene) status = stage.name === "Nido Final" ? "La Reina despierta. La cinemática es común a la sala." : stage.hint;
  else if (combat.campaign.exitOpen && !stage.boss) status = you?.x >= ARENA.exit
    ? "Estás en el portal. Espera a tu compañero para entrar juntos."
    : "Sala despejada: mantén → o D para llegar al portal del extremo derecho. Debéis entrar los dos.";
  else if (combat.boss?.mode === "break") status = "Reina expuesta: podéis hacerle daño en cualquier momento; BREAK amplifica los golpes.";
  else if (combat.boss?.mode === "charge") status = "¡Ataque de la Reina! Sal de la zona marcada.";
  else if (combat.boss?.mode === "telegraph" && combat.boss.targetSlot === you?.slot) status = "La Reina te marca: aléjate del círculo rojo.";
  else if (activeThreat) status = `${activeThreat.name} prepara un golpe contra ti: esquiva ahora.`;
  else if (combat.boss?.mode === "recover") status = "La Reina recupera el aliento. Seguid atacando.";
  if (state.networkState === "reconnecting") status = "Conexión inestable. Reintentando con la sala…";
  else if (state.networkState === "session-conflict") status = "Esta sala se reanudó desde otra pestaña. Recarga para recuperar la sesión.";
  $("combat-status").textContent = state.snapshot.phase === "won" || state.snapshot.phase === "lost" ? combat.lastEvent?.text || status : status;
  const actionsDisabled = !!combat.scene || state.snapshot.phase !== "playing" || state.networkState !== "connected";
  $("touch-attack").disabled = actionsDisabled;
  document.querySelectorAll("[data-ability]").forEach((button) => { button.disabled = actionsDisabled; });
  if (state.snapshot.phase === "won" || state.snapshot.phase === "lost") $("ending-actions").hidden = false;
}

function drawFrame(time) {
  if (!state.running) return;
  const canvas = $("arena");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, canvas.clientWidth);
  const height = width * 9 / 16;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(canvas.width / 1280, 0, 0, canvas.height / 720, 0, 0);
  const gameTime = time / 16.667;
  const dt = Math.min(0.05, Math.max(0, (time - (state.lastFrame || time)) / 1000));
  state.lastFrame = time;
  const combat = state.snapshot?.combat;
  if (!combat) { state.raf = requestAnimationFrame(drawFrame); return; }
  const stage = CAMPAIGN[combat.campaign.stageIndex] || CAMPAIGN[0];
  const world = WORLDS.find((item) => item.id === stage.worldId) || WORLDS[0];
  const sceneActive = !!combat.scene && serverNow() < combat.scene.startedAt + combat.scene.durationMs;
  const you = state.snapshot.players.find((player) => player.isYou);
  if (you && state.localPose) {
    const definition = ROSTER.find((item) => item.id === you.characterId);
    const form = definition?.forms?.[you.evolution ?? 1] || definition;
    const ix = (state.keys.has("ArrowRight") || state.keys.has("d") ? 1 : 0) - (state.keys.has("ArrowLeft") || state.keys.has("a") ? 1 : 0);
    const iy = (state.keys.has("ArrowDown") || state.keys.has("s") ? 1 : 0) - (state.keys.has("ArrowUp") || state.keys.has("w") ? 1 : 0);
    const length = Math.hypot(ix, iy) || 1;
    const speed = (form?.speed || 4.5) * 60 * dt;
    if (!sceneActive && state.snapshot.phase === "playing" && state.networkState === "connected") {
      state.localPose.x = Math.max(ARENA.left, Math.min(ARENA.right, state.localPose.x + ix / length * speed));
      state.localPose.y = Math.max(ARENA.top, Math.min(ARENA.floor, state.localPose.y + iy / length * speed));
      state.localPose.x += (you.x - state.localPose.x) * 0.08;
      state.localPose.y += (you.y - state.localPose.y) * 0.08;
    }
  }

  renderWorld(ctx, world, { x: 0, y: 0 }, gameTime, 1280, 720);
  drawCampaignSetpieces(ctx, world, stage, { x: 0, y: 0 }, gameTime);
  drawQueenForeshadow(ctx, combat, gameTime);
  stageFloor(ctx, world, gameTime);
  drawStageHeader(ctx, stage, combat, gameTime);
  drawEnemies(ctx, combat, gameTime);
  drawBoss(ctx, combat, gameTime);
  drawPlayers(ctx, time, gameTime);
  drawEffects(ctx, time);
  if (sceneActive) drawSceneOverlay(ctx, combat, time);
  if (combat.ending) drawEnding(ctx, combat, time);
  syncHud(time, combat);

  if (!state.pollInFlight && time - state.lastPoll >= state.pollDelay) {
    state.lastPoll = time;
    state.pollInFlight = true;
    void api("poll").then((snapshot) => {
      acceptSnapshot(snapshot);
      state.pollFailures = 0;
      state.pollDelay = 250;
      if (snapshot.phase === "lobby" && state.running) {
        state.running = false;
        cancelAnimationFrame(state.raf);
        state.keys.clear();
        state.touchKeys.clear();
        enterLobby(snapshot);
      }
    }).catch(async (error) => {
      state.pollFailures += 1;
      if (error.code === "DISCONNECTED") {
        await reconnectSession();
        return;
      }
      if (error.code === "STALE_SESSION") {
        state.networkState = "session-conflict";
        state.keys.clear();
        state.touchKeys.clear();
        state.actionQueue.length = 0;
        state.pendingMove = null;
        return;
      }
      state.networkState = "reconnecting";
      state.pollDelay = Math.min(4_000, 250 * (2 ** Math.min(state.pollFailures, 4)));
    }).finally(() => { state.pollInFlight = false; });
  }
  if (!sceneActive && state.snapshot.phase === "playing" && state.networkState === "connected" && state.keys.size && time - state.lastSend > 320) {
    state.lastSend = time;
    const x = (state.keys.has("ArrowRight") || state.keys.has("d") ? 1 : 0) - (state.keys.has("ArrowLeft") || state.keys.has("a") ? 1 : 0);
    const y = (state.keys.has("ArrowDown") || state.keys.has("s") ? 1 : 0) - (state.keys.has("ArrowUp") || state.keys.has("w") ? 1 : 0);
    const length = Math.hypot(x, y) || 1;
    state.pendingMove = { x: x / length, y: y / length };
    pumpMutationQueue();
  }
  state.raf = requestAnimationFrame(drawFrame);
}

function sendCombatAction(action, slot) {
  if (!state.running || state.snapshot.phase !== "playing" || state.networkState !== "connected") return;
  const combat = state.snapshot.combat;
  if (combat?.scene && serverNow() < combat.scene.startedAt + combat.scene.durationMs) return;
  const you = state.snapshot.players.find((player) => player.isYou);
  if (!you) return;
  const duplicateQueued = state.actionQueue.some((item) => item.action === action && item.slot === slot)
    || (state.activeMutation?.action === action && state.activeMutation?.slot === slot);
  if (duplicateQueued) return;
  if (state.actionQueue.length >= MAX_QUEUED_ACTIONS) {
    $("combat-status").textContent = "La conexión está ocupada. Espera a que lleguen tus acciones.";
    return;
  }
  const ability = action === "ability" ? ROSTER.find((item) => item.id === you.characterId)?.abilities?.[slot] : null;
  state.actionPulses.set(you.playerId, { kind: action, slot, id: ability, startedAt: performance.now(), predicted: true });
  state.actionQueue.push({ action, slot });
  pumpMutationQueue();
}

function isRetryable(error) {
  return !error.status || error.status === 408 || error.status === 429 || error.status >= 500 || error.code === "ROOM_BUSY";
}

async function pumpMutationQueue() {
  if (state.mutationSending || !state.roomId || !state.identity) return;
  const item = state.actionQueue.shift() || (state.pendingMove && { action: "move", ...state.pendingMove });
  if (!item) return;
  if (item.action === "move") state.pendingMove = null;
  state.mutationSending = true;
  state.activeMutation = item;
  const sequence = item.sequence ?? ++state.sequence;
  item.sequence = sequence;
  const payload = item.payload || { sequence, actionId: `${state.identity.playerId}:${sequence}` };
  item.payload = payload;
  if (item.action === "move") Object.assign(payload, { x: item.x, y: item.y });
  else if (item.slot !== undefined) payload.slot = item.slot;
  try {
    let snapshot;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { snapshot = await api(item.action, payload); break; }
      catch (error) {
        if (!isRetryable(error) || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 220 * (attempt + 1) + Math.random() * 90));
      }
    }
    acceptSnapshot(snapshot);
    if (snapshot.actionResult && !snapshot.actionResult.accepted) {
      $("combat-status").textContent = snapshot.actionResult.reason;
    }
  } catch (error) {
    if (error.code === "DISCONNECTED") {
      if (await reconnectSession()) state.actionQueue.unshift(item);
      else state.networkState = "reconnecting";
    } else if (error.code === "STALE_SESSION" || error.code === "INVALID_SESSION") {
      state.networkState = "session-conflict";
      state.keys.clear();
      state.touchKeys.clear();
      state.pendingMove = null;
      state.actionQueue.length = 0;
    } else if (isRetryable(error)) {
      state.networkState = "reconnecting";
      state.mutationRetryDelay = Math.min(4_000, Math.max(350, (state.mutationRetryDelay || 250) * 1.7));
      state.actionQueue.unshift(item);
    } else {
      showError("combat-status", error.message);
    }
  } finally {
    state.mutationSending = false;
    state.activeMutation = null;
    if (state.actionQueue.length) {
      const delay = state.mutationRetryDelay || 0;
      state.mutationRetryDelay = 0;
      if (delay) setTimeout(pumpMutationQueue, delay);
      else queueMicrotask(pumpMutationQueue);
    } else if (state.pendingMove) setTimeout(pumpMutationQueue, 260);
  }
}

$("create-room").addEventListener("click", async () => {
  if (state.entrySubmitting) return;
  state.entrySubmitting = true;
  $("create-room").disabled = true;
  $("join-room").disabled = true;
  showError("entry-error");
  try { enterLobby(await api("create")); }
  catch (error) { showError("entry-error", error.message); }
  finally { state.entrySubmitting = false; $("create-room").disabled = false; $("join-room").disabled = false; }
});
$("join-room").addEventListener("click", async () => {
  if (state.entrySubmitting) return;
  state.entrySubmitting = true;
  $("create-room").disabled = true;
  $("join-room").disabled = true;
  showError("entry-error");
  state.roomId = $("room-input").value.trim().toUpperCase();
  try { enterLobby(await api("join")); }
  catch (error) { showError("entry-error", error.message); }
  finally { state.entrySubmitting = false; $("create-room").disabled = false; $("join-room").disabled = false; }
});
$("confirm-character").addEventListener("click", () => void confirmCharacter());
$("copy-code").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(state.roomId); $("copy-code").textContent = "Copiado"; }
  catch { showError("lobby-error", "No se pudo copiar el código."); }
});
$("return-home").addEventListener("click", () => { window.location.href = "./index.html"; });

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Shift"].includes(event.key)) event.preventDefault();
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"].includes(event.key)) state.keys.add(event.key);
  if (event.repeat || !state.running) return;
  if (key === "h") sendCombatAction("attack");
  if (key === "shift") sendCombatAction("dodge");
  if (key === "j") sendCombatAction("ability", 0);
  if (key === "k") sendCombatAction("ability", 1);
  if (key === "l") sendCombatAction("ability", 2);
});
window.addEventListener("keyup", (event) => state.keys.delete(event.key));
window.addEventListener("blur", () => { state.keys.clear(); state.touchKeys.clear(); });
document.querySelectorAll("[data-move]").forEach((button) => {
  const [x, y] = button.dataset.move.split(",").map(Number);
  const key = x < 0 ? "ArrowLeft" : x > 0 ? "ArrowRight" : y < 0 ? "ArrowUp" : "ArrowDown";
  const press = (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    state.touchKeys.set(button, key);
    state.keys.add(key);
  };
  const release = () => {
    const pressed = state.touchKeys.get(button);
    if (!pressed) return;
    state.touchKeys.delete(button);
    if (![...state.touchKeys.values()].includes(pressed)) state.keys.delete(pressed);
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});
$("touch-attack").addEventListener("click", () => sendCombatAction("attack"));
$("touch-dodge").addEventListener("click", () => sendCombatAction("dodge"));
document.querySelectorAll("[data-ability]").forEach((button) => button.addEventListener("click", () => sendCombatAction("ability", Number(button.dataset.ability))));

window.addEventListener("pagehide", () => {
  if (!state.redirectingToEngine && state.roomId && state.identity) {
    void fetch(ENDPOINT, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "disconnect", roomId: state.roomId, identity: state.identity }),
    });
  }
});

try {
  const saved = JSON.parse(sessionStorage.getItem("ohana-coop-session") || "null");
  if (saved?.roomId && saved?.identity?.playerId && saved?.identity?.token) {
    state.roomId = saved.roomId;
    state.identity = saved.identity;
    void api("join", { identity: state.identity })
      .then(enterLobby)
      .catch(() => {
        sessionStorage.removeItem("ohana-coop-session");
        state.roomId = "";
        state.identity = null;
      });
  }
} catch {}
