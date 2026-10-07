import { getStore } from "@netlify/blobs";
import { createRoomService, RoomError } from "../lib/room-service.mjs";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  vary: "origin",
};

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

export default async function handler(request: Request) {
  if (request.method !== "POST") return respond({ error: { code: "METHOD_NOT_ALLOWED", message: "Usa POST." } }, 405);
  let body: any;
  try { body = await request.json(); } catch { return respond({ error: { code: "INVALID_JSON", message: "El cuerpo debe ser JSON." } }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: { code: "INVALID_BODY", message: "Solicitud no válida." } }, 400);

  try {
    const service = createRoomService(getStore("ohana-multiplayer-rooms"));
    let data;
    switch (body.action) {
      case "create": data = await service.create(); break;
      case "join": data = await service.join(body.roomId, body.identity); break;
      case "choose": data = await service.choose(body.roomId, body.identity, body.characterId); break;
      case "ready": data = await service.ready(body.roomId, body.identity, body.ready); break;
      case "move": data = await service.move(body.roomId, body.identity, body); break;
      case "attack": data = await service.action(body.roomId, body.identity, body, "attack"); break;
      case "ability": data = await service.action(body.roomId, body.identity, body, "ability"); break;
      case "dodge": data = await service.action(body.roomId, body.identity, body, "dodge"); break;
      case "poll": data = await service.poll(body.roomId, body.identity); break;
      case "disconnect": data = await service.disconnect(body.roomId, body.identity); break;
      default: return respond({ error: { code: "UNKNOWN_ACTION", message: "Acción desconocida." } }, 400);
    }
    return respond({ data });
  } catch (error) {
    if (error instanceof RoomError) return respond({ error: { code: error.code, message: error.message } }, error.status);
    console.error("[ohana-multiplayer] game function error", error);
    return respond({ error: { code: "SERVER_ERROR", message: "No se pudo actualizar la sala." } }, 500);
  }
}
