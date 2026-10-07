import { ROSTER, applyForm } from "../characters/roster.js";
import { drawCharacter } from "../characters/draw.js";

const ENDPOINT = "/.netlify/functions/game";
const REMOTE_LERP = 0.22;
const SEND_INTERVAL_MS = 125;
const POLL_INTERVAL_MS = 180;

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
    this.sending = false;
    this.lastRoomId = "";
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

    document.body.dataset.gameMode = "online";
    document.body.dataset.onlineRoom = this.roomId;

    await this.poll(game, true);
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
    const targetX = finite(remote.x, previous?.targetX ?? remote.x);
    const targetY = finite(remote.y, previous?.targetY ?? remote.y);

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
      };
    } else {
      this.remote.targetX = targetX;
      this.remote.targetY = targetY;
      this.remote.characterId = remote.characterId;
      this.remote.evolution = remote.evolution ?? this.remote.evolution ?? 1;
      this.remote.facing = remote.facing || this.remote.facing || 1;
      this.remote.slot = remote.slot;
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

  async sendPosition(game) {
    if (!this.enabled || this.sending || !game.player || game.player.dead || !this.roomId || !this.identity) return;
    const now = performance.now();
    if (now - this.lastSend < SEND_INTERVAL_MS) return;

    this.lastSend = now;
    this.sending = true;
    const sequence = ++this.sequence;
    try {
      const data = await post({
        action: "move",
        roomId: this.roomId,
        identity: this.identity,
        mode: "engine",
        sequence,
        actionId: makeActionId(this.identity.playerId, sequence),
        x: game.player.facing || 1,
        y: 0,
        positionX: finite(game.player.x, 180),
        positionY: finite(game.player.y, 500),
        facing: game.player.facing || 1,
        evolution: Math.max(0, Math.min(4, Number(game.player.evo) || 0)),
        experience: finite(game.player.xp, 0),
        worldRoomId: game.roomId || "hub",
      });

      if (data?.players) {
        this.snapshot = data;
        this.updateRemote(data, game);
      }
    } catch (error) {
      this.error = error?.message || String(error);
    } finally {
      this.sending = false;
    }
  }

  async signal(game, signalKind, payload = {}) {
    if (!this.enabled || !this.roomId || !this.identity) return;
    const sequence = ++this.sequence;
    try {
      const snapshot = await post({
        action: "signal",
        roomId: this.roomId,
        identity: this.identity,
        sequence,
        actionId: makeActionId(this.identity.playerId, sequence),
        signalKind,
        payload: {
          ...payload,
          roomId: game.roomId || "hub",
        },
      });
      this.snapshot = snapshot;
      this.updateRemote(snapshot, game);
    } catch (error) {
      this.error = error?.message || String(error);
    }
  }

  consumeSignals(game) {
    const events = this.snapshot?.combat?.events || [];
    for (const event of events) {
      if (event.kind !== "online-signal" || event.senderPlayerId === this.identity?.playerId) continue;
      if (event.payload?.roomId !== game.roomId) continue;
      if (this.seenSignals.has(event.id)) continue;
      this.seenSignals.add(event.id);
      if (this.seenSignals.size > 128) this.seenSignals.delete(this.seenSignals.values().next().value);

      if (event.signalKind === "action") {
        const action = event.payload?.action;
        if (!this.remote) continue;
        if (action === "attack" || action === "ability") {
          this.remote.melee = action === "ability" ? 13 : 9;
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
    const kind = String(payload.kind || "");
    const x = finite(payload.x, 0);
    const y = finite(payload.y, 0);
    const damage = Math.max(0, finite(payload.damage, 0));
    if (!damage) return;

    let target = game.enemies
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
    target.invuln = Math.max(target.invuln || 0, 8);
    target.stun = Math.max(target.stun || 0, 8);
    target._hitT = 10;
    target._hitMax = 10;
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
    void this.sendPosition(game);

    if (this.remote) {
      this.remote.x += (this.remote.targetX - this.remote.x) * REMOTE_LERP;
      this.remote.y += (this.remote.targetY - this.remote.y) * REMOTE_LERP;
      this.remote.melee = Math.max(0, this.remote.melee - 1);
      this.remote.dash = Math.max(0, this.remote.dash - 1);
      this.remote.invuln = Math.max(0, this.remote.invuln - 1);
      const dy = this.remote.targetY - this.remote.y;
      this.remote.grounded = Math.abs(dy) < 2;
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
      vx: 0,
      vy: this.remote.grounded ? 0 : (this.remote.targetY - this.remote.y),
      facing: this.remote.facing || 1,
      grounded: this.remote.grounded,
      evo,
      melee: this.remote.melee,
      dash: this.remote.dash,
      invuln: this.remote.invuln,
      phase: this.remote.phase + t / 10,
      visualScale: 1,
    };
    ctx.save();
    if (this.remote.invuln > 0) ctx.globalAlpha = 0.72;
    drawCharacter(ctx, player, game.cam, t);
    ctx.globalAlpha = 1;
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
