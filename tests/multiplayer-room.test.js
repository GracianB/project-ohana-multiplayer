import test from "node:test";
import assert from "node:assert/strict";
import { createRoomService, RoomError } from "../netlify/lib/room-service.mjs";
import { CAMPAIGN } from "../multiplayer/mission.js";

class MemoryStore {
  entries = new Map();
  counter = 0;

  async getWithMetadata(key) {
    const entry = this.entries.get(key);
    return entry ? { data: structuredClone(entry.data), etag: entry.etag } : null;
  }

  async setJSON(key, value, options = {}) {
    const entry = this.entries.get(key);
    if (options.onlyIfNew && entry) return { modified: false };
    if (options.onlyIfMatch && (!entry || entry.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = `"${++this.counter}"`;
    this.entries.set(key, { data: structuredClone(value), etag });
    return { modified: true, etag };
  }
}

function setup() {
  let time = 1_800_000_000_000;
  let credential = 0;
  const store = new MemoryStore();
  const service = createRoomService(store, {
    now: () => time,
    makeCode: () => "QWERTY",
    makeCredential: () => `token-${++credential}`,
  });
  return { service, store, advance: (ms) => { time += ms; } };
}

async function makeRoom(service) {
  const host = await service.create();
  const guest = await service.join(host.roomId);
  return { host, guest };
}

async function startMatch(service, room) {
  await service.choose(room.host.roomId, room.host.identity, "kilo");
  await service.choose(room.host.roomId, room.guest.identity, "cat");
  const hostReady = await service.ready(room.host.roomId, room.host.identity);
  assert.equal(hostReady.phase, "lobby");
  const started = await service.ready(room.host.roomId, room.guest.identity);
  assert.equal(started.phase, "playing");
  return started;
}

async function finishIntro(service, room, advance) {
  advance(5700);
  const snapshot = await service.poll(room.host.roomId, room.host.identity);
  assert.equal(snapshot.combat.scene, null);
  return snapshot;
}

async function reachQueen(service, store, room, advance) {
  await startMatch(service, room);
  await finishIntro(service, room, advance);
  const key = `room:${room.host.roomId}`;
  for (let stageIndex = 0; stageIndex < 4; stageIndex++) {
    const stored = store.entries.get(key).data;
    const enemies = stored.combat.enemies;
    for (const enemy of enemies) {
      enemy.hp = 0;
      enemy.alive = false;
    }
    const killXp = enemies.reduce((sum, enemy) => sum + enemy.xp, 0);
    for (const player of stored.players) player.experience += killXp;

    const cleared = await service.poll(room.host.roomId, room.host.identity);
    assert.equal(cleared.combat.campaign.exitOpen, true);
    const atGate = store.entries.get(key).data;
    for (const player of atGate.players) player.x = 1200;
    advance(300);
    const mover = atGate.players.find((player) => player.id === room.guest.identity.playerId);
    const next = await service.move(room.host.roomId, room.guest.identity, {
      x: 0,
      y: 0,
      sequence: mover.lastSequence + 1,
      actionId: `portal:${stageIndex}:${mover.lastSequence + 1}`,
    });
    assert.equal(next.combat.campaign.stageIndex, stageIndex + 1);
    if (stageIndex < 3) {
      advance(2000);
      await service.poll(room.host.roomId, room.host.identity);
    }
  }
  advance(4400);
  const queen = await service.poll(room.host.roomId, room.host.identity);
  assert.equal(queen.combat.campaign.roomId, "queen");
  assert.equal(queen.combat.scene, null);
  return queen;
}

test("creates a two-player room and requires each person to confirm a character", async () => {
  const { service } = setup();
  const host = await service.create();
  const guest = await service.join(host.roomId);
  assert.equal(host.roomId, "QWERTY");
  assert.equal(guest.players.length, 2);
  await assert.rejects(service.join(host.roomId), { code: "ROOM_FULL" });
  await assert.rejects(service.join("BAD"), { code: "INVALID_CODE" });
  await assert.rejects(service.ready(host.roomId, host.identity), { code: "CHARACTER_REQUIRED" });
  await service.choose(host.roomId, host.identity, "kilo");
  const hostReady = await service.ready(host.roomId, host.identity);
  assert.equal(hostReady.players.find((player) => player.isYou).ready, true);
  assert.equal(hostReady.phase, "lobby");
});

test("preparation is a set operation, so a retried click cannot undo readiness", async () => {
  const { service } = setup();
  const room = await makeRoom(service);
  await service.choose(room.host.roomId, room.host.identity, "kilo");
  const prepared = await service.ready(room.host.roomId, room.host.identity, true);
  const replay = await service.ready(room.host.roomId, room.host.identity, true);
  assert.equal(prepared.players.find((player) => player.isYou).ready, true);
  assert.equal(replay.players.find((player) => player.isYou).ready, true);
  const unprepared = await service.ready(room.host.roomId, room.host.identity, false);
  assert.equal(unprepared.players.find((player) => player.isYou).ready, false);
});

test("the party starts in form 2, sees the shared opening, and the server validates movement", async () => {
  const { service, advance } = setup();
  const room = await makeRoom(service);
  const started = await startMatch(service, room);
  assert.equal(started.combat.scene.kind, "opening");
  assert.equal(started.combat.campaign.roomId, CAMPAIGN[0].id);
  assert.ok(started.players.every((player) => player.evolution === 1 && player.experience === 55));
  await finishIntro(service, room, advance);
  advance(300);
  const moved = await service.move(room.host.roomId, room.host.identity, {
    x: 1, y: 0, sequence: 1, actionId: "host:move:1",
  });
  assert.equal(moved.accepted, true);
  assert.ok(moved.players.find((player) => player.isYou).x > 390);
});

test("reconnection resumes the same ready party and a stale pagehide cannot disconnect it", async () => {
  const { service } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);
  await service.disconnect(room.host.roomId, room.guest.identity);
  await assert.rejects(service.move(room.host.roomId, room.guest.identity, {
    x: 1, y: 0, sequence: 1, actionId: "guest:move:1",
  }), { code: "DISCONNECTED" });
  const resumed = await service.join(room.host.roomId, room.guest.identity);
  assert.equal(resumed.identity.playerId, room.guest.identity.playerId);
  assert.equal(resumed.players.find((player) => player.isYou).connected, true);
  assert.equal(resumed.phase, "playing");
  assert.ok(resumed.identity.connectionEpoch > room.guest.identity.connectionEpoch);
  await service.disconnect(room.host.roomId, room.guest.identity);
  assert.equal((await service.poll(room.host.roomId, resumed.identity)).players.find((player) => player.isYou).connected, true);
  await assert.rejects(service.poll(room.host.roomId, room.guest.identity), { code: "STALE_SESSION" });
  await assert.rejects(service.join(room.host.roomId, { playerId: room.guest.identity.playerId, token: "wrong" }), { code: "INVALID_SESSION" });
});

test("a retried movement returns its original result without moving twice", async () => {
  const { service, advance } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);
  await finishIntro(service, room, advance);
  advance(300);
  const command = { x: 1, y: 0, sequence: 1, actionId: "host:move:retry" };
  const first = await service.move(room.host.roomId, room.host.identity, command);
  const xAfterFirst = first.players.find((player) => player.isYou).x;
  const replay = await service.move(room.host.roomId, room.host.identity, command);
  assert.equal(first.accepted, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.players.find((player) => player.isYou).x, xAfterFirst);
  await assert.rejects(service.move(room.host.roomId, room.host.identity, { ...command, sequence: 2 }), { code: "DUPLICATE_ACTION" });
});

test("heartbeat marks an inactive peer disconnected and the same identity can resume", async () => {
  const { service, advance } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);
  advance(8_000);
  await service.poll(room.host.roomId, room.host.identity);
  advance(8_000);
  const waiting = await service.poll(room.host.roomId, room.host.identity);
  assert.equal(waiting.phase, "lobby");
  assert.equal(waiting.players.find((player) => player.slot === 1).connected, false);
  await assert.rejects(service.poll(room.host.roomId, room.guest.identity), { code: "DISCONNECTED" });
  const resumed = await service.join(room.host.roomId, room.guest.identity);
  assert.equal(resumed.phase, "playing");
  assert.equal(resumed.players.every((player) => player.connected), true);
});

test("a reconnect pauses enemy telegraphs instead of resolving an attack during a dropout", async () => {
  const { service, advance } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);
  await finishIntro(service, room, advance);
  const before = await service.poll(room.host.roomId, room.host.identity);
  const enemy = before.combat.enemies.find((entry) => entry.mode === "telegraph");
  assert.ok(enemy, "an enemy should be telegraphing before the disconnect");
  const oldDeadline = enemy.modeUntil;
  await service.disconnect(room.host.roomId, room.guest.identity);
  advance(5_000);
  await service.poll(room.host.roomId, room.host.identity);
  advance(5_000);
  const resumed = await service.join(room.host.roomId, room.guest.identity);
  const resumedEnemy = resumed.combat.enemies.find((entry) => entry.id === enemy.id);
  assert.equal(resumed.phase, "playing");
  assert.equal(resumedEnemy.mode, "telegraph");
  assert.equal(resumedEnemy.modeUntil, oldDeadline + 10_000);
});

test("conditional writes preserve both simultaneous movement updates", async () => {
  const { service, advance } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);
  await finishIntro(service, room, advance);
  advance(300);
  const [left, right] = await Promise.all([
    service.move(room.host.roomId, room.host.identity, { x: 1, y: 0, sequence: 1, actionId: "host:move:1" }),
    service.move(room.host.roomId, room.guest.identity, { x: -1, y: 0, sequence: 1, actionId: "guest:move:1" }),
  ]);
  assert.ok(left.players.find((player) => player.slot === 0).x > 390);
  assert.ok(right.players.find((player) => player.slot === 1).x < 880);
});

test("shared encounters confirm visible hits and make a retry idempotent", async () => {
  const { service, advance } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);
  await finishIntro(service, room, advance);
  const hostHit = await service.action(room.host.roomId, room.host.identity, {
    kind: "ability", slot: 2, sequence: 1, actionId: "host:skill:1",
  }, "ability");
  const guestHit = await service.action(room.host.roomId, room.guest.identity, {
    kind: "attack", sequence: 1, actionId: "guest:hit:1",
  }, "attack");
  assert.equal(hostHit.actionResult.target, "hoku-crab");
  assert.equal(guestHit.actionResult.target, "hoku-gull");
  assert.ok(hostHit.combat.events.some((event) => event.actionId === "host:skill:1" && event.damage > 0));
  const crabHp = hostHit.combat.enemies.find((enemy) => enemy.id === "hoku-crab").hp;
  const replay = await service.action(room.host.roomId, room.host.identity, {
    kind: "ability", slot: 2, sequence: 1, actionId: "host:skill:1",
  }, "ability");
  assert.equal(replay.replayed, true);
  assert.equal(replay.combat.enemies.find((enemy) => enemy.id === "hoku-crab").hp, crabHp);
});

test("both players must meet at each portal and shared XP evolves the whole party", async () => {
  const { service, store, advance } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);
  await finishIntro(service, room, advance);
  const key = `room:${room.host.roomId}`;
  const current = store.entries.get(key).data;
  current.combat.enemies.forEach((enemy) => { enemy.hp = 0; enemy.alive = false; });
  for (const player of current.players) player.experience += current.combat.enemies.reduce((sum, enemy) => sum + enemy.xp, 0);
  const cleared = await service.poll(room.host.roomId, room.host.identity);
  assert.equal(cleared.combat.campaign.exitOpen, true);
  assert.ok(cleared.players.every((player) => player.evolution === 2));

  const atGate = store.entries.get(key).data;
  atGate.players[0].x = 1200;
  advance(300);
  const waiting = await service.move(room.host.roomId, room.host.identity, {
    x: 0, y: 0, sequence: atGate.players[0].lastSequence + 1, actionId: "portal:first-player",
  });
  assert.equal(waiting.combat.campaign.stageIndex, 0);
  const bothAtGate = store.entries.get(key).data;
  bothAtGate.players.forEach((player) => { player.x = 1200; });
  advance(300);
  const next = await service.move(room.host.roomId, room.guest.identity, {
    x: 0, y: 0, sequence: bothAtGate.players[1].lastSequence + 1, actionId: "portal:second-player",
  });
  assert.equal(next.combat.campaign.stageIndex, 1);
});

test("the campaign reaches the Queen at form 5 and the boss accepts damage without BREAK", async () => {
  const { service, store, advance } = setup();
  const room = await makeRoom(service);
  const queen = await reachQueen(service, store, room, advance);
  assert.ok(queen.players.every((player) => player.evolution === 4));
  assert.equal(queen.combat.boss.mode, "telegraph");
  const key = `room:${room.host.roomId}`;
  const stored = store.entries.get(key).data;
  stored.players.find((player) => player.slot === 0).x = stored.combat.boss.x;
  const hp = stored.combat.boss.hp;
  const hit = await service.action(room.host.roomId, room.host.identity, {
    kind: "attack", sequence: stored.players[0].lastSequence + 1, actionId: "queen:hit:1",
  }, "attack");
  assert.equal(hit.actionResult.accepted, true);
  assert.equal(hit.combat.boss.hp, hp - hit.actionResult.damage);
  assert.ok(hit.combat.events.some((event) => event.actionId === "queen:hit:1" && event.targetId === "queen-of-the-nest"));
});

test("Queen attacks visibly deal shared damage when the marked player does not dodge", async () => {
  const { service, store, advance } = setup();
  const room = await makeRoom(service);
  await reachQueen(service, store, room, advance);
  const key = `room:${room.host.roomId}`;
  const stored = store.entries.get(key).data;
  const target = stored.players.find((player) => player.slot === stored.combat.boss.targetSlot);
  target.health = 10;
  advance(2700);
  const charging = await service.poll(room.host.roomId, room.host.identity);
  assert.equal(charging.combat.boss.mode, "charge");
  advance(650);
  const lost = await service.poll(room.host.roomId, room.guest.identity);
  assert.equal(lost.phase, "lost");
  assert.equal(lost.players.find((player) => player.isYou).health, 0);
  assert.ok(lost.combat.events.some((event) => event.kind === "queen-hit" && event.damage > 0));
});

test("a dodge is a server-authoritative combat action and grants a real i-frame window", async () => {
  const { service, advance } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);
  await finishIntro(service, room, advance);

  const before = await service.poll(room.host.roomId, room.host.identity);
  const player = before.players.find((entry) => entry.isYou);
  const dodged = await service.action(room.host.roomId, room.host.identity, {
    kind: "dodge",
    sequence: player.lastSequence + 1,
    actionId: "host:dodge:1",
  }, "dodge");

  assert.equal(dodged.actionResult.accepted, true);
  assert.ok(dodged.combat.events.some((event) => event.kind === "dodge" && event.playerSlot === player.slot));
  assert.ok(dodged.players.find((entry) => entry.isYou).dodgeUntil > 0);

  const replay = await service.action(room.host.roomId, room.host.identity, {
    kind: "dodge",
    sequence: player.lastSequence + 1,
    actionId: "host:dodge:1",
  }, "dodge");
  assert.equal(replay.replayed, true);
});

test("every existing OHANA character ability has a server combat profile", async () => {
  const { ROSTER } = await import("../characters/roster.js");
  const { service, advance } = setup();
  const room = await makeRoom(service);
  await service.choose(room.host.roomId, room.host.identity, "yomi");
  await service.choose(room.host.roomId, room.guest.identity, "kilo");
  await service.ready(room.host.roomId, room.host.identity);
  await service.ready(room.host.roomId, room.guest.identity);
  await finishIntro(service, room, advance);
  for (let slot = 0; slot < 3; slot++) {
    const result = await service.action(room.host.roomId, room.host.identity, {
      kind: "ability", slot, sequence: slot + 1, actionId: `yomi:${slot}`,
    }, "ability");
    assert.notEqual(result.actionResult.reason, "Esa habilidad no está disponible.", `${ROSTER.find((entry) => entry.id === "yomi").abilities[slot]} debe tener una regla de combate`);
  }
});


test("original-engine online mode accepts absolute positions and stops synthetic server combat", async () => {
  const { service, advance } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);
  const first = await service.move(room.host.roomId, room.host.identity, {
    mode: "engine",
    positionX: 512,
    positionY: 500,
    facing: -1,
    evolution: 2,
    experience: 140,
    worldRoomId: "beach",
    sequence: 1,
    actionId: "engine:host:1",
  });
  assert.equal(first.accepted, true);
  assert.equal(first.players.find((player) => player.isYou).x, 512);
  assert.equal(first.players.find((player) => player.isYou).y, 500);
  assert.equal(first.players.find((player) => player.isYou).worldRoomId, "beach");

  advance(10_000);
  await service.poll(room.guest.roomId || room.host.roomId, room.guest.identity);
  await service.poll(room.host.roomId, room.host.identity);
  advance(10_000);
  await service.poll(room.guest.roomId || room.host.roomId, room.guest.identity);
  const later = await service.poll(room.host.roomId, room.host.identity);
  assert.equal(later.phase, "playing");
  assert.equal(later.combat.enemies.length, 0);
  assert.equal(later.combat.boss, null);
});

test("original-engine online signals relay peer attacks without changing single-player simulation", async () => {
  const { service } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);

  const sent = await service.signal(room.host.roomId, room.host.identity, {
    sequence: 1,
    actionId: "engine:signal:1",
    signalKind: "action",
    payload: { action: "attack", roomId: "hub" },
  });

  assert.equal(sent.combat.events.some((event) =>
    event.kind === "online-signal" &&
    event.senderPlayerId === room.host.identity.playerId &&
    event.signalKind === "action"
  ), true);
  assert.equal(sent.combat.enemies.length, 0);

  const replay = await service.signal(room.host.roomId, room.host.identity, {
    sequence: 1,
    actionId: "engine:signal:1",
    signalKind: "action",
    payload: { action: "attack", roomId: "hub" },
  });
  assert.equal(replay.combat.events.filter((event) => event.id === sent.combat.lastEvent.id).length, 1);
});


test("original-engine sync preserves the 1260px world floor and full player pose", async () => {
  const { service } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);

  const moved = await service.move(room.host.roomId, room.host.identity, {
    mode: "engine",
    positionX: 2010,
    positionY: 1120,
    velocityX: 8,
    velocityY: -12,
    grounded: false,
    facing: -1,
    evolution: 3,
    experience: 260,
    health: 87,
    maxHealth: 120,
    worldRoomId: "volcano",
    sequence: 1,
    actionId: "engine:pose:1",
  });

  const player = moved.players.find((entry) => entry.isYou);
  assert.equal(moved.engineMode, true);
  assert.equal(player.x, 2010);
  assert.equal(player.y, 1120);
  assert.equal(player.worldRoomId, "volcano");
  assert.equal(player.pose.vx, 8);
  assert.equal(player.pose.vy, -12);
  assert.equal(player.pose.grounded, false);
});


test("online world signals relay shared defeat/victory state without duplicating events", async () => {
  const { service } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);

  const lost = await service.signal(room.host.roomId, room.host.identity, {
    sequence: 1,
    actionId: "state:lost:1",
    signalKind: "state",
    payload: { state: "lost", roomId: "beach" },
  });

  const lostEvent = lost.combat.events.find((event) => event.signalKind === "state" && event.payload.state === "lost");
  assert.ok(lostEvent);
  assert.equal(lostEvent.senderPlayerId, room.host.identity.playerId);

  const replay = await service.signal(room.host.roomId, room.host.identity, {
    sequence: 1,
    actionId: "state:lost:1",
    signalKind: "state",
    payload: { state: "lost", roomId: "beach" },
  });
  assert.equal(replay.combat.events.filter((event) => event.id === lostEvent.id).length, 1);
});

test("online orb signals are scoped to the current world position", async () => {
  const { service } = setup();
  const room = await makeRoom(service);
  await startMatch(service, room);

  const sent = await service.signal(room.host.roomId, room.host.identity, {
    sequence: 1,
    actionId: "orb:beach:420:960",
    signalKind: "orb",
    payload: { roomId: "beach", x: 420, y: 960, xp: 8 },
  });

  const event = sent.combat.events.find((item) => item.signalKind === "orb");
  assert.ok(event);
  assert.equal(event.payload.roomId, "beach");
  assert.equal(event.payload.xp, 8);
});
