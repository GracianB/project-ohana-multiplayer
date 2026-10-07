import { advanceCombat, createCombat, moveCombatPlayer, resolveCombatAction } from "./combat.mjs";

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_RETRIES = 4;
const MOVE_MIN_INTERVAL_MS = 240;
const PLAYER_HEARTBEAT_MS = 4_000;
const PLAYER_STALE_MS = 15_000;
const ACTION_HISTORY_LIMIT = 128;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "RoomError";
    this.code = code;
    this.status = status;
  }
}

export function makeRoomCode(random = Math.random) {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

export function makeCredential(randomBytes = (size) => crypto.getRandomValues(new Uint8Array(size))) {
  const bytes = randomBytes(24);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function snapshot(room, viewerId) {
  return {
    roomId: room.code,
    phase: room.phase,
    revision: room.revision,
    tick: room.tick,
    players: room.players.map((player) => ({
      playerId: player.id,
      slot: player.slot,
      characterId: player.characterId,
      x: player.x,
      y: player.y,
      facing: player.facing,
      lastSequence: player.lastSequence,
      connected: player.connected,
      ready: !!player.ready,
      evolution: player.evolution ?? null,
      experience: player.experience ?? 0,
      combo: player.combo ?? 0,
      isYou: player.id === viewerId,
      health: player.health ?? null,
      maxHealth: player.maxHealth ?? null,
      dodgeUntil: player.dodgeUntil ?? 0,
      name: player.slot === 0 ? "Jugador 1" : "Jugador 2",
      worldRoomId: player.worldRoomId || "hub",
    })),
    combat: room.combat ? structuredClone(room.combat) : null,
    updatedAt: room.updatedAt,
  };
}

function validateCharacter(characterId) {
  const allowed = new Set(["kilo", "stitcho", "chispin", "cat", "dragon", "dino", "frita", "pizza", "yomi", "cuerno"]);
  if (!allowed.has(characterId)) throw new RoomError("INVALID_CHARACTER", "Elige un personaje de OHANA.");
}

function hasAction(player, actionId) {
  return player.actions.some((entry) => typeof entry === "string" ? entry === actionId : entry?.id === actionId);
}

function expireStalePlayers(room, now) {
  let changed = false;
  for (const player of room.players) {
    const lastSeen = Number(player.lastSeenAt ?? player.lastMoveAt ?? room.updatedAt ?? 0);
    if (player.connected && now - lastSeen > PLAYER_STALE_MS) {
      player.connected = false;
      changed = true;
    }
  }
  if (changed && room.phase === "playing") {
    room.phase = "lobby";
    if (room.combat && room.combat.pausedAt == null) room.combat.pausedAt = now;
  }
  return changed;
}

function resumeCombat(room, now) {
  const combat = room.combat;
  if (!combat || combat.pausedAt == null) return;
  const pausedFor = Math.max(0, now - combat.pausedAt);
  const shift = (object, key) => {
    if (Number.isFinite(object?.[key]) && object[key] > 0) object[key] += pausedFor;
  };
  shift(combat.scene, "startedAt");
  shift(combat.campaign, "stageStartedAt");
  for (const enemy of combat.enemies || []) {
    shift(enemy, "nextAttackAt");
    shift(enemy, "modeUntil");
  }
  shift(combat.boss, "attackAt");
  shift(combat.boss, "modeUntil");
  shift(combat, "lastTeamHitAt");
  for (const player of room.players) {
    shift(player, "lastComboAt");
    for (const ability of Object.keys(player.cooldowns || {})) shift(player.cooldowns, ability);
  }
  combat.pausedAt = null;
}

export function createRoomService(store, options = {}) {
  const now = options.now || Date.now;
  const code = options.makeCode || makeRoomCode;
  const credential = options.makeCredential || makeCredential;

  async function read(codeValue) {
    const codeKey = String(codeValue || "").toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(codeKey)) throw new RoomError("INVALID_CODE", "El código debe tener seis caracteres.");
    const entry = await store.getWithMetadata(`room:${codeKey}`, { type: "json", consistency: "strong" });
    if (!entry?.data) throw new RoomError("ROOM_NOT_FOUND", "No encontramos esa sala. Revisa el código.", 404);
    if (now() - entry.data.updatedAt > ROOM_TTL_MS) throw new RoomError("ROOM_EXPIRED", "Esta sala ha caducado.", 410);
    return { room: entry.data, etag: entry.etag, key: `room:${codeKey}` };
  }

  async function mutate(codeValue, transform) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const current = await read(codeValue);
      const next = structuredClone(current.room);
      const before = JSON.stringify(next);
      const timestamp = now();
      expireStalePlayers(next, timestamp);
      if (!next.engineMode) advanceCombat(next, timestamp);
      const result = transform(next);
      if (JSON.stringify(next) === before) return { room: current.room, result };
      next.revision += 1;
      next.tick += 1;
      next.updatedAt = now();
      const write = await store.setJSON(current.key, next, { onlyIfMatch: current.etag });
      if (write.modified) return { room: next, result };
      if (attempt < MAX_RETRIES - 1) {
        const backoff = Math.min(120, 18 * (2 ** attempt) + Math.random() * 28);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
    throw new RoomError("ROOM_BUSY", "La sala está recibiendo muchas acciones. Inténtalo otra vez.", 409);
  }

  function playerFrom(room, identity) {
    const player = room.players.find((entry) => entry.id === identity?.playerId);
    if (!player || !identity?.token || player.token !== identity.token) {
      throw new RoomError("INVALID_SESSION", "La sesión no es válida. Vuelve a entrar en la sala.", 401);
    }
    if (identity.connectionEpoch !== undefined && Number(identity.connectionEpoch) !== Number(player.connectionEpoch)) {
      throw new RoomError("STALE_SESSION", "Esta sesión se reanudó en otra pestaña o dispositivo.", 409);
    }
    return player;
  }

  return {
    async create() {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const roomCode = code();
        const room = {
          code: roomCode,
          phase: "lobby",
          revision: 0,
          tick: 0,
          createdAt: now(),
          updatedAt: now(),
          players: [{ id: crypto.randomUUID(), token: credential(), connectionEpoch: 1, slot: 0, characterId: "", ready: false, x: 390, y: 572, facing: 1, connected: true, lastSequence: 0, lastMoveAt: now(), lastSeenAt: now(), dodgeUntil: 0, actions: [] }],
        };
        const write = await store.setJSON(`room:${roomCode}`, room, { onlyIfNew: true });
        if (write.modified) return { ...snapshot(room, room.players[0].id), identity: { playerId: room.players[0].id, token: room.players[0].token, connectionEpoch: 1 } };
      }
      throw new RoomError("ROOM_BUSY", "No se pudo crear una sala ahora. Inténtalo otra vez.", 503);
    },

    async join(roomCode, resumeIdentity) {
      const identity = resumeIdentity && typeof resumeIdentity.playerId === "string" && typeof resumeIdentity.token === "string"
        ? { playerId: resumeIdentity.playerId, token: resumeIdentity.token }
        : { playerId: "", token: "" };
      const { room } = await mutate(roomCode, (state) => {
        const resume = state.players.find((player) => player.id === identity.playerId && player.token === identity.token);
        if (resume) {
          resume.connectionEpoch = (resume.connectionEpoch || 0) + 1;
          resume.connected = true;
          resume.lastMoveAt = now();
          resume.lastSeenAt = now();
        } else {
          if (identity.playerId) throw new RoomError("INVALID_SESSION", "La sesión no se puede reanudar.", 401);
          if (state.players.length >= 2) throw new RoomError("ROOM_FULL", "La sala ya tiene dos jugadores.", 409);
          identity.playerId = crypto.randomUUID();
          identity.token = credential();
          state.players.push({ id: identity.playerId, token: identity.token, connectionEpoch: 1, slot: 1, characterId: "", ready: false, x: 880, y: 572, facing: -1, connected: true, lastSequence: 0, lastMoveAt: now(), lastSeenAt: now(), dodgeUntil: 0, actions: [] });
        }
        if (state.players.length === 2 && state.players.every((player) => player.connected && player.characterId && player.ready)) {
          resumeCombat(state, now());
          state.phase = "playing";
          state.combat ||= createCombat(state.players, now());
        }
      });
      const joined = room.players.find((player) => player.id === identity.playerId);
      if (!joined) {
        // mutate persists only successful transforms; throw before a room is claimed by a third participant.
        throw new RoomError("ROOM_FULL", "La sala ya tiene dos jugadores.", 409);
      }
      identity.connectionEpoch = joined.connectionEpoch;
      return { ...snapshot(room, joined.id), identity };
    },

    async choose(roomCode, identity, characterId) {
      validateCharacter(characterId);
      const { room } = await mutate(roomCode, (state) => {
        const player = playerFrom(state, identity);
        if (!player.connected) throw new RoomError("DISCONNECTED", "Reconecta la sesión antes de elegir.", 409);
        if (state.phase !== "lobby") throw new RoomError("MATCH_STARTED", "No se puede cambiar de personaje una vez iniciada la misión.", 409);
        player.characterId = characterId;
        player.ready = false;
        player.lastSeenAt = now();
      });
      return snapshot(room, identity.playerId);
    },

    async ready(roomCode, identity, requestedReady = true) {
      if (typeof requestedReady !== "boolean") throw new RoomError("INVALID_READY_STATE", "El estado de preparación no es válido.");
      const { room } = await mutate(roomCode, (state) => {
        const player = playerFrom(state, identity);
        if (!player.connected) throw new RoomError("DISCONNECTED", "Reconecta la sesión antes de prepararte.", 409);
        if (state.phase !== "lobby") throw new RoomError("MATCH_STARTED", "La misión ya ha empezado.", 409);
        if (!player.characterId) throw new RoomError("CHARACTER_REQUIRED", "Elige primero un personaje.");
        player.ready = requestedReady;
        player.lastSeenAt = now();
        if (state.players.length === 2 && state.players.every((entry) => entry.connected && entry.characterId && entry.ready)) {
          state.phase = "playing";
          state.combat ||= createCombat(state.players, now());
        }
      });
      return snapshot(room, identity.playerId);
    },

    async move(roomCode, identity, payload) {
      const seq = Number(payload?.sequence);
      if (!Number.isSafeInteger(seq) || seq < 1) throw new RoomError("INVALID_SEQUENCE", "La acción de movimiento no es válida.");
      const actionId = String(payload?.actionId || `${identity?.playerId || "player"}:${seq}`);
      if (actionId.length > 96) throw new RoomError("INVALID_ACTION_ID", "La acción de movimiento no es válida.");
      const engineMode = payload?.mode === "engine";
      const { room, result } = await mutate(roomCode, (state) => {
        const player = playerFrom(state, identity);
        if (!player.connected) throw new RoomError("DISCONNECTED", "Reconecta la sesión antes de moverte.", 409);
        const previous = player.actions.find((entry) => typeof entry === "object" && entry?.id === actionId);
        if (previous) {
          if (previous.sequence !== seq) throw new RoomError("DUPLICATE_ACTION", "El identificador ya pertenece a otra acción.", 409);
          return { accepted: !!previous.result?.accepted, cinematic: !!previous.result?.cinematic, replayed: true };
        }
        if (hasAction(player, actionId)) return { accepted: true, cinematic: false, replayed: true };
        if (seq <= player.lastSequence) throw new RoomError("DUPLICATE_ACTION", "Esta acción ya se recibió.", 409);
        if (state.phase !== "playing") throw new RoomError("NOT_READY", "La misión ya no está en curso.", 409);
        const currentTime = now();

        if (engineMode) {
          state.engineMode = true;
          if (state.combat) {
            state.combat.scene = null;
            state.combat.enemies = [];
            state.combat.boss = null;
          }
          player.x = Math.max(48, Math.min(1232, Number(payload?.positionX) || player.x));
          player.y = Math.max(0, Math.min(720, Number(payload?.positionY) || player.y));
          player.facing = Number(payload?.facing) < 0 ? -1 : 1;
          player.evolution = Math.max(0, Math.min(4, Math.floor(Number(payload?.evolution) || 0)));
          player.experience = Math.max(0, Number(payload?.experience) || 0);
          player.worldRoomId = String(payload?.worldRoomId || player.worldRoomId || "hub");
          player.lastSequence = seq;
          player.lastSeenAt = currentTime;
          const moveResult = { accepted: true, cinematic: false };
          player.actions = [...player.actions.slice(-(ACTION_HISTORY_LIMIT - 1)), { id: actionId, sequence: seq, result: moveResult }];
          return { ...moveResult, replayed: false };
        }

        let x = Math.max(-1, Math.min(1, Number(payload?.x) || 0));
        let y = Math.max(-1, Math.min(1, Number(payload?.y) || 0));
        const directionLength = Math.hypot(x, y) || 1;
        x /= directionLength;
        y /= directionLength;
        if (currentTime - player.lastMoveAt < MOVE_MIN_INTERVAL_MS) return { accepted: false, throttled: true };
        const moved = moveCombatPlayer(state, player, x, y, currentTime);
        if (!moved) return { accepted: false, cinematic: true };
        player.lastSequence = seq;
        player.lastSeenAt = currentTime;
        const moveResult = { accepted: true, cinematic: false };
        player.actions = [...player.actions.slice(-(ACTION_HISTORY_LIMIT - 1)), { id: actionId, sequence: seq, result: moveResult }];
        return { ...moveResult, replayed: false };
      });
      return { ...snapshot(room, identity.playerId), accepted: result.accepted, cinematic: !!result.cinematic, replayed: !!result.replayed };
    },

    async action(roomCode, identity, payload, kind) {
      const seq = Number(payload?.sequence);
      if (!Number.isSafeInteger(seq) || seq < 1) throw new RoomError("INVALID_SEQUENCE", "La acción no es válida.");
      const actionId = String(payload?.actionId || "");
      if (!actionId || actionId.length > 96) throw new RoomError("INVALID_ACTION_ID", "La acción no es válida.");
      const { room, result } = await mutate(roomCode, (state) => {
        const player = playerFrom(state, identity);
        if (!player.connected) throw new RoomError("DISCONNECTED", "Reconecta la sesión antes de actuar.", 409);
        const previous = player.actions.find((entry) => typeof entry === "object" && entry?.id === actionId);
        if (previous) {
          if (previous.sequence !== seq) throw new RoomError("DUPLICATE_ACTION", "El identificador ya pertenece a otra acción.", 409);
          return { result: previous.result, replayed: true };
        }
        if (seq <= player.lastSequence || hasAction(player, actionId)) throw new RoomError("DUPLICATE_ACTION", "Esta acción ya se recibió.", 409);
        if (state.phase !== "playing") throw new RoomError("NOT_READY", "La misión ya no está en curso.", 409);
        player.lastSequence = seq;
        const result = resolveCombatAction(state, player, { kind, slot: payload.slot }, now());
        player.lastSeenAt = now();
        if (result.accepted && state.combat?.events) {
          const actionEvent = state.combat.events.find((event) => event.id === result.eventId);
          if (actionEvent) Object.assign(actionEvent, {
            actionId,
            playerSlot: player.slot,
            actionKind: kind,
            abilitySlot: kind === "ability" ? Number(payload.slot) : null,
            abilityId: result.abilityId || null,
            targetId: result.target || null,
            damage: result.damage || 0,
            breakBonus: !!result.breakBonus,
          });
        }
        player.actions = [...player.actions.slice(-(ACTION_HISTORY_LIMIT - 1)), { id: actionId, sequence: seq, result }];
        return { result, replayed: false };
      });
      return { ...snapshot(room, identity.playerId), actionResult: result.result, replayed: result.replayed };
    },

    async signal(roomCode, identity, payload) {
      const seq = Number(payload?.sequence);
      if (!Number.isSafeInteger(seq) || seq < 1) throw new RoomError("INVALID_SEQUENCE", "La señal no es válida.");
      const actionId = String(payload?.actionId || "");
      const signalKind = String(payload?.signalKind || "");
      if (!actionId || actionId.length > 96 || !signalKind || signalKind.length > 32) {
        throw new RoomError("INVALID_SIGNAL", "La señal no es válida.");
      }
      const { room } = await mutate(roomCode, (state) => {
        const player = playerFrom(state, identity);
        if (!player.connected) throw new RoomError("DISCONNECTED", "Reconecta la sesión antes de enviar señales.", 409);
        const previous = player.actions.find((entry) => typeof entry === "object" && entry?.id === actionId);
        if (previous) return;
        if (seq <= player.lastSequence || hasAction(player, actionId)) {
          throw new RoomError("DUPLICATE_ACTION", "Esta señal ya se recibió.", 409);
        }
        if (state.phase !== "playing") throw new RoomError("NOT_READY", "La misión ya no está en curso.", 409);

        state.engineMode = true;
        if (state.combat) {
          state.combat.scene = null;
          state.combat.enemies = [];
          state.combat.boss = null;
          const event = {
            id: `online:${now()}:${crypto.randomUUID()}`,
            kind: "online-signal",
            senderPlayerId: player.id,
            senderSlot: player.slot,
            signalKind,
            payload: structuredClone(payload?.payload || {}),
            at: now(),
          };
          state.combat.eventSequence = (state.combat.eventSequence || 0) + 1;
          state.combat.events.push(event);
          if (state.combat.events.length > 64) state.combat.events.splice(0, state.combat.events.length - 64);
          state.combat.lastEvent = event;
        }

        player.lastSequence = seq;
        player.lastSeenAt = now();
        player.actions = [...player.actions.slice(-(ACTION_HISTORY_LIMIT - 1)), { id: actionId, sequence: seq, result: { accepted: true } }];
      });
      return snapshot(room, identity.playerId);
    },

    async poll(roomCode, identity) {
      const { room } = await mutate(roomCode, (state) => {
        const player = playerFrom(state, identity);
        if (!player.connected) throw new RoomError("DISCONNECTED", "Reconecta la sesión antes de consultar la sala.", 409);
        const currentTime = now();
        const lastSeen = Number(player.lastSeenAt ?? player.lastMoveAt ?? state.updatedAt ?? 0);
        if (currentTime - lastSeen >= PLAYER_HEARTBEAT_MS) player.lastSeenAt = currentTime;
      });
      const player = playerFrom(room, identity);
      return snapshot(room, player.id);
    },

    async disconnect(roomCode, identity) {
      const { room } = await mutate(roomCode, (state) => {
        const player = state.players.find((entry) => entry.id === identity?.playerId && entry.token === identity?.token);
        if (!player) throw new RoomError("INVALID_SESSION", "La sesión no es válida. Vuelve a entrar en la sala.", 401);
        if (identity.connectionEpoch !== player.connectionEpoch) return;
        player.connected = false;
        if (state.phase === "playing") {
          state.phase = "lobby";
          if (state.combat && state.combat.pausedAt == null) state.combat.pausedAt = now();
        }
      });
      return snapshot(room, identity.playerId);
    },
  };
}
