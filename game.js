import { ROSTER, applyForm, tickEvoTween } from "./characters/roster.js";
import { evolutionMessage } from "./characters/evolution.js";
import { signature, markAt, difficulty } from "./characters/signature.js";
import { drawCharacter } from "./characters/draw.js";
import { WORLDS, renderWorld } from "./worlds/index.js";
import { drawTerrain } from "./worlds/terrain.js";
import { drawRoomAtmosphere } from "./worlds/room-atmosphere.js";
import { drawPaintedHub, paintedHubOn } from "./worlds/painted-hub.js";
import { drawPaintedRoom } from "./worlds/painted-rooms.js";
import { getLook, paintFit, PAINT_WORLD } from "./characters/look.js";
import { clearRank, formatClear, rememberBest } from "./systems/save.js";
import { ABILITY_DEFS, useAbility, drawProjectile, drawSlash, drawBolt, supremeOf, specialOf } from "./systems/abilities.js";
import { showSystemMessage, showRoomMessage, showErrorMessage, showObjectiveMessage, showCombatMessage, showBossMessage, showEvolutionMessage, dismissNotifications } from "./systems/notify.js";
import { ParticleSystem } from "./engine/particles.js";
import { sfx, setMuted as setAudioMuted } from "./engine/audio.js";
import { playMusic, themeForRoom, duckMusic, currentMusic } from "./engine/music.js";
import { ROOMS, ROOM_W, ROOM_H, drawSigns, MAP_LAYOUT } from "./systems/map.js";
import { drawEnemy } from "./engine/enemies.js";
import { Floaters } from "./systems/floaters.js";
import { portals } from "./systems/portals.js";
import { DeathFx } from "./systems/death-fx.js";
import { Rain } from "./systems/rain.js";
import { Surprises } from "./systems/surprises.js";
import { createBossNido, updateBossNido } from "./systems/boss-nido.js";
import { isAirFoe, applyElite, makeFoe } from "./engine/foes.js";
import { sense, think } from "./engine/foe-brain.js";
import { resolveBody, hitsSolid } from "./engine/collide.js";
import { XP_NEED } from "./systems/xp.js";
import { saveStore } from "./systems/save.js";
import { finiteOr as safeFiniteOr, damageEnemy as safeDamageEnemy, healPlayer as safeHealPlayer, damagePlayer as safeDamagePlayer, addPlayerXp as safeAddPlayerXp, addScore as safeAddScore, addKill as safeAddKill, addCombo as safeAddCombo } from "./systems/mutations.js";
import { MAX_RUNTIME_ENEMIES, MAX_RUNTIME_PROJECTILES, MAX_RUNTIME_GHOSTS, MAX_RUNTIME_ORBS, MAX_RUNTIME_BOLTS, MAX_RUNTIME_SLASHES, MAX_RUNTIME_SAFE, pushRuntime, compactRuntimeList, boundedFinite as runtimeBoundedFinite } from "./systems/runtime.js";
import { createFixedClock } from "./engine/clock.js";
import { bindInput } from "./engine/input.js";
import { bindDialogs } from "./systems/dialogs.js";
import { syncHudStatus } from "./systems/hud.js";
import { Passives } from "./systems/passives.js";
import { Magic } from "./systems/magic.js";
import { CombatFX, combatTier } from "./systems/combat-fx.js";
import { damageFeedback } from "./systems/combat-feedback.js";
import { BossFX, bossPhaseProfile, bossAttackProfile } from "./systems/boss-fx.js";
import { formatBossStatus } from "./systems/boss-hud.js";
import { ExperienceDirector } from "./systems/experience.js";
import { baitLabel } from "./systems/boss-bait.js";
import { baitFeedbackLabel } from "./systems/boss-bait-feedback.js";
import { encounterLabel } from "./systems/boss-encounter-memory.js";
import { onlineCoop } from "./systems/online-coop.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
let input;
let keys;
const clock = createFixedClock();
const $ = (id) => document.getElementById(id);
const DOM = {
  help: $("help"),
  map: $("map-overlay"),
  mapGrid: $("map-grid"),
  pause: $("pause-overlay"),
  finale: $("win-cinema"),
  evoStage: $("evo-stage"),
  prompt: $("prompt"),
  mute: $("btn-mute"),
  abilityBar: $("ability-bar"),
  hudAvatar: $("hud-avatar"),
  hudName: $("hud-name"),
  hudTrait: $("hud-trait"),
  hudMeta: $("hud-meta"),
  hpBar: $("hp-bar"),
  hpText: $("hp-text"),
  xpBar: $("xp-bar"),
  xpText: $("xp-text"),
  hudWorld: $("hud-world"),
  hudEvo: $("hud-evo"),
  combo: $("hud-combo"),
  comboChip: $("combo-chip"),
  comboValue: document.querySelector("#combo-chip .combo-value"),
  bossWrap: $("boss-wrap"),
  bossBar: $("boss-bar"),
  bossLabel: document.querySelector("#boss-wrap .boss-label"),
  formPips: document.querySelectorAll("#form-pips b"),
};
let abilitySlots = [];
let touchPowers = [];
let hudAvatarKey = "";
let pipKey = "";
function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}
let t = 0;
let muted = false;
let paused = false;
// Accessibility: honor prefers-reduced-motion (dampen shake + flashes)
const RMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduceMotion = RMQ.matches;
try { RMQ.addEventListener("change", (e) => { reduceMotion = e.matches; game.reduceMotion = reduceMotion; }); } catch (_) {}

const game = {
  player: null, enemies: [], projectiles: [], bolts: [], slashes: [], platforms: [], orbs: [], hearts: [], ghosts: [],
  rng: Math.random,
  fx: new ParticleSystem(), nums: new Floaters(), worldIndex: 0, cam: { x: 0, y: 0 },
  worldW: ROOM_W, worldH: ROOM_H, running: false, reduceMotion, spawn: { x: 180, y: 500 },
  shake: 0, hitstop: 0, camPunch: 0, combo: 0, comboT: 0, score: 0, combatFx: new CombatFX(), bossFx: new BossFX(), experience: new ExperienceDirector(), roomId: "hub", visited: { hub: true }, fading: 0, flash: 0, kills: 0, won: false, summoned: false, summonDelay: 0, runtimeFaults: 0, lastRuntimeFault: ""
};

function beep(n) { if (!muted) try { sfx(n); } catch (e) {} }

function vfxUnit(seed) {
  const value = Math.sin(Number(seed) * 12.9898 + 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function vfxRandom(salt = 0) {
  return vfxUnit(game.t * 31.73 + Number(salt) * 17.11);
}
function boundedFinite(value, fallback, min, max) { return runtimeBoundedFinite(value, fallback, min, max); }

function sanitizeRuntimeState() {
  game.t = boundedFinite(game.t, 0, 0, MAX_RUNTIME_SAFE);
  game.score = boundedFinite(game.score, 0, 0, MAX_RUNTIME_SAFE);
  game.kills = Math.floor(boundedFinite(game.kills, 0, 0, MAX_RUNTIME_SAFE));
  game.combo = Math.floor(boundedFinite(game.combo, 0, 0, 999));
  game.comboT = Math.floor(boundedFinite(game.comboT, 0, 0, 600));
  game.shake = boundedFinite(game.shake, 0, 0, 32);
  game.hitstop = Math.floor(boundedFinite(game.hitstop, 0, 0, 8));
  game.flash = Math.floor(boundedFinite(game.flash, 0, 0, 120));
  game.fading = Math.floor(boundedFinite(game.fading, 0, 0, 120));
  if (typeof game.rng !== "function") game.rng = Math.random;

  const p = game.player;
  if (p) {
    p.x = boundedFinite(p.x, game.spawn?.x ?? 180, -2048, game.worldW + 2048);
    p.y = boundedFinite(p.y, game.spawn?.y ?? 500, -2048, game.worldH + 2048);
    p.w = boundedFinite(p.w, 32, 1, 256);
    p.h = boundedFinite(p.h, 32, 1, 256);
    p.vx = boundedFinite(p.vx, 0, -40, 40);
    p.vy = boundedFinite(p.vy, 0, -40, 40);
    p.maxHealth = boundedFinite(p.maxHealth, 100, 1, 100000);
    p.health = boundedFinite(p.health, p.dead ? 0 : p.maxHealth, 0, p.maxHealth);
    p.xp = boundedFinite(p.xp, 0, 0, MAX_RUNTIME_SAFE);
    p.evo = Math.floor(boundedFinite(p.evo, 0, 0, 4));
    p.invuln = Math.floor(boundedFinite(p.invuln, 0, 0, 600));
    p.coyote = Math.floor(boundedFinite(p.coyote, 0, 0, 60));
    p.buffer = Math.floor(boundedFinite(p.buffer, 0, 0, 60));
    p.dash = Math.floor(boundedFinite(p.dash, 0, 0, 120));
    p.melee = Math.floor(boundedFinite(p.melee, 0, 0, 120));
  }

  compactRuntimeList(game.enemies, MAX_RUNTIME_ENEMIES);
  for (const e of game.enemies) {
    e.x = boundedFinite(e.x, 0, -2048, game.worldW + 2048);
    e.y = boundedFinite(e.y, 0, -2048, game.worldH + 2048);
    e.w = boundedFinite(e.w, 32, 1, 512);
    e.h = boundedFinite(e.h, 32, 1, 512);
    e.vx = boundedFinite(e.vx, 0, -40, 40);
    e.vy = boundedFinite(e.vy, 0, -40, 40);
    e.max = boundedFinite(e.max, 1, 1, 100000);
    e.hp = boundedFinite(e.hp, 0, 0, e.max);
    e.invuln = Math.floor(boundedFinite(e.invuln, 0, 0, 600));
    e.stun = Math.floor(boundedFinite(e.stun, 0, 0, 120));
    e.dying = Math.floor(boundedFinite(e.dying, 0, 0, 240));
  }

  compactRuntimeList(game.projectiles, MAX_RUNTIME_PROJECTILES);
  for (const pr of game.projectiles) {
    pr.x = boundedFinite(pr.x, 0, -4096, game.worldW + 4096);
    pr.y = boundedFinite(pr.y, 0, -4096, game.worldH + 4096);
    pr.w = boundedFinite(pr.w, 8, 1, 256);
    pr.h = boundedFinite(pr.h, 8, 1, 256);
    pr.vx = boundedFinite(pr.vx, 0, -60, 60);
    pr.vy = boundedFinite(pr.vy, 0, -60, 60);
    pr.life = Math.floor(boundedFinite(pr.life, 0, 0, 600));
    pr.dmg = boundedFinite(pr.dmg, 0, 0, 100000);
  }

  compactRuntimeList(game.ghosts, MAX_RUNTIME_GHOSTS);
  for (const g of game.ghosts) {
    g.x = boundedFinite(g.x, 0, -4096, game.worldW + 4096);
    g.y = boundedFinite(g.y, 0, -4096, game.worldH + 4096);
    g.w = boundedFinite(g.w, 32, 1, 256);
    g.h = boundedFinite(g.h, 32, 1, 256);
    g.life = Math.floor(boundedFinite(g.life, 0, 0, 120));
  }

  compactRuntimeList(game.orbs, MAX_RUNTIME_ORBS);
  for (const o of game.orbs) {
    o.x = boundedFinite(o.x, 0, -4096, game.worldW + 4096);
    o.y = boundedFinite(o.y, 0, -4096, game.worldH + 4096);
    o.r = boundedFinite(o.r, 9, 1, 128);
  }

  game.cam.x = boundedFinite(game.cam?.x, 0, -4096, game.worldW + 4096);
  game.cam.y = boundedFinite(game.cam?.y, 0, -4096, game.worldH + 4096);
}

let viewW = 1280, viewH = 720, viewDpr = 1;
const CAM_ZOOM = 1.02;
function camZoom() { return getLook() === "paint" ? 1 : CAM_ZOOM; }
function camW() { return viewW / camZoom(); }
function camH() { return viewH / camZoom(); }
function fit() {
  // Cap DPR: retina×2 mataba el FPS; reduceMotion → 1
  viewDpr = reduceMotion ? 1 : Math.min(1.25, window.devicePixelRatio || 1);
  viewW = Math.max(320, innerWidth | 0);
  viewH = Math.max(240, innerHeight | 0);
  const bw = Math.round(viewW * viewDpr);
  const bh = Math.round(viewH * viewDpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  canvas.style.width = viewW + "px";
  canvas.style.height = viewH + "px";
  ctx.imageSmoothingEnabled = false;
  game.renderDirty = true;
}
addEventListener("resize", fit); fit();


function overlayOpen() {
  return !!(
    DOM.help?.classList.contains("open") ||
    DOM.map?.classList.contains("open") ||
    DOM.pause?.classList.contains("open") ||
    DOM.finale?.classList.contains("show") ||
    DOM.evoStage?.classList.contains("show")
  );
}
function setMuted(on) {
  muted = !!on;
  setAudioMuted(muted);
  setText(DOM.mute, muted ? "Mute · N" : "Sonido · N");
  DOM.mute?.setAttribute("aria-pressed", String(muted));
  DOM.mute?.setAttribute("aria-label", muted ? "Activar sonido" : "Silenciar sonido");
}
function setPaused(on) {
  if (game.finale && game.finale.t > 0) return;

  // PHASE 39 - PAUSE STATE CLOSURE
  // El estado de pausa y su representacion accesible se comprometen de forma
  // atomica antes de efectos secundarios. Ningun guardado, audio, input o reloj
  // puede impedir que Escape abra la capa visual.
  paused = !!on && game.running;

  const pauseLayer = DOM.pause || document.getElementById("pause-overlay");

  if (pauseLayer) {
    pauseLayer.classList.toggle("open", paused);
    pauseLayer.setAttribute("aria-hidden", paused ? "false" : "true");
  }

  try {
    input?.reset();
  } catch (_) {}

  try {
    clock.reset();
  } catch (_) {}

  if (paused) {
    try {
      save();
    } catch (_) {}
  }

  try {
    duckMusic(paused);
  } catch (_) {}

  // Reafirma el contrato DOM despues de todos los efectos secundarios.
  if (pauseLayer) {
    pauseLayer.classList.toggle("open", paused);
    pauseLayer.setAttribute("aria-hidden", paused ? "false" : "true");
  }
}function closeOverlays() {
  DOM.help?.classList.remove("open");
  DOM.map?.classList.remove("open");
  setPaused(false);
}
function hitStop(frames) {
  if (!frames) return;
  if (game.reduceMotion) frames = Math.max(1, Math.ceil(frames * 0.35));
  game.hitstop = Math.min(8, Math.max(game.hitstop || 0, frames | 0));
}
function buzz(ms) {
  if (game.reduceMotion) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}

function comboRank(n) {
  if (n > 12) return "S";
  if (n > 7) return "A";
  if (n > 3) return "B";
  return "C";
}

function canAct() { return game.running && !paused && !overlayOpen() && !document.hidden; }
function interact() {
  if (!canAct()) return;
  if (!portals.tryUse(game.player, game)) evolve("manual");
}
function escape() {
  if (DOM.evoStage?.classList.contains("show") || DOM.finale?.classList.contains("show")) return;
  if (game.finale && game.finale.t > 40) { game.finale.t = 8; return; }
  if (DOM.help?.classList.contains("open")) { DOM.help.classList.remove("open"); return; }
  if (DOM.map?.classList.contains("open")) { DOM.map.classList.remove("open"); return; }
  setPaused(!paused);
}
function suspend() {
  // Suspender la pestaña debe pausar la sesión actual, no reiniciarla.
  // El checkpoint lo realiza setPaused(true) sobre el estado intacto.
  input?.reset();
  clock.reset();
  if (!game.running) return;
  setPaused(true);
}
// El cambio de foco de ventana no equivale necesariamente a ocultar la página.
// Pausar por `blur` provoca carreras con botones/modal y con navegadores headless.
// `visibilitychange` cubre el abandono real de la pestaña sin secuestrar la UI.
addEventListener("pagehide", () => save());
document.addEventListener("visibilitychange", () => {
  clock.reset();
  if (document.hidden) suspend();
});
function toggleHelp() {
  const help = DOM.help;
  if (!help) return;
  const open = !help.classList.contains("open");
  DOM.map?.classList.remove("open");
  if (open) setPaused(false);
  help.classList.toggle("open", open);
}
function setPrompt(text, on) {
  const el = DOM.prompt;
  if (!el) return;
  if (!on) { el.classList.remove("show"); return; }
  setText(el, text);
  el.classList.add("show");
}
function room() { return game.roomDef || ROOMS[game.roomId] || ROOMS.hub; }
let saveWarning = false;
function save() {
  if (!game.player || game.player.dead) return;
  const saved = saveStore.write(game, Magic);
  if (!saved && !saveWarning) showSystemMessage("GUARDADO", "No se puede guardar en este navegador. La partida sigue disponible mientras no cierres la página.");
  saveWarning = !saved;
  return saved;
}
function returnToMenu() {
  save();
  game.running = false;
  input?.reset();
  clock.reset();
  // PHASE 39 - SESSION RESET CLOSURE
  // Una nueva sesion nunca hereda estado transitorio anterior.
  t = 0;
  paused = false;
  game.hitstop = 0;
  game.camPunch = 0;
  game.fading = 0;
  game.flash = 0;
  game.flashColor = null;
  game.doorWait = null;
  game.doorHold = 0;
  game.finale = null;
  game.summonDelay = 0;
  game.roomId = "hub";
  game.won = false;
  game.summoned = false;
  game.runtimeFaults = 0;
  game.lastRuntimeFault = "";
  game.cam.x = 0;
  game.cam.y = 0;
  playMusic("title");
  game.experience?.reset();
  closeOverlays();
  document.body.classList.remove("playing", "boss-fight");
  $("char-select")?.classList.remove("hidden");
  DOM.bossWrap?.classList.add("hidden");
  DOM.comboChip?.classList.remove("show");
  setPrompt("", false);
  document.querySelector(".char-card.selected")?.focus();
}
function bounceLocked(fromDir) {
  const p = game.player;
  if (!p) return;
  if (fromDir === "right") p.x = Math.min(p.x, game.worldW - 80);
  else if (fromDir === "left") p.x = Math.max(p.x, 24);
  else if (fromDir === "up") p.y = Math.max(p.y, 120);
  else if (fromDir === "down") p.y = Math.min(p.y, game.worldH - 220);
  else if (fromDir === "portal") {
    p.x = Math.max(40, Math.min(p.x - 48 * (p.facing || 1), game.worldW - 80));
    p.y = Math.min(p.y, game.worldH - 220);
  }
  p.vx = 0; p.vy = 0;
}
function safeX(preferred) {
  const p = game.player;
  const w = p ? p.w : 24;
  const tries = [preferred, 120, 240, 400, 1080, 1280, 60, 1480];
  for (const x of tries) {
    if (floorsAtX(x, w).some((pl) => pl.h > 40)) return x;
  }
  return preferred;
}
function snapToFloor(p) {
  if (!p) return;
  const feet = p.y + p.h;
  const next = nearestBelow(p.x, p.w, feet - 8) || lowestFloor(p.x, p.w);
  if (next) landOn(p, next);
}
function placeFrom(fromDir) {
  const p = game.player;
  if (!p) return;
  if (fromDir === "right") p.x = game.roomId === "boss" ? 280 : 56;
  else if (fromDir === "left") p.x = game.worldW - 56 - p.w;
  else if (fromDir === "up") {
    p.x = safeX(220);
    p.y = game.worldH - 240;
  } else if (fromDir === "down") {
    p.x = safeX(220);
    p.y = 70;
  } else if (fromDir === "portal") {
    const spot = portals.spawnPoint(p.w, p.h);
    if (spot) {
      p.x = safeX(spot.x);
      p.y = spot.y;
    } else {
      p.x = safeX(180);
    }
    // Kick ANTES de armArrival (armArrival limpia pending, no el kick; marca trailTicks)
    const kick = typeof portals.arrivalKick === "function" ? portals.arrivalKick() : null;
    portals.armArrival();
    if (kick) {
      p.vx = kick.vx || 0;
      p.vy = kick.vy || 0;
      if (kick.facing) p.facing = kick.facing;
      if (kick.type) portals.trailType = kick.type;
    }
    // Reef: trail agua-cyan (override tipado en emit + burst de aterrizaje)
    if (game.roomId === "reef") {
      portals.trailColor = "#5ecfff";
      if (!portals.trailType || portals.trailType === "catapult") portals.trailType = "water";
    }
    // Micro-shake al aterrizar (además del shake de salida)
    game.shake = Math.min(14, (game.shake || 0) + (reduceMotion ? 3 : 5));
    // reduceMotion: estela más corta
    if (reduceMotion && portals.trailTicks > 0) {
      portals.trailTicks = Math.min(portals.trailTicks, 8);
    }
    let col = (kick && (kick.type === "catapult" || Math.abs(kick.vy || 0) > 5)) ? "#ffc078" : "#c9a0ff";
    if (portals.trailColor) col = portals.trailColor;
    else if (game.roomId === "reef") col = "#5ecfff";
    game.fx.emit(p.x + p.w / 2, p.y + p.h / 2, {
      color: col, count: reduceMotion ? 10 : 22, size: 4, up: 1.8, speed: 3.2, life: 18, star: true
    });
    game.flash = Math.max(game.flash || 0, 8);
    // Kick ya aplicado; no pisar vx/vy ni snap forzado (catapulta aterriza en arco)
    if (!kick) { p.vx = 0; p.vy = 0; snapToFloor(p); }
    return;
  } else {
    p.x = safeX(p.x || 180);
  }
  p.vx = 0; p.vy = fromDir === "down" ? 2 : 0;
  if (fromDir !== "down") snapToFloor(p);
}
function loadRoom(id, fromDir) {
  const r = ROOMS[id];
  if (!r) return false;
  if (r.needEvo && game.player && game.player.evo < r.needEvo) {
    showErrorMessage("CERRADO", "Necesitas forma " + (r.needEvo + 1));
    beep("locked");
    bounceLocked(fromDir);
    return false;
  }
  const first = !game.visited[id];
  game.roomId = id;
  dismissNotifications();
  game.renderDirty = true;
  game.roomDef = r;
  game.finale = null;
  game.visited[id] = true;
  game.worldIndex = r.world;
  const paint = getLook() === "paint";
  const S = paint ? PAINT_WORLD : 1;
  game.worldW = ROOM_W * S;
  game.worldH = ROOM_H * S;
  game.platforms = r.plats.map((p) => ({ x: p[0] * S, y: p[1] * S, w: p[2] * S, h: p[3] * S }));
  game.orbs = (r.orbs || []).map((o) => ({ x: o[0] * S, y: o[1] * S, r: 9, taken: false }));
  game.hearts = first ? [{ x: 220 * S, y: 760 * S, taken: false }] : [];
  game.enemies = (r.foes || []).map((f, i) => {
    const e = scaleFoe(makeFoe(f[0] * S, f[1] * S, f[2], id, i, f[3] ? { elite: true } : undefined));
    if (f[3]) applyElite(e);
    return e;
  });
  for (const e of game.enemies) Surprises.onMakeFoe(e, id, game);
  for (const e of game.enemies) {
    if (isAirFoe(e)) continue;
    let floor = null;
    for (const plat of game.platforms) {
      const mid = e.x + e.w / 2;
      if (mid > plat.x && mid < plat.x + plat.w) {
        if (!floor || plat.y > floor.y) floor = plat;
      }
    }
    if (floor) e.y = floor.y - e.h;
  }
  game.bossFx?.clear();
  game.boss = null;
  if (r.boss && !game.won) {
    game.boss = scaleFoe(createBossNido());
    game.enemies.push(game.boss);
  }
  game.projectiles.length = 0;
  game.bolts.length = 0;
  game.slashes.length = 0;
  game.fx.clear?.();
  game.slashes.length = 0;
  game.ghosts.length = 0;
  portals.spawnFromRoom(r);
  if (paint) {
    for (const portal of portals.items) {
      portal.x *= S;
      portal.y *= S;
      portal.w *= S;
      portal.h *= S;
    }
  }
  if (game.player) placeFrom(fromDir);
  game.cam.x = 0;
  game.fading = 16;
  game.doorHold = reduceMotion ? 4 : 8;
  game.doorWait = null;
  game.flash = Math.max(game.flash || 0, reduceMotion ? 4 : 8);
  if (first && game.player) {
    game.player.health = Math.min(game.player.maxHealth, game.player.health + 15);
    game.nums.add(game.player.x, game.player.y, "+15", "#6f6");
  }
  const LINES = {
    hub: "Aquí empieza Ohana. Reúne fuerzas y abre la ruta por la costa.",
    beach: "La costa abre el este. Cruza el hueco y sigue hacia la jungla.",
    jungle: "La jungla guarda la bajada. Busca la forma necesaria para entrar en la caldera.",
    cave: "La cueva protege la ruta oeste. El laboratorio queda al otro lado.",
    lab: "El laboratorio guarda una ruta alternativa. Mira el paraguas y sigue adelante.",
    ridge: "La cumbre conecta el claro con la órbita. El camino continúa hacia las estrellas.",
    space: "Aquí caen estrellas. El vórtice abre la bajada al arrecife.",
    reef: "El arrecife devuelve a la costa. Recoge lo que encuentres antes de volver.",
    volcano: "La caldera es la última puerta. La Reina del Nido espera más adelante.",
    boss: "La Reina ha despertado. Aquí termina la ruta de este Mundo."
  };
  if (!r.boss) {
    const story = LINES[id] || "";
    const objective = r.hint || r.goal || "";
    showRoomMessage(r.name, first && story ? story + (objective ? " " + objective : "") : objective || story || "Explora la sala.", {
      key: "room:" + id + ":" + (first ? "first" : "repeat")
    });
  } else {
    game.bossIntro = { t: 220 };
    game.storyLine = "La Reina sale del nido. No negocia.";
    showBossMessage("REINA DEL NIDO", "Has llegado al corazón del Nido. Derrota a la Reina y cierra el Mundo 1.", {
      key: "boss:intro"
    });
    game.flash = 16;
    game.flashColor = "#ff4060";
    game.shake = 12;
  }
  game.experience?.room(id, r.name, !!r.boss);
  beep(r.boss ? "boss" : "door");
  playMusic(themeForRoom(id));
  worldClear();
  Surprises.onEnterRoom(game);
  Passives.onRoom(game);
  Magic.onRoom(game, id);
  save();
  dispatchEvent(new CustomEvent("ohana-room", { detail: {
    id,
    name: r.name,
    visited: game.visited,
    won: !!game.won,
    evo: game.player ? game.player.evo : 0
  }}));
  return true;
}
function showMap() {
  const overlay = DOM.map;
  const grid = DOM.mapGrid;
  if (!overlay || !grid) {
    showSystemMessage("MAPA", Object.keys(game.visited).map((id) => (ROOMS[id] && ROOMS[id].name) || id).join(" · "));
    return;
  }
  if (overlay.classList.contains("open")) {
    overlay.classList.remove("open");
    return;
  }
  DOM.help?.classList.remove("open");
  setPaused(false);
  const layout = MAP_LAYOUT || [];
  grid.innerHTML = layout.map((row) => row.map((id) => {
    if (!id) return '<div class="map-cell empty"></div>';
    const dest = ROOMS[id];
    const here = game.roomId === id;
    const seen = !!game.visited[id];
    const lock = dest && dest.needEvo != null && game.player && game.player.evo < dest.needEvo && !seen;
    const cls = here ? "here" : seen ? "seen" : lock ? "lock" : "";
    const label = dest ? (dest.short || dest.name) : id;
    return '<div class="map-cell ' + cls + '">' + label + "</div>";
  }).join("")).join("");
  overlay.classList.add("open");
}
function makePlayer(def) {
  const p = {
    ...def,
    x: 180, y: 500, vx: 0, vy: 0,
    facing: 1, jumps: 0, grounded: false, evo: 0, dead: false, invuln: 0,
    cds: {}, cdDur: {}, gliding: 0, xp: 0, coyote: 0, buffer: 0,
    dash: 0, dashBuf: 0, melee: 0, meleeBuf: 0, wall: 0,
    // Garantiza abilities del roster (Pizza: pepperoni/cheese/oven)
    abilities: Array.isArray(def.abilities) ? def.abilities.slice() : (def.abilities || []),
  };
  if (!p.facing) p.facing = 1;
  applyForm(p, { silent: true });
  paintFit(p);
  return p;
}
function start(def) {
  game.lastAbilityId = null;
  game.lastAbilitySlot = null;
  if (!def) return;
  const onlineSession = onlineCoop.readSession?.();
  const onlineMode = !!onlineSession?.originalEngine;
  const resume = !onlineMode && (function () { try { return localStorage.getItem("ohana-resume") === "1"; } catch (e) { return false; } })();
  try { localStorage.removeItem("ohana-resume"); } catch (e) {}
  input?.reset();
  clock.reset();
  // PHASE 39 - SESSION RESET CLOSURE
  // Una nueva sesion nunca hereda estado transitorio anterior.
  t = 0;
  paused = false;
  game.hitstop = 0;
  game.camPunch = 0;
  game.fading = 0;
  game.flash = 0;
  game.flashColor = null;
  game.doorWait = null;
  game.doorHold = 0;
  game.finale = null;
  game.summonDelay = 0;
  game.roomId = "hub";
  game.won = false;
  game.summoned = false;
  game.runtimeFaults = 0;
  game.lastRuntimeFault = "";
  game.cam.x = 0;
  game.cam.y = 0;
  game._magicSnap = null;
  game.hitstop = 0;
  game.combatFx?.clear();
  game.experience?.reset();
  game.experience?.mount();
  game.player = makePlayer(def); game.combo = 0; game.score = 0; game.kills = 0; game.shake = 0; game.visited = { hub: true };
  game.clearTicks = 0;
  game.best = null;
  Surprises.reset();
  game.projectiles = []; game.bolts = []; game.slashes = []; game.ghosts = []; game.fx.clear?.(); game.won = false; game.summoned = false;
  game.running = true; closeOverlays();
  let roomId = "hub";
  if (resume) {
    try {
      const u = saveStore.read(def.id);
      if (u) {
        game.player.evo = u.evo;
        game.player.xp = u.xp;
        game.visited = { hub: true };
        for (const key of Object.keys(u.visited)) if (ROOMS[key]) game.visited[key] = true;
        game.score = u.score;
        game.kills = u.kills;
        game.won = u.won;
        applyForm(game.player, { silent: true });
        paintFit(game.player);
        if (u.hp != null) game.player.health = Math.max(1, Math.min(game.player.maxHealth, u.hp));
        if (u.nineUsed) game.player._nineUsed = true;
        game.clearTicks = u.clearTicks || 0;
        game.best = u.best || null;
        game._magicSnap = u.magic;
        roomId = ROOMS[u.roomId] ? u.roomId : "hub";
      }
    } catch (e) {}
  }
  document.body.classList.add("playing");
  document.getElementById("char-select")?.classList.add("hidden");
  renderAbilityBar();
  if (!loadRoom(roomId)) loadRoom("hub");
  if (game._magicSnap) { Magic.restore(game._magicSnap); game._magicSnap = null; }
  if (onlineMode) {
    void onlineCoop.start(game, def).catch((error) => {
      console.error("[OHANA online]", error);
      showErrorMessage("ONLINE", "No se pudo conectar a la partida online.");
    });
  } else {
    save();
  }
  updateHUD();
  canvas.focus({ preventScroll: true });
}
function evolve(reason) {
  const p = game.player; if (!p || p.dead) return;
  p.evo = Number(p.evo) || 0;
  if (reason !== "xp" && reason !== "manual") return;
  if (p.evo >= 4) { if (reason === "manual") showSystemMessage("MAX", "Ya eres GOD (forma 5)."); return; }
  const need = XP_NEED[p.evo + 1];
  if (need == null || p.xp < need) {
    if (reason === "manual") showSystemMessage("XP", "Te faltan " + Math.max(0, Math.ceil(need - p.xp)) + " para evolucionar.");
    return;
  }
  p.evo += 1;
  applyForm(p);
  paintFit(p);
  if (p.evo === 4) Surprises.onBecomeGod(game);
  const toGod = p.evo >= 4;
  game.shake = toGod ? 26 : 12;
  // Flash tinted with character form color (reduceMotion: corto pero con color)
  game.flashColor = p.color || (p.forms && p.forms[p.evo] && p.forms[p.evo].color) || "#fff";
  game.flash = reduceMotion ? (toGod ? 12 : 8) : (toGod ? 32 : 14);
  game.fx.emit(p.x + p.w / 2, p.y, {
    color: p.color,
    count: toGod ? 96 : 48,
    size: toGod ? 10 : 6,
    up: toGod ? 3.5 : 2,
    speed: toGod ? 5.5 : undefined,
    star: toGod || undefined,
  });
  if (toGod) {
    game.fx.emit(p.x + p.w / 2, p.y + p.h / 2, {
      color: "#fff8c8", count: 48, size: 7, up: 2.5, speed: 4, star: true,
    });
  }
  game.experience?.evolution(p, toGod);
  save();
}
function cheatEvolve() {
  const p = game.player;
  if (!p || p.dead || !game.running || paused || overlayOpen() || document.hidden) return;
  if (p.evo >= 4) {
    showSystemMessage("CHEAT", "Forma final ya desbloqueada.");
    return;
  }
  const need = XP_NEED[p.evo + 1];
  if (need != null) p.xp = Math.max(p.xp, need);
  evolve("xp");
  showSystemMessage("CHEAT", "Evolución de prueba: Ctrl+Z");
}

function respawn() {
  const p = game.player; if (!p) return;
  if (DeathFx.isPlaying()) DeathFx.cancel();
  p.x = 180; p.y = 500; p.vx = 0; p.vy = 0; p.health = p.maxHealth; p.dead = false; p.invuln = 50; game.combo = 0;
  Magic.reset(game);
  loadRoom("hub");
}
function dash() {
  const p = game.player;
  if (!p || p.dead) return;
  if (p.dash > 0) { p.dashBuf = 8; return; }
  const sig = signature(p.id);
  p._dashFace = p.facing || 1;
  p._dashGo = 11;
  p.vx = sig.dash * p._dashFace;
  p.invuln = Math.max(p.invuln, sig.iframe);
  p.dash = 20 + Math.round(sig.dash * 0.35);
  p.dashBuf = 0;
  if (sig.hop) p.vy = Math.min(p.vy || 0, sig.hop);
  if (sig.ram) p._ram = 8;
  for (let i = 0; i < 3; i++) {
    pushRuntime(game.ghosts, { x: p.x - p._dashFace * i * 10, y: p.y, w: p.w, h: p.h, life: 10 + i * 3, color: p.color }, MAX_RUNTIME_GHOSTS);
  }
  game.fx.emit(p.x, p.y + p.h * 0.5, { color: p.color || "#fff", count: sig.heavy ? 14 : 10, size: 3, star: true, speed: 3.2, life: 16 });
  beep("dash");
  game.experience?.dash(p);
  void onlineCoop.signal(game, "action", { action: "dash", characterId: p.id });
}
function finiteOr(value, fallback = 0) { return safeFiniteOr(value, fallback); }
function damageEnemy(e, amount) { if (e.dying > 0) return true; return safeDamageEnemy(e, amount); }
function healPlayer(p, amount) { return safeHealPlayer(p, amount); }
function damagePlayer(p, amount) { return safeDamagePlayer(p, amount); }
function addPlayerXp(p, amount) { return safeAddPlayerXp(p, amount); }
function addScore(amount) { return safeAddScore(game, amount); }
function addKill() { return safeAddKill(game); }
function addCombo(amount = 1) { return safeAddCombo(game, amount); }
function registerBossPunish(e) {
  if (!e?.boss || !e.vulnerable || e.dying) return false;
  e.punishHits = (Number(e.punishHits) || 0) + 1;
  if (e.punishAwarded) return true;

  e.punishAwarded = true;
  const reward = 50 + Math.max(1, Math.min(3, Number(e.phase) || 1)) * 25;
  addScore(reward);
  game.shake = Math.min(14, (game.shake || 0) + 5);
  game.flash = Math.max(game.flash || 0, 4);
  game.flashColor = "#fff6c8";
  game.nums.add(e.x, e.y - 12, "PUNISH +" + reward, "#ffe66a", true);
  game.bossFx?.counter?.(e.x + e.w / 2, e.y + e.h / 2, e.phase, reward);
  return true;
}
function markHit(p, e, dmg, kb) {
  const evo = Number(p.evo) || 0;
  let d = dmg;
  const push = kb == null ? 1 : kb;
  const crit = d >= 32 || push >= 1.5;
  if (e.boss) d = Math.ceil(d * 0.55);
  damageEnemy(e, d);
  registerBossPunish(e);
  const face = p.facing || 1;
  e.vx = face * (e.boss ? 3 : 8) * push;
  e.vy = Math.min(e.vy || 0, -2.2 * Math.abs(push));
  e.stun = Math.max(e.stun || 0, 10);
  e.flash = crit ? 18 : 14;
  e.invuln = Math.max(e.invuln || 0, 8);
  e._hitT = crit ? 16 : 12;
  e._hitMax = e._hitT;
  e._hitDir = face;
  e._hitColor = crit ? "#ffe66a" : (p.color || "#ffffff");
  e._hitCrit = crit;

  const feedback = damageFeedback({
    crit,
    boss: !!e.boss,
    combo: game.combo,
  });

  if (feedback.showNumber) {
    game.nums.add(
      e.x,
      e.y,
      crit ? d + "!" : String(d),
      crit ? "#ffe66a" : (p.color || "#fff"),
      crit
    );
  }

  game.combatFx?.add(
    e.x + e.w / 2,
    e.y + e.h / 2,
    crit ? "#ffe66a" : (p.color || "#fff"),
    {
      tier: feedback.tier,
      dir: face,
      label: feedback.label,
      seed: game.combo + (e.boss ? 11 : 0),
    }
  );

  punch(e.x, e.y, crit ? "#ffe66a" : p.color);
  game.experience?.hit(p, e, { damage: d, crit, boss: !!e.boss });
  hitStop(e.boss ? (crit ? 5 : 3) : (crit ? 8 : 4));
  if (crit) {
    game.shake = Math.min(16, (game.shake || 0) + 5);
    game.flash = Math.max(game.flash || 0, reduceMotion ? 2 : 4);
    game.flashColor = "#fff6c8";
  }
  addPlayerXp(p, 1);
  void onlineCoop.signal(game, "hit", {
    characterId: p.id,
    targetId: e.id,
    kind: e.kind,
    x: e.x,
    y: e.y,
    damage: d,
  });
  if (game.combo >= 5) {
    game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: p.color || "#fff6c8", count: 8, size: 3, star: true, speed: 2.4 });
    game.nums.add(e.x, e.y - 16, "x" + game.combo, "#fff6c8");
  }
}
function hornPoke(p, evo, def) {
  const face = p.facing || 1;
  p._thrust = 6;
  p._thrustFace = face;
  const reach = 92 + evo * 12;
  const box = {
    x: face > 0 ? p.x + p.w - 6 : p.x - reach,
    y: p.y - 2,
    w: reach,
    h: Math.max(22, p.h * 0.62),
  };
  pushRuntime(game.slashes, {
    x: p.x + p.w / 2 + face * 20,
    y: p.y + 4,
    facing: face,
    life: 14,
    max: 14,
    color: "#ffe9a8",
    kind: "poke",
    w: reach,
  }, MAX_RUNTIME_SLASHES);
  p._swing = { reach, low: false, dmg: def.dmg, kb: 1.2, hit: new Set() };
  for (const e of game.enemies) {
    if (!e || e.dying || e.hp <= 0 || e.invuln > 0) continue;
    if (aabb(box, e)) {
      p._swing.hit.add(e);
      markHit(p, e, def.dmg, 1.2);
    }
  }
  game.fx.emit(box.x + box.w * 0.7, box.y + 8, { color: "#fff6c8", count: 8, size: 3, star: true, speed: 2.4 });
  game.shake = Math.min(10, (game.shake || 0) + 3);
}
function showSwing(p, evo, def) {
  const face = p.facing || 1;
  const sig = signature(p.id);
  p._thrust = sig.heavy ? 7 : 5;
  p._thrustFace = face;
  if (sig.hop) p.vy = Math.min(p.vy || 0, sig.hop);
  const reach = Math.max(48, (def.reach || 64) + (sig.reach || 0));
  const low = !!sig.low;
  const box = low
    ? { x: p.x - reach * 0.12, y: p.y + p.h * 0.42, w: p.w + reach, h: p.h * 0.7 }
    : { x: face > 0 ? p.x + p.w - 8 : p.x - reach, y: p.y - 10, w: reach, h: p.h + 22 };
  const mouth = p.id === "dino" || p.id === "yomi";
  const life = sig.heavy ? 20 : 16;
  const slash = {
    x: p.x + p.w / 2 + face * (low ? 8 : 18),
    y: low ? p.y + p.h * 0.72 : (mouth ? p.y + p.h * 0.4 : p.y + p.h * 0.32),
    facing: face, life, max: life,
    color: def.color || p.color,
    kind: def.kind || "slice",
    w: reach,
  };
  pushRuntime(game.slashes, slash, MAX_RUNTIME_SLASHES);
  pushRuntime(game.slashes, { ...slash, life: 8, max: 8, w: reach * 0.72, y: slash.y - 8 }, MAX_RUNTIME_SLASHES);
  p._swing = { reach, low, dmg: def.dmg, kb: sig.kb || 1, hit: new Set() };
  for (const e of game.enemies) {
    if (!e || e.dying || e.hp <= 0 || e.invuln > 0) continue;
    if (aabb(box, e)) {
      p._swing.hit.add(e);
      markHit(p, e, def.dmg, sig.kb || 1);
    }
  }
  const tipX = face > 0 ? box.x + box.w - 6 : box.x + 6;
  game.fx.emit(tipX, box.y + box.h * 0.45, {
    color: def.color || p.color, count: sig.heavy ? 18 : 12, size: 3.6,
    star: true, speed: 3.4, angle: face > 0 ? 0 : Math.PI, spread: 0.8,
  });
  game.fx.emit(tipX, box.y + box.h * 0.45, { color: "#fff", count: 6, size: 2, speed: 2.2, life: 10 });
  game.shake = Math.min(14, (game.shake || 0) + (sig.heavy ? 6 : 4));
  if (sig.heavy) hitStop(2);
}

function tickSwing(p) {
  const s = p._swing;
  if (!s || !(p.melee > 0)) { p._swing = null; return; }
  const face = p.facing || 1;
  const reach = s.reach;
  const box = s.low
    ? { x: p.x - reach * 0.12, y: p.y + p.h * 0.42, w: p.w + reach, h: p.h * 0.7 }
    : { x: face > 0 ? p.x + p.w - 8 : p.x - reach, y: p.y - 10, w: reach, h: p.h + 22 };
  for (const e of game.enemies) {
    if (!e || e.dying || e.hp <= 0 || e.invuln > 0 || s.hit.has(e)) continue;
    if (!aabb(box, e)) continue;
    s.hit.add(e);
    markHit(p, e, s.dmg, s.kb);
  }
}

function attack() {
  const p = game.player;
  if (!p || p.dead) return;
  if (p.melee > 0) { p.meleeBuf = 8; return; }

  // facing nunca 0
  if (!p.facing) p.facing = 1;

  const evo = Math.max(0, Math.min(4, Number(p.evo) || 0));
  const def = markAt(p.id, evo);

  p.melee = Math.max(7, 12 - evo);
  p.meleeBuf = 0;

  beep("slash");
  game.experience?.attack(p, def);

  if (p._markName !== def.name) {
    p._markName = def.name;
    game.nums.add(
      p.x,
      p.y - 18,
      def.name,
      def.color || p.color || "#ffe66a"
    );
  }
  
  void onlineCoop.signal(game, "action", {
    action: "attack",
    characterId: p.id,
  });

  if (p.id === "cuerno") {
    hornPoke(p, evo, def);
    return;
  }

  showSwing(p, evo, def);
}
function gameDifficulty() {
  try {
    const v = localStorage.getItem("ohana-difficulty");
    return v === "easy" || v === "hard" ? v : "normal";
  } catch (e) { return "normal"; }
}
function scaleFoe(e) {
  if (!e) return e;
  const mul = gameDifficulty() === "easy" ? 0.7 : gameDifficulty() === "hard" ? 1.45 : 1;
  e.max = Math.max(1, Math.ceil((e.max || e.hp || 1) * mul));
  e.hp = e.max;
  return e;
}
function hurtPlayer(amount, label) {
  const p = game.player;
  if (!p || p.dead || p.invuln > 0) return;
  const diffMul = gameDifficulty() === "easy" ? 0.55 : gameDifficulty() === "hard" ? 1.4 : 1;
  amount = Magic.onHurt(game, Passives.onHurt(game, amount)) * diffMul;
  if (!(amount > 0)) return;
  damagePlayer(p, amount);
  p.invuln = 42;
  p.vx = Math.sign(p.vx || p.facing || 1) * -8;
  p.vy = -6.5;
  p.flash = Math.max(p.flash || 0, 10);
  game.shake = 12;
  game.combo = 0;
  game.comboT = 0;
  beep("hurt");
  buzz(24);
  hitStop(2);
  game.experience?.hurt(p, amount);
  void onlineCoop.signal(game, "hurt", {
    targetPlayerId: onlineCoop.identity?.playerId || null,
    amount,
    health: Math.max(0, p.health),
  });
  game.nums.add(p.x, p.y, label || ("-" + Math.round(amount)), "#ff6a7a");
  const hurt = document.getElementById("fx-hurt");
  if (hurt) { hurt.classList.add("on"); setTimeout(() => hurt.classList.remove("on"), 220); }
  if (p.health <= 0 && Passives.onLethal(game)) return;
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    showErrorMessage("DERROTA", "R vuelve al claro");
    if (!DeathFx.isPlaying()) DeathFx.start(p, () => respawn(), { reason: "hurt" });
  }
}
function overlapX(px, pw, plat, pad) {
  const m = pad == null ? 1 : pad;
  return px + pw > plat.x + m && px < plat.x + plat.w - m;
}
function floorsAtX(px, pw) {
  const out = [];
  for (const plat of game.platforms) if (overlapX(px, pw, plat, 0)) out.push(plat);
  return out;
}
function nearestBelow(px, pw, feetY) {
  let best = null;
  for (const plat of floorsAtX(px, pw)) {
    if (plat.y >= feetY - 28 && (!best || plat.y < best.y)) best = plat;
  }
  return best;
}
function lowestFloor(px, pw) {
  let best = null;
  for (const plat of floorsAtX(px, pw)) if (!best || plat.y > best.y) best = plat;
  return best;
}
function landOn(p, plat) {
  const wasAir = !p.grounded;
  const impactSpeed = Number(p.vy) || 0;

  if (wasAir && impactSpeed > 7) {
    beep("land");
    game.experience?.land(p, impactSpeed);
    game.fx.emit(p.x + p.w / 2, plat.y, { color: p.color || "#fff", count: impactSpeed > 11 ? 16 : 8, size: 3, speed: 2.4, up: 0.4, life: 14 });
    if (impactSpeed > 11) game.shake = Math.min(10, (game.shake || 0) + 3);
  }

  p.y = plat.y - p.h;
  p.vy = 0;
  p.grounded = true;
  p.jumps = 0;
  p.coyote = 10;
}
function inPitX(p) {
  const cx = p.x + p.w / 2;
  const grounds = game.platforms.filter((pl) => pl.h > 40).sort((a, b) => a.x - b.x);
  for (let i = 0; i < grounds.length - 1; i++) {
    const left = grounds[i].x + grounds[i].w;
    const right = grounds[i + 1].x;
    if (right - left >= 40 && cx > left && cx < right) return true;
  }
  return false;
}
function dieVoid(p) {
  if (!p || p.dead) return;
  p.dead = true; p.health = 0; game.shake = 16; beep("hurt");
  const hurt = document.getElementById("fx-hurt");
  if (hurt) { hurt.classList.add("on"); setTimeout(() => hurt.classList.remove("on"), 280); }
  showErrorMessage("VACÍO", "Pozo real. R vuelve al claro");
  game.fx.emit(p.x + p.w / 2, p.y, { color: "#7ee7ff", count: 28, size: 5, up: 2 });
  if (!DeathFx.isPlaying()) DeathFx.start(p, () => respawn(), { reason: "void" });
}
function checkVoidDeath() {
  const p = game.player;
  if (!p || p.dead) return;
  const r = room();
  const feet = p.y + p.h;

  const next = nearestBelow(p.x, p.w, feet - 8);
  if (next && feet >= next.y) {
    landOn(p, next);
    return;
  }

  const low = lowestFloor(p.x, p.w);
  if (low && feet > low.y && p.vy >= 0) {
    landOn(p, low);
    return;
  }

  if (!r.pit) {
    const floorY = game.worldH - 90;
    if (feet > floorY) {
      p.y = floorY - p.h;
      p.vy = 0;
      p.grounded = true;
    }
    return;
  }

  // El vacío se determina por geometría, no por una única coordenada mágica.
  const inGap = inPitX(p);
  const crossedBottom = feet > game.worldH - 24;
  const deepFall = p.y > game.worldH + 8;

  if (inGap && crossedBottom) {
    if (r.doors.down) loadRoom(r.doors.down, "down");
    else dieVoid(p);
    return;
  }

  if (deepFall) dieVoid(p);
}
function aabb(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function punch(x, y, color, dir = 1) {
  game.shake = Math.min(18, game.shake + 6);
  addCombo(1);
  game.comboT = 480;
  addScore(10 * game.combo);
  const tier = combatTier(game.combo);
  const label = tier >= 4 ? "RÁFAGA" : tier === 3 ? "IMPACTO" : tier === 2 ? "COMBO" : "";
  game.combatFx?.add(x, y, color || "#fff", { tier, dir, label, seed: game.combo });
  game.fx.emit(x, y, { color, count: 10 + tier * 2, size: 3.2 + tier * 0.35, up: 1.2 + tier * 0.18 });
  game.fx.emit(x, y, { color: "#fff", count: 6 + tier * 2, size: 2, up: 1.8, speed: 4.4 + tier * 0.3, life: 16, star: true });
  if (tier >= 3) hitStop(tier === 4 ? 4 : 3);
  beep("hit");
}
function beginFinale(e) {
  game.finale = {
    t: 520,
    max: 520,
    x: e.x + e.w / 2,
    y: e.y + e.h * 0.42,
    lines: [
      "El nido se abre.",
      "Los que se quedaron atrás salen a la luz.",
      "Ohana no es el poder. Es no dejar a nadie."
    ]
  };
  game.storyLine = "El nido se abre.";
  game.hitstop = 0;
  game.flash = 24;
  game.flashColor = "#fff6c8";
  game.shake = 26;
  game.projectiles = [];
  game.fx?.emit(game.finale.x, game.finale.y, {
    color: "#ffe66a",
    count: game.reduceMotion ? 16 : 44,
    size: 6,
    up: 3.2,
    speed: 4.6,
    star: true,
    life: 28,
  });
  game.bolts = [];
  game.slashes = [];
  playMusic("victoria");
}
function tickFinale() {
  const f = game.finale;
  if (!f || f.t <= 0) return;
  f.t--;
  if (game.fx && f.t % 5 === 0 && f.t > 80) {
    game.fx.emit(f.x + (vfxRandom(1) - 0.5) * 160, f.y + (vfxRandom(2) - 0.5) * 90, {
      color: f.t > 240 ? "#ff4060" : "#ffe66a",
      count: 2,
      size: 4,
      up: 2.2,
      star: true,
      life: 18,
    });
  }
  if (f.t === 420) game.storyLine = f.lines[1];
  if (f.t === 260) game.storyLine = f.lines[2];
  if (f.t === 420 || f.t === 260 || f.t === 120) {
    game.flash = 12;
    game.flashColor = f.t === 120 ? "#ffe66a" : "#fff";
  }
  if (f.t === 0 && !game.won) {
    game.won = true;
    const p = game.player;
    const ticks = game.clearTicks || 0;
    const rank = clearRank(ticks);
    game.best = rememberBest(game.best, {
      ticks, kills: game.kills, score: game.score, evo: p ? p.evo : 0, rank, id: p ? p.id : ""
    });
    save();
    dispatchEvent(new CustomEvent("ohana-win", { detail: {
      score: game.score,
      kills: game.kills,
      hero: p ? p.name : "Ohana",
      form: p && p.evoNames ? p.evoNames[p.evo] || p.evoNames[4] : "forma final",
      rank,
      time: formatClear(ticks),
      best: game.best ? formatClear(game.best.ticks) : ""
    }}));
    dispatchEvent(new CustomEvent("ohana-room", { detail: {
      id: game.roomId, visited: game.visited, won: true, evo: p ? p.evo : 0
    }}));
  }
}
function worldClear() {
  const need = ["hub", "beach", "jungle", "cave", "lab", "ridge", "space", "volcano"];
  if (game.won || game.summoned || game.roomId === "boss") return;
  if (!need.every((id) => game.visited[id])) return;
  game.summoned = true;
  game.summonDelay = 132; // 2.2 s a 60 Hz, pausables y reproducibles.
  beep("alert");
  showBossMessage("EL NIDO DESPIERTA", "El monstruo te espera. Prepárate.");
}

function tickWorldSummon() {
  if (!(game.summonDelay > 0)) return;
  if (game.won || game.roomId === "boss" || !game.running) {
    if (game.roomId === "boss" || game.won) game.summonDelay = 0;
    return;
  }
  game.summonDelay--;
  if (game.summonDelay <= 0) {
    game.summonDelay = 0;
    if (!game.won && game.running) loadRoom("boss", "right");
  }
}
function nearUpDoor(p) {
  const cx = p.x + p.w / 2;
  return cx > 700 && cx < 1060;
}
function tryDoors() {
  const p = game.player; const r = room();
  const nestLocked = r.id === "boss" && !game.won;
  if (nestLocked && p.x < 72) p.x = 72;
  let dest = null, dir = null;
  if (p.x > game.worldW - 24 && r.doors.right) { dest = r.doors.right; dir = "right"; }
  else if (p.x < -8 && r.doors.left && !nestLocked) { dest = r.doors.left; dir = "left"; }
  else if (p.y < 8 && r.doors.up && nearUpDoor(p)) { dest = r.doors.up; dir = "up"; }
  if (p.x > game.worldW - 24 && !r.doors.right) p.x = game.worldW - p.w;
  if (p.x < -8 && (!r.doors.left || nestLocked)) p.x = nestLocked ? 72 : 0;
  if (nestLocked && p.x < 72) p.x = 72;
  if (p.y < 0 && !r.doors.up) p.y = 0;
  if (!dest || game.doorWait) return;
  const next = ROOMS[dest];
  if (next && next.needEvo && p.evo < next.needEvo) { loadRoom(dest, dir); return; }
  const hold = reduceMotion ? 8 : 30;
  game.doorWait = { id: dest, dir, t: hold, max: hold };
  p.vx = 0;
  p.vy = 0;
  if (dir === "right") p.x = Math.min(p.x, game.worldW - p.w - 2);
  else if (dir === "left") p.x = Math.max(p.x, 2);
  else if (dir === "up") p.y = Math.max(p.y, 6);
}
function updatePlayer() {
  const p = game.player; if (p.dead) return;
  if (game.doorWait) {
    p.vx = 0;
    p.vy = 0;
    game.doorWait.t--;
    if (game.doorWait.t <= 0) {
      const w = game.doorWait;
      game.doorWait = null;
      loadRoom(w.id, w.dir);
    }
    return;
  }
  if (p.markT > 0) p.markT--;
  if (game.doorHold > 0) {
    game.doorHold--;
    p.vx = 0;
    p.vy = 0;
    return;
  }
  if (game.finale && game.finale.t > 0) {
    p.vx = 0;
    p.vy = 0;
    return;
  }
  tickEvoTween(p);
  const left = keys["a"] || keys["arrowleft"];
  const right = keys["d"] || keys["arrowright"];
  const jump = keys["w"] || keys["arrowup"] || keys[" "];
  const drop = keys["s"] || keys["arrowdown"];
  if (p.dash > 0) p.dash--;
  if (p._dashGo > 0) p._dashGo--;
  if (p.melee > 0) p.melee--;
  if (p.dashBuf > 0) { p.dashBuf--; if (p.dash <= 0) dash(); }
  // Buffer usa el mismo camino que F/click (attack), no el melee legacy
  if (p.meleeBuf > 0) { p.meleeBuf--; if (p.melee <= 0) attack(); }
  if (p._thrust > 0) {
    p._thrust--;
    p.facing = p._thrustFace || p.facing || 1;
    const burst = p.facing * (p.speed + 4);
    if (p._dashGo > 0) {
      const dv = signature(p.id).dash * (p._dashFace || p.facing || 1);
      p.vx = Math.abs(dv) >= Math.abs(burst) ? dv : burst;
    } else p.vx = burst;
  } else if (p._dashGo > 0) {
    const face = p._dashFace || p.facing || 1;
    const oppose = (face > 0 && left && !right) || (face < 0 && right && !left);
    if (oppose) {
      p._dashGo = 0;
      p.vx *= 0.35;
    } else {
      p.vx = face * signature(p.id).dash;
      p.facing = face;
    }
  } else if (left !== right) {
    // Movimiento horizontal determinista y simétrico.
    const target = right ? Math.abs(p.speed) : -Math.abs(p.speed);
    const accel = p.grounded ? 0.34 : 0.20;
    p.vx += (target - p.vx) * accel;
    if (Math.abs(target - p.vx) < 0.06) p.vx = target;
    p.facing = target > 0 ? 1 : -1;
  } else {
    // Frenado corto y consistente, sin arrastre asimétrico.
    p.vx *= p.grounded ? 0.72 : 0.94;
    if (Math.abs(p.vx) < 0.04) p.vx = 0;
  }
  if (jump) p.buffer = 10; else if (p.buffer > 0) p.buffer--;
  p.wall = 0;
  if (!p.grounded) {
    for (const plat of game.platforms) {
      if (p.y + p.h > plat.y && p.y < plat.y + plat.h) {
        if (p.x + p.w > plat.x && p.x + p.w < plat.x + 10 && right) p.wall = -1;
        if (p.x < plat.x + plat.w && p.x > plat.x + plat.w - 10 && left) p.wall = 1;
      }
    }
  }
  const canJump = p.jumps < p.maxJumps || p.coyote > 0 || p.wall;
  if (p.buffer > 0 && canJump && !p._jumpHeld) {
    p.vy = -p.jumpPower; p.jumps = p.coyote > 0 || p.wall ? 1 : p.jumps + 1;
    if (p.wall) p.vx = 8 * p.wall;
    p.grounded = false; p.coyote = 0; p.buffer = 0; p._jumpHeld = true; beep("jump");
    game.fx.emit(p.x + p.w / 2, p.y + p.h, { color: p.color || "#fff", count: 10, size: 2.6, up: 1.4, speed: 2.2, life: 14 });
  }
  if (!jump) {
    if (p._jumpHeld && p.vy < -4) p.vy *= 0.55;
    p._jumpHeld = false;
  }
  if (p.glide && !p.grounded && p.vy > 1 && jump) p.vy = 1.15;
  if (p.gliding > 0) { p.gliding--; p.vy = Math.min(p.vy, 1.3); }
  // GOD glide dust trail: 2–3 partículas cada ~5 frames detrás/abajo
  {
    const holdGlide = !!(p.glide && !p.grounded && p.vy > 1 && jump);
    const glideActive = holdGlide || (p.gliding > 0);
    if (glideActive && (p.evo >= 4 || p.glide) && (t % 5 === 0)) {
      const behind = p.x + p.w / 2 - p.facing * 10;
      const under = p.y + p.h * 0.88;
      game.fx.emit(behind, under, {
        color: p.color || "#fff8e0",
        count: 2 + (vfxRandom(3) < 0.45 ? 1 : 0),
        size: 1.7,
        up: 0.12,
        speed: 0.85,
        life: 12,
        gravity: 0.035,
        angle: Math.PI / 2 + (vfxRandom(4) - 0.5) * 0.8,
        spread: 0.6,
      });
    }
  }
  if (p.wall) p.vy = Math.min(p.vy, 2.2);
  const input = { left: !!left, right: !!right, jump: !!jump, drop: !!drop, jumpPressed: !!jump && !p._jumpPrev, t };
  p._jumpPrev = !!jump;
  Passives.update(game, input);
  const wasGrounded = !!p.grounded;
  const incoming = p.vy;
  p.vy = Math.min(14, p.vy + (p._dashGo > 0 ? 0.14 : 0.5));
  p.grounded = false;
  const steps = Math.max(1, Math.ceil((Math.abs(p.vx) + Math.abs(p.vy)) / 8));
  let wall = 0;
  for (let s = 0; s < steps; s++) {
    const sx = p.x;
    const sy = p.y;
    p.x += p.vx / steps;
    p.y += p.vy / steps;
    const hit = resolveBody(p, game.platforms, {
      prevX: sx,
      prevY: sy,
      dropThroughY: drop && wasGrounded && s === 0 ? sy + p.h + 10 : null,
    });
    if (hit.grounded) {
      if (!p.grounded && incoming > 7) beep("land");
      p.vy = 0;
      p.grounded = true;
      p.jumps = 0;
      p.coyote = 10;
    }
    if (hit.hitX) wall = hit.hitX;
    if (hit.hitY === -1) break;
  }
  if (wall && !p.grounded) p.wall = wall;
  tickSwing(p);
  Passives.afterMove(game, input);
  Magic.update(game);
  if (p.grounded && Math.abs(p.vx) > 2 && t % 6 === 0) game.fx.emit(p.x + p.w / 2, p.y + p.h, { color: "#ccc", count: 2, size: 2 });
  if (!p.grounded && p.coyote > 0) p.coyote--;
  if (p._specialFlightT > 0) {
    p.grounded = false;
    p.coyote = 0;
    p.jumps = p.maxJumps;
  }
  if (p.invuln > 0) p.invuln--;
  for (const o of game.orbs) {
    if (!o.taken && Math.hypot(p.x + p.w / 2 - o.x, p.y + p.h / 2 - o.y) < 28) {
      o.taken = true; addPlayerXp(p, 4 + Surprises.starOrbBonus()); addScore(25); beep("pickup"); game.nums.add(o.x, o.y, "+XP", "#ffe66a");
      if (game.orbs.every((q) => q.taken)) { beep("objective"); showObjectiveMessage("CRISTALES COMPLETOS", room().name + " · todos los cristales recogidos"); addScore(100); }
    }
  }
  for (const h of game.hearts) {
    if (!h.taken && Math.hypot(p.x + p.w / 2 - h.x, p.y + p.h / 2 - h.y) < 36) {
      h.taken = true; healPlayer(p, 25); game.nums.add(h.x, h.y, "+HP", "#f66"); beep("pickup");
    }
  }
  if (!(portals.isBusy && portals.isBusy())) { tryDoors(); checkVoidDeath(); }
  portals.update(game);
  // Charge en curso: refuerzo mínimo de shake/flash tipado (no reescribe trip)
  if (portals.isBusy && portals.isBusy() && portals.charge) {
    const ov = typeof portals.getOverlay === "function" ? portals.getOverlay() : null;
    const bh = portals.charge.type === "blackhole";
    if (!reduceMotion && ov && ov.alpha > 0.15) {
      game.shake = Math.min(15, Math.max(game.shake || 0, 2 + ov.alpha * 9));
    }
    if (ov && ov.alpha > 0.45) {
      game.flash = Math.max(game.flash || 0, bh ? 3 : 2);
      game._portalFlash = bh ? "purple" : "amber";
    }
  }
  const trip = portals.consume();
  if (trip && trip.dest) {
    // Transición portal: fade largo + flash tipado (nunca dieVoid)
    const bh = trip.type === "blackhole";
    game.fading = reduceMotion ? 16 : 24;
    game.flash = bh ? (reduceMotion ? 10 : 16) : (reduceMotion ? 8 : 12);
    game.shake = Math.min(22, (game.shake || 0) + (reduceMotion ? 4 : (bh ? 14 : 10)));
    game._portalFlash = bh ? "purple" : "amber";
    game._portalFadeMax = game.fading;
    if (bh) {
      game.fx.emit(p.x + p.w / 2, p.y + p.h / 2, { color: "#b48cff", count: reduceMotion ? 14 : 36, size: 5, up: 1.6, speed: 3.4, life: 22 });
      game.fx.emit(p.x + p.w / 2, p.y + p.h / 2, { color: "#fff", count: reduceMotion ? 4 : 12, size: 2.5, up: 2, speed: 4, life: 14, star: true });
      beep("orb");
    } else {
      game.fx.emit(p.x + p.w / 2, p.y, { color: "#ffc078", count: reduceMotion ? 12 : 28, size: 4, up: 2.4, speed: 4, life: 18 });
      game.fx.emit(p.x + p.w / 2, p.y + p.h / 2, { color: "#ffe8c0", count: reduceMotion ? 4 : 10, size: 2.5, up: 2.8, speed: 3.5, life: 14, star: true });
      beep("jump");
    }
    const fadeLen = game.fading;
    const flashLen = game.flash;
    const flashKind = game._portalFlash;
    const ok = loadRoom(trip.dest, "portal");
    if (ok) {
      // loadRoom resetea fading=12; restaurar transición portal (tint vía _portalFlash)
      game.fading = fadeLen;
      game.flash = Math.max(game.flash || 0, flashLen);
      game._portalFlash = flashKind;
      game._portalFadeMax = fadeLen;
    } else {
      // Trip abortado (needEvo / dest inválido): reset visual + push-out
      game._portalFlash = null;
      game._portalFadeMax = 0;
      game.fading = 0;
      game.flash = Math.min(game.flash || 0, 6);
      if (typeof portals.abortTrip === "function") portals.abortTrip(game);
      else portals.armArrival();
      snapToFloor(p);
      beep("hurt");
    }
  }
  const r = room();
  if (portals.prompt) setPrompt(portals.prompt, true);
  else if (p.x > game.worldW - 90 && r.doors.right) setPrompt("ESTE · sigue andando", true);
  else if (p.x < 120 && r.id === "boss" && !game.won) setPrompt("El nido no se abre hasta que caiga", true);
  else if (p.x < 70 && r.doors.left) setPrompt("OESTE · sigue andando", true);
  else if (p.y < 90 && r.doors.up && nearUpDoor(p)) setPrompt("ARRIBA · salta al techo", true);
  else if (p.y > game.worldH - 160 && r.doors.down && inPitX(p)) setPrompt("ABAJO · cae por el hueco", true);
  else if (p.evo < 4 && p.xp >= (XP_NEED[p.evo + 1] || Infinity)) {
    const nxt = p.forms && p.forms[p.evo + 1];
    setPrompt("E · evolucionar" + (nxt ? " · " + nxt.name : ""), true);
  }
  else setPrompt("", false);
  while (p.evo < 4 && XP_NEED[p.evo + 1] != null && p.xp >= XP_NEED[p.evo + 1]) evolve("xp");
  tickRam(p);
}
function tickRam(p) {
  if (!p || !(p._ram > 0)) return;
  p._ram--;
  const box = { x: p.x - 8, y: p.y + 4, w: p.w + 16, h: p.h - 4 };
  for (const e of game.enemies) {
    if (e._rammed > 0) e._rammed--;
    if (e._rammed > 0 || e.dying || e.hp <= 0 || e.invuln > 0) continue;
    if (!aabb(box, e)) continue;
    e._rammed = 12;
    const d = 10 + (Number(p.evo) || 0) * 4;
    damageEnemy(e, e.boss ? Math.ceil(d * 0.45) : d);
    registerBossPunish(e);
    e.vx = p.facing * 7;
    e.vy = Math.min(e.vy || 0, -2);
    e.flash = 12;
    punch(e.x, e.y, p.color);
  }
}
function solidifyFoe(e) {
  if (!e || e.boss) {
    if (e && e.boss && !e.dying) {
      e.x = Math.max(48, Math.min(e.x, game.worldW - e.w - 48));
      e.y = Math.min(e.y, game.worldH - 90 - e.h);
    }
    return;
  }
  if (e.x < 12) { e.x = 12; if (e.vx < 0) e.vx *= -1; }
  if (e.x > game.worldW - e.w - 12) { e.x = game.worldW - e.w - 12; if (e.vx > 0) e.vx *= -1; }
  const water = e.kind === "pez" || e.kind === "medusa" || e.kind === "anguila";
  const planted = e.kind === "planta";
  if (water || planted) {
    e.y = Math.max(180, Math.min(game.worldH - 150, e.y));
    e.grounded = !!planted;
    return;
  }
  if (isAirFoe(e)) {
    const hit = resolveBody(e, game.platforms, {
      prevX: e.x - (e.vx || 0),
      prevY: e.y - (e.vy || 0),
      solidsOnly: true,
    });
    if (hit.hitY === 1) e.vy = -Math.abs(e.vy || 1.4);
    if (hit.hitX) e.vx *= -1;
    e.y = Math.max(64, Math.min(game.worldH - 190, e.y));
    e.grounded = false;
    return;
  }
  const rising = e.vy < -0.4 && (e.kind === "rana" || e.lunge > 0 || e.hop > 0);
  const hit = resolveBody(e, game.platforms, {
    prevX: e.x - (e.vx || 0),
    prevY: e.y - (e.vy || 0),
    solidsOnly: rising,
  });
  if (rising) { e.grounded = false; return; }
  if (!hit.grounded) {
    e.grounded = false;
    if (e.y > game.worldH) e.hp = 0;
    return;
  }
  e.grounded = true;
  if (e.kind === "arana") e.dropping = false;
  if (e.kind === "rana" && e.hopCd > 0 && !(e.sitting > 0)) e.sitting = 16;
  const under = game.platforms.find((plat) => overlapX(e.x, e.w, plat, 0) && Math.abs(e.y + e.h - plat.y) < 3);
  if (under && e.kind !== "rana") {
    const margin = 8;
    if (e.x <= under.x + margin || e.x + e.w >= under.x + under.w - margin) {
      e.vx *= -1;
      e.x = e.x <= under.x + margin ? under.x + margin : under.x + under.w - e.w - margin;
    }
  }
}
function dmgFor(e) {
  let dmg = 7;
  if (e.boss) dmg = e.contactDmg || 22;
  else if (e.kind === "planta") dmg = 12;
  else if ((e.kind === "abeja" || e.kind === "avispa") && (e.diving > 0 || e.charging > 0)) dmg = 14;
  else if (e.kind === "mosquito") dmg = 9;
  else if (e.kind === "libelula") dmg = 8;
  else if (e.kind === "pez") dmg = 8;
  else if (e.kind === "medusa") dmg = 10;
  else if (e.kind === "anguila") dmg = 10;
  else if (e.kind === "rana") dmg = 8;
  else if (e.kind === "cangrejo") dmg = (e.clawSnap > 0) ? 11 : 8;
  else if (e.kind === "gaviota") dmg = e.diving ? 10 : 7;
  else if (e.kind === "murcielago") dmg = e.diving ? 11 : 8;
  else if (e.kind === "arana") dmg = 9;
  else if (e.kind === "brasita") dmg = 9;
  else if (e.kind === "escoria") dmg = e.hp < e.max * 0.4 ? 12 : 9;
  else if (e.kind === "ufo") dmg = 8;
  else if (e.kind === "cucaracho" && e.evo >= 2) dmg = 12;
  else if (e.kind === "cucaracho" && e.evo >= 1) dmg = 10;
  else if (e.kind === "cucaracho") dmg = 7;
  else if (e.evo) dmg = 10;
  if (e.elite) dmg = Math.round(dmg * 1.25);
  return dmg;
}
function updateEnemies() {
  if (!game.player) return;
  game.bossFx?.update();
  { const b = game.enemies.find((e) => e.boss && !e.dying); if (b && b.phase >= 3 && currentMusic() === "jefe") playMusic("jefe3"); }
  if (game.enemySlow > 0 && (t & 1)) return; // Reloj de arena: enemigos a media velocidad
  for (const e of game.enemies) {
    const molts = e.kind === "cucaracho" && !e.baby && (e.evo || 0) < 2;
    const posed = e.kind === "cucaracho" || e.kind === "mosquito" || e.kind === "cangrejo";
    if (!e.boss && e.hp <= 0 && posed && !molts) {
      if (e.dying == null) {
        e.dying = 28;
        game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: e.color || "#fff", count: 16, size: 4, star: true, speed: 3.2, up: 1.6 });
        game.nums.add(e.x, e.y - 10, "KO", "#fff6c8", true);
      }
      e.deathHold = 1;
      e.dying--;
      e.vx = 0;
      e.vy = Math.min(5, (e.vy || -2) + 0.4);
      e.y += e.vy;
      continue;
    }
    if (e.flash > 0) e.flash--;
    if (e._hitT > 0) e._hitT--;
    if (e.stun > 0) {
      e.stun--;
      if (!e.boss && e.stun > 5) {
        e.vx *= 0.4;
        e.telegraph = false;
        // Cancela wind-ups de ataque (sin soft-lock: stun acotado)
        if (e.wind) e.wind = 0;
        if (e.hopWind) e.hopWind = 0;
        if (e.clawWind) e.clawWind = 0;
      }
    }

    // --- BOSS: IA primero, movimiento después (sin gravedad genérica) ---
    // Evita el soft-lock: antes se aplicaba gravedad + move ANTES de updateBossNido,
    // lo que desincronizaba slam/swoop/charge y dejaba a la Reina congelada.
    if (e.boss) {
      if (e.fell) {
        e.vx = 0; e.vy = 0;
        e.x += ((game.worldW / 2 - e.w / 2) - e.x) * 0.14;
        e.y += ((game.worldH / 2 - 80 - e.h / 2) - e.y) * 0.14;
        e.dying = Math.max(0, (e.dying || 0) - 1);
        if (t % 3 === 0) {
          game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#ffe66a", count: 8, size: 5, up: 2.4, star: true });
          game.flash = 4;
        }
        continue;
      }
      if (e.invuln > 0) e.invuln--;
      try {
        updateBossNido(e, game, {
          t, hurtPlayer, showBossMessage, makeFoe,
          ROOM_W: game.worldW, ROOM_H: game.worldH,
          reduceMotion: game.reduceMotion || reduceMotion,
          beep,
        });
      } catch (err) {
        // Nunca congelar el loop entero si el boss falla un frame
        console.warn("[Ohana] boss update:", err);
        e.mode = "idle";
        e.telegraph = false;
        e.attackCd = Math.max(e.attackCd || 0, 30);
      }
      // Integrar velocidad que acaba de fijar la state machine
      e.x += e.vx || 0;
      e.y += e.vy || 0;
      e.x = Math.max(40, Math.min(e.x, game.worldW - e.w - 40));
      e.y = Math.max(80, Math.min(e.y, game.worldH - 90 - e.h));
      // Contacto con el jugador
      const pBoss = game.player;
      if (pBoss && !pBoss.dead && !e.dying && e.contactDmg > 0 && aabb(pBoss, e)) {
        const dmg = e.contactDmg || 22;
        hurtPlayer(dmg, "-" + dmg);
        if (!pBoss.dead) {
          pBoss.vx = Math.sign(pBoss.x - e.x || 1) * 10;
          pBoss.vy = -6.5;
        }
      }
      continue;
    }

    const flyer = e.kind === "phosquito" || e.kind === "mosquito" || e.kind === "gaviota" || e.kind === "murcielago" || e.kind === "libelula" || e.kind === "avispa" || e.kind === "abeja" || e.kind === "brasita" || e.kind === "ufo";
    if (flyer) {
      const band = e.kind === "gaviota" ? 280 : 360;
      if (e.y > band) e.vy = Math.min(e.vy || 0, -0.8);
      else e.vy += 0.04;
    }
    else if (e.kind === "planta" || e.kind === "medusa" || e.kind === "pez" || e.kind === "anguila") e.vy = 0;
    else e.vy += 0.5;
    e.x += e.vx; e.y += e.vy;
    {
    const s = sense(e, game.player);
    let pack = 0;
    for (const o of game.enemies) {
      if (o !== e && o.kind === e.kind && (o.aggro || 0) > 20 && Math.abs(o.x - e.x) < 240) pack++;
    }
    const next = think(e, s, pack);
    if (next !== "patrol" && (e.mode || "patrol") === "patrol") e.alertPing = 16;
    e.mode = next;
    e._dx = s.dx;
    e._over = s.over;
    if (e.alertPing > 0) e.alertPing--;
    e.shoot = (e.shoot || 0) + 1;
    const rate = e.kind === "planta" ? 70 : 9999;
    if (e.kind === "planta" && e.up) {
      if (e.shoot > rate) {
        e.shoot = 0;
        const aim = Math.sign(game.player.x - e.x) || 1;
        pushRuntime(game.projectiles, {
          x: e.x + 10, y: e.y + 8,
          vx: aim * 4.2 * 0.7,
          vy: -1.2,
          w: 10, h: 10, life: 80,
          dmg: 9, color: "#7dca5a",
          owner: "enemy",
  }, MAX_RUNTIME_PROJECTILES);
      }
    }
    }
    if (e.kind === "phosquito" && e.canSplit && !e.split && e.hp < e.max * 0.5) {
      e.split = true;
      pushRuntime(game.enemies, makeFoe(e.x + 18, e.y - 8, "phosquito", game.roomId, 1, { baby: true }), MAX_RUNTIME_ENEMIES);
      game.fx.emit(e.x, e.y, { color: "#6ad0a8", count: 10, size: 3, up: 1.4 });
    }
    if (e.kind === "planta") {
      e.vx = 0;
      e.hide = (e.hide || 0) + 1;
      if (e.hide > 110) { e.hide = 0; e.up = !e.up; }
    }
    if (e.invuln > 0) e.invuln--;
    // --- phosquito: dive telegraph + split kept ---
    if (e.kind === "phosquito") {
      e.diveCd = (e.diveCd || 0) - 1;
      if (e.diving) {
        e.diving--;
        e.telegraph = false;
        if (e.diving <= 0) e.diveCd = 70;
      } else if (e.diveCd <= 0 && game.player) {
        e.wind = (e.wind || 0) + 1;
        e.telegraph = true;
        e.vx *= 0.9;
        if (e.wind > 12) {
          e.wind = 0; e.telegraph = false; e.diving = 28;
          e.vx += Math.sign(game.player.x - e.x) * 1.8;
          e.vy = 3.4;
        }
      } else {
        e.telegraph = false;
        e.vy += 0.04;
        if (e.y < 520) e.vy += 0.45;
        if (e.y > 720) e.vy = -1.8;
      }
      e.vx = Math.max(-3.6, Math.min(3.6, e.vx));
    }
    // --- cucaracho evo2: sigue en el suelo, más rápido, con saltos cortos ---
    if (e.kind === "cucaracho" && e.evo >= 2) {
      e.telegraph = false;
      if (game.player) e.vx += Math.sign(game.player.x - e.x || 1) * 0.16;
      e.vx = Math.max(-3.6, Math.min(3.6, e.vx));
      if (e.grounded && (e.hop || 0) <= 0 && (e.mode === "chase" || e.mode === "strike") && (t + Math.floor(e.x)) % 70 === 0) {
        e.vy = -6.2;
        e.hop = 18;
        e.flash = 4;
      }
      if (e.hop > 0) e.hop--;
    }
    // --- cucaracho evo0 patrol / evo1 lunge ---
    if (e.kind === "cucaracho" && e.evo < 2) {
      if (e.lunge > 0) {
        e.lunge--;
        if (e.lunge <= 0) e.vx *= 0.4;
      } else {
        e.lungeCd = (e.lungeCd || 0) - 1;
        if (e.evo >= 1 && e.lungeCd <= 0 && game.player && e.mode === "strike") {
          e.lungeCd = 90;
          e.lunge = 18;
          e.vx = Math.sign(game.player.x - e.x || 1) * 5.2;
          e.vy = -3.5;
          e.flash = 6;
          game.fx.emit(e.x, e.y + e.h, { color: "#c45a18", count: 6, size: 2.5, up: 1.2 });
        }
      }
    }
    // --- mosquito: telegraph dive, steep dive, upward spiral recover ---
    if (e.kind === "mosquito") {
      e.diveCd = (e.diveCd || 0) - 1;
      if (e.spiral > 0) {
        e.spiral--;
        e.telegraph = false;
        e.diving = false;
        e.vx = Math.cos(t / 4 + e.x * 0.01) * 3.2;
        e.vy = -2.6;
        if (t % 3 === 0) game.fx.emit(e.x + e.w / 2, e.y + e.h, { color: "#ff6a4a", count: 1, size: 1.8, up: 0.2, life: 10 });
      } else if (e.diving) {
        e.diving--;
        e.telegraph = false;
        if (e.diving <= 0) { e.spiral = 28; e.diveCd = 48; }
      } else if (e.diveCd <= 0 && game.player && e.mode === "strike") {
        e.wind = (e.wind || 0) + 1;
        e.telegraph = true;
        e.vx *= 0.85;
        e.vy *= 0.7;
        if (e.wind > 14) {
          e.wind = 0; e.telegraph = false; e.diving = 22;
          e.vx = Math.sign(game.player.x - e.x || 1) * 3.4;
          e.vy = 5.5;
        }
      } else {
        e.telegraph = false;
        e.vy += 0.05;
        if (game.player) e.vx += Math.sign(game.player.x - e.x) * 0.12;
        if (e.y < 480) e.vy += 0.55;
        if (e.y > 740) e.vy = -2.4;
      }
      e.vx = Math.max(-5.0, Math.min(5.0, e.vx));
    }
    // --- libelula: figure-8 hover, telegraph then zig-zag diagonal dash + afterimage ---
    if (e.kind === "libelula") {
      e.bob = (e.bob || 0) + 0.07;
      e.dart = (e.dart || 0) - 1;
      if (e.baseY == null) e.baseY = e.y;
      if (e.darting) {
        e.darting--;
        e.telegraph = false;
        if (t % 2 === 0) pushRuntime(game.ghosts, { x: e.x, y: e.y, w: e.w, h: e.h, life: 7, color: "#4aba7a" }, MAX_RUNTIME_GHOSTS);
        if (e.darting <= 0) { e.dart = 55 + (t % 35); e.vx *= 0.35; }
      } else if (e.wind > 0 || (e.dart <= 0 && game.player)) {
        if (e.dart <= 0 && e.wind <= 0) e.wind = 1;
        e.wind++;
        e.telegraph = true;
        // zig-zag wind-up
        e.vx = Math.sin(e.wind * 0.7) * 1.8;
        e.y = e.baseY + Math.sin(e.bob) * 10;
        e.vy = 0;
        if (e.wind > 10) {
          e.wind = 0; e.telegraph = false; e.darting = 16;
          const dx = game.player.x - e.x;
          const dy = game.player.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          e.vx = (dx / len) * 6.2 + (game.rng() - 0.5) * 1.5;
          e.vy = (dy / len) * 4.5;
          e.baseY += Math.sign(game.player.y - e.baseY) * 36;
          e.baseY = Math.max(220, Math.min(620, e.baseY));
        }
      } else {
        e.telegraph = false;
        // figure-8 hover
        e.y = e.baseY + Math.sin(e.bob) * 16;
        e.x += Math.sin(e.bob * 2) * 0.55;
        e.vy = 0;
        e.vx *= 0.988;
        e.vx = Math.max(-3.2, Math.min(3.2, e.vx));
      }
      if (e.x < 30 || e.x > game.worldW - 30 - e.w) { e.vx *= -1; e.x = Math.max(30, Math.min(game.worldW - 30 - e.w, e.x)); }
    }
    // --- abeja/avispa: gentle hover, buzz telegraph, steeper stinger dive ---
    if (e.kind === "abeja" || e.kind === "avispa") {
      e.bob = (e.bob || 0) + 0.07;
      if (e.baseY == null) e.baseY = e.y;
      e.cd = (e.cd || 0) - 1;
      if (e.diving > 0) {
        e.diving--;
        e.telegraph = false;
        e.charging = e.diving; // drives drawAbeja sting stretch
        if (t % 3 === 0) pushRuntime(game.ghosts, { x: e.x, y: e.y, w: e.w, h: e.h, life: 8, color: "#ffcc33" }, MAX_RUNTIME_GHOSTS);
        if (e.diving <= 0) {
          e.cd = 80;
          e.charging = 0;
          e.vx *= 0.25;
          e.vy *= 0.15;
          e.baseY = Math.max(220, Math.min(620, e.y));
        }
      } else if (e.cd <= 0 && game.player) {
        e.wind = (e.wind || 0) + 1;
        e.telegraph = true;
        e.vx *= 0.9;
        e.vy = 0;
        // hover wobble while winding up
        e.y = e.baseY + Math.sin(e.bob * 1.6) * 10;
        if (e.wind > 36) {
          e.wind = 0;
          e.telegraph = false;
          e.diving = 26;
          e.charging = 26;
          const dx = game.player.x - e.x;
          const dy = game.player.y - e.y + 12;
          const len = Math.hypot(dx, dy) || 1;
          // steeper dive than avispa (more vertical stinger plunge)
          e.vx = (dx / len) * 6.2;
          e.vy = (dy / len) * 8.4;
          game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#ffcc33", count: 7, size: 2.6, up: 1.0 });
        }
      } else {
        e.telegraph = false;
        e.charging = 0;
        e.vy = 0;
        // idle hover — rounder bob than avispa
        e.y = e.baseY + Math.sin(e.bob) * 16 + Math.sin(e.bob * 2.5) * 5;
        if (game.player) e.vx += Math.sign(game.player.x - e.x) * 0.03;
        e.vx = Math.max(-2.0, Math.min(2.0, e.vx));
        e.baseY += Math.sign((game.player ? game.player.y : e.baseY) - e.baseY) * 0.18;
        e.baseY = Math.max(220, Math.min(620, e.baseY));
      }
      if (e.x < 30 || e.x > game.worldW - 30 - e.w) { e.vx *= -1; e.x = Math.max(30, Math.min(game.worldW - 30 - e.w, e.x)); }
    }
    // --- pez: school sine, dash burst, vertical hunt, dense bubbles ---
    if (e.kind === "pez") {
      e.vy = 0;
      e.bob = (e.bob || 0) + 0.06;
      if (e.baseY == null) e.baseY = e.y;
      e.dashCd = (e.dashCd || 0) - 1;
      if (e.dashSwim > 0) {
        e.dashSwim--;
        if (t % 2 === 0) game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#a0e8ff", count: 2, size: 2.2, up: 0.3, speed: 0.6, life: 14 });
        if (e.dashSwim <= 0) e.vx *= 0.45;
      } else if (e.dashCd <= 0 && game.player) {
        e.dashCd = 90 + (t % 40);
        e.dashSwim = 18;
        e.vx = Math.sign(game.player.x - e.x || 1) * 4.4;
        e.baseY += Math.sign(game.player.y - e.baseY) * 28;
      }
      // school-like sine offset
      e.y = e.baseY + Math.sin(e.bob) * 26 + Math.sin(e.bob * 2.2) * 8;
      if (game.player) {
        e.vx += Math.sign(game.player.x - e.x) * 0.035;
        e.baseY += Math.sign(game.player.y - e.baseY) * 0.25;
      }
      e.vx = Math.max(e.dashSwim > 0 ? -4.6 : -2.4, Math.min(e.dashSwim > 0 ? 4.6 : 2.4, e.vx));
      e.baseY = Math.max(280, Math.min(560, e.baseY));
      if (e.x < 30 || e.x > game.worldW - 30 - e.w) { e.vx *= -1; e.x = Math.max(30, Math.min(game.worldW - 30 - e.w, e.x)); }
      if (t % 3 === 0) game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#7ec8f0", count: 2, size: 2.0, up: 0.28, speed: 0.5, life: 16 });
    }
    // --- medusa: near player pulse then pink soft zap projectile ---
    if (e.kind === "medusa") {
      e.vy = 0;
      e.bob = (e.bob || 0) + 0.04;
      if (e.baseY == null) e.baseY = e.y;
      e.baseY += Math.sign((game.player ? game.player.y : e.baseY) - e.baseY) * 0.18;
      e.y = e.baseY + Math.sin(e.bob) * 40;
      if (game.player) e.vx += Math.sign(game.player.x - e.x) * 0.015;
      e.vx = Math.max(-1.4, Math.min(1.4, e.vx));
      if (e.x < 30 || e.x > game.worldW - 30 - e.w) { e.vx *= -1; e.x = Math.max(30, Math.min(game.worldW - 30 - e.w, e.x)); }
      if (t % 8 === 0) game.fx.emit(e.x + e.w / 2, e.y + e.h - 4, { color: "#ff9ad8", count: 1, size: 2, up: 0.4, speed: 0.5, life: 14 });
      if (e.pulsezap > 0) {
        e.pulsezap--;
        e.telegraph = e.pulsezap > 8; // pulse ring visible ~0.4s (pulsezap 32→9)
        if (e.pulsezap === 8 && game.player) {
          const aim = Math.sign(game.player.x - e.x) || 1;
          pushRuntime(game.projectiles, {
            x: e.x + e.w / 2 - 5, y: e.y + e.h / 2,
            vx: aim * 1.6, vy: (game.player.y - e.y) * 0.012,
            w: 12, h: 12, life: 90, dmg: 10, color: "#ff8ad0",
            owner: "enemy", trail: true,
  }, MAX_RUNTIME_PROJECTILES);
          game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#ff8ad0", count: 10, size: 3, up: 1.2, star: true });
        }
        if (e.pulsezap <= 0) e.zapCd = 100;
      } else {
        e.telegraph = false;
        e.zapCd = (e.zapCd || 0) - 1;
        if (e.zapCd <= 0 && game.player) {
          const dist = Math.hypot(game.player.x - e.x, game.player.y - e.y);
          if (dist < 280) e.pulsezap = 32; // ~0.4s telegraph before sting
          else e.zapCd = 20;
        }
      }
    }
    // --- anguila: sine swim + zap telegraph bolt ---
    if (e.kind === "anguila" && !(e.stun > 5)) {
      e.vy = 0;
      e.bob = (e.bob || 0) + 0.055;
      if (e.baseY == null) e.baseY = e.y;
      e.y = e.baseY + Math.sin(e.bob) * 22 + Math.sin(e.bob * 1.7) * 8;
      if (game.player) {
        e.vx += Math.sign(game.player.x - e.x) * 0.028;
        e.baseY += Math.sign(game.player.y - e.baseY) * 0.2;
      }
      e.vx = Math.max(-2.2, Math.min(2.2, e.vx));
      e.baseY = Math.max(260, Math.min(560, e.baseY));
      if (e.x < 30 || e.x > game.worldW - 30 - e.w) { e.vx *= -1; e.x = Math.max(30, Math.min(game.worldW - 30 - e.w, e.x)); }
      if (t % 4 === 0) game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#40e0d0", count: 1, size: 1.8, up: 0.2, speed: 0.4, life: 12 });
      if (e.pulsezap > 0) {
        e.pulsezap--;
        e.telegraph = e.pulsezap > 12; // ~0.4s telegraph (pulsezap 36→12)
        if (game.player && e.telegraph) {
          e.aimDx = game.player.x - e.x;
          e.aimDy = game.player.y - e.y;
        }
        if (e.pulsezap === 12 && game.player) {
          const dx = game.player.x - e.x, dy = game.player.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          pushRuntime(game.projectiles, {
            x: e.x + e.w / 2 - 5, y: e.y + e.h / 2,
            vx: (dx / len) * 2.4, vy: (dy / len) * 2.0,
            w: 11, h: 11, life: 80, dmg: 10, color: "#ff8ad0",
            owner: "enemy", trail: true,
  }, MAX_RUNTIME_PROJECTILES);
          game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#7ee7ff", count: 8, size: 2.8, up: 1.0, star: true });
        }
        if (e.pulsezap <= 0) { e.zapCd = 110; e.aimDx = e.aimDy = null; }
      } else {
        e.telegraph = false;
        e.aimDx = e.aimDy = null;
        e.zapCd = (e.zapCd || 0) - 1;
        if (e.zapCd <= 0 && game.player) {
          const dist = Math.hypot(game.player.x - e.x, game.player.y - e.y);
          if (dist < 320) e.pulsezap = 36;
          else e.zapCd = 18;
        }
      }
    }
    // --- rana: telegraph crouch ~0.4s then hop toward player ---
    if (e.kind === "rana" && !(e.stun > 5)) {
      if (e.hopWind > 0) {
        e.hopWind--;
        e.telegraph = true;
        e.vx *= 0.35;
        e.sitting = Math.max(e.sitting || 0, 2);
        if (e.hopWind <= 0 && game.player) {
          e.telegraph = false;
          e.sitting = 0;
          e.hopCd = 52 + (t % 28);
          e.vx = Math.sign(game.player.x - e.x || 1) * (3.2 + game.rng());
          e.vy = -7.2;
          e.flash = 5;
          game.fx.emit(e.x + e.w / 2, e.y + e.h, { color: "#6ad070", count: 6, size: 2.4, up: 1.1 });
        }
      } else if (e.sitting > 0) {
        e.sitting--;
        e.vx *= 0.7;
        e.telegraph = false;
      } else {
        e.hopCd = (e.hopCd || 0) - 1;
        if (e.hopCd <= 0 && game.player && (e.mode === "chase" || e.mode === "strike")) {
          e.hopWind = 24; // ~0.4s telegraph
          e.telegraph = true;
        } else if (Math.abs(e.vy) < 0.2 && e.hopCd > 0 && e.hopCd < 40) {
          e.sitting = 20;
          e.vx = 0;
        }
      }
    }
    // --- cangrejo: scuttle + pinza telegraph (~0.4s) then snap ---
    if (e.kind === "cangrejo" && !(e.stun > 5)) {
      e.clawCd = (e.clawCd || 0) - 1;
      const near = game.player && Math.abs(game.player.x - e.x) < 130 && Math.abs(game.player.y - e.y) < 90;
      if (e.clawWind > 0) {
        e.clawWind--;
        e.telegraph = true;
        e.claws = true;
        e.vx *= 0.55;
        if (e.clawWind <= 0) {
          e.telegraph = false;
          e.clawSnap = 16;
          e.clawCd = 55;
          e.flash = 5;
          game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#ff8040", count: 8, size: 2.6, up: 1.0 });
        }
      } else if (e.clawSnap > 0) {
        e.clawSnap--;
        e.claws = true;
        e.telegraph = false;
        if (near && game.player) e.vx += Math.sign(game.player.x - e.x || 1) * 0.14;
      } else {
        e.claws = !!near;
        e.telegraph = false;
        if (e.mode === "hold" || e.mode === "patrol") e.vx *= 0.86;
        else if (e.mode === "strike" && e.clawCd <= 0) e.clawWind = 24;
        else if (e.mode === "chase") e.vx += Math.sign(e._dx || 1) * 0.1;
      }
      e.vx = Math.max(-2.6, Math.min(2.6, e.vx));
    }
    // --- gaviota: glide then softer dive like mosquito ---
    if (e.kind === "gaviota") {
      e.diveCd = (e.diveCd || 0) - 1;
      if (e.baseY == null) e.baseY = e.y;
      e.bob = (e.bob || 0) + 0.05;
      if (e.diving) {
        e.diving--;
        e.telegraph = false;
        if (e.diving <= 0) { e.diveCd = 70; e.vy = -2.0; e.baseY = Math.max(240, Math.min(520, e.y)); }
      } else if (e.diveCd <= 0 && game.player) {
        e.wind = (e.wind || 0) + 1;
        e.telegraph = true;
        e.vx *= 0.88;
        e.vy *= 0.75;
        if (e.wind > 24) { // ~0.4s telegraph
          e.wind = 0; e.telegraph = false; e.diving = 26;
          e.vx = Math.sign(game.player.x - e.x || 1) * 2.6;
          e.vy = 4.2;
        }
      } else {
        e.telegraph = false;
        e.vy += 0.03;
        e.y = e.baseY + Math.sin(e.bob) * 12;
        e.vy = 0;
        if (game.player) e.vx += Math.sign(game.player.x - e.x) * 0.05;
        if (e.y < 260) e.baseY += 0.4;
        if (e.y > 560) e.baseY -= 0.4;
      }
      e.vx = Math.max(-3.4, Math.min(3.4, e.vx));
      if (e.x < 30 || e.x > game.worldW - 30 - e.w) { e.vx *= -1; e.x = Math.max(30, Math.min(game.worldW - 30 - e.w, e.x)); }
    }
    // --- murcielago: flap bob, dive at mid HP or on timer ---
    if (e.kind === "murcielago") {
      e.diveCd = (e.diveCd || 0) - 1;
      if (e.baseY == null) e.baseY = e.y;
      e.bob = (e.bob || 0) + 0.09;
      const angry = e.hp < e.max * 0.5;
      if (e.diving) {
        e.diving--;
        e.telegraph = false;
        if (t % 3 === 0) pushRuntime(game.ghosts, { x: e.x, y: e.y, w: e.w, h: e.h, life: 7, color: "#4a3060" }, MAX_RUNTIME_GHOSTS);
        if (e.diving <= 0) { e.diveCd = angry ? 40 : 65; e.vy = -2.4; e.baseY = Math.max(200, Math.min(500, e.y)); }
      } else if ((e.diveCd <= 0 || (angry && e.diveCd < 20)) && game.player) {
        e.wind = (e.wind || 0) + 1;
        e.telegraph = true;
        e.vx *= 0.86;
        if (e.wind > 12) {
          e.wind = 0; e.telegraph = false; e.diving = 24;
          e.vx = Math.sign(game.player.x - e.x || 1) * 3.0;
          e.vy = 5.0;
        }
      } else {
        e.telegraph = false;
        e.y = e.baseY + Math.sin(e.bob) * 14;
        e.vy = 0;
        if (game.player) e.vx += Math.sign(game.player.x - e.x) * 0.07;
        e.vx = Math.max(-3.2, Math.min(3.2, e.vx));
      }
      if (e.x < 30 || e.x > game.worldW - 30 - e.w) { e.vx *= -1; e.x = Math.max(30, Math.min(game.worldW - 30 - e.w, e.x)); }
    }
    // --- arana: crawl, occasional drop from above ---
    if (e.kind === "arana") {
      e.dropCd = (e.dropCd || 0) - 1;
      if (e.dropping) {
        e.telegraph = true;
        e.vx *= 0.92;
        if (e.vy > 6) e.dropping = false;
        // stick when landing (vy zeroed by platform)
      } else if (e.dropCd <= 0 && game.player && Math.abs(game.player.x - e.x) < 160) {
        e.dropCd = 140;
        e.dropping = true;
        e.y = Math.max(80, e.y - 180);
        e.vy = 0.5;
        e.telegraph = true;
        game.fx.emit(e.x + e.w / 2, e.y, { color: "#888", count: 4, size: 2, up: 0.3 });
      } else {
        e.telegraph = false;
        if (game.player) e.vx += Math.sign(game.player.x - e.x) * 0.04;
        e.vx = Math.max(-2.0, Math.min(2.0, e.vx));
      }
      if (!e.dropping && Math.abs(e.vy) < 0.15) e.dropping = false;
    }
    // --- brasita: bob float, ember particles ---
    if (e.kind === "brasita") {
      e.bob = (e.bob || 0) + 0.08;
      if (e.baseY == null) e.baseY = e.y;
      e.y = e.baseY + Math.sin(e.bob) * 18;
      e.vy = 0;
      if (game.player) {
        e.vx += Math.sign(game.player.x - e.x) * 0.04;
        e.baseY += Math.sign(game.player.y - e.baseY) * 0.22;
      }
      e.vx = Math.max(-1.8, Math.min(1.8, e.vx));
      e.baseY = Math.max(220, Math.min(620, e.baseY));
      if (e.x < 30 || e.x > game.worldW - 30 - e.w) { e.vx *= -1; e.x = Math.max(30, Math.min(game.worldW - 30 - e.w, e.x)); }
      if (t % 3 === 0) game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#ff8a30", count: 2, size: 2.4, up: 0.8, speed: 0.9, life: 16 });
    }
    // --- escoria: slow crawler, hotter/faster when low HP ---
    if (e.kind === "escoria") {
      const hot = e.hp < e.max * 0.45;
      const spd = hot ? 2.4 : 1.1;
      if (game.player) e.vx += Math.sign(game.player.x - e.x || 1) * (hot ? 0.12 : 0.04);
      e.vx = Math.max(-spd, Math.min(spd, e.vx));
      e.telegraph = hot;
      e.color = hot ? "#ff4020" : "#c04010";
      if (hot && t % 4 === 0) game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#ff6020", count: 2, size: 2.2, up: 0.6, life: 12 });
    }
    // --- ufo: hover, shoot slow projectile ~90f ---
    if (e.kind === "ufo" && !(e.stun > 5)) {
      e.bob = (e.bob || 0) + 0.04;
      if (e.baseY == null) e.baseY = e.y;
      e.y = e.baseY + Math.sin(e.bob) * 14;
      e.vy = 0;
      if (game.player) {
        e.vx += Math.sign(game.player.x - e.x) * 0.03;
        e.baseY += Math.sign(game.player.y - 40 - e.baseY) * 0.15;
      }
      e.vx = Math.max(-1.6, Math.min(1.6, e.vx));
      e.baseY = Math.max(180, Math.min(520, e.baseY));
      if (e.x < 30 || e.x > game.worldW - 30 - e.w) { e.vx *= -1; e.x = Math.max(30, Math.min(game.worldW - 30 - e.w, e.x)); }
      e.shootCd = (e.shootCd || 0) - 1;
      // Telegraph ~0.5s antes del rayo
      if (e.shootCd <= 30) e.telegraph = true;
      else e.telegraph = false;
      if (e.shootCd <= 0 && game.player) {
        e.shootCd = 90;
        e.telegraph = false;
        const dx = game.player.x - e.x, dy = game.player.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        pushRuntime(game.projectiles, {
          x: e.x + e.w / 2 - 6, y: e.y + e.h,
          vx: (dx / len) * 1.8, vy: (dy / len) * 1.5 + 0.4,
          w: 12, h: 12, life: 110, dmg: 9, color: "#7ee7ff",
          owner: "enemy", trail: true,
  }, MAX_RUNTIME_PROJECTILES);
        game.fx.emit(e.x + e.w / 2, e.y + e.h, { color: "#7ee7ff", count: 6, size: 2.5, up: 0.8 });
      }
    }
    solidifyFoe(e);
    const p = game.player;
    const solid = !(e.kind === "planta" && !e.up);
    if (p && !p.dead && !e.dying && solid && aabb(p, e)) {
      const kb = Math.sign((p.x + p.w / 2) - (e.x + e.w / 2) || p.facing || 1);
      const feet = p.y + p.h;
      const stomp = p.vy > 1.5 && feet < e.y + Math.min(28, e.h * 0.5) && p.y < e.y + 8;
      if (stomp) {
        p.vy = -9.4;
        p.grounded = false;
        p.jumps = Math.max(0, (p.jumps || 1) - 1);
        p.invuln = Math.max(p.invuln || 0, 10);
        if (!e.boss && !(e.invuln > 0) && e.hp > 0) {
          const dmg = 8 + (Number(p.evo) || 0) * 2;
          damageEnemy(e, dmg);
          registerBossPunish(e);
          e.vy = 2.4;
          e.stun = Math.max(e.stun || 0, 10);
          e.flash = 10;
          e.invuln = Math.max(e.invuln || 0, 10);
          game.nums.add(e.x, e.y - 6, "" + dmg, "#fff");
          punch(e.x, e.y, p.color || "#fff");
          hitStop(2);
        } else {
          e.flash = Math.max(e.flash || 0, 6);
          game.shake = Math.min(10, (game.shake || 0) + 3);
          beep("land");
        }
        game.fx.emit(p.x + p.w / 2, feet, { color: "#fff", count: 6, size: 2, up: 0.4, life: 12 });
      } else {
        const hp0 = p.health;
        hurtPlayer(dmgFor(e), "-" + dmgFor(e));
        const took = p.health < hp0;
        if (took && !p.dead) {
          p.vx = kb * 11;
          p.vy = -6.6;
          p.x += kb * 5;
          if (!e.boss) e.x -= kb * 7;
        } else if (!p.dead && !(p._dashGo > 0) && !(p.invuln > 0)) {
          p.x += kb * 2.4;
          if (!e.boss) e.x -= kb * 1.6;
        }
        if (e.kind === "mosquito" && took) {
          game.fx.emit(p.x + p.w / 2, p.y + p.h / 2, { color: "#ff2020", count: 6, size: 2.4, up: 1.0, life: 14 });
        }
      }
    }
  }
  game.enemies = game.enemies.filter((e) => {
    if (e.boss && e.hp <= 0) {
      if (!e.fell) {
        e.fell = true;
        e.dying = e.dyingMax || 120;
        e.hp = 0;
        e.vx = 0;
        e.vy = 0;
        e.telegraph = false;
        e.mode = "idle";
        game.flash = 18;
        game.shake = 24;
        beep("win");
        game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#ffe66a", count: game.reduceMotion ? 12 : 32, size: 6, up: 2.8, star: true });
        game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#ff4060", count: game.reduceMotion ? 8 : 20, size: 4, up: 2, speed: 3.5 });
        showBossMessage("EL NIDO CAE", "La Reina se deshace.");
        beginFinale(e);
        return true;
      }
      if (e.dying > 0) return true;
      return false;
    }
    if (e.hp > 0) return true;
    if (e.deathHold && e.dying > 0) return true;
    // Cucaracho muda: 1ª muerte → evo1, 2ª → evo2 flyer, 3ª → kill real
    if (e.kind === "cucaracho" && !e.baby && e.evo < 2) {
      e.evo += 1;
      e.hp = Math.round(e.max * 0.9);
      e.max = Math.max(e.max, e.hp);
      e.w += e.evo === 1 ? 10 : 8;
      e.h += e.evo === 1 ? 6 : 4;
      e.vx *= e.evo === 1 ? 1.35 : 1.25;
      e.color = e.evo >= 2 ? "#c81818" : "#8a2010";
      e.flash = 18;
      e.invuln = 28;
      game.flash = Math.max(game.flash, 8);
      game.shake = Math.max(game.shake, e.evo >= 2 ? 14 : 10);
      // shell-pop particles (+1 vs prior lote; cada death stage Design A)
      game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, {
        color: e.evo >= 2 ? "#ff4a20" : "#c45a18",
        count: e.evo >= 2 ? 29 : 21, size: 5, up: 2.4, star: true,
      });
      game.fx.emit(e.x + e.w / 2, e.y, {
        color: "#ffe0a0", count: 13, size: 3.5, up: 2.8, speed: 3.5, life: 20,
      });
      if (e.evo >= 2) {
        e.bob = 0;
        e.baseY = Math.max(260, Math.min(620, e.y - 40));
        e.y = e.baseY;
        e.vy = -3.2;
        e.diveCd = 40;
        e.diving = false;
        e.telegraph = false;
        showCombatMessage("¡VUELA!", "Cucaracho alado.");
      } else {
        e.lungeCd = 40;
        showCombatMessage("CUCARACHO+", "Ha mudado. Más cabreado.");
      }
      return true;
    }
    Surprises.onEnemyKilled(e, game);
    game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: e.color || "#fff6c8", count: 14, size: 4, star: true, speed: 3, up: 1.8 });
    game.nums.add(e.x, e.y - 8, "KO", "#fff6c8", true);
    if (e.kind === "cucaracho") {
      game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, {
        color: "#ff4a20", count: 1, size: 5, up: 2.4, star: true,
      });
    }
    punch(e.x, e.y, e.color); beep("kill"); addKill(); healPlayer(game.player, 4);
    if (e.dropsOrb) {
      pushRuntime(game.orbs, { x: e.x + e.w / 2, y: e.y + e.h / 2, r: 9, taken: false }, MAX_RUNTIME_ORBS);
      game.fx.emit(e.x + e.w / 2, e.y + e.h / 2, { color: "#ffe66a", count: 12, size: 4, up: 1.6, star: true });
    }
    return false;
  });
}
function updateProjectiles() {
  for (const pr of game.projectiles) {
    if (pr.homing && game.enemies[0]) { pr.vx += Math.sign(game.enemies[0].x - pr.x) * 0.35; pr.vy += Math.sign(game.enemies[0].y - pr.y) * 0.35; }
    const previous = { x: pr.x, y: pr.y };
    pr.x += pr.vx; pr.y += pr.vy; pr.life--;
    if (hitsSolid(pr, game.platforms, previous)) {
      pr.life = 0;
      game.fx.emit(pr.x, pr.y, { color: pr.color || "#fff", count: 4, size: 2, up: 0.6, life: 10 });
    }
    if (pr.trail && pr.life % 2 === 0) {
      game.fx.emit(pr.x + pr.w / 2, pr.y + pr.h / 2, {
        color: pr.color, count: 1, size: 2, speed: 0.4, life: 8, gravity: 0, up: 0,
      });
    }
    if (pr.owner === "player") {
      for (const e of game.enemies) {
        if (!pr.pickup && !e.dying && !(e.invuln > 0) && !(pr.hit && pr.hit.has(e)) && aabb({ x: pr.x, y: pr.y, w: pr.w, h: pr.h }, e)) {
          let dmg = pr.dmg * (1 + game.player.evo * 0.35); if (e.boss) dmg *= 0.55;
          dmg = Math.round(dmg);
          damageEnemy(e, dmg); registerBossPunish(e); e.vx += Math.sign(pr.vx) * (e.boss ? 0.6 : 5.5); e.vy = Math.min(e.vy || 0, -2.5);
          e.stun = Math.max(e.stun || 0, e.boss ? 4 : 12);
          e.flash = Math.max(e.flash || 0, 14);
          if (pr.pierce) {
            if (!pr.hit) pr.hit = new Set();
            pr.hit.add(e);
            if (pr.hit.size >= pr.pierce) pr.life = 0;
          } else pr.life = 0;
          punch(e.x, e.y, pr.color); addPlayerXp(game.player, 3);
          game.nums.add(e.x, e.y, "" + dmg, "#ffe66a", dmg >= 40);
        }
      }
    } else if (game.player && !game.player.dead && aabb({ x: pr.x, y: pr.y, w: pr.w, h: pr.h }, game.player)) {
      if (game.player.invuln <= 0) hurtPlayer(pr.dmg, "-" + Math.round(pr.dmg));
      pr.life = 0;
    }
  }
  game.projectiles = game.projectiles.filter((pr) => pr.life > 0);
  game.bolts = game.bolts.filter((b) => --b.life > 0).slice(-MAX_RUNTIME_BOLTS);
  game.slashes = (game.slashes || []).filter((s) => --s.life > 0);
  if (game.slashes.length > 6) game.slashes.splice(0, game.slashes.length - 6);
  game.ghosts = game.ghosts.filter((g) => --g.life > 0);
}
function updateCam() {
  const p = game.player; if (!p) return;
  const vw = camW(), vh = camH();
  let lerp = 0.24;
  const look = p._dashGo > 0 ? 48 : Math.sign(p.vx || 0) * 18;
  let tx = p.x + p.w / 2 + (p.facing || 1) * look - vw / 2;
  let ty = p.y + p.h / 2 - vh / 2;
  const boss = game.enemies.find((e) => e.boss && !e.fell);
  const fin = game.finale && game.finale.t > 0 ? game.finale : null;
  if (fin) {
    tx = fin.x - vw / 2;
    ty = fin.y - vh * 0.46;
    lerp = 0.07;
  } else if (boss) {
    const bx = boss.x + boss.w / 2;
    const by = boss.y + boss.h * 0.28;
    const px = p.x + p.w / 2;
    const py = p.y + p.h * 0.35;
    tx = (px + bx) / 2 - vw / 2;
    ty = (py * 0.45 + by * 0.55) - vh * 0.42;
    lerp = 0.18;
  }
  game.cam.x += (tx - game.cam.x) * lerp;
  game.cam.y += (ty - game.cam.y) * lerp;
  if (game.camPunch > 0) game.camPunch *= 0.82;
  game.cam.x = Math.max(0, Math.min(game.cam.x, Math.max(0, game.worldW - vw)));
  game.cam.y = Math.max(-40, Math.min(game.cam.y, Math.max(-40, game.worldH - vh + 80)));
  if (game.shake > 0) game.shake *= 0.86;
  if (game.comboT > 0) game.comboT--; else game.combo = 0;
  if (game.fading > 0) game.fading--;
  if (game.bossIntro && game.bossIntro.t > 0) {
    game.bossIntro.t--;
    if (game.bossIntro.t === 120) game.storyLine = "Quien no llegó a la forma final sigue dentro.";
    if (game.bossIntro.t === 0) game.storyLine = "";
  }
  if (game.flash > 0) {
    game.flash--;
    if (game.flash <= 0) game.flashColor = null;
  }
  game.nums.update();
}

function drawMinimap() {
  const layout = MAP_LAYOUT || [];
  const ox = viewW - 196, oy = viewH - 118;
  ctx.fillStyle = "rgba(6,10,16,.62)"; ctx.fillRect(ox - 8, oy - 8, 188, 104);
  ctx.strokeStyle = "rgba(126,231,255,.28)"; ctx.strokeRect(ox - 8.5, oy - 8.5, 189, 105);
  layout.forEach((row, cy) => {
    row.forEach((id, cx) => {
      if (!id) return;
      ctx.fillStyle = game.roomId === id ? "#7ee7ff" : game.visited[id] ? "#3a6" : "#1a222c";
      ctx.fillRect(ox + cx * 28, oy + cy * 28, 22, 22);
    });
  });
}
function drawCrystal(o) {
  const x = o.x - game.cam.x;
  const y = o.y - game.cam.y + Math.sin(t / 12) * 4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t / 18) * 0.12);
  ctx.shadowColor = "#ffe66a";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffe66a";
  ctx.beginPath();
  ctx.moveTo(0, -12); ctx.lineTo(8, 0); ctx.lineTo(0, 12); ctx.lineTo(-8, 0);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,.78)";
  ctx.beginPath();
  ctx.moveTo(0, -12); ctx.lineTo(3.2, -1); ctx.lineTo(0, 3); ctx.lineTo(-2.2, -4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function render() {
  if (!game.player) return;
  ctx.setTransform(viewDpr, 0, 0, viewDpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const world = WORLDS[game.worldIndex] || WORLDS[0];
  const shake = reduceMotion ? 0 : game.shake;
  const z = camZoom() * (game.experience?.zoomPulse(game) || 1);
  const centerX = viewW / 2;
  const centerY = viewH / 2;
  const shakeX = (vfxRandom(5) - 0.5) * shake;
  const shakeY = (vfxRandom(6) - 0.5) * shake;

  ctx.save();
  ctx.translate(centerX + shakeX, centerY + shakeY);
  ctx.scale(z, z);
  ctx.translate(-centerX, -centerY);
  if (paintedHubOn(game.roomId)) drawPaintedHub(ctx, game.cam, game.worldW, game.worldH, camW(), camH());
  else {
    const painted = drawPaintedRoom(ctx, game.roomId, camW(), camH());
    if (!painted) renderWorld(ctx, world, game.cam, t, camW(), camH());
    drawRoomAtmosphere(ctx, game.roomId, game.cam, t, camW(), camH());
    drawTerrain(ctx, game.platforms, world, game.cam, t);
  }
  const r = room();
  drawSigns(ctx, r, game.cam, t, game.player.evo);
  portals.draw(ctx, game.cam, t, { skipCatapult: paintedHubOn(game.roomId) });
  Rain.draw(ctx, game.cam);
  Rain.drawPlayerHint(ctx, game.cam, game.player);
  Surprises.draw(ctx, game.cam, t, game);
  for (const o of game.orbs) {
    if (o.taken) continue;
    drawCrystal(o);
  }
  for (const h of game.hearts) {
    if (h.taken) continue;
    ctx.fillStyle = "#f45"; ctx.beginPath(); ctx.arc(h.x - game.cam.x, h.y - game.cam.y, 8, 0, Math.PI * 2); ctx.fill();
  }
  for (const g of game.ghosts) {
    ctx.globalAlpha = g.life / 16; ctx.fillStyle = g.color; ctx.fillRect(g.x - game.cam.x, g.y - game.cam.y, g.w, g.h); ctx.globalAlpha = 1;
  }
  game.bossFx?.render(ctx, game.cam, t, { width: viewW, height: viewH }, game.boss, game.reduceMotion || reduceMotion);
  for (const e of game.enemies) drawEnemy(ctx, e, game.cam, t);
  Magic.draw(ctx, game, t);
  Passives.draw(ctx, game, t);
  for (const pr of game.projectiles) drawProjectile(ctx, pr, game.cam, t);
  for (const b of game.bolts) drawBolt(ctx, b, game.cam, t);
  for (const s of game.slashes || []) drawSlash(ctx, s, game.cam);
  onlineCoop.render(ctx, game, t);
  game.fx.render(ctx, game.cam); game.combatFx?.render(ctx, game.cam); game.nums.render(ctx, game.cam);
  if (DeathFx.isPlaying()) {
    DeathFx.draw(ctx, game.cam, t);
    ctx.globalAlpha = typeof DeathFx.playerAlpha === "function" ? DeathFx.playerAlpha() : 0.45;
    drawCharacter(ctx, game.player, game.cam, t);
    ctx.globalAlpha = 1;
  } else if (game.player.dead) {
    ctx.globalAlpha = 0.45;
    drawCharacter(ctx, game.player, game.cam, t);
    ctx.globalAlpha = 1;
  } else if (game.player.invuln % 4 !== 1) {
    const pv = typeof portals.playerVisual === "function" ? portals.playerVisual() : null;
    if (pv && (pv.scale < 0.99 || pv.alpha < 0.99)) {
      const px = game.player.x + game.player.w / 2 - game.cam.x;
      const py = game.player.y + game.player.h / 2 - game.cam.y;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(pv.scale, pv.scale);
      ctx.translate(-px, -py);
      ctx.globalAlpha = Math.max(0, pv.alpha);
      drawCharacter(ctx, game.player, game.cam, t);
      ctx.restore();
    } else {
      drawCharacter(ctx, game.player, game.cam, t);
    }
  }
  ctx.restore();
  if (game.storyLine && (game.bossIntro || game.finale) && !document.querySelector("#notification-container .game-notification")) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(4,8,16,.55)";
    ctx.fillRect(0, viewH * 0.72, viewW, 64);
    ctx.fillStyle = "#fff6c8";
    ctx.font = "700 22px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(game.storyLine, viewW / 2, viewH * 0.72 + 40);
    ctx.restore();
  }
  // Skip low-HP edge vignette during death FX — at health=0 it was ~60% opaque over the ghost
  // También skip si HP > 65%: evita createRadialGradient cada frame cuando está sano
  if (!DeathFx.isPlaying()) {
    const hpRatio = game.player.health / Math.max(1, game.player.maxHealth);
    if (hpRatio <= 0.65) {
      const low = 1 - Math.max(0, hpRatio);
      const vg = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.3, viewW / 2, viewH / 2, viewW * 0.72);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(" + Math.round(80 * low) + ",0,0," + (0.32 + low * 0.28) + ")");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, viewW, viewH);
    }
  }
  {
    const ov = typeof portals.getOverlay === "function" ? portals.getOverlay() : null;
    if (game.fading > 0) {
      const fadeMax = game._portalFadeMax || 12;
      const fa = Math.min(1, game.fading / Math.max(1, fadeMax));
      let tint = "0,0,0";
      if (ov && ov.color) tint = ov.color;
      else if (game._portalFlash === "purple") tint = "90,40,160";
      else if (game._portalFlash === "amber") tint = "255,160,60";
      // Tint fuerte + ligera vignette tipada
      ctx.fillStyle = "rgba(" + tint + "," + Math.min(0.92, fa * 0.95) + ")";
      ctx.fillRect(0, 0, viewW, viewH);
      const vgA = fa * 0.35;
      if (vgA > 0.02) {
        const g = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.2, viewW / 2, viewH / 2, viewW * 0.7);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(" + tint + "," + vgA + ")");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, viewW, viewH);
      }
    } else if (ov && ov.alpha > 0.02) {
      // Overlay durante charge (antes del fade de viaje)
      const a = Math.min(0.9, ov.alpha);
      ctx.fillStyle = "rgba(" + (ov.color || "0,0,0") + "," + a + ")";
      ctx.fillRect(0, 0, viewW, viewH);
      if (ov.vignette > 0.05) {
        const g = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.18, viewW / 2, viewH / 2, viewW * 0.72);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(" + (ov.color || "0,0,0") + "," + (ov.vignette * 0.55) + ")");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, viewW, viewH);
      }
    } else if (game._portalFlash && game.flash <= 0) {
      game._portalFlash = null;
      game._portalFadeMax = 0;
    }
  }
  if (game.doorWait) {
    const w = game.doorWait;
    const k = 1 - w.t / Math.max(1, w.max || 30);
    ctx.fillStyle = "rgba(4,8,16," + (0.12 + k * 0.62) + ")";
    ctx.fillRect(0, 0, viewW, viewH);
  }
  if (game.finale && game.finale.t > 0) {
    const f = game.finale;
    const k = 1 - f.t / f.max;
    const sx = f.x - game.cam.x;
    const sy = f.y - game.cam.y;
    ctx.save();
    ctx.fillStyle = "rgba(4, 6, 14, " + Math.min(0.82, 0.15 + k * 0.8) + ")";
    ctx.fillRect(0, 0, viewW, viewH);
    const beam = ctx.createLinearGradient(sx, 0, sx, viewH);
    beam.addColorStop(0, "rgba(255, 230, 140, 0)");
    beam.addColorStop(0.45, "rgba(255, 210, 120, " + (0.18 + Math.sin(f.t * 0.2) * 0.06) + ")");
    beam.addColorStop(1, "rgba(255, 80, 90, 0)");
    ctx.fillStyle = beam;
    ctx.fillRect(sx - 70, 0, 140, viewH);
    ctx.strokeStyle = "rgba(255, 220, 140, 0.85)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const rad = ((k * 3 + i * 0.33) % 1) * Math.max(viewW, viewH) * 0.55;
      ctx.globalAlpha = 1 - ((k * 3 + i * 0.33) % 1);
      ctx.beginPath();
      ctx.arc(sx, sy, 20 + rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    if (k > 0.18) {
      const a = Math.min(1, (k - 0.18) * 3);
      ctx.globalAlpha = a;
      ctx.fillStyle = "#ffe66a";
      ctx.font = "800 " + Math.round(40 + (1 - a) * 18) + "px Fraunces, serif";
      ctx.fillText("LA REINA CAE", viewW / 2, viewH * 0.36);
    }
    if (k > 0.4) {
      ctx.globalAlpha = Math.min(1, (k - 0.4) * 3);
      ctx.fillStyle = "#fff";
      ctx.font = "600 20px Outfit, sans-serif";
      ctx.fillText("El nido se queda en silencio", viewW / 2, viewH * 0.36 + 42);
    }
    if (k > 0.62) {
      ctx.globalAlpha = Math.min(1, (k - 0.62) * 3.2);
      ctx.fillStyle = "#9ad7ff";
      ctx.font = "600 16px Outfit, sans-serif";
      ctx.fillText("Nadie se queda atrás", viewW / 2, viewH * 0.36 + 74);
    }
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#c9d7e8";
    ctx.font = "600 12px Outfit, sans-serif";
    ctx.fillText("Esc para seguir", viewW / 2, viewH * 0.36 + 112);
    ctx.restore();
  }
  if (game.ult && game.ult.t > 0) {
    game.ult.t--;
    const u = game.ult.t / 42;
    ctx.save();
    ctx.strokeStyle = game.ult.color || "#ffe66a";
    ctx.globalAlpha = Math.min(0.85, u + 0.15);
    ctx.lineWidth = 8;
    const rad = (1 - u) * Math.max(viewW, viewH) * 0.72;
    ctx.beginPath();
    ctx.arc(viewW / 2, viewH / 2, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "800 28px Fraunces, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = game.ult.color || "#fff";
    ctx.globalAlpha = Math.min(1, u * 2);
    ctx.fillText(game.ult.name || "", viewW / 2, viewH * 0.28);
    ctx.restore();
  }
  if (game.flash > 0) {
    const fa = (reduceMotion ? Math.min(game.flash, 5) : game.flash) / 20;
    if (game.flashColor && !game._portalFlash) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, fa);
      ctx.fillStyle = game.flashColor || "#fff";
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.restore();
    } else {
      let rgb = "255,255,220";
      if (game._portalFlash === "purple") rgb = "200,150,255";
      else if (game._portalFlash === "amber") rgb = "255,200,120";
      ctx.fillStyle = "rgba(" + rgb + "," + fa + ")";
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }
  game.experience?.render(ctx, game, viewW, viewH, t);
  if (viewW >= 820) drawMinimap();
}
function castPower(index) {
  const p = game.player;
  if (!p) return;
  const need = [0, 1, 2, 4][index] ?? 4;
  if ((Number(p.evo) || 0) < need) {
    game.nums.add(p.x, p.y - 12, "FORMA " + (need + 1), "#fff6c8");
    return;
  }
  useAbility(game, index);
  void onlineCoop.signal(game, "action", {
    action: "ability",
    slot: index,
    characterId: p.id,
  });
}
function renderAbilityBar() {
  const bar = DOM.abilityBar;
  if (!bar || !game.player) return;
  const evo = Number(game.player.evo) || 0;
  const slots = (game.player.abilities || []).map((id, i) => ({ id, need: [0, 1, 2][i] || 0 }));
  slots.push({ id: "supreme", need: 4, supreme: true });
  bar.innerHTML = slots.map((slot) => {
    const d = slot.supreme
      ? supremeOf(game.player.id)
      : ABILITY_DEFS[slot.id];
    if (!d) return "";
    const locked = evo < slot.need;
    return '<button type="button" class="ability-slot' + (locked ? " locked" : "") + '" data-id="' + slot.id + '"' + (slot.supreme ? ' data-supreme="1"' : "") + ' aria-label="' + (locked ? "Forma " + (slot.need + 1) : (d.special || d.name)) + ' · ' + d.key + '" title="' + (slot.supreme ? (d.special || d.name) : d.name) + '" style="--abil:' + d.color + ';opacity:' + (locked ? "0.4" : "1") + '"><span class="key">' + d.key + '</span><span class="name">' + (locked ? "Forma " + (slot.need + 1) : (slot.supreme ? (d.special || d.name) : d.name)) + '</span><span class="cd"><i class="cd-fill"></i></span><b class="cd-sec" aria-hidden="true"></b></button>';
  }).join("");
  abilitySlots = Array.from(bar.querySelectorAll(".ability-slot")).map((slot) => ({
    slot, fill: slot.querySelector("i"), sec: slot.querySelector(".cd-sec")
  }));
  touchPowers = Array.from(document.querySelectorAll(".touch-btn.pw"));
}
// Retrato vivo del personaje en el HUD (misma pipeline que el juego)
function drawHudAvatar(p) {
  const av = DOM.hudAvatar;
  if (!av) return;
  let cv = av.querySelector("canvas");
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = 88; cv.height = 88;
    cv.style.cssText = "position:relative;z-index:1;width:100%;height:100%;display:block";
    av.appendChild(cv);
  }
  const c = cv.getContext("2d");
  c.clearRect(0, 0, cv.width, cv.height);
  const evo = Math.max(0, Math.min(4, Number(p.evo) || 0));
  const dummy = {
    id: p.id, evo, color: p.color, x: -10, y: -20, w: 20, h: 20, facing: 1,
    grounded: true, vx: 0, vy: 0, melee: 0, invuln: 0,
    visualScale: 70 / [36, 48, 58, 68, 80][evo],
  };
  c.save();
  c.translate(cv.width / 2, cv.height - 8);
  drawCharacter(c, dummy, { x: 0, y: 0 }, t);
  c.restore();
}

function updateHUD() {
  const p = game.player; if (!p) return;
  setText(DOM.hudName, p.name);
  const mk = markAt(p.id, p.evo);
  setText(DOM.hudTrait, ((p.passive && p.passive.name) || "") + " · H " + mk.name);
  const need = p.evo >= 4 ? p.xp : XP_NEED[p.evo + 1];
  let orbsLeft = 0;
  for (let i = 0; i < game.orbs.length; i++) if (!game.orbs[i].taken) orbsLeft++;
  const hp = Math.max(0, Math.ceil(p.health));
  setText(DOM.hudMeta, "HP " + hp + "/" + p.maxHealth + " · XP " + p.xp + (p.evo < 4 ? "/" + need : ""));
  const hpPct = Math.max(0, Math.min(100, (p.health / Math.max(1, p.maxHealth)) * 100));
  if (DOM.hpBar) {
    const w = hpPct + "%";
    if (DOM.hpBar.style.width !== w) DOM.hpBar.style.width = w;
  }
  setText(DOM.hpText, hp + "/" + p.maxHealth);
  const avatarKey = p.id + ":" + p.evo;
  if (avatarKey !== hudAvatarKey || (t & 31) === 0) {
    hudAvatarKey = avatarKey;
    drawHudAvatar(p);
  }
  const nxt = p.evo >= 4 ? 1 : XP_NEED[p.evo + 1];
  const prev = XP_NEED[p.evo] || 0;
  const xpPct = p.evo >= 4 ? 100 : Math.max(0, Math.min(100, ((p.xp - prev) / Math.max(1, nxt - prev)) * 100));
  if (DOM.xpBar) {
    const w = xpPct + "%";
    if (DOM.xpBar.style.width !== w) DOM.xpBar.style.width = w;
    setText(DOM.xpText, p.evo >= 4 ? "MAX" : Math.round(xpPct) + "%");
  }
  setText(DOM.hudWorld, room().name);
  const seen = Object.keys(game.visited || {}).length;
  setText(document.getElementById("hud-journey"), "Isla Hoku · " + Math.min(10, seen) + "/10");
  setText(DOM.hudEvo, "Forma " + (p.evo + 1) + "/5 · Cristales " + orbsLeft);
  if (p.evo >= 4) {
    const sp = specialOf(p.id);
    DOM.hudEvo?.setAttribute("title", "Especial U: " + sp.name + " · " + sp.text);
  }
  const evoIdx = Math.max(0, Math.min(4, Number(p.evo) || 0));
  const col = p.color || "#7ee7ff";
  const nextPip = evoIdx + ":" + col;
  if (nextPip !== pipKey) {
    pipKey = nextPip;
    const pips = DOM.formPips;
    for (let i = 0; i < pips.length; i++) {
      const pip = pips[i];
      const filled = i <= evoIdx;
      const active = i === evoIdx;
      pip.classList.toggle("on", filled);
      pip.classList.toggle("active", active);
      if (active) {
        pip.style.background = col;
        pip.style.borderColor = col;
        pip.style.boxShadow = "0 0 12px " + col;
      } else {
        pip.style.background = "";
        pip.style.borderColor = "";
        pip.style.boxShadow = "";
      }
    }
  }
  setText(DOM.combo, "Combo " + game.combo + " · Score " + game.score);
  const chip = DOM.comboChip;
  if (chip) {
    const show = game.combo >= 1 && game.comboT > 0;
    const text = show ? String(game.combo) : "";
    if (DOM.comboValue && DOM.comboValue.textContent !== text) {
      DOM.comboValue.textContent = text;
      if (show) {
        DOM.comboValue.style.animation = "none";
        void DOM.comboValue.offsetWidth;
        DOM.comboValue.style.animation = "";
      }
    }
    chip.classList.toggle("show", show);
    chip.classList.toggle("hidden", !show);
    const rank = show ? comboRank(game.combo) : "";
    if (chip.dataset.rank !== rank) chip.dataset.rank = rank;
  }
  const boss = game.boss || game.enemies.find((e) => e.boss);
  if (DOM.bossWrap) DOM.bossWrap.classList.toggle("hidden", !boss);
  document.body.classList.toggle("boss-fight", !!boss);
  if (boss && DOM.bossBar) DOM.bossBar.style.width = Math.max(0, (boss.hp / Math.max(1, boss.max)) * 100) + "%";
  if (boss) {
    const phase = bossPhaseProfile(boss.phase);
    const status = formatBossStatus(boss, phase.name);
    const attack = boss.telegraph && boss.teleKind ? bossAttackProfile(boss.teleKind) : null;
    const attackText = attack ? " · " + attack.icon : "";
    setText(DOM.bossLabel, status.visible + attackText);
    DOM.bossWrap?.setAttribute("aria-label", status.accessible + (attack ? " Ataque: " + boss.teleKind + "." : ""));
  } else {
    setText(DOM.bossLabel, "REINA DEL NIDO");
  }
  syncHudStatus({ player: p, hp, xpPct, boss });
  const now = Number.isFinite(Number(game.t)) ? Number(game.t) * (1000 / 60) : 0;
  for (let i = 0; i < abilitySlots.length; i++) {
    const item = abilitySlots[i];
    const id = item.slot.dataset.id;
    const def = ABILITY_DEFS[id];
    if (!def || !item.fill) continue;
    const left = Math.max(0, (p.cds[id] || 0) - now);
    const dur = (p.cdDur && p.cdDur[id]) || def.cd;
    const pct = dur > 0 ? Math.max(0, Math.min(100, 100 - (left / dur) * 100)) : 100;
    const w = pct + "%";
    if (item.fill.style.width !== w) item.fill.style.width = w;
    const sec = left > 80 ? (left / 1000).toFixed(1) : "";
    if (item.sec && item.sec.textContent !== sec) item.sec.textContent = sec;
    item.slot.classList.toggle("cooling", left > 80);
  }
  const PWIDX = { j: 0, k: 1, l: 2 };
  for (let i = 0; i < touchPowers.length; i++) {
    const btn = touchPowers[i];
    const id = (p.abilities || [])[PWIDX[btn.dataset.k]];
    const def = id && ABILITY_DEFS[id];
    if (!def) { btn.classList.add("off"); btn.style.setProperty("--cd", "100%"); continue; }
    btn.classList.remove("off");
    if (btn.getAttribute("title") !== def.name) btn.setAttribute("title", def.name);
    const label = (def.special || def.name) + " · " + btn.dataset.k.toUpperCase();
    if (btn.getAttribute("aria-label") !== label) btn.setAttribute("aria-label", label);
    const left = Math.max(0, (p.cds[id] || 0) - now);
    const dur = (p.cdDur && p.cdDur[id]) || def.cd;
    const pct = dur > 0 ? Math.max(0, Math.min(100, 100 - (left / dur) * 100)) : 100;
    btn.classList.toggle("cooling", left > 80);
    btn.style.setProperty("--cd", pct + "%");
  }
}
function step() {
  if (!canAct()) return;
  t++;
  game.t = t;
  sanitizeRuntimeState();
  game.experience?.update(game);
  if (game.hitstop > 0) {
    game.hitstop--;
    if (game.shake > 0) game.shake *= 0.92;
    if (game.flash > 0) game.flash--;
    return;
  }
  if (!game.won) game.clearTicks = (game.clearTicks || 0) + 1;
  tickFinale();
  tickWorldSummon();
  if (!canAct()) return;
  updatePlayer();
  updateEnemies();
  updateProjectiles();
  game.fx.update();
  game.combatFx?.update();
  if (DeathFx.isPlaying()) DeathFx.update(game);
  Rain.update(game, { onTickDamage: (n) => hurtPlayer(n, "lluvia") });
  Surprises.update(game, t);
  updateCam();
  onlineCoop.tick(game);
  if ((t & 3) === 0) updateHUD();
  if (t % 300 === 0) save();
}
function containRuntimeFault(scope, error) {
  game.runtimeFaults = Math.min(32, Math.max(0, Number(game.runtimeFaults) || 0) + 1);
  game.lastRuntimeFault = String(scope) + ": " + (error?.stack || error?.message || String(error));
  try { console.error("[OHANA runtime fault]", scope, error); } catch (_) {}
  try { input?.reset(); } catch (_) {}
  try { clock.reset(); } catch (_) {}
  game.hitstop = 0;
  game.renderDirty = true;
  if (game.running) {
    paused = true;
    try { DOM.pause?.classList.add("open"); } catch (_) {}
  }
}

let renderedTick = -1;
function loop(now) {
  if (game.running && !document.hidden) {
    try {
      clock.advance(now, step);
    } catch (error) {
      containRuntimeFault("simulation", error);
    }
    if ((game.renderDirty || renderedTick !== t) && !paused) {
      try {
        render();
        renderedTick = t;
        game.renderDirty = false;
      } catch (error) {
        containRuntimeFault("render", error);
      }
    }
  } else clock.reset();
  requestAnimationFrame(loop);
}
function setupSelect() {
  const wrap = document.getElementById("chars");
  if (!wrap) return;
  const grid = document.getElementById("chars-grid") || wrap;
  const RANKS = ["", "Fácil", "Media", "Difícil"];
  grid.innerHTML = ROSTER.map((c, i) => {
    const rank = difficulty(c.id);
    const hit = markAt(c.id, 0).name;
    return '<button class="char-card" type="button" data-id="' + c.id + '" aria-label="' + c.name + ", " + RANKS[rank] + '"><span class="role r' + rank + '">' + RANKS[rank] + '</span><div class="swatch" style="background:' + c.color + '"></div><h3>' + c.name + '</h3><span class="h-move">H · ' + hit + '</span><small>' + c.evoNames.join(" → ") + '</small><div class="hint">tecla ' + (i + 1) + '</div></button>';
  }).join("");
  grid.querySelectorAll(".char-card").forEach((el) => el.addEventListener("click", () => dispatchEvent(new CustomEvent("ohana-select", { detail: { id: el.dataset.id } }))));
  addEventListener("ohana-start", (e) => start(ROSTER.find((r) => r.id === e.detail?.id)));
  addEventListener("keydown", (e) => {
    if (game.running || overlayOpen() || e.repeat) return;
    if (/^[0-9]$/.test(e.key)) {
      const c = ROSTER[e.key === "0" ? 9 : Number(e.key) - 1];
      if (c) dispatchEvent(new CustomEvent("ohana-select", { detail: { id: c.id } }));
    }
  });
  const helpBtn = document.getElementById("btn-help");
  const fullBtn = document.getElementById("btn-full");
  const mapBtn = document.getElementById("btn-map");
  const muteBtn = document.getElementById("btn-mute");
  const help = document.getElementById("help");
  if (helpBtn) helpBtn.onclick = toggleHelp;
  if (mapBtn) mapBtn.onclick = () => { if (game.running) showMap(); };
  if (muteBtn) muteBtn.onclick = () => { setMuted(!muted); showSystemMessage("AUDIO", muted ? "Mute" : "On"); };
  if (fullBtn) fullBtn.onclick = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen(); };
  if (help) help.addEventListener("click", (e) => { if (e.target.id === "help") help.classList.remove("open"); });
  const map = document.getElementById("map-overlay");
  if (map) map.addEventListener("click", (e) => { if (e.target.id === "map-overlay") map.classList.remove("open"); });
  const pause = document.getElementById("pause-overlay");
  if (pause) pause.addEventListener("click", (e) => { if (e.target.id === "pause-overlay") setPaused(false); });
  const resume = document.getElementById("btn-resume");
  const quit = document.getElementById("btn-quit");
  if (resume) resume.onclick = () => setPaused(false);
  if (quit) quit.onclick = returnToMenu;
  $("btn-close-help")?.addEventListener("click", () => DOM.help.classList.remove("open"));
  $("btn-close-map")?.addEventListener("click", () => DOM.map.classList.remove("open"));
  addEventListener("ohana-after", (e) => {
    const act = e.detail && e.detail.action;
    if (act === "continue") {
      game.running = true;
      return;
    }
    if (act === "repeat") {
      game.won = false;
      if (game.player) {
        game.player.dead = false;
        game.player.health = game.player.maxHealth;
      }
      loadRoom("boss", "right");
      return;
    }
    if (act === "roster") returnToMenu();
  });
    // PHASE 39 - ESCAPE HARDENING DIRECT
  // Escape debe abrir la pausa de forma determinista antes del adaptador
  // generico de teclado. Se bloquea la propagacion para impedir doble toggle.
  addEventListener("keydown", (event) => {
    if (
      event.key !== "Escape" ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.target?.closest?.("input, textarea, select, [contenteditable='true']")
    ) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    escape();
  }, true);
// QA-only shortcut: Ctrl+Z forces the next evolution without grinding XP.
  addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    if (event.repeat || key !== "z" || !event.ctrlKey || event.altKey || event.metaKey) return;
    if (!game.running || paused || overlayOpen() || document.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cheatEvolve();
  }, true);

  input = bindInput({
    target: window, canvas, buttons: document.querySelectorAll(".touch-btn"), canAct,
    isRunning: () => game.running,
    actions: {
      attack, dash, interact, respawn, escape,
      power: (index) => castPower(index),
      help: toggleHelp,
      map: () => { if (game.running) showMap(); },
      mute: () => { setMuted(!muted); showSystemMessage("AUDIO", muted ? "Mute" : "On"); }
    }
  });
  keys = input.keys;
  // Tappable ability slots (desktop + touch): cast by clicking the HUD pill.
  const abilityBar = document.getElementById("ability-bar");
  abilityBar?.addEventListener("click", (ev) => {
    const slot = ev.target.closest(".ability-slot");
    if (!slot || !game.running || paused || overlayOpen()) return;
    ev.preventDefault();
    const idx = slot.dataset.supreme ? 3 : (game.player && game.player.abilities || []).indexOf(slot.dataset.id);
    if (idx >= 0) castPower(idx);
  });
}
addEventListener("ohana-evolve-done", (e) => {
  const detail = e?.detail || {};
  const p = game.player;
  if (!p || detail.id !== p.id) return;
  const evo = Math.max(0, Math.min(4, Number(detail.evo) || p.evo));
  const story = evolutionMessage(p.id, evo);
  const opened = evo === 1 ? "K abierto" : evo === 2 ? "L abierto" : evo === 4 ? "U, supremo" : "";
  showEvolutionMessage(
    "NUEVA FORMA · " + (evo + 1) + "/5",
    p.name + " · " + story.line + (opened ? " · " + opened : ""),
    {
      key: "evolution:" + p.id + ":" + evo,
      duration: 3600
    }
  );
  if (opened) game.nums.add(p.x, p.y - 28, opened, "#fff6c8", true);
  updateHUD();
});

setupSelect();

const onlineBoot = new URLSearchParams(location.search);
if (onlineBoot.get("online") === "1") {
  const session = onlineCoop.readSession?.();
  const id = session?.characterId || session?.selectedCharacterId;
  const def = id && ROSTER.find((character) => character.id === id);
  if (session?.originalEngine && def) {
    start(def);
  }
}

const e2eParams = new URLSearchParams(location.search);
const e2eEnabled = location.hostname === "127.0.0.1" && e2eParams.has("e2e");

if (e2eEnabled) {
  const dismissE2EOverlays = () => {
    DOM.help?.classList.remove("open");
    DOM.map?.classList.remove("open");
    DOM.pause?.classList.remove("open");
    DOM.finale?.classList.remove("show");
    DOM.evoStage?.classList.remove("show");
    paused = false;
    input?.reset();
    clock.reset();
  // PHASE 39 - SESSION RESET CLOSURE
  // Una nueva sesion nunca hereda estado transitorio anterior.
  t = 0;
  paused = false;
  game.hitstop = 0;
  game.camPunch = 0;
  game.fading = 0;
  game.flash = 0;
  game.flashColor = null;
  game.doorWait = null;
  game.doorHold = 0;
  game.finale = null;
  game.summonDelay = 0;
  game.roomId = "hub";
  game.won = false;
  game.summoned = false;
  game.runtimeFaults = 0;
  game.lastRuntimeFault = "";
  game.cam.x = 0;
  game.cam.y = 0;
  };

  window.__OHANA_E2E = {
    setSeed(seed = 1) {
      let state = (Number(seed) >>> 0) || 1;
      game.rng = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
      };
      return state;
    },
    injectFault(kind = "nan") {
      if (kind === "nan") {
        game.score = NaN;
        game.kills = Infinity;
        if (game.player) game.player.x = NaN;
        pushRuntime(game.projectiles, { x: NaN, y: Infinity, w: NaN, h: NaN, vx: NaN, vy: NaN, life: NaN, dmg: NaN }, MAX_RUNTIME_PROJECTILES);
      } else if (kind === "collection") {
        game.projectiles[0] = null;
        game.projectiles[1] = { x: NaN };
        game.ghosts[0] = null;
        game.ghosts[1] = { x: Infinity, y: NaN };
        game.bolts[0] = null;
        game.bolts[1] = { x: NaN };
      }
      this.step(1);
      return this.state();
    },
    state() {
      const p = game.player;
      const boss = game.boss || game.enemies.find((e) => e.boss);
      return {
        running: !!game.running,
        roomId: game.roomId,
        evo: p ? p.evo : -1,
        xp: p ? p.xp : 0,
        hp: p ? p.health : 0,
        maxHealth: p ? p.maxHealth : 0,
        score: game.score,
        kills: game.kills,
        combo: game.combo,
        projectiles: game.projectiles.length,
        ghosts: game.ghosts.length,
        bolts: game.bolts.length,
        slashes: game.slashes.length,
        rain: !!Rain.active,
        umbrella: !!Rain.hasUmbrella,
        starBonus: Surprises.starOrbBonus(),
        lastAbilityId: game.lastAbilityId,
        lastAbilitySlot: game.lastAbilitySlot,
        boss: boss ? {
          x: boss.x,
          y: boss.y,
          hp: boss.hp,
          max: boss.max,
          phase: boss.phase,
          vulnerable: !!boss.vulnerable,
          dying: !!boss.dying,
        } : null,
      };
    },
    step(frames = 1) {
      const n = Math.max(0, Math.min(600, Math.floor(Number(frames) || 0)));
      for (let i = 0; i < n; i++) step();
      updateHUD();
      return this.state();
    },
    start(id = "kilo") {
      const def = ROSTER.find((r) => r.id === id);
      start(def);
      dismissE2EOverlays();
      return this.state();
    },
    loadRoom(id) {
      loadRoom(String(id), "e2e");
      return this.state();
    },
    cast(index) {
      useAbility(game, Math.max(0, Math.min(2, Math.floor(Number(index) || 0))));
      return this.state();
    },
    attack() {
      attack();
      return this.state();
    },
    dash() {
      dash();
      return this.state();
    },
    setXp(value) {
      if (!game.player) return this.state();
      game.player.xp = Math.max(0, Number(value) || 0);
      const state = this.step(1);
      dismissE2EOverlays();
      return state;
    },
    setEvo(value) {
      if (!game.player) return this.state();
      game.player.evo = Math.max(0, Math.min(4, Math.floor(Number(value) || 0)));
      applyForm(game.player, { silent: true });
      paintFit(game.player);
      return this.step(1);
    },
    setPlayer(x, y) {
      if (!game.player) return this.state();
      game.player.x = Number.isFinite(Number(x)) ? Number(x) : game.player.x;
      game.player.y = Number.isFinite(Number(y)) ? Number(y) : game.player.y;
      game.player.vx = 0;
      game.player.vy = 0;
      return this.step(1);
    },
    setInvulnerable(frames = 600) {
      if (game.player) game.player.invuln = Math.max(0, Math.min(600, Math.floor(Number(frames) || 0)));
      return this.state();
    },
    forceRain() {
      Rain.start(game);
      return this.state();
    },
    setBossHp(value) {
      const boss = game.boss || game.enemies.find((e) => e.boss);
      if (boss) boss.hp = Math.max(1, Math.min(boss.max, Number(value) || boss.max));
      return this.state();
    },
  };
}

bindDialogs({
  document,
  onChange: () => { input.reset(); clock.reset(); },
  onEscape: () => escape()
});
requestAnimationFrame(loop);
