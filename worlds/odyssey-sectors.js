export const CHARACTER_SECTORS = [
  { id:"kilo", name:"Ala Solar", c1:"#ffd36a", c2:"#ff7b52", motif:"sun" },
  { id:"stitcho", name:"Galería de Puntadas", c1:"#7ee7ff", c2:"#8c7bff", motif:"stitch" },
  { id:"chispin", name:"Circuito de Chispa", c1:"#ffe66a", c2:"#60e5ff", motif:"spark" },
  { id:"cat", name:"Umbral Lunar", c1:"#ff83d0", c2:"#9b8cff", motif:"moon" },
  { id:"dragon", name:"Forja del Cielo", c1:"#ff7048", c2:"#ffd36a", motif:"ember" },
  { id:"dino", name:"Jardín Fósil", c1:"#8fe28e", c2:"#c5a77a", motif:"fern" },
  { id:"frita", name:"Cúpula Crujiente", c1:"#ff9a5a", c2:"#ffe27a", motif:"ring" },
  { id:"pizza", name:"Catedral de Queso", c1:"#ffcf68", c2:"#ff6a63", motif:"cheese" },
  { id:"yomi", name:"Archivo de Ofudas", c1:"#f6efff", c2:"#bb93ff", motif:"paper" },
  { id:"cuerno", name:"Arco de Familia", c1:"#b8f090", c2:"#ffec8a", motif:"rainbow" }
];

const ROOM_SEED = { hub:11, beach:23, jungle:37, cave:41, lab:53, ridge:67, space:71, reef:83, volcano:97, boss:101 };
const TAU = Math.PI * 2;

function hash(n) {
  const seed = Number.isFinite(ROOM_SEED[n % 10]) ? ROOM_SEED[n % 10] : 17;
  const s = Math.sin(n * 127.1 + seed) * 43758.5453;
  return s - Math.floor(s);
}

function wrap(v, size) {
  const m = v % size;
  return m < 0 ? m + size : m;
}

export function drawOdysseySectors(ctx, roomId, cam, t, W, H, playerId) {
  const horizon = H * 0.58;
  const worldWidth = 2240;
  const sectorWidth = worldWidth / CHARACTER_SECTORS.length;

  ctx.save();
  for (let i = 0; i < CHARACTER_SECTORS.length; i++) {
    const theme = CHARACTER_SECTORS[i];
    const wx = i * sectorWidth + sectorWidth * 0.5;
    const px = wx - cam.x * 0.72;
    if (px < -280 || px > W + 280) continue;

    const active = playerId === theme.id;
    const top = horizon - 260 - (i % 3) * 28;
    const bottom = horizon + 48;
    const accent = active ? 0.24 : 0.055 + 0.018 * Math.sin(t * 0.015 + i);

    ctx.globalAlpha = accent;
    ctx.strokeStyle = theme.c1;
    ctx.lineWidth = active ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(px - sectorWidth * 0.42, bottom);
    ctx.quadraticCurveTo(px - sectorWidth * 0.30, top + 55, px, top);
    ctx.quadraticCurveTo(px + sectorWidth * 0.30, top + 55, px + sectorWidth * 0.42, bottom);
    ctx.stroke();

    ctx.globalAlpha = active ? 0.10 : 0.04;
    const rg = ctx.createRadialGradient(px, top + 90, 8, px, top + 90, 190);
    rg.addColorStop(0, theme.c1 + "aa");
    rg.addColorStop(0.5, theme.c2 + "28");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(px - 210, top - 110, 420, 360);

    ctx.globalAlpha = active ? 0.30 : 0.10;
    drawMotif(ctx, theme.motif, px, top + 88, t, i, theme);

    ctx.fillStyle = theme.c1;
    ctx.globalAlpha = active ? 0.78 : 0.18;
    ctx.font = active ? "800 11px Outfit,system-ui,sans-serif" : "700 9px Outfit,system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(theme.name, px, horizon + 84);
  }

  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(W, horizon);
  ctx.stroke();
  ctx.restore();
}

function drawMotif(ctx, motif, x, y, t, i, theme) {
  ctx.save();
  if (motif === "sun") {
    ctx.strokeStyle = theme.c1;
    ctx.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + t * 0.001;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 44, y + Math.sin(a) * 44); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, 22 + Math.sin(t * 0.02 + i) * 3, 0, TAU); ctx.stroke();
  } else if (motif === "stitch") {
    ctx.strokeStyle = theme.c1; ctx.lineWidth = 3; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.arc(x, y, 34, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  } else if (motif === "spark") {
    ctx.strokeStyle = theme.c1; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.lineTo(x + 12, y - 8); ctx.lineTo(x - 10, y - 5); ctx.lineTo(x + 16, y + 32); ctx.stroke();
  } else if (motif === "moon") {
    ctx.fillStyle = theme.c2; ctx.beginPath(); ctx.arc(x, y, 34, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(4,6,16,.85)"; ctx.beginPath(); ctx.arc(x + 13, y - 7, 29, 0, TAU); ctx.fill();
  } else if (motif === "ember") {
    for (let k = 0; k < 10; k++) {
      const a = k * TAU / 10 + t * 0.004;
      const rr = 22 + hash(i * 20 + k) * 22;
      ctx.fillStyle = k % 2 ? theme.c1 : theme.c2;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 2 + hash(k + 300) * 3, 0, TAU); ctx.fill();
    }
  } else if (motif === "fern") {
    ctx.strokeStyle = theme.c1; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y + 34); ctx.quadraticCurveTo(x + 12, y - 10, x - 2, y - 35); ctx.stroke();
    for (let k = 0; k < 5; k++) {
      ctx.beginPath(); ctx.moveTo(x - 1, y - k * 12); ctx.lineTo(x - 20, y - 8 - k * 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - k * 12); ctx.lineTo(x + 20, y - 8 - k * 9); ctx.stroke();
    }
  } else if (motif === "ring") {
    ctx.strokeStyle = theme.c1; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 34 + Math.sin(t * 0.02 + i) * 5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = theme.c2; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 21, 0, TAU); ctx.stroke();
  } else if (motif === "cheese") {
    ctx.fillStyle = theme.c1; ctx.beginPath(); ctx.moveTo(x - 38, y + 30); ctx.lineTo(x, y - 28); ctx.lineTo(x + 38, y + 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = theme.c2;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x - 18 + k * 10, y + 7 + (k % 2) * 10, 4, 0, TAU); ctx.fill(); }
  } else if (motif === "paper") {
    ctx.fillStyle = theme.c1; ctx.strokeStyle = theme.c2; ctx.lineWidth = 2;
    ctx.fillRect(x - 17, y - 29, 34, 58); ctx.strokeRect(x - 17, y - 29, 34, 58);
    ctx.beginPath(); ctx.moveTo(x - 9, y - 12); ctx.lineTo(x + 9, y + 12); ctx.moveTo(x + 9, y - 12); ctx.lineTo(x - 9, y + 12); ctx.stroke();
  } else {
    const cols = [theme.c1, theme.c2, "#ff7aa2", "#8fb8ff", "#ffe66a", "#8fe28e"];
    for (let k = 0; k < cols.length; k++) {
      ctx.strokeStyle = cols[k]; ctx.lineWidth = 4; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(x, y + 28, 28 + k * 8, Math.PI, TAU); ctx.stroke();
    }
  }
  ctx.restore();
}
