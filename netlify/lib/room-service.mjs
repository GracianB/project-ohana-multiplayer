const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_RETRIES = 4;
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
      ready: !!player.characterId,
      isYou: player.id === viewerId,
      name: player.slot === 0 ? "Jugador 1" : "Jugador 2",
    })),
    updatedAt: room.updatedAt,
  };
}

function validateCharacter(characterId) {
  const allowed = new Set(["kilo", "stitcho", "chispin", "cat", "dragon", "dino", "frita", "pizza", "yomi", "cuerno"]);
  if (!allowed.has(characterId)) throw new RoomError("INVALID_CHARACTER", "Elige un personaje de OHANA.");
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
      const result = transform(next);
      next.revision += 1;
      next.tick += 1;
      next.updatedAt = now();
      const write = await store.setJSON(current.key, next, { onlyIfMatch: current.etag });
      if (write.modified) return { room: next, result };
    }
    throw new RoomError("ROOM_BUSY", "La sala está recibiendo muchas acciones. Inténtalo otra vez.", 409);
  }

  function playerFrom(room, identity) {
    const player = room.players.find((entry) => entry.id === identity?.playerId);
    if (!player || !identity?.token || player.token !== identity.token) {
      throw new RoomError("INVALID_SESSION", "La sesión no es válida. Vuelve a entrar en la sala.", 401);
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
          players: [{ id: crypto.randomUUID(), token: credential(), slot: 0, characterId: "", x: 390, y: 572, facing: 1, connected: true, lastSequence: 0, lastMoveAt: now(), actions: [] }],
        };
        const write = await store.setJSON(`room:${roomCode}`, room, { onlyIfNew: true });
        if (write.modified) return { ...snapshot(room, room.players[0].id), identity: { playerId: room.players[0].id, token: room.players[0].token } };
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
          resume.connected = true;
          resume.lastMoveAt = now();
        } else {
          if (identity.playerId) throw new RoomError("INVALID_SESSION", "La sesión no se puede reanudar.", 401);
          if (state.players.length >= 2) throw new RoomError("ROOM_FULL", "La sala ya tiene dos jugadores.", 409);
          identity.playerId = crypto.randomUUID();
          identity.token = credential();
          state.players.push({ id: identity.playerId, token: identity.token, slot: 1, characterId: "", x: 880, y: 572, facing: -1, connected: true, lastSequence: 0, lastMoveAt: now(), actions: [] });
        }
        if (state.players.length === 2 && state.players.every((player) => player.connected && player.characterId)) state.phase = "playing";
      });
      const joined = room.players.find((player) => player.id === identity.playerId);
      if (!joined) {
        // mutate persists only successful transforms; throw before a room is claimed by a third participant.
        throw new RoomError("ROOM_FULL", "La sala ya tiene dos jugadores.", 409);
      }
      return { ...snapshot(room, joined.id), identity };
    },

    async choose(roomCode, identity, characterId) {
      validateCharacter(characterId);
      const { room } = await mutate(roomCode, (state) => {
        const player = playerFrom(state, identity);
        if (!player.connected) throw new RoomError("DISCONNECTED", "Reconecta la sesión antes de elegir.", 409);
        player.characterId = characterId;
        if (state.players.length === 2 && state.players.every((entry) => entry.connected && entry.characterId)) state.phase = "playing";
      });
      return snapshot(room, identity.playerId);
    },

    async move(roomCode, identity, payload) {
      const seq = Number(payload?.sequence);
      if (!Number.isSafeInteger(seq) || seq < 1) throw new RoomError("INVALID_SEQUENCE", "La acción de movimiento no es válida.");
      const x = Math.max(-1, Math.min(1, Number(payload?.x) || 0));
      const y = Math.max(-1, Math.min(1, Number(payload?.y) || 0));
      const { room, result } = await mutate(roomCode, (state) => {
        const player = playerFrom(state, identity);
        if (!player.connected) throw new RoomError("DISCONNECTED", "Reconecta la sesión antes de moverte.", 409);
        if (seq <= player.lastSequence || player.actions.includes(payload.actionId)) throw new RoomError("DUPLICATE_ACTION", "Esta acción ya se recibió.", 409);
        if (state.phase !== "playing") throw new RoomError("NOT_READY", "Ambos jugadores deben elegir personaje.", 409);
        const elapsed = Math.max(0, Math.min(0.15, (now() - player.lastMoveAt) / 1000));
        const speed = 250;
        player.x = Math.max(48, Math.min(1232, player.x + x * speed * elapsed));
        player.y = Math.max(450, Math.min(572, player.y + y * speed * elapsed));
        if (x) player.facing = Math.sign(x);
        player.lastMoveAt = now();
        player.lastSequence = seq;
        player.actions = [...player.actions.slice(-31), String(payload.actionId || `${player.id}:${seq}`)];
        return { accepted: true };
      });
      return { ...snapshot(room, identity.playerId), accepted: result.accepted };
    },

    async poll(roomCode, identity) {
      const { room } = await read(roomCode);
      const player = playerFrom(room, identity);
      return snapshot(room, player.id);
    },

    async disconnect(roomCode, identity) {
      const { room } = await mutate(roomCode, (state) => {
        playerFrom(state, identity).connected = false;
        if (state.phase === "playing") state.phase = "lobby";
      });
      return snapshot(room, identity.playerId);
    },
  };
}
