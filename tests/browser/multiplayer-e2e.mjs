import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startServer } from "./server.mjs";
import { createRoomService, RoomError } from "../../netlify/lib/room-service.mjs";

class MemoryStore {
  entries = new Map();
  counter = 0;
  async getWithMetadata(key) { const value = this.entries.get(key); return value ? { data: structuredClone(value.data), etag: value.etag } : null; }
  async setJSON(key, data, options = {}) {
    const current = this.entries.get(key);
    if ((options.onlyIfNew && current) || (options.onlyIfMatch && (!current || current.etag !== options.onlyIfMatch))) return { modified: false };
    const etag = `"${++this.counter}"`;
    this.entries.set(key, { data: structuredClone(data), etag });
    return { modified: true, etag };
  }
}

const server = await startServer(4174);
const browser = await chromium.launch({ headless: true });
const store = new MemoryStore();
const service = createRoomService(store);
let host;
let roomId;

async function installFakeNetlify(context) {
  await context.route("**/.netlify/functions/game", async (route) => {
    try {
      const body = route.request().postDataJSON();
      let data;
      switch (body.action) {
        case "create": data = host = await service.create(); roomId = data.roomId; break;
        case "join": data = await service.join(body.roomId, body.identity); break;
        case "choose": data = await service.choose(body.roomId, body.identity, body.characterId); break;
        case "move": data = await service.move(body.roomId, body.identity, body); break;
        case "poll": data = await service.poll(body.roomId, body.identity); break;
        case "disconnect": data = await service.disconnect(body.roomId, body.identity); break;
        default: throw new RoomError("UNKNOWN_ACTION", "Acción desconocida.");
      }
      await route.fulfill({ status: 200, headers: { "cache-control": "no-store", "content-type": "application/json" }, body: JSON.stringify({ data }) });
    } catch (error) {
      await route.fulfill({ status: error.status || 500, headers: { "cache-control": "no-store", "content-type": "application/json" }, body: JSON.stringify({ error: { code: error.code || "TEST_ERROR", message: error.message } }) });
    }
  });
}

const contexts = [];
try {
  const hostContext = await browser.newContext(); contexts.push(hostContext);
  const guestContext = await browser.newContext(); contexts.push(guestContext);
  await installFakeNetlify(hostContext); await installFakeNetlify(guestContext);
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const errors = [];
  for (const page of [hostPage, guestPage]) page.on("pageerror", (error) => errors.push(error.stack || error.message));

  await hostPage.goto("http://127.0.0.1:4174/multiplayer.html");
  await hostPage.getByRole("button", { name: "Crear sala" }).click();
  await hostPage.locator("#room-code").waitFor();
  roomId = await hostPage.locator("#room-code").innerText();
  await hostPage.getByRole("button", { name: "Elegir Kilo" }).click();

  await guestPage.goto("http://127.0.0.1:4174/multiplayer.html");
  await guestPage.locator("#room-input").fill(roomId);
  await guestPage.getByRole("button", { name: "Unirse" }).click();
  await guestPage.getByRole("button", { name: "Elegir Michi" }).click();
  await hostPage.locator("#game-panel").waitFor({ state: "visible", timeout: 5000 });
  await guestPage.locator("#game-panel").waitFor({ state: "visible", timeout: 5000 });
  await hostPage.keyboard.down("ArrowRight");
  await hostPage.waitForTimeout(800);
  await hostPage.keyboard.up("ArrowRight");
  const moved = await service.poll(roomId, host.identity);
  assert.ok(moved.players.find((player) => player.isYou).x > 390, "el servidor compartido debe mover al jugador host");
  assert.deepEqual(errors, [], "las dos vistas deben renderizar sin errores");
  console.log("PASS · dos contextos independientes crean/unen sala, eligen a Kilo y Michi, entran juntos y sincronizan movimiento.");
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
