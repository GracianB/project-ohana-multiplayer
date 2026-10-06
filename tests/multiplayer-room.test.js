import test from "node:test";
import assert from "node:assert/strict";
import { createRoomService, RoomError } from "../netlify/lib/room-service.mjs";

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

test("creates a room, accepts a second player, and rejects a third", async () => {
  const { service } = setup();
  const host = await service.create();
  assert.equal(host.roomId, "QWERTY");
  const guest = await service.join(host.roomId);
  assert.equal(guest.players.length, 2);
  assert.equal(guest.players.filter((player) => player.connected).length, 2);
  await assert.rejects(service.join(host.roomId), { code: "ROOM_FULL" });
  await assert.rejects(service.join("BAD"), { code: "INVALID_CODE" });
});

test("requires both character selections and accepts server-side movement intents", async () => {
  const { service, advance } = setup();
  const host = await service.create();
  const guest = await service.join(host.roomId);
  await service.choose(host.roomId, host.identity, "kilo");
  assert.equal((await service.poll(host.roomId, host.identity)).phase, "lobby");
  const ready = await service.choose(host.roomId, guest.identity, "cat");
  assert.equal(ready.phase, "playing");
  advance(150);
  const moved = await service.move(host.roomId, host.identity, { x: 1, y: 0, sequence: 1, actionId: "host:1" });
  assert.equal(moved.accepted, true);
  assert.ok(moved.players.find((player) => player.isYou).x > 390);
  await assert.rejects(service.move(host.roomId, host.identity, { x: 1, y: 0, sequence: 1, actionId: "host:1" }), { code: "DUPLICATE_ACTION" });
  await assert.rejects(service.poll(host.roomId, { playerId: "intruder", token: "nope" }), { code: "INVALID_SESSION" });
});

test("reconnection requires the disconnected player's session token", async () => {
  const { service } = setup();
  const host = await service.create();
  const guest = await service.join(host.roomId);
  await service.choose(host.roomId, host.identity, "kilo");
  await service.choose(host.roomId, guest.identity, "cat");
  await service.disconnect(host.roomId, guest.identity);
  await assert.rejects(service.move(host.roomId, guest.identity, { x: 1, y: 0, sequence: 1, actionId: "guest:1" }), { code: "DISCONNECTED" });
  const resumed = await service.join(host.roomId, guest.identity);
  assert.equal(resumed.identity.playerId, guest.identity.playerId);
  assert.equal(resumed.players.find((player) => player.isYou).connected, true);
  assert.equal(resumed.phase, "playing");
  await assert.rejects(service.join(host.roomId, { playerId: guest.identity.playerId, token: "wrong" }), { code: "INVALID_SESSION" });
});

test("retries a concurrent conditional write without losing either movement", async () => {
  const { service, advance } = setup();
  const host = await service.create();
  const guest = await service.join(host.roomId);
  await service.choose(host.roomId, host.identity, "kilo");
  await service.choose(host.roomId, guest.identity, "cat");
  advance(120);
  const [left, right] = await Promise.all([
    service.move(host.roomId, host.identity, { x: 1, y: 0, sequence: 1, actionId: "host:1" }),
    service.move(host.roomId, guest.identity, { x: -1, y: 0, sequence: 1, actionId: "guest:1" }),
  ]);
  assert.ok(left.players.find((player) => player.slot === 0).x > 390);
  assert.ok(right.players.find((player) => player.slot === 1).x < 880);
});
