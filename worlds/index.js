// Ohana — world rendering · MAX visual pass (Fase 3+)
// 2026-10-03: wrap() fix, un solo pase de causticos, burbujas con techo, no shadowBlur.
// API intact: WORLDS, renderWorld, drawGrove, drawAquatic. Boca del pozo 620–860 intacta.
// Richer, layered, parallax backgrounds per world. Same public API:
//   WORLDS[]  ·  renderWorld(ctx, world, cam, t, W, H)
// Each world adds `edge` (platform glow accent) used by the platform draw.

export const WORLDS = [
  { id: "beach",   name: "Isla Hoku", ground: "#c9964e", groundTop: "#6bb86a", edge: "#8fe0a6", sky: ["#1b6fd6", "#57b8ef", "#ffe7bd"] },
  { id: "jungle",  name: "Jungla",    ground: "#245522", groundTop: "#63c85a", edge: "#a6f07a", sky: ["#07160a", "#123a18", "#2f6a2e"] },
  { id: "volcano", name: "Volcán",    ground: "#3a1610", groundTop: "#ff6a22", edge: "#ffb04a", sky: ["#120303", "#3a0c06", "#7a1c08"] },
  { id: "space",   name: "Espacio",   ground: "#161628", groundTop: "#7a5cff", edge: "#9a7cff", sky: ["#03030c", "#0b0a24", "#191542"] },
  { id: "lab",     name: "Alien Lab", ground: "#15202a", groundTop: "#3ee0ff", edge: "#7af3ff", sky: ["#050d13", "#0a1a24", "#123646"] },
  { id: "aquatic", name: "Abismo",    ground: "#0a3a58", groundTop: "#3ec8e8", edge: "#8af8ff", platOutline: "rgba(150,245,255,.85)", sky: ["#010c1c", "#042848", "#0a4a78"] },
  { id: "grove",   name: "Claro",     ground: "#3a6a32", groundTop: "#7ec85a", edge: "#b8f090", sky: ["#6eb8e8", "#a8d8f0", "#e8f4c8"] },
  { id: "boss",    name: "Nido",      ground: "#24131d", groundTop: "#6d3341", edge: "#ff8a6e", sky: ["#080612", "#1b0d1d", "#4b1726"] }
];

// deterministic pseudo-random for stable star/particle fields
function pr(i) { const s = Math.sin(i * 127.1 + 43.7) * 43758.5; return s - Math.floor(s); }

// JS % keeps the sign. Camera scrolling left made every parallax layer pop.
function wrap(v, span) {
  const m = v % span;
  return m < 0 ? m + span : m;
}
function onScreen(x, pad, W) { return x > -pad && x < W + pad; }

function cinematicGrade(ctx, world, W, H, t) {
  const id = world?.id || "beach";
  const profiles = {
    beach:   ["rgba(255,225,165,.10)", "rgba(0,42,72,.18)"],
    jungle:  ["rgba(180,255,145,.08)", "rgba(0,25,12,.28)"],
    volcano: ["rgba(255,95,35,.12)", "rgba(35,0,0,.34)"],
    space:   ["rgba(125,105,255,.10)", "rgba(0,0,22,.34)"],
    lab:     ["rgba(70,230,255,.09)", "rgba(0,15,25,.28)"],
    aquatic: ["rgba(80,230,255,.08)", "rgba(0,18,45,.30)"],
    grove:   ["rgba(220,245,180,.08)", "rgba(10,35,15,.18)"],
    boss:    ["rgba(255,105,120,.10)", "rgba(18,3,18,.40)"]
  };
  const [top, bottom] = profiles[id] || profiles.beach;
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, top);
  g.addColorStop(.48, "rgba(0,0,0,0)");
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  const horizon = H * .48 + Math.sin(t * .004) * 3;
  const hg = ctx.createLinearGradient(0,horizon-90,0,horizon+120);
  hg.addColorStop(0,"rgba(255,255,255,0)");
  hg.addColorStop(.55,"rgba(255,255,255,.025)");
  hg.addColorStop(1,"rgba(0,0,0,.08)");
  ctx.fillStyle = hg;
  ctx.fillRect(0,horizon-90,W,210);

  const vg = ctx.createRadialGradient(W*.5,H*.48,H*.18,W*.5,H*.5,Math.max(W,H)*.78);
  vg.addColorStop(0,"rgba(0,0,0,0)");
  vg.addColorStop(.68,"rgba(0,0,0,.025)");
  vg.addColorStop(1,"rgba(0,0,0,.22)");
  ctx.fillStyle = vg;
  ctx.fillRect(0,0,W,H);
}

export function renderWorld(ctx, world, cam, t, W, H) {
  const sky = world.sky || ["#0a0a12", "#161630"];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (sky.length >= 3) {
    g.addColorStop(0, sky[0]); g.addColorStop(0.55, sky[1]); g.addColorStop(1, sky[2]);
  } else { g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]); }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (world.id === "beach") drawBeach(ctx, cam, t, W, H);
  else if (world.id === "jungle") drawJungle(ctx, cam, t, W, H);
  else if (world.id === "volcano") drawVolcano(ctx, cam, t, W, H);
  else if (world.id === "space") drawSpace(ctx, cam, t, W, H);
  else if (world.id === "lab") drawLab(ctx, cam, t, W, H);
  else if (world.id === "aquatic") drawAquatic(ctx, cam, t, W, H);
  else if (world.id === "grove") drawGrove(ctx, cam, t, W, H);
  else if (world.id === "boss") drawBossWorld(ctx, cam, t, W, H);

  drawWorldLandmarks(ctx, world, cam, t, W, H);

  // subtle global top vignette to seat the HUD
  const tv = ctx.createLinearGradient(0, 0, 0, 160);
  tv.addColorStop(0, "rgba(0,0,0,.22)"); tv.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = tv; ctx.fillRect(0, 0, W, 160);
}

/* ─────────────────────────  BEACH · Isla Hoku  ───────────────────────── */
function drawBeach(ctx, cam, t, W, H) {
  // sun — layered glow + warm core
  const sx = W * 0.78, sy = 108;
  const outer = ctx.createRadialGradient(sx, sy, 8, sx, sy, 210);
  outer.addColorStop(0, "rgba(255,248,210,.98)");
  outer.addColorStop(0.22, "rgba(255,230,150,.55)");
  outer.addColorStop(0.55, "rgba(255,200,110,.18)");
  outer.addColorStop(1, "rgba(255,190,100,0)");
  ctx.fillStyle = outer; ctx.beginPath(); ctx.arc(sx, sy, 210, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,252,235,.98)"; ctx.beginPath(); ctx.arc(sx, sy, 36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,236,160,.55)"; ctx.beginPath(); ctx.arc(sx, sy, 52, 0, Math.PI * 2); ctx.fill();

  // distant island silhouettes (far parallax)
  for (let i = 0; i < 6; i++) {
    const x = (wrap(i * 480 - cam.x * 0.05, W + 480)) - 140;
    const y = H * 0.48;
    ctx.fillStyle = i % 2 ? "rgba(55,105,135,.36)" : "rgba(70,125,155,.42)";
    ctx.beginPath();
    ctx.moveTo(x, y + 40);
    ctx.quadraticCurveTo(x + 90, y - 70, x + 180, y - 10);
    ctx.quadraticCurveTo(x + 260, y - 55, x + 340, y + 40);
    ctx.closePath(); ctx.fill();
  }

  // soft clouds
  for (let i = 0; i < 7; i++) {
    const x = (wrap(i * 340 - cam.x * 0.1 + t * 0.18, W + 320)) - 140;
    const y = 48 + (i % 3) * 32;
    const a = 0.55 - (i % 3) * 0.12;
    ctx.fillStyle = "rgba(255,255,255," + a + ")";
    cloud(ctx, x, y, 54 + (i % 2) * 26);
  }

  // sand strip ABOVE the ocean — water starts below sand
  const sandY = H * 0.52;
  const oceanY = sandY + 58;
  const sandG = ctx.createLinearGradient(0, sandY, 0, oceanY);
  sandG.addColorStop(0, "#e8c078");
  sandG.addColorStop(0.55, "#d4a858");
  sandG.addColorStop(1, "#c8964a");
  ctx.fillStyle = sandG; ctx.fillRect(0, sandY, W, oceanY - sandY);

  // sand grain / ripples
  ctx.fillStyle = "rgba(255,230,180,.22)";
  for (let i = 0; i < 10; i++) {
    const yy = sandY + 8 + i * 5 + Math.sin(t / 40 + i) * 1.5;
    ctx.fillRect(0, yy, W, 1.5);
  }

  // ocean with depth gradient
  const og = ctx.createLinearGradient(0, oceanY, 0, H);
  og.addColorStop(0, "#6ec8ef");
  og.addColorStop(0.35, "#3a9ed4");
  og.addColorStop(1, "#185a96");
  ctx.fillStyle = og; ctx.fillRect(0, oceanY, W, H - oceanY);

  // sun reflection column on water
  ctx.fillStyle = "rgba(255,246,210,.30)";
  for (let i = 0; i < 9; i++) {
    const yy = oceanY + 14 + i * 16;
    const ww = 100 - i * 8 + Math.sin(t / 8 + i) * 10;
    ctx.globalAlpha = 0.55 - i * 0.045;
    ctx.fillRect(sx - ww / 2, yy, ww, 3.5);
  }
  ctx.globalAlpha = 1;

  // animated wave bands
  for (let i = 0; i < 8; i++) {
    const x = (wrap(i * 280 - cam.x * 0.2 + t * 0.35, W + 240)) - 80;
    const yy = oceanY + 28 + i * 22 + Math.sin(t / 14 + i) * 5;
    ctx.fillStyle = "rgba(210,240,255," + (0.18 + (i % 3) * 0.06) + ")";
    ctx.beginPath(); ctx.ellipse(x, yy, 110 - i * 4, 8, 0, 0, Math.PI * 2); ctx.fill();
  }

  // foam / shoreline where sand meets water
  ctx.fillStyle = "rgba(255,255,255,.55)";
  for (let i = 0; i < 14; i++) {
    const x = (wrap(i * 140 - cam.x * 0.35 + t * 0.6, W + 160)) - 40;
    const bob = Math.sin(t / 10 + i * 0.9) * 3;
    ctx.beginPath();
    ctx.ellipse(x, oceanY + bob, 48 + (i % 3) * 10, 5 + (i % 2), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // wet sand sheen just above foam
  const wet = ctx.createLinearGradient(0, oceanY - 10, 0, oceanY + 4);
  wet.addColorStop(0, "rgba(180,150,100,0)");
  wet.addColorStop(1, "rgba(120,170,200,.28)");
  ctx.fillStyle = wet; ctx.fillRect(0, oceanY - 10, W, 14);

  // shells & rocks on sand (land only)
  for (let i = 0; i < 14; i++) {
    const wx = pr(i + 40) * 1600;
    if (wx > 600 && wx < 900) continue;
    const x = wx - cam.x * 0.55;
    const y = sandY + 18 + pr(i + 50) * 28;
    if (i % 3 === 0) {
      ctx.fillStyle = "rgba(90,80,70,.55)";
      ctx.beginPath(); ctx.ellipse(x, y, 5 + pr(i) * 4, 3 + pr(i + 1) * 2, 0.3, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = i % 2 ? "rgba(240,220,200,.7)" : "rgba(255,180,160,.65)";
      ctx.beginPath(); ctx.ellipse(x, y, 4, 3, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(200,140,120,.5)"; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.quadraticCurveTo(x, y - 2, x + 2, y); ctx.stroke();
    }
  }

  // light foam sparkle along shore (boost)
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 10; i++) {
    const x = (wrap(i * 140 - cam.x * 0.25 + t * 0.55, W + 160)) - 20;
    const y = oceanY - 6 + Math.sin(t / 9 + i) * 3;
    ctx.fillStyle = "rgba(220,250,255," + (0.08 + (i % 3) * 0.04) + ")";
    ctx.beginPath(); ctx.ellipse(x, y, 28 + (i % 3) * 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // pit-gap water mouth (~world x 620–860): foam + aqua lip so the hole reads as descent to reef
  {
    const gapL = 620 - cam.x * 0.55, gapR = 860 - cam.x * 0.55;
    const mid = (gapL + gapR) / 2;
    const mouthY = oceanY + 8;
    const mouth = ctx.createRadialGradient(mid, mouthY + 10, 4, mid, mouthY + 10, 110);
    mouth.addColorStop(0, "rgba(40,160,200,.45)");
    mouth.addColorStop(0.45, "rgba(30,120,180,.28)");
    mouth.addColorStop(1, "rgba(20,90,140,0)");
    ctx.fillStyle = mouth;
    ctx.beginPath(); ctx.ellipse(mid, mouthY + 10, 120, 36, 0, 0, Math.PI * 2); ctx.fill();
    // churning foam lip on both edges of the gap
    ctx.fillStyle = "rgba(255,255,255,.7)";
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? gapL + 10 + i * 14 : gapR - 10 - (i - 4) * 14;
      const bob = Math.sin(t / 8 + i * 1.1) * 4;
      ctx.beginPath();
      ctx.ellipse(side, oceanY + bob, 22 + (i % 3) * 6, 6 + (i % 2), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // descending foam streaks into the mouth
    ctx.strokeStyle = "rgba(200,240,255,.45)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const sx = mid - 40 + i * 20;
      const sy = oceanY + 4 + Math.sin(t / 10 + i) * 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + Math.sin(t / 12 + i) * 6, sy + 18, mid + (i - 2) * 8, sy + 34);
      ctx.stroke();
    }
  }

  // palms ONLY on land — never in pit gap
  const palmSpots = [90, 260, 480, 980, 1180, 1420];
  for (let i = 0; i < palmSpots.length; i++) {
    const wx = palmSpots[i];
    const x = wx - cam.x * 0.55;
    palm(ctx, x, sandY + 4, t + i * 7, i);
  }

  // drifting light motes above sand / sky
  ctx.fillStyle = "rgba(255,250,220,.55)";
  for (let i = 0; i < 18; i++) {
    const x = (pr(i) * W + t * (0.15 + pr(i) * 0.25)) % W;
    const y = (pr(i + 9) * sandY + Math.sin(t / 18 + i) * 10) % sandY;
    ctx.globalAlpha = 0.22 + pr(i + 3) * 0.4;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}
function cloud(ctx, x, y, r) {
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.48, 0, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.72, y + 3, r * 0.62, r * 0.38, 0, 0, Math.PI * 2);
  ctx.ellipse(x - r * 0.68, y + 5, r * 0.58, r * 0.34, 0, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.15, y - r * 0.28, r * 0.45, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}
function palm(ctx, x, baseY, t, seed) {
  const s = seed || 0;
  const lean = (s % 2 ? 1 : -1) * (6 + (s % 3) * 3);
  const tipX = x + lean;
  const tipY = baseY - 148 - (s % 3) * 8;

  ctx.fillStyle = "rgba(80,50,20,.22)";
  ctx.beginPath();
  ctx.ellipse(x + lean * 0.4, baseY + 4, 28, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#7a4a28";
  ctx.lineCap = "round";
  for (let seg = 0; seg < 5; seg++) {
    const y0 = baseY - seg * 30;
    const y1 = baseY - (seg + 1) * 30;
    const x0 = x + lean * (seg / 5);
    const x1 = x + lean * ((seg + 1) / 5);
    ctx.lineWidth = 12 - seg * 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + 3, (y0 + y1) / 2, x1, y1);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(50,28,12,.35)";
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 6; k++) {
    const by = baseY - 18 - k * 22;
    const bx = x + lean * ((baseY - by) / 150);
    ctx.beginPath();
    ctx.moveTo(bx - 5, by);
    ctx.lineTo(bx + 5, by + 2);
    ctx.stroke();
  }

  const nLeaves = 7;
  for (let a = 0; a < nLeaves; a++) {
    const ang = -Math.PI / 2 + (a - (nLeaves - 1) / 2) * 0.42 + Math.sin(t / 18 + a + s) * 0.07;
    const len = 72 + (a % 3) * 10;
    const midX = tipX + Math.cos(ang) * len * 0.45;
    const midY = tipY + Math.sin(ang) * len * 0.45;
    const endX = tipX + Math.cos(ang) * len;
    const endY = tipY + Math.sin(ang) * len + 16;
    ctx.strokeStyle = "#146832";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.stroke();
    ctx.strokeStyle = "#2cb85a";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(midX - 2, midY - 2, endX - 2, endY - 3);
    ctx.stroke();
  }

  if (s % 2 === 0) {
    ctx.fillStyle = "#5a3a18";
    for (let c = 0; c < 3; c++) {
      const cx = tipX + (c - 1) * 7;
      const cy = tipY + 10 + (c % 2) * 4;
      ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.lineCap = "butt";
}

/* ─────────────────────────  GROVE · Claro Ohana (hub)  ───────────────────────── */
export function drawGrove(ctx, cam, t, W, H) {
  // soft warm sun wash (no ocean)
  const sx = W * 0.72, sy = 90;
  const sun = ctx.createRadialGradient(sx, sy, 6, sx, sy, 180);
  sun.addColorStop(0, "rgba(255,250,210,.95)");
  sun.addColorStop(0.35, "rgba(255,230,150,.35)");
  sun.addColorStop(1, "rgba(255,220,140,0)");
  ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx, sy, 180, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,252,230,.9)"; ctx.beginPath(); ctx.arc(sx, sy, 28, 0, Math.PI * 2); ctx.fill();

  // far haze / light banks (extra subtle parallax)
  for (let i = 0; i < 5; i++) {
    const x = (wrap(i * 380 - cam.x * 0.03 + t * 0.06, W + 380)) - 80;
    const y = 70 + (i % 3) * 36;
    const hg = ctx.createRadialGradient(x, y, 4, x, y, 90);
    hg.addColorStop(0, "rgba(255,250,210,.14)");
    hg.addColorStop(1, "rgba(255,240,180,0)");
    ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(x, y, 100, 28, 0, 0, Math.PI * 2); ctx.fill();
  }

  // distant soft hills
  for (let i = 0; i < 4; i++) {
    const x = (wrap(i * 420 - cam.x * 0.06, W + 420)) - 100;
    const y = H * 0.52;
    ctx.fillStyle = i % 2 ? "rgba(70,130,70,.28)" : "rgba(90,150,85,.34)";
    ctx.beginPath();
    ctx.moveTo(x, y + 60);
    ctx.quadraticCurveTo(x + 100, y - 50, x + 210, y + 10);
    ctx.quadraticCurveTo(x + 300, y - 40, x + 400, y + 60);
    ctx.closePath(); ctx.fill();
  }

  // far tree silhouettes (parallax)
  for (let i = 0; i < 10; i++) {
    const x = (wrap(i * 180 - cam.x * 0.14, W + 200)) - 40;
    const trunkH = 70 + (i % 3) * 18;
    const base = H * 0.58;
    ctx.fillStyle = "rgba(40,70,35,.45)";
    ctx.fillRect(x + 18, base - trunkH, 10, trunkH);
    ctx.beginPath();
    ctx.arc(x + 23, base - trunkH - 8, 28 + (i % 3) * 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 8, base - trunkH + 10, 20, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 38, base - trunkH + 12, 18, 0, Math.PI * 2); ctx.fill();
  }

  // mid-far canopy fronds (slower than mid trees)
  for (let i = 0; i < 8; i++) {
    const x = (wrap(i * 220 - cam.x * 0.1 + t * 0.04, W + 240)) - 50;
    const y = H * 0.34 + (i % 3) * 18;
    ctx.strokeStyle = "rgba(50,100,45," + (0.18 + (i % 3) * 0.05) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 40 + Math.sin(t / 30 + i) * 6, y - 18, x + 90, y + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 10);
    ctx.quadraticCurveTo(x + 55, y - 8, x + 110, y + 16);
    ctx.stroke();
  }

  // mid trees (clearer)
  for (let i = 0; i < 7; i++) {
    const x = (wrap(i * 260 - cam.x * 0.28, W + 280)) - 60;
    const base = H * 0.62;
    const trunkH = 110 + (i % 2) * 30;
    ctx.fillStyle = "#4a3420";
    ctx.fillRect(x + 22, base - trunkH, 14, trunkH);
    ctx.fillStyle = i % 2 ? "#2e6a28" : "#3a8030";
    ctx.beginPath(); ctx.arc(x + 29, base - trunkH - 10, 42, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 8, base - trunkH + 18, 30, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 50, base - trunkH + 16, 28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(140,210,90,.35)";
    ctx.beginPath(); ctx.arc(x + 20, base - trunkH - 18, 18, 0, Math.PI * 2); ctx.fill();
  }

  // grass meadow band
  const grassY = H * 0.58;
  const gg = ctx.createLinearGradient(0, grassY, 0, H);
  gg.addColorStop(0, "#6eb84e");
  gg.addColorStop(0.4, "#4a9038");
  gg.addColorStop(1, "#2e6028");
  ctx.fillStyle = gg; ctx.fillRect(0, grassY, W, H - grassY);

  // grass blades (subtle sway)
  ctx.strokeStyle = "rgba(90,180,70,.58)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 44; i++) {
    const x = (wrap(i * 48 - cam.x * 0.4 + t * 0.08, W + 60));
    const sway = Math.sin(t / 14 + i) * 4.5;
    ctx.beginPath();
    ctx.moveTo(x, grassY + 8 + (i % 5) * 6);
    ctx.quadraticCurveTo(x + sway, grassY - 6, x + sway * 1.5, grassY - 18 - (i % 3) * 4);
    ctx.stroke();
  }

  // juncos / reeds near low ground & low plats (subtle sway)
  ctx.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const x = (wrap(i * 110 - cam.x * 0.45 + t * 0.05, W + 120));
    const base = H * 0.72 + (i % 4) * 10;
    const sway = Math.sin(t / 18 + i * 0.7) * 5;
    const tall = 28 + (i % 4) * 8;
    ctx.strokeStyle = i % 2 ? "rgba(60,120,50,.5)" : "rgba(80,140,60,.45)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + sway * 0.6, base - tall * 0.55, x + sway, base - tall);
    ctx.stroke();
    // tip seed head
    ctx.fillStyle = "rgba(120,160,70,.4)";
    ctx.beginPath();
    ctx.ellipse(x + sway, base - tall - 2, 2.2, 3.5, sway * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = "butt";

  // soft clouds
  for (let i = 0; i < 5; i++) {
    const x = (wrap(i * 360 - cam.x * 0.08 + t * 0.12, W + 300)) - 120;
    const y = 40 + (i % 3) * 28;
    ctx.fillStyle = "rgba(255,255,255," + (0.5 - (i % 3) * 0.1) + ")";
    cloud(ctx, x, y, 48 + (i % 2) * 20);
  }

  // floating light motes (fireflies / pollen)
  for (let i = 0; i < 22; i++) {
    const x = wrap(pr(i) * W - cam.x * 0.2 + t * (0.1 + pr(i) * 0.2) + W, W);
    const y = grassY * 0.35 + pr(i + 5) * (grassY * 0.55) + Math.sin(t / 20 + i) * 12;
    ctx.fillStyle = "rgba(255,255,180," + (0.25 + pr(i + 2) * 0.5) + ")";
    ctx.beginPath(); ctx.arc(x, y, 1.4 + pr(i) * 1.6, 0, Math.PI * 2); ctx.fill();
  }

  // soft sun shafts through canopy (light boost)
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const x = (wrap(i * 280 + 60 - cam.x * 0.05, W + 200));
    const sway = Math.sin(t / 40 + i) * 10;
    const grd = ctx.createLinearGradient(x + sway, 0, x + sway - 40, H * 0.7);
    grd.addColorStop(0, "rgba(255,250,180,.10)");
    grd.addColorStop(1, "rgba(255,230,140,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x + sway, 0); ctx.lineTo(x + sway + 50, 0);
    ctx.lineTo(x + sway - 20, H * 0.7); ctx.lineTo(x + sway - 90, H * 0.7);
    ctx.fill();
  }
  ctx.restore();

  // soft edge vignette (warm, not abyss)
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(20,40,10,.18)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

/* ─────────────────────────  JUNGLE  ───────────────────────── */
function drawJungle(ctx, cam, t, W, H) {
  // depth wash
  ctx.fillStyle = "rgba(4,20,8,.42)"; ctx.fillRect(0, 0, W, H);

  // four canopy layers, back → front (denser)
  const layers = [
    { p: 0.08, col: "#081c0a", r: 52, y: 0.14, step: 130 },
    { p: 0.18, col: "#0c280f", r: 68, y: 0.12, step: 170 },
    { p: 0.32, col: "#143a18", r: 86, y: 0.09, step: 220 },
    { p: 0.5,  col: "#1e5224", r: 102, y: 0.05, step: 280 },
  ];
  for (const L of layers) {
    ctx.fillStyle = L.col;
    for (let i = -1; i < W / L.step + 2; i++) {
      const x = (wrap(i * L.step - cam.x * L.p, W + L.step * 2));
      ctx.fillRect(x + L.r * 0.4, H * L.y, 28, H);
      ctx.beginPath(); ctx.arc(x + L.r * 0.5, H * L.y, L.r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x - L.r * 0.25, H * L.y + 22, L.r * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + L.r * 1.15, H * L.y + 18, L.r * 0.68, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + L.r * 0.2, H * L.y - 20, L.r * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // hanging vines
  ctx.strokeStyle = "rgba(30,90,40,.55)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const x = (wrap(i * 200 - cam.x * 0.35, W + 180));
    const sway = Math.sin(t / 22 + i) * 10;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + sway, H * 0.25, x + sway * 0.5, H * 0.42 + (i % 3) * 20);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  // green god rays (stronger)
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i++) {
    const x = wrap(i * 300 + 80 - cam.x * 0.05 + Math.sin(t / 50 + i) * 12, W + 220);
    const grd = ctx.createLinearGradient(x, 0, x - 100, H);
    grd.addColorStop(0, "rgba(180,255,140,.18)");
    grd.addColorStop(0.5, "rgba(140,230,100,.05)");
    grd.addColorStop(1, "rgba(180,255,150,0)");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 80, 0); ctx.lineTo(x - 50, H); ctx.lineTo(x - 170, H); ctx.fill();
  }
  ctx.restore();

  // floating spores (denser)
  for (let i = 0; i < 28; i++) {
    const x = wrap(pr(i) * W - cam.x * 0.3 + t * 0.15, W);
    const y = (pr(i + 5) * H + Math.sin(t / 24 + i) * 14) % H;
    ctx.fillStyle = "rgba(180,240,150," + (0.2 + pr(i + 2) * 0.45) + ")";
    ctx.beginPath(); ctx.arc((x + W) % W, y, 1.5 + pr(i) * 1.8, 0, Math.PI * 2); ctx.fill();
  }

  // canopy glitter motes (light boost)
  for (let i = 0; i < 12; i++) {
    const x = wrap(pr(i + 40) * W - cam.x * 0.22 + t * 0.22 + W, W);
    const y = (pr(i + 41) * H * 0.55 + Math.sin(t / 18 + i) * 8) % (H * 0.55);
    ctx.fillStyle = "rgba(200,255,160," + (0.18 + pr(i + 42) * 0.35) + ")";
    ctx.beginPath(); ctx.arc(x, y, 1.2 + pr(i + 43), 0, Math.PI * 2); ctx.fill();
  }

  // ground mist
  const mist = ctx.createLinearGradient(0, H * 0.7, 0, H);
  mist.addColorStop(0, "rgba(40,80,40,0)");
  mist.addColorStop(1, "rgba(20,50,25,.35)");
  ctx.fillStyle = mist; ctx.fillRect(0, H * 0.7, W, H * 0.3);
}

/* ─────────────────────────  VOLCANO  ───────────────────────── */
function drawVolcano(ctx, cam, t, W, H) {
  // distant volcano silhouettes with glowing craters
  for (let i = 0; i < 4; i++) {
    const x = (wrap(i * 420 - cam.x * 0.12, W + 420)) - 120;
    const peak = H * (0.2 + (i % 3) * 0.04), base = H * 0.74;
    ctx.fillStyle = i % 2 ? "#1a0604" : "#240a06";
    ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + 140, peak); ctx.lineTo(x + 280, base); ctx.closePath(); ctx.fill();
    // lava crown + glow
    const glow = 0.55 + Math.sin(t / 7 + i) * 0.25;
    ctx.fillStyle = "rgba(255,100,20," + glow + ")";
    ctx.beginPath(); ctx.moveTo(x + 118, peak + 8); ctx.lineTo(x + 140, peak - 14); ctx.lineTo(x + 162, peak + 8); ctx.fill();
    const crater = ctx.createRadialGradient(x + 140, peak + 4, 2, x + 140, peak + 4, 40);
    crater.addColorStop(0, "rgba(255,180,40," + (0.5 * glow) + ")");
    crater.addColorStop(1, "rgba(255,80,0,0)");
    ctx.fillStyle = crater; ctx.beginPath(); ctx.arc(x + 140, peak + 4, 40, 0, Math.PI * 2); ctx.fill();
  }

  // lava rivers (simple streaks)
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) {
    const x = (wrap(i * 380 - cam.x * 0.2, W + 300));
    const pulse = 0.35 + Math.sin(t / 8 + i) * 0.12;
    ctx.strokeStyle = "rgba(255,90,20," + pulse + ")";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, H * 0.45);
    ctx.quadraticCurveTo(x + 30, H * 0.58, x - 10, H * 0.78);
    ctx.stroke();
  }

  // lava haze at bottom (intense)
  const lg = ctx.createLinearGradient(0, H * 0.55, 0, H);
  lg.addColorStop(0, "rgba(255,74,16,0)");
  lg.addColorStop(0.5, "rgba(255,80,20," + (0.22 + Math.sin(t / 9) * 0.06) + ")");
  lg.addColorStop(1, "rgba(255,50,10," + (0.4 + Math.sin(t / 9) * 0.1) + ")");
  ctx.fillStyle = lg; ctx.fillRect(0, H * 0.55, W, H * 0.45);
  ctx.restore();

  // heat shimmer bands (light boost)
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const x = (wrap(i * 260 - cam.x * 0.12 + t * 0.3, W + 200));
    const y = H * 0.62 + Math.sin(t / 11 + i) * 12;
    const hg = ctx.createRadialGradient(x, y, 2, x, y, 50);
    hg.addColorStop(0, "rgba(255,140,40,.10)");
    hg.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(x, y, 55, 16, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // rising embers (more / slightly clearer)
  for (let i = 0; i < 36; i++) {
    const life = (t * (0.6 + pr(i) * 0.8) + pr(i) * 900) % 900;
    const x = wrap(pr(i) * W + Math.sin(life / 40 + i) * 24 - cam.x * 0.2 + W, W);
    const y = H - (life / 900) * H;
    const sz = 2.1 + pr(i + 3) * 2.5;
    ctx.fillStyle = "rgba(255," + (110 + ((i * 37) % 120)) + ",35," + (0.88 - life / 1200) + ")";
    ctx.fillRect(x, y, sz, sz);
  }

  // short-cycle ash / ember sparks (cheap, ~2s loop; slightly more legible)
  for (let i = 0; i < 18; i++) {
    const life = (t * (1.1 + pr(i + 60) * 0.9) + pr(i + 60) * 240) % 240;
    if (life > 160) continue;
    const a = (1 - life / 160) * 0.88;
    const x = wrap(pr(i + 61) * W + Math.sin(life / 18 + i) * 14 - cam.x * 0.15 + W, W);
    const y = H * 0.55 - (life / 160) * (H * 0.5) + Math.cos(t / 20 + i) * 4;
    const sz = 1.6 + pr(i + 62) * 2.6;
    ctx.fillStyle = "rgba(255," + (150 + ((i * 29) % 90)) + ",55," + a + ")";
    ctx.fillRect(x, y, sz, sz * (i % 3 === 0 ? 1.8 : 1));
  }

  // smoke plumes (darker / thicker)
  ctx.fillStyle = "rgba(28,14,12,.55)";
  for (let i = 0; i < 5; i++) {
    const x = (wrap(i * 320 - cam.x * 0.1 + t * 0.08, W + 280));
    cloud(ctx, x, 55 + Math.sin(t / 28 + i) * 14, 58 + (i % 2) * 16);
  }
  ctx.fillStyle = "rgba(50,30,24,.35)";
  for (let i = 0; i < 4; i++) {
    const x = (wrap(i * 360 - cam.x * 0.08 + t * 0.05, W + 300));
    cloud(ctx, x + 40, 90 + Math.sin(t / 35 + i) * 12, 70);
  }
}

/* ─────────────────────────  SPACE  ───────────────────────── */
function drawSpace(ctx, cam, t, W, H) {
  // nebula clouds (richer)
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const neb = [
    ["rgba(120,80,255,.28)", 0.55, 0.32, 280],
    ["rgba(50,160,255,.20)", 0.22, 0.58, 240],
    ["rgba(255,80,180,.16)", 0.82, 0.62, 220],
    ["rgba(80,255,200,.10)", 0.4, 0.75, 180],
  ];
  for (const [c, fx, fy, r] of neb) {
    const nx = wrap(W * fx - cam.x * 0.04 + Math.sin(t / 80) * 8 + W, W);
    const ny = H * fy;
    const rg = ctx.createRadialGradient(nx, ny, 8, nx, ny, r);
    rg.addColorStop(0, c); rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // parallax stars (three depths)
  for (let i = 0; i < 70; i++) {
    const depth = i % 3 === 0 ? 0.03 : i % 3 === 1 ? 0.07 : 0.12;
    const x = wrap(i * 67 + cam.x * depth, W);
    const y = (i * 49 + pr(i) * 40) % (H * 0.95);
    const tw = 0.35 + Math.abs(Math.sin(t / 10 + i)) * 0.65;
    ctx.fillStyle = "rgba(255,255,255," + tw + ")";
    const s = i % 7 === 0 ? 2.8 : i % 4 === 0 ? 2 : 1.3;
    ctx.fillRect((x + W) % W, y, s, s);
  }

  // distant galaxy smear
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(160,140,255,.08)";
  ctx.beginPath();
  ctx.ellipse(W * 0.35, H * 0.28, 180, 28, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ringed planet (larger / more detail)
  const px = W * 0.82, py = 118;
  const pg = ctx.createRadialGradient(px - 18, py - 18, 4, px, py, 58);
  pg.addColorStop(0, "#c8b0ff"); pg.addColorStop(0.5, "#7a50e0"); pg.addColorStop(1, "#3a1a90");
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 52, 0, Math.PI * 2); ctx.fill();
  // atmosphere rim
  ctx.strokeStyle = "rgba(180,200,255,.35)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(px, py, 54, 0, Math.PI * 2); ctx.stroke();
  // rings
  ctx.strokeStyle = "rgba(210,190,255,.6)"; ctx.lineWidth = 7;
  ctx.save(); ctx.translate(px, py); ctx.rotate(-0.48); ctx.scale(1, 0.32);
  ctx.beginPath(); ctx.arc(0, 0, 82, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(160,140,220,.35)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 94, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // moon
  ctx.fillStyle = "#a8b0c8";
  ctx.beginPath(); ctx.arc(W * 0.18, 160, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(60,70,90,.4)";
  ctx.beginPath(); ctx.arc(W * 0.18 - 4, 158, 4, 0, Math.PI * 2); ctx.fill();

  // cosmic dust glitter (light boost)
  for (let i = 0; i < 16; i++) {
    const x = wrap(pr(i + 90) * W - cam.x * 0.05 + t * 0.08 + W, W);
    const y = (pr(i + 91) * H + Math.sin(t / 25 + i) * 6) % H;
    const a = 0.15 + Math.abs(Math.sin(t / 8 + i)) * 0.45;
    ctx.fillStyle = "rgba(200,220,255," + a + ")";
    ctx.fillRect(x, y, 1.2, 1.2);
  }

  // short-cycle star twinkles / dust puffs (~1.5s)
  for (let i = 0; i < 12; i++) {
    const life = (t * (0.9 + pr(i + 100) * 0.7) + pr(i + 100) * 180) % 180;
    if (life > 50) continue;
    const a = Math.sin((life / 50) * Math.PI) * (0.35 + pr(i + 101) * 0.45);
    const x = wrap(pr(i + 102) * W - cam.x * 0.04 + W, W);
    const y = (pr(i + 103) * H * 0.9) % H;
    ctx.fillStyle = "rgba(220,235,255," + a + ")";
    const s = 1.1 + pr(i + 104) * 2.2;
    ctx.fillRect(x, y, s, s);
    if (i % 4 === 0) {
      ctx.strokeStyle = "rgba(180,210,255," + (a * 0.7) + ")";
      ctx.lineWidth = 1;
      const r = 3 + (50 - life) * 0.08;
      ctx.beginPath(); ctx.moveTo(x - r, y + s * 0.5); ctx.lineTo(x + r + s, y + s * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + s * 0.5, y - r); ctx.lineTo(x + s * 0.5, y + r + s); ctx.stroke();
    }
  }

  // shooting star (periodic, brighter trail)
  const cyc = (t % 420) / 420;
  if (cyc < 0.16) {
    const sxp = W * (0.08 + cyc * 5.5), syp = 60 + cyc * 400;
    const trail = ctx.createLinearGradient(sxp, syp, sxp - 60, syp - 28);
    trail.addColorStop(0, "rgba(220,250,255,.95)");
    trail.addColorStop(1, "rgba(120,180,255,0)");
    ctx.strokeStyle = trail; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(sxp, syp); ctx.lineTo(sxp - 60, syp - 28); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.beginPath(); ctx.arc(sxp, syp, 2.5, 0, Math.PI * 2); ctx.fill();
  }
}

/* ─────────────────────────  LAB  ───────────────────────── */
function drawLab(ctx, cam, t, W, H) {
  ctx.fillStyle = "#061018"; ctx.fillRect(0, 0, W, H);

  // perspective grid (stronger cyan)
  ctx.strokeStyle = "rgba(60,224,255,.16)"; ctx.lineWidth = 1;
  for (let x = -wrap(cam.x * 0.2, 64); x < W; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 50; y < H; y += 52) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // floor glow band
  const floorG = ctx.createLinearGradient(0, H * 0.65, 0, H);
  floorG.addColorStop(0, "rgba(40,200,255,0)");
  floorG.addColorStop(1, "rgba(40,200,255,.12)");
  ctx.fillStyle = floorG; ctx.fillRect(0, H * 0.65, W, H * 0.35);

  // glowing tubes / monitors (parallax)
  for (let i = 0; i < 5; i++) {
    const x = (wrap(i * 310 - cam.x * 0.28, W + 280)) - 50;
    const pulse = 0.5 + Math.sin(t / 6 + i) * 0.3;
    // tube frame
    ctx.fillStyle = "rgba(20,40,55,.7)";
    ctx.fillRect(x - 4, 50, 98, 230);
    ctx.fillStyle = "rgba(80,220,255,.12)"; ctx.fillRect(x, 56, 90, 218);
    ctx.strokeStyle = "rgba(122,243,255," + (0.35 + pulse * 0.25) + ")";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 56, 90, 218);
    // liquid
    const bub = ctx.createLinearGradient(0, 70, 0, 260);
    bub.addColorStop(0, "rgba(80,230,255," + (0.12 * pulse) + ")");
    bub.addColorStop(1, "rgba(40,180,220," + (0.45 * pulse) + ")");
    ctx.fillStyle = bub; ctx.fillRect(x + 8, 70, 74, 190);
    // specimen (alien blob)
    const sy = 160 + Math.sin(t / 11 + i) * 42;
    ctx.fillStyle = "rgba(180,255,220,.85)";
    ctx.beginPath(); ctx.ellipse(x + 45, sy, 12, 16, Math.sin(t / 20 + i) * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,100,180,.7)";
    ctx.beginPath(); ctx.arc(x + 41, sy - 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 50, sy - 2, 2.5, 0, Math.PI * 2); ctx.fill();
    // tube bubbles
    for (let b = 0; b < 4; b++) {
      const by = 250 - ((t * 0.8 + b * 40 + i * 20) % 170);
      ctx.strokeStyle = "rgba(180,240,255,.4)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x + 25 + b * 12, by, 2 + (b % 2), 0, Math.PI * 2); ctx.stroke();
    }
  }

  // hanging cables / pipes
  ctx.strokeStyle = "rgba(80,160,180,.35)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const x = (wrap(i * 280 - cam.x * 0.15, W + 200));
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 20, 40, x - 30, 80, x + 10, 120);
    ctx.stroke();
  }

  // data motes / hologram sparks
  ctx.fillStyle = "rgba(122,243,255,.55)";
  for (let i = 0; i < 24; i++) {
    const x = wrap(pr(i) * W - cam.x * 0.25 + t * 0.45 + W, W);
    const y = (pr(i + 4) * H + Math.sin(t / 15 + i) * 8) % H;
    ctx.globalAlpha = 0.2 + pr(i) * 0.55;
    ctx.fillRect(x, y, 2 + (i % 3 === 0 ? 2 : 0), 2);
  }
  ctx.globalAlpha = 1;

  // soft hologram bloom (light boost)
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) {
    const x = W * (0.2 + i * 0.3) + Math.sin(t / 18 + i) * 20;
    const y = H * 0.35 + Math.cos(t / 22 + i) * 16;
    const bg = ctx.createRadialGradient(x, y, 2, x, y, 70);
    bg.addColorStop(0, "rgba(80,240,255,.10)");
    bg.addColorStop(1, "rgba(40,160,220,0)");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // scanline flicker
  ctx.fillStyle = "rgba(80,220,255," + (0.03 + Math.sin(t / 4) * 0.015) + ")";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}

/* ─────────────────────────  AQUATIC · Abismo  ───────────────────────── */
export function drawAquatic(ctx, cam, t, W, H) {
  // FULL underwater — deep blue wall-to-wall (kills any sky feel)
  const deep = ctx.createLinearGradient(0, 0, 0, H);
  deep.addColorStop(0, "rgba(2,36,72,.78)");
  deep.addColorStop(0.22, "rgba(1,28,58,.88)");
  deep.addColorStop(0.55, "rgba(0,16,40,.94)");
  deep.addColorStop(0.82, "rgba(0,8,24,.97)");
  deep.addColorStop(1, "rgba(0,2,12,.99)");
  ctx.fillStyle = deep;
  ctx.fillRect(0, 0, W, H);

  // secondary teal mid wash (depth color band)
  const midWash = ctx.createLinearGradient(0, H * 0.15, 0, H * 0.7);
  midWash.addColorStop(0, "rgba(10,70,110,.22)");
  midWash.addColorStop(0.5, "rgba(4,50,90,.18)");
  midWash.addColorStop(1, "rgba(0,20,50,0)");
  ctx.fillStyle = midWash;
  ctx.fillRect(0, 0, W, H);

  // far marine snow / light motes (extra subtle parallax)
  for (let i = 0; i < 18; i++) {
    const x = wrap(pr(i + 70) * W - cam.x * 0.025 + t * 0.05 + W, W);
    const y = (pr(i + 71) * H * 0.85 + Math.sin(t / 40 + i) * 8) % H;
    ctx.fillStyle = "rgba(160,220,255," + (0.08 + pr(i + 72) * 0.18) + ")";
    ctx.beginPath(); ctx.arc(x, y, 0.8 + pr(i + 73) * 1.4, 0, Math.PI * 2); ctx.fill();
  }

  // far soft light orbs drifting slower than scroll
  for (let i = 0; i < 4; i++) {
    const x = (wrap(i * 360 - cam.x * 0.04 + t * 0.07, W + 360)) - 60;
    const y = H * (0.18 + (i % 3) * 0.16) + Math.sin(t / 35 + i) * 10;
    const og = ctx.createRadialGradient(x, y, 2, x, y, 70);
    og.addColorStop(0, "rgba(120,210,255,.10)");
    og.addColorStop(1, "rgba(40,120,180,0)");
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI * 2); ctx.fill();
  }

  // distant reef silhouettes (parallax back, denser)
  for (let i = 0; i < 8; i++) {
    const x = (wrap(i * 280 - cam.x * 0.07, W + 300)) - 90;
    const y = H * 0.52 + (i % 3) * 22;
    ctx.fillStyle = i % 2 ? "rgba(6,40,58,.55)" : "rgba(4,28,48,.62)";
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + 16, y);
    ctx.quadraticCurveTo(x + 55, y - 48, x + 95, y + 8);
    ctx.quadraticCurveTo(x + 140, y - 55, x + 185, y);
    ctx.quadraticCurveTo(x + 220, y - 30, x + 250, y + 20);
    ctx.lineTo(x + 280, H);
    ctx.closePath(); ctx.fill();
  }

  // soft jelly silhouettes (far, gentle pulse)
  for (let j = 0; j < 3; j++) {
    const jx = wrap(j * 420 + t * (0.12 + j * 0.04) - cam.x * 0.06, W + 200) - 40;
    const jy = H * (0.22 + j * 0.14) + Math.sin(t / 28 + j) * 14;
    const pulse = 0.12 + Math.sin(t / 16 + j) * 0.05;
    ctx.fillStyle = "rgba(160,220,255," + pulse + ")";
    ctx.beginPath();
    ctx.ellipse(jx, jy, 22 + j * 4, 16 + j * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // tentacles
    ctx.strokeStyle = "rgba(140,200,240," + (pulse * 0.8) + ")";
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      const tx = jx - 12 + k * 8;
      const sway = Math.sin(t / 14 + k + j) * 8;
      ctx.beginPath();
      ctx.moveTo(tx, jy + 10);
      ctx.quadraticCurveTo(tx + sway, jy + 40, tx + sway * 0.5, jy + 62 + j * 6);
      ctx.stroke();
    }
  }

  // mid coral / rock formations — denser & more colorful
  const coralCols = ["#c44a6a", "#e86838", "#3aaa78", "#e09030", "#7a48a8", "#2a8ab0", "#d45890"];
  for (let i = 0; i < 12; i++) {
    const x = (wrap(i * 170 - cam.x * 0.24, W + 220)) - 40;
    const h = 70 + (i % 5) * 26;
    ctx.globalAlpha = 0.62 + (i % 3) * 0.08;
    ctx.fillStyle = coralCols[i % coralCols.length];
    // branching coral stalk
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + 6, H - h);
    ctx.lineTo(x + 20, H - h * 0.72);
    ctx.lineTo(x + 16, H);
    ctx.closePath(); ctx.fill();
    // tip clusters
    ctx.beginPath();
    ctx.arc(x + 8, H - h, 12 + (i % 3) * 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 26, H - h * 0.58, 9 + (i % 2) * 3, 0, Math.PI * 2); ctx.fill();
    // secondary branch
    if (i % 2 === 0) {
      ctx.fillStyle = coralCols[(i + 3) % coralCols.length];
      ctx.beginPath();
      ctx.moveTo(x + 10, H - h * 0.4);
      ctx.lineTo(x + 34, H - h * 0.85);
      ctx.lineTo(x + 40, H - h * 0.7);
      ctx.lineTo(x + 18, H - h * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 36, H - h * 0.88, 8, 0, Math.PI * 2); ctx.fill();
    }
    // brain / boulder coral
    if (i % 3 !== 2) {
      ctx.fillStyle = coralCols[(i + 2) % coralCols.length];
      ctx.beginPath();
      ctx.ellipse(x + 48, H - 20, 30 + (i % 3) * 6, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,200,160,.25)";
      ctx.beginPath();
      ctx.ellipse(x + 40, H - 26, 10, 6, -0.3, 0, Math.PI * 2); ctx.fill();
    }
    // anemone tufts
    if (i % 4 === 0) {
      ctx.strokeStyle = coralCols[(i + 1) % coralCols.length];
      ctx.lineWidth = 2;
      for (let a = 0; a < 5; a++) {
        const sway = Math.sin(t / 10 + a + i) * 6;
        ctx.beginPath();
        ctx.moveTo(x + 55, H - 4);
        ctx.quadraticCurveTo(x + 55 + sway, H - 28, x + 50 + sway * 1.4, H - 48 - a * 3);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;

  // god rays from surface (strong / spectacular + depth pass)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 7; i++) {
    const x = (wrap(i * 175 + 24 - cam.x * 0.035, W + 280));
    const sway = Math.sin(t / 32 + i * 0.85) * 28;
    const grd = ctx.createLinearGradient(x + sway, 0, x + sway - 90, H);
    grd.addColorStop(0, "rgba(160,240,255,.34)");
    grd.addColorStop(0.25, "rgba(100,210,255,.15)");
    grd.addColorStop(0.55, "rgba(50,150,220,.055)");
    grd.addColorStop(1, "rgba(20,80,160,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x + sway, 0);
    ctx.lineTo(x + sway + 85, 0);
    ctx.lineTo(x + sway - 50, H);
    ctx.lineTo(x + sway - 190, H);
    ctx.fill();
  }

  // caustic light ripples — mid + floor, more visible
  for (let i = 0; i < 8; i++) {
    const cx = (wrap(i * 210 - cam.x * 0.16 + t * 0.5, W + 200)) - 50;
    const cy = H * 0.4 + (i % 5) * 48 + Math.sin(t / 11 + i) * 10;
    const rad = 40 + (i % 4) * 12;
    const ca = ctx.createRadialGradient(cx, cy, 1, cx, cy, rad);
    ca.addColorStop(0, "rgba(180,250,255,.22)");
    ca.addColorStop(0.35, "rgba(120,220,255,.10)");
    ca.addColorStop(1, "rgba(60,150,220,0)");
    ctx.fillStyle = ca;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rad + Math.sin(t / 9 + i) * 12, 12 + (i % 3) * 4, Math.sin(t / 16 + i) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // floor caustic sheet
  for (let i = 0; i < 4; i++) {
    const cx = (wrap(i * 280 - cam.x * 0.2 + t * 0.35, W + 220)) - 40;
    const cy = H - 30 + Math.sin(t / 14 + i) * 6;
    const ca = ctx.createRadialGradient(cx, cy, 2, cx, cy, 70);
    ca.addColorStop(0, "rgba(140,230,255,.16)");
    ca.addColorStop(1, "rgba(40,120,180,0)");
    ctx.fillStyle = ca;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 75, 18, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // distant fish schools (cardúmenes)
  for (let s = 0; s < 5; s++) {
    const bx = wrap(t * (0.28 + s * 0.09) + s * 340 - cam.x * 0.09, W + 360) - 100;
    const by = H * (0.2 + s * 0.1);
    const dir = s % 2 === 0 ? 1 : -1;
    ctx.fillStyle = "rgba(120,200,235," + (0.18 + s * 0.05) + ")";
    for (let f = 0; f < 10; f++) {
      const fx = bx + dir * (f * 12 + Math.sin(t / 7 + f + s) * 5);
      const fy = by + Math.sin(f * 0.8 + t / 9) * 12 + (f % 4) * 4;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 6 + (f % 3), 2.5, dir * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // occasional sparkle flashes (surface light hits)
  for (let i = 0; i < 6; i++) {
    const life = (t * 0.7 + pr(i + 50) * 200) % 200;
    if (life < 28) {
      const a = (1 - life / 28) * 0.55;
      const x = wrap(pr(i + 51) * W - cam.x * 0.1 + W, W);
      const y = pr(i + 52) * H * 0.55;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(220,250,255," + a + ")";
      ctx.lineWidth = 1.2;
      const r = 4 + (28 - life) * 0.25;
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
      ctx.restore();
    }
  }

  // rising bubbles — multi-size layers (density bump)
  // layer A: tiny dense
  for (let i = 0; i < 28; i++) {
    const life = (t * (0.5 + pr(i) * 0.6) + pr(i) * 700) % 700;
    const x = wrap(pr(i) * W + Math.sin(life / 28 + i) * 16 - cam.x * 0.12 + W, W);
    const y = H - (life / 700) * (H + 40);
    const r = 0.8 + pr(i + 2) * 2.2;
    const a = Math.max(0, 0.45 - life / 1400);
    ctx.strokeStyle = "rgba(180,230,255," + a + ")";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }
  // layer B: medium glossy
  for (let i = 0; i < 16; i++) {
    const life = (t * (0.4 + pr(i + 20) * 0.7) + pr(i + 20) * 900) % 900;
    const x = wrap(pr(i + 20) * W + Math.sin(life / 32 + i) * 22 - cam.x * 0.18 + W, W);
    const y = H - (life / 900) * (H + 60);
    const r = 2.2 + pr(i + 22) * 4.5;
    const a = Math.max(0, 0.65 - life / 1400);
    ctx.strokeStyle = "rgba(190,235,255," + a + ")";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(210,245,255," + (a * 0.4) + ")";
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  // layer C: large sparse
  for (let i = 0; i < 6; i++) {
    const life = (t * (0.28 + pr(i + 40) * 0.4) + pr(i + 40) * 1100) % 1100;
    const x = wrap(pr(i + 40) * W + Math.sin(life / 40 + i) * 30 - cam.x * 0.22 + W, W);
    const y = H - (life / 1100) * (H + 80);
    const r = 5 + pr(i + 42) * 6;
    const a = Math.max(0, 0.5 - life / 1600);
    ctx.strokeStyle = "rgba(200,240,255," + a + ")";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(220,250,255," + (a * 0.28) + ")";
    ctx.beginPath(); ctx.arc(x - r * 0.28, y - r * 0.32, r * 0.32, 0, Math.PI * 2); ctx.fill();
  }

  // swaying kelp / seaweed — denser & colorful
  for (let i = 0; i < 12; i++) {
    const x = (wrap(i * 150 - cam.x * 0.4, W + 160)) - 30;
    const base = H - 4;
    const sway = Math.sin(t / 15 + i * 0.6) * 22;
    const tall = 140 + (i % 5) * 38;
    const dark = i % 2 ? "#145a3c" : "#0a3c2a";
    const mid = i % 3 === 0 ? "#2aaa68" : "#1e8a52";
    ctx.strokeStyle = dark;
    ctx.lineWidth = 6 + (i % 3);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + sway * 0.5, base - tall * 0.5, x + sway, base - tall);
    ctx.stroke();
    // secondary frond
    ctx.strokeStyle = mid;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + sway * 0.3 - 10, base - tall * 0.45, x + sway * 0.7 - 14, base - tall * 0.88);
    ctx.stroke();
    // bright tip accent
    ctx.strokeStyle = "rgba(80,220,140,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + sway * 0.7, base - tall * 0.75);
    ctx.quadraticCurveTo(x + sway, base - tall * 0.92, x + sway + 4, base - tall);
    ctx.stroke();
    // leaf blades
    for (let k = 0; k < 5; k++) {
      const ly = base - 24 - k * (tall / 5.5);
      const lx = x + sway * (0.2 + k * 0.18);
      const leafSway = Math.sin(t / 11 + k + i) * 6;
      ctx.strokeStyle = k % 2 ? "#248a58" : "#1a6a44";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(lx + 22 + leafSway, ly - 12, lx + 38 + leafSway * 0.5, ly + 4);
      ctx.stroke();
      if (k % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(lx - 18 - leafSway, ly - 10, lx - 32, ly + 2);
        ctx.stroke();
      }
    }
  }
  ctx.lineCap = "butt";

  // plankton / particulate motes (dense)
  for (let i = 0; i < 28; i++) {
    const x = wrap(pr(i) * W - cam.x * 0.18 + t * (0.08 + pr(i + 3) * 0.12) + W, W);
    const y = (pr(i + 7) * H + Math.sin(t / 18 + i) * 14) % H;
    const a = 0.12 + pr(i + 3) * 0.45;
    ctx.fillStyle = "rgba(150,230,255," + a + ")";
    const s = 1.2 + pr(i) * 2;
    ctx.fillRect(x, y, s, s);
  }

  // depth vignette — pressure dark at edges & bottom
  const vig = ctx.createRadialGradient(W / 2, H * 0.38, H * 0.12, W / 2, H * 0.42, H * 0.9);
  vig.addColorStop(0, "rgba(0,8,24,0)");
  vig.addColorStop(0.45, "rgba(0,12,32,.12)");
  vig.addColorStop(0.75, "rgba(0,8,28,.38)");
  vig.addColorStop(1, "rgba(0,2,12,.72)");
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

  // bottom abyss darkness band
  const abyss = ctx.createLinearGradient(0, H * 0.72, 0, H);
  abyss.addColorStop(0, "rgba(0,4,16,0)");
  abyss.addColorStop(1, "rgba(0,2,10,.55)");
  ctx.fillStyle = abyss; ctx.fillRect(0, H * 0.72, W, H * 0.28);

  // top surface shimmer (looking up toward light)
  const surf = ctx.createLinearGradient(0, 0, 0, H * 0.28);
  surf.addColorStop(0, "rgba(90,190,240,.42)");
  surf.addColorStop(0.35, "rgba(50,140,200,.18)");
  surf.addColorStop(1, "rgba(20,70,120,0)");
  ctx.fillStyle = surf; ctx.fillRect(0, 0, W, H * 0.28);

  // surface ripple lines
  ctx.strokeStyle = "rgba(160,230,255,.18)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    const y = 8 + i * 10 + Math.sin(t / 12 + i) * 3;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 40) {
      const yy = y + Math.sin(x / 50 + t / 10 + i) * 4;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

/* ───────────────────────── NIDO · final room ───────────────────────── */
function drawBossWorld(ctx, cam, t, W, H) {
  const pulse = 0.5 + Math.sin(t * 0.045) * 0.08;
  // Deep cavern layers
  for (let layer = 0; layer < 4; layer++) {
    const par = 0.05 + layer * 0.08;
    const baseY = H * (0.48 + layer * 0.07);
    ctx.fillStyle = [
      "rgba(12,5,18,.55)",
      "rgba(29,9,26,.62)",
      "rgba(54,15,31,.68)",
      "rgba(91,29,38,.78)"
    ][layer];
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, baseY);
    for (let i = 0; i <= 10; i++) {
      const x = i * W / 10;
      const y = baseY + Math.sin(i * 1.7 + cam.x * par * .01) * (18 + layer * 8);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  // Hanging roots / thorns create a readable Nido silhouette.
  for (let i = 0; i < 15; i++) {
    const x = wrap(i * 170 - cam.x * .18, W + 220) - 110;
    const len = 50 + (i % 5) * 24;
    ctx.strokeStyle = i % 3 ? "rgba(48,19,30,.92)" : "rgba(107,38,48,.9)";
    ctx.lineWidth = 5 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x - 18, len * .35, x + 30, len * .55, x + (i % 2 ? 12 : -18), len);
    ctx.stroke();
    for (let j = 1; j < 4; j++) {
      const yy = len * j / 4;
      ctx.fillStyle = "rgba(20,6,14,.95)";
      ctx.beginPath();
      ctx.moveTo(x + (j % 2) * 8, yy);
      ctx.lineTo(x + (j % 2 ? 20 : -18), yy + 9);
      ctx.lineTo(x + (j % 2) * 6, yy + 3);
      ctx.fill();
    }
  }

  // A warm nest-light source behind the boss keeps the final room readable.
  const gx = W * .72, gy = H * .44;
  const glow = ctx.createRadialGradient(gx, gy, 5, gx, gy, 270);
  glow.addColorStop(0, `rgba(255,104,78,${.28 + pulse * .15})`);
  glow.addColorStop(.32, "rgba(255,66,72,.11)");
  glow.addColorStop(1, "rgba(255,40,60,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(gx - 270, gy - 270, 540, 540);

  // Circular nest sigils on the back wall.
  ctx.save();
  ctx.translate(gx, gy + 40);
  ctx.strokeStyle = `rgba(255,205,112,${.14 + pulse * .08})`;
  ctx.lineWidth = 2;
  for (let r = 70; r <= 190; r += 40) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = t * .003 + i * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 65, Math.sin(a) * 65);
    ctx.lineTo(Math.cos(a) * 190, Math.sin(a) * 190);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWorldLandmarks(ctx, world, cam, t, W, H) {
  const id = world && world.id || "beach";
  const p = Math.sin(t * 0.006);
  ctx.save();
  if (id === "beach") {
    const sx = W * 0.78, sy = H * 0.16;
    const rg = ctx.createRadialGradient(sx, sy, 8, sx, sy, 260);
    rg.addColorStop(0, "rgba(255,229,168,.80)");
    rg.addColorStop(.22, "rgba(255,198,110,.28)");
    rg.addColorStop(1, "rgba(255,190,100,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,240,.14)"; ctx.lineWidth = 9;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI * 2 / 8 + t * 0.0007;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * 380, sy + Math.sin(a) * 260); ctx.stroke();
    }
  } else if (id === "jungle") {
    for (let i = 0; i < 7; i++) {
      const x = wrap(i * 360 - cam.x * 0.05 + t * 0.02, W + 420) - 180;
      const y = H * 0.13 + (i % 3) * 42;
      ctx.fillStyle = "rgba(72,175,96,.13)";
      ctx.beginPath(); ctx.ellipse(x, y, 130, 46, Math.sin(t * 0.002 + i) * .2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(190,255,175,.18)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 72, y + 10); ctx.quadraticCurveTo(x, y - 54, x + 74, y + 14); ctx.stroke();
    }
  } else if (id === "volcano") {
    const vx = W * .72 - cam.x * .04, vy = H * .34;
    const rg = ctx.createRadialGradient(vx, vy, 10, vx, vy, 240);
    rg.addColorStop(0, "rgba(255,110,42," + (.24 + .06 * Math.sin(t * .018)) + ")");
    rg.addColorStop(1, "rgba(255,60,20,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,180,92,.25)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(vx - 92, vy + 52); ctx.quadraticCurveTo(vx, vy - 34, vx + 92, vy + 52); ctx.stroke();
  } else if (id === "space") {
    const cx = W * .78, cy = H * .28;
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = "rgba(175,158,255," + (.18 - i * .025) + ")"; ctx.lineWidth = 3 - i * .3;
      ctx.beginPath(); ctx.arc(cx, cy, 105 + i * 28, p * .2 + i * .7, p * .2 + i * .7 + 4.7); ctx.stroke();
    }
  } else if (id === "lab") {
    for (let i = 0; i < 5; i++) {
      const x = wrap(i * 300 - cam.x * .06, W + 340) - 160;
      const y = H * .17 + (i % 2) * 72;
      ctx.strokeStyle = "rgba(90,240,255,.22)"; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, 150, 92);
      ctx.fillStyle = "rgba(90,240,255,.06)"; ctx.fillRect(x + 10, y + 10, 130, 72);
      ctx.beginPath(); ctx.arc(x + 75, y + 46, 22 + 7 * Math.sin(t * .02 + i), 0, Math.PI * 2); ctx.stroke();
    }
  } else if (id === "aquatic") {
    for (let i = 0; i < 10; i++) {
      const x = wrap(i * 250 - cam.x * .10, W + 300) - 140;
      const base = H * .86;
      ctx.strokeStyle = "rgba(100,230,245,.18)"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + 38, base - 120, x + Math.sin(t * .01 + i) * 12, base - 230); ctx.stroke();
    }
  } else if (id === "grove") {
    const cx = W * .5, cy = H * .31;
    ctx.strokeStyle = "rgba(222,255,192,.17)"; ctx.lineWidth = 4;
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9 + t * .0005;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + Math.cos(a) * 90, cy + Math.sin(a) * 60, cx + Math.cos(a) * 210, cy + Math.sin(a) * 150); ctx.stroke();
    }
  } else if (id === "boss") {
    const cx = W * .5, cy = H * .44;
    for (let i = 0; i < 7; i++) {
      const r = 125 + i * 30 + Math.sin(t * .01 + i) * 4;
      ctx.strokeStyle = i % 2 ? "rgba(255,94,118,.18)" : "rgba(255,220,120,.14)";
      ctx.lineWidth = 4 - i * .35;
      ctx.beginPath(); ctx.arc(cx, cy, r, t * .003 + i * .5, t * .003 + i * .5 + 1.65); ctx.stroke();
    }
  } else if (id === "cave") {
    for (let i = 0; i < 8; i++) {
      const x = wrap(i * 300 - cam.x * .08, W + 340) - 170;
      const y = H * .16 + (i % 3) * 42;
      ctx.strokeStyle = "rgba(90,190,255,.20)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 44, y + 125); ctx.lineTo(x + 88, y); ctx.stroke();
    }
  }
  ctx.restore();
}