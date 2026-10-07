import { getLook } from "../characters/look.js";
// Fondos pintados de sala. El suelo de juego se dibuja encima.
const SRC = {
  beach: "assets/worlds/beach-bg.jpg",
  jungle: "assets/worlds/jungle-bg.jpg",
  volcano: "assets/worlds/volcano-bg.jpg",
  boss: "assets/worlds/boss-bg.jpg",
};
const cache = new Map();
export function paintedRoomOn(roomId) { return false; }
function img(id) {
  const src = SRC[id];
  if (!src) return null;
  let el = cache.get(id);
  if (el) return el.complete && el.naturalWidth ? el : null;
  if (typeof Image === "undefined") return null;
  el = new Image();
  el.src = src;
  cache.set(id, el);
  return null;
}
export function drawPaintedRoom(ctx, roomId, W, H) {
  return false;
  /*
  const el = img(roomId);
  if (!el) return false;
  const scale = Math.max(W / el.naturalWidth, H / el.naturalHeight);
  const dw = el.naturalWidth * scale;
  const dh = el.naturalHeight * scale;
  ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const shade = ctx.createLinearGradient(0, H * 0.55, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,.35)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);
  return true;
  */ 
}
