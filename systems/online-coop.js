import { ROSTER, applyForm } from "../characters/roster.js";
import { drawCharacter } from "../characters/draw.js";

const ENDPOINT = "/.netlify/functions/game";
const REMOTE_LERP = 0.22;
const SEND_INTERVAL_MS = 125;
const POLL_INTERVAL_MS = 180;
const START_ROOM = "beach";
const STAGE_ROOMS = ["beach", "jungle", "volcano", "boss", "boss"];
const ENGINE_INITIAL = {
  0: { x: 420, y: 1070 },
  1: { x: 1500, y: 1070 },
};

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeActionId(playerId, sequence) {
  return `online:${playerId}:${sequence}`;
}

async function post(body) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data?.error) {
    const error = new Error(data?.error?.message || "No se pudo sincronizar la partida online.");
    error.code = data?.error?.code;
    error.status = response.status;
    throw error;
  }
  return data.data;
}

class OnlineCoop {
  constructor() {
    this.enabled = false;
    this.roomId = "";
    this.identity = null;
    this.selectedCharacterId = "";
    this.snapshot = null;
    this.remote = null;
    this.remoteWorld = "";
    this.sequence = 0;
    this.lastSend = 0;
    this.lastPoll = 0;
    this.polling = false;
    this.mutationBusy = false;
    this.pendingPosition = null;
    this.pendingSignals = [];
    this.lastRoomId = "";
    this.lastLocalWorld = "";
    this.error = "";
    this.seenSignals = new Set();
  }

  readSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem("ohana-coop-session") || "null");
      if (!saved?.roomId || !saved?.identity?.playerId || !saved?.identity?.token) return null;
      return {
        roomId: saved.roomId,
        identity: saved.identity,
        characterId: saved.characterId || saved.selectedCharacterId || "",
      };
    } catch (_) {
      return null;
    }
  }

  clearSession() {
    try { sessionStorage.removeItem("ohana-coop-session"); } catch (_) {}
  }

  async start(game, definition) {
    const session = this.readSession();
    if (!session || !definition) return false;

    this.enabled = true;
    this.roomId = session.roomId;
    this.identity = session.identity;
    this.selectedCharacterId = session.characterId || definition.id;
    this.snapshot = null;
    this.remote = null;
    this.remoteWorld = game.roomId;
    this.sequence = 0;
    this.lastSend = 0;
    this.lastPoll = 0;
    this.error = "";
    this.mutationBusy = false;
    this.pendingPosition = null;
    this.pendingSignals = [];
    this.lastLocalWorld = "";

    document.body.dataset.gameMode = "online";
    document.body.dataset.onlineRoom = this.roomId;

    await this.poll(game, true);

    // Online mode reuses the original OHANA room/physics/rendering.
    // The lobby's synthetic 1280×720 coordinates are never applied to it.
    const stageIndex = Math.max(0, Math.min(STAGE_ROOMS.length - 1, Number(this.snapshot?.combat?.campaign?.stageIndex) || 0));
    const initialRoom = this.snapshot?.players?.find((player) => player.isYou)?.worldRoomId
      || STAGE_ROOMS[stageIndex]
      || START_ROOM;

    try {
      game.loadRoom(initialRoom, "online");
    } catch (_) {
      game.loadRoom(START_ROOM, "online");
    }

    const local = game.player;
    const me = this.currentPlayer(this.snapshot);
    if (local && me) {
      const serverEvolution = Math.max(0, Math.min(4, Number(me.evolution) || 0));
      const serverXp = Math.max(0, Number(me.experience) || 0);
      local.evo = serverEvolution;
      local.xp = serverXp;
      applyForm(local, { silent: true });
      local.maxHealth = Math.max(1, Number(me.maxHealth) || local.maxHealth || 1);
      local.health = Math.max(0, Math.min(local.maxHealth, Number(me.health) || local.maxHealth));
      paintFit(local);
      const spawn = ENGINE_INITIAL[me.slot] || ENGINE_INITIAL[0];
      if (Number.isFinite(Number(me.x)) && Number.isFinite(Number(me.y)) &&
          Number(me.y) >= 900 && Number(me.y) <= 1200) {
        local.x = Number(me.x);
        local.y = Number(me.y);
      } else {
        local.x = spawn.x;
        local.y = spawn.y;
      }
      local.vx = 0;
      local.vy = 0;
      local.grounded = true;
    }

    await this.sendPosition(game, true);
    this.ensurePeerHud();
    return true;
  }

  ensurePeerHud() {
    if (!this.enabled || document.getElementById("online-peer-badge")) return;
    const badge = document.createElement("div");
    badge.id = "online-peer-badge";
    badge.textContent = "ONLINE · 2 JUGADORES";
    Object.assign(badge.style, {
      position: "fixed",
      top: "12px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "60",
      padding: "7px 13px",
      borderRadius: "999px",
      border: "1px solid rgba(126,231,255,.34)",
      background: "rgba(7,18,38,.72)",
      color: "#dff9ff",
      font: "700 11px Outfit, sans-serif",
      letterSpacing: ".08em",
      pointerEvents: "none",
      backdropFilter: "blur(8px)",
      boxShadow: "0 8px 28px rgba(0,0,0,.22)",
    });
    document.body.appendChild(badge);
  }

  currentPlayer(snapshot) {
    return snapshot?.players?.find((player) => player.isYou) || null;
  }

  updateRemote(snapshot, game) {
    const you = this.currentPlayer(snapshot);
    const remote = snapshot?.players?.find((player) => !player.isYou && player.connected && player.characterId);
    if (!remote) {
      this.remote = null;
      return;
    }

    const worldRoom = remote.worldRoomId || "hub";
    const previous = this.remote;
    const legacyCoord = !snapshot.engineMode && Number(remote.y) > 0 && Number(remote.y) <= 720;
    const spawn = ENGINE_INITIAL[remote.slot] || ENGINE_INITIAL[1];
    const targetX = legacyCoord ? (previous?.targetX ?? spawn.x) : finite(remote.x, previous?.targetX ?? spawn.x);
    const targetY = legacyCoord ? (previous?.targetY ?? spawn.y) : finite(remote.y, previous?.targetY ?? spawn.y);

    if (!previous || previous.playerId !== remote.playerId) {
      this.remote = {
        playerId: remote.playerId,
        characterId: remote.characterId,
        evolution: remote.evolution ?? 1,
        x: targetX,
        y: targetY,
        targetX,
        targetY,
        facing: remote.facing || 1,
        grounded: true,
        melee: 0,
        dash: 0,
        invuln: 0,
        slot: remote.slot,
        phase: Math.random() * 100,
        health: remote.health,
        maxHealth: remote.maxHealth,
        pose: structuredClone(remote.pose || { vx: 0, vy: 0, grounded: true, melee: 0, dash: 0 }),
        actionKind: null,
        abilitySlot: null,
        actionUntil: 0,
      };
    } else {
      this.remote.targetX = targetX;
      this.remote.targetY = targetY;
      this.remote.characterId = remote.characterId;
      this.remote.evolution = remote.evolution ?? this.remote.evolution ?? 1;
      this.remote.facing = remote.facing || this.remote.facing || 1;
      this.remote.slot = remote.slot;
      this.remote.health = remote.health;
      this.remote.maxHealth = remote.maxHealth;
      this.remote.pose = structuredClone(remote.pose || this.remote.pose || { vx: 0, vy: 0, grounded: true, melee: 0, dash: 0 });
    }

    this.remoteWorld = worldRoom;
    if (you && !you.isYou) return;
  }

  async poll(game, immediate = false) {
    if (!this.enabled || this.polling || !this.roomId || !this.identity) return;
    const now = performance.now();
    if (!immediate && now - this.lastPoll < POLL_INTERVAL_MS) return;

    this.polling = true;
    this.lastPoll = now;
    try {
      const snapshot = await post({
        action: "poll",
        roomId: this.roomId,
        identity: this.identity,
      });
      this.snapshot = snapshot;
      this.updateRemote(snapshot, game);
      this.sequence = Math.max(
        this.sequence,
        this.currentPlayer(snapshot)?.lastSequence || 0
      );
      this.error = "";

      if (snapshot.phase === "lobby") {
        this.enabled = false;
        this.clearSession();
        location.href = "./multiplayer.html";
        return;
      }

      const remoteWorld = this.remote?.playerId ? this.remoteWorld : "";
      if (remoteWorld && remoteWorld !== game.roomId && this.lastRoomId !== remoteWorld) {
        this.lastRoomId = remoteWorld;
        try {
          if (typeof game.loadRoom === "function") game.loadRoom(remoteWorld, "online-peer");
        } catch (_) {}
      }
    } catch (error) {
      this.error = error?.message || String(error);
    } finally {
      this.polling = false;
    }
  }

  async sendPosition(game, force = false) {
    if (!this.enabled || !game.player || game.player.dead || !this.roomId || !this.identity) return;
    const now = performance.now();
    if (!force && now - this.lastSend < SEND_INTERVAL_MS) return;
    this.lastSend = now;

    const sequence = ++this.sequence;
    this.pendingPosition = {
      action: "move",
      roomId: this.roomId,
      identity: this.identity,
      mode: "engine",
      sequence,
      actionId: makeActionId(this.identity.playerId, sequence),
      positionX: finite(game.player.x, 420),
      positionY: finite(game.player.y, 1070),
      facing: game.player.facing || 1,
      evolution: Math.max(0, Math.min(4, Number(game.player.evo) || 0)),
      experience: finite(game.player.xp, 0),
      health: finite(game.player.health, 0),
      maxHealth: finite(game.player.maxHealth, 1),
      velocityX: finite(game.player.vx, 0),
      velocityY: finite(game.player.vy, 0),
      grounded: game.player.grounded !== false,
      melee: finite(game.player.melee, 0),
      dash: finite(game.player.dash, 0),
      worldRoomId: game.roomId || START_ROOM,
    };

    void this.drainMutations(game);
  }

  async drainMutations(game) {
    if (this.mutationBusy) return;
    this.mutationBusy = true;
    try {
      while (this.enabled && this.roomId && this.identity && (this.pendingSignals.length || this.pendingPosition)) {
        const body = this.pendingSignals.length
          ? this.pendingSignals.shift()
          : this.pendingPosition;
        if (!this.pendingSignals.length) this.pendingPosition = null;

        try {
          const data = await post(body);
          if (data) {
            this.snapshot = data;
            this.updateRemote(data, game);
          }
        } catch (error) {
          this.error = error?.message || String(error);
          if (error?.code === "STALE_SESSION" || error?.code === "INVALID_SESSION") {
            this.enabled = false;
            this.clearSession();
            location.href = "./multiplayer.html";
            break;
          }
          // Keep the most recent movement, but never build an unbounded queue.
          if (body.action === "move") this.pendingPosition = body;
          else this.pendingSignals.unshift(body);
          break;
        }
      }
    } finally {
      this.mutationBusy = false;
      if (this.pendingSignals.length || this.pendingPosition) queueMicrotask(() => this.drainMutations(game));
    }
  }

  async signal(game, signalKind, payload = {}) {
    if (!this.enabled || !this.roomId || !this.identity) return;
    const sequence = ++this.sequence;
    this.pendingPosition = null;
    this.pendingSignals.push({
      action: "signal",
      roomId: this.roomId,
      identity: this.identity,
      sequence,
      actionId: makeActionId(this.identity.playerId, sequence),
      signalKind,
      payload: {
        ...payload,
        roomId: game.roomId || START_ROOM,
      },
    });
    if (this.pendingSignals.length > 12) this.pendingSignals.splice(0, this.pendingSignals.length - 12);
    void this.drainMutations(game);
  }

  consumeSignals(game) {
    const events = this.snapshot?.combat?.events || [];
    for (const event of events) {
      if (event.kind !== "online-signal" || event.senderPlayerId === this.identity?.playerId) continue;
      if (event.payload?.roomId !== game.roomId) continue;
      if (this.seenSignals.has(event.id)) continue;
      this.seenSignals.add(event.id);
      if (this.seenSignals.size > 128) this.seenSignals.delete(this.seenSignals.values().next().value);

      if (event.signalKind === "room") {
        const nextRoom = String(event.payload?.roomId || "");
        if (nextRoom && nextRoom !== game.roomId) {
          try { game.loadRoom(nextRoom, "online-peer"); } catch (_) {}
        }
        this.remoteWorld = nextRoom || this.remoteWorld;
        continue;
      }

      if (event.signalKind === "action") {
        const action = event.payload?.action;
        if (!this.remote) continue;
        this.remote.actionKind = action;
        this.remote.abilitySlot = Number.isFinite(Number(event.payload?.slot)) ? Number(event.payload.slot) : null;
        this.remote.actionUntil = performance.now() + (action === "ability" ? 420 : action === "dash" ? 280 : 300);
        if (action === "attack" || action === "ability") {
          this.remote.melee = action === "ability" ? 16 : 10;
        } else if (action === "dash") {
          this.remote.dash = 18;
        }
      }

      if (event.signalKind === "hit") {
        this.applyRemoteHit(game, event.payload);
      }

      if (event.signalKind === "hurt" && game.player && event.payload?.targetPlayerId === this.identity.playerId) {
        const amount = Math.max(0, finite(event.payload.amount, 0));
        if (amount > 0) this.applyRemoteHurt(game, amount);
      }
    }
  }

  applyRemoteHit(game, payload) {
    if (!payload || !Array.isArray(game.enemies)) return;
    const targetId = String(payload.targetId || "");
    const kind = String(payload.kind || "");
    const x = finite(payload.x, 0);
    const y = finite(payload.y, 0);
    const damage = Math.max(0, finite(payload.damage, 0));
    if (!damage) return;

    let target = targetId
      ? game.enemies.find((enemy) => enemy && enemy.id === targetId && !enemy.dying)
      : null;

    if (!target) target = game.enemies
      .filter((enemy) => enemy && enemy.hp > 0 && !enemy.dying)
      .filter((enemy) => !kind || enemy.kind === kind)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];

    if (!target) {
      target = game.enemies
        .filter((enemy) => enemy && enemy.hp > 0 && !enemy.dying)
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    }

    if (!target || Math.hypot(target.x - x, target.y - y) > 180) return;

    target.hp = Math.max(0, target.hp - damage);
    target.dying = Number(payload.dying) || target.dying || 0;
    target.invuln = Math.max(target.invuln || 0, 8);
    target.stun = Math.max(target.stun || 0, 8);
    target._hitT = 10;
    target._hitMax = 10;
    if (game.player && !game.player.dead) {
      game.player.xp = Math.max(0, Number(game.player.xp) || 0) + 1;
    }
    game.nums?.add(target.x, target.y, String(Math.round(damage)), "#9be7ff");
    game.fx?.emit(target.x + target.w / 2, target.y + target.h / 2, {
      color: "#9be7ff",
      count: 8,
      size: 3,
      star: true,
      speed: 2.2,
      life: 12,
    });
  }

  applyRemoteHurt(game, amount) {
    const player = game.player;
    if (!player || player.dead || player.invuln > 0) return;
    player.health = Math.max(0, player.health - amount);
    player.invuln = 24;
    player.flash = Math.max(player.flash || 0, 8);
  }

  tick(game) {
    if (!this.enabled) return;
    void this.poll(game);
    if (game.roomId !== this.lastLocalWorld) {
      const firstWorld = !this.lastLocalWorld;
      this.lastLocalWorld = game.roomId;
      if (!firstWorld) {
        void this.signal(game, "room", {
          roomId: game.roomId,
          positionX: game.player?.x,
          positionY: game.player?.y,
          facing: game.player?.facing || 1,
        });
      }
    }
    void this.sendPosition(game);

    if (this.remote) {
      this.remote.x += (this.remote.targetX - this.remote.x) * REMOTE_LERP;
      this.remote.y += (this.remote.targetY - this.remote.y) * REMOTE_LERP;
      this.remote.melee = Math.max(0, this.remote.melee - 1);
      this.remote.dash = Math.max(0, this.remote.dash - 1);
      this.remote.invuln = Math.max(0, this.remote.invuln - 1);
      const dy = this.remote.targetY - this.remote.y;
        this.remote.grounded = Math.abs(dy) < 3;
      this.remote.phase += 0.7;
    }

    this.consumeSignals(game);
  }

  render(ctx, game, t) {
    if (!this.enabled || !this.remote || this.remoteWorld !== game.roomId) return;
    const definition = ROSTER.find((item) => item.id === this.remote.characterId);
    if (!definition) return;
    const evo = Math.max(0, Math.min(4, Number(this.remote.evolution) || 0));
    const form = definition.forms?.[evo] || definition;
    const player = {
      ...definition,
      ...form,
      id: definition.id,
      x: this.remote.x,
      y: this.remote.y,
      w: form.w,
      h: form.h,
      vx: finite(this.remote.pose?.vx, 0),
      vy: finite(this.remote.pose?.vy, 0),
      facing: this.remote.facing || 1,
      grounded: this.remote.grounded,
      evo,
      melee: this.remote.melee,
      dash: this.remote.dash,
      invuln: this.remote.invuln,
      actionKind: this.remote.actionKind,
      abilitySlot: this.remote.abilitySlot,
      phase: this.remote.phase + t / 10,
      visualScale: 1,
    };
    ctx.save();
    if (this.remote.invuln > 0) ctx.globalAlpha = 0.72;
    drawCharacter(ctx, player, game.cam, t);
    ctx.globalAlpha = 1;
    const px = player.x + player.w / 2 - game.cam.x;
    const py = player.y + player.h * 0.45 - game.cam.y;
    if (this.remote.actionKind === "ability") {
      ctx.save();
      ctx.globalAlpha = Math.max(0, (this.remote.actionUntil - performance.now()) / 420);
      ctx.strokeStyle = "#ffd36a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px + player.facing * 26, py - 12, 18 + ((t * 4) % 18), -1.05, 1.05);
      ctx.stroke();
      ctx.restore();
    }
    ctx.font = "700 11px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#e5fbff";
    ctx.strokeStyle = "rgba(4,8,16,.84)";
    ctx.lineWidth = 3;
    ctx.strokeText("J2 · " + (definition.name || "Jugador"), player.x + player.w / 2 - game.cam.x, player.y - 10 - game.cam.y);
    ctx.fillText("J" + ((this.remote.slot ?? 1) + 1) + " · " + (definition.name || "Jugador"), player.x + player.w / 2 - game.cam.x, player.y - 10 - game.cam.y);
    ctx.restore();
  }
}

export const onlineCoop = new OnlineCoop();
