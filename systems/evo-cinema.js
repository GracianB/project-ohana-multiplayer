// ============================================================================
// PROJECT OHANA · Cinemática de evolución (systems/evo-cinema.js)
// ----------------------------------------------------------------------------
// Escucha window "ohana-evolve" ({ id, evo, color, fromName, toName, name }) y
// reproduce a pantalla completa, en un <canvas> propio:
//   oscurecer breve → forma anterior + nueva en crossfade continuo
//   → flash corto → forma nueva legible y retorno rápido al juego.
// Mientras dura, #evo-stage tiene la clase "show" (game.js pausa la partida).
// También exporta utilidades (partículas, rayos, texto) que reutiliza intro.js.
// ============================================================================
import { drawCharacter } from "../characters/draw.js";
import { ROSTER } from "../characters/roster.js";
import { sfx } from "../engine/audio.js";
import { duckMusic } from "../engine/music.js";
import { evolutionTiming } from "./evolution-timing.js";
import { EVOLUTION_CINEMA_PROFILES, EVOLUTION_STAGE_COPY } from "../characters/evolution.js";

const VISUAL_H = [34, 56, 76, 98, 124];
const CHAR_K = { kilo: 1.0, lilo: 1.0, stitcho: 0.95, stitch: 0.95, chispin: 0.92, pikachu: 0.92, cat: 0.92, dragon: 1.0, frita: 1.04, dino: 1.0, pizza: 0.98, yomi: 0.96 };
export const FONT_DISPLAY = "Fredoka, 'Baloo 2', system-ui, sans-serif";
export const FONT_BODY = "Outfit, system-ui, sans-serif";
const GOLD = "#ffd84a";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
/** Progreso 0..1 de t dentro de [a, b]. */
export const seg = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a), 0, 1);
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeBack = (k) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

export function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (_) { return false; }
}

function hexRgb(color) {
  let h = String(color || "#ffffff").trim();
  if (/^#[0-9a-f]{3}$/i.test(h)) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  if (!/^#[0-9a-f]{6}$/i.test(h)) return [255, 255, 255];
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
export function rgba(color, a) {
  const [r, g, b] = hexRgb(color);
  return "rgba(" + r + "," + g + "," + b + "," + clamp(a, 0, 1) + ")";
}
/** Mezcla un color hacia blanco (k>0) o negro (k<0). */
export function tint(color, k) {
  const c = hexRgb(color);
  const to = k >= 0 ? 255 : 0;
  const a = Math.abs(k);
  const out = c.map((v) => Math.round(v + (to - v) * a));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

let fontsReady = false;
export function loadFonts() {
  if (fontsReady || !document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all([
    document.fonts.load("700 64px Fredoka"),
    document.fonts.load("800 16px Outfit"),
  ]).then(() => { fontsReady = true; }, () => {});
}
loadFonts();

/** Canvas a pantalla completa con DPR; devuelve { cv, ctx, W, H, resize }. */
export function fullCanvas(cv) {
  const ctx = cv.getContext("2d");
  const st = { cv, ctx, W: 0, H: 0, dpr: 1 };
  st.resize = () => {
    st.dpr = Math.min(2, window.devicePixelRatio || 1);
    st.W = Math.max(1, window.innerWidth);
    st.H = Math.max(1, window.innerHeight);
    cv.width = Math.round(st.W * st.dpr);
    cv.height = Math.round(st.H * st.dpr);
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  };
  st.resize();
  return st;
}

// ---------------------------------------------------------------------------
// Partículas
// ---------------------------------------------------------------------------
export class Particles {
  constructor() { this.list = []; }
  add(p) {
    this.list.push(Object.assign({ life: 0, max: 1, vx: 0, vy: 0, drag: 0.985, g: 0, size: 3, rot: 0, vr: 0, kind: "dot", color: "#fff", to: null }, p));
  }
  update(dt) {
    const out = [];
    for (const p of this.list) {
      p.life += dt;
      if (p.life >= p.max) continue;
      if (p.to) {
        // convergencia: aceleración hacia el objetivo
        const dx = p.to.x - p.x, dy = p.to.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 10) continue;
        const acc = 2600 * dt;
        p.vx += (dx / d) * acc; p.vy += (dy / d) * acc;
        // componente tangencial: espiral
        p.vx += (-dy / d) * p.swirl * dt; p.vy += (dx / d) * p.swirl * dt;
        p.vx *= 0.92; p.vy *= 0.92;
      }
      p.vy += p.g * dt;
      p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      out.push(p);
    }
    this.list = out;
  }
  draw(ctx, pred) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.list) {
      if (pred && !pred(p)) continue;
      const k = p.life / p.max;
      const a = p.to ? Math.min(1, p.life * 4) : Math.sin(Math.min(1, k) * Math.PI) * (p.alpha || 1);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      if (p.kind === "star") drawStar(ctx, p.x, p.y, p.size * (1 - k * 0.4), p.rot, p.color);
      else if (p.kind === "spark") drawSpark(ctx, p.x, p.y, p.size * (0.6 + 0.4 * Math.sin(p.life * 18 + p.size)), p.color);
      else if (p.kind === "streak") {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const len = clamp(sp * 0.05, 4, 60);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
        ctx.stroke();
      } else {
        const r = p.size * 3;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, p.color);
        g.addColorStop(0.3, rgba(p.color, 0.6));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

export function drawStar(ctx, x, y, r, rot, color) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    const b = a + Math.PI / 5;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(b) * r * 0.45, Math.sin(b) * r * 0.45);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Destello de cuatro puntas. */
export function drawSpark(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Capas de fondo
// ---------------------------------------------------------------------------
/** Rayos de luz giratorios desde (cx, cy). */
export function drawRays(ctx, cx, cy, R, color, alpha, rot, n = 14) {
  if (alpha <= 0.005) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, rgba(color, 0.55 * alpha));
  g.addColorStop(0.45, rgba(color, 0.16 * alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = (i % 2 ? 0.07 : 0.12) * (1 + 0.3 * Math.sin(i * 3.1));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a - w, a + w);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Fondo oscuro con viñeta y resplandor central. */
export function drawBackdrop(ctx, W, H, cx, cy, color, dark, glow) {
  if (dark > 0) {
    ctx.fillStyle = "rgba(3,6,14," + (0.9 * dark) + ")";
    ctx.fillRect(0, 0, W, H);
    const R = Math.hypot(W, H) * 0.62;
    const v = ctx.createRadialGradient(cx, cy, R * 0.25, cx, cy, R);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0," + (0.75 * dark) + ")");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  if (glow > 0) {
    const r = Math.min(W, H) * 0.55;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(color, 0.42 * glow));
    g.addColorStop(0.4, rgba(color, 0.12 * glow));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
}

/** Anillo expansivo (onda). k 0..1. */
export function drawRing(ctx, cx, cy, maxR, k, color, width, squash = 1) {
  if (k <= 0 || k >= 1) return;
  const e = easeOut(k);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha *= (1 - k) * (1 - k);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.5, width * (1 - e * 0.8));
  ctx.beginPath();
  ctx.ellipse(cx, cy, maxR * e, maxR * e * squash, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Texto con relleno degradado, contorno y brillo. */
export function drawTitle(ctx, text, x, y, size, colors, opts = {}) {
  ctx.save();
  ctx.font = (opts.weight || 700) + " " + size + "px " + (opts.font || FONT_DISPLAY);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (opts.spacing && "letterSpacing" in ctx) ctx.letterSpacing = opts.spacing;
  const maxW = opts.maxWidth || Infinity;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    const s = maxW / w;
    ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y);
  }
  const tw = Math.min(w, 4000);
  if (opts.stroke !== false) {
    ctx.lineJoin = "round";
    ctx.strokeStyle = opts.strokeColor || "rgba(4,8,18,0.9)";
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.strokeText(text, x, y);
  }
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = size * 0.5;
  }
  if (Array.isArray(colors)) {
    const g = ctx.createLinearGradient(x - tw / 2, y - size / 2, x + tw / 2, y + size / 2);
    colors.forEach((c, i) => g.addColorStop(i / Math.max(1, colors.length - 1), c));
    ctx.fillStyle = g;
  } else ctx.fillStyle = colors;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Personaje grande
// ---------------------------------------------------------------------------
/** Altura visual (px) de un personaje/forma con visualScale = 1. */
export function baseHeight(id, evo) {
  return VISUAL_H[clamp(evo | 0, 0, 4)] * (CHAR_K[id] || 1);
}

/** Muñeco ficticio para drawCharacter con los pies en (fx, fy). */
export function makeDummy(id, evo, color) {
  const def = ROSTER.find((r) => r.id === id) || ROSTER[0];
  const f = (def.forms && def.forms[evo]) || def;
  return {
    id: def.id, evo, color: color || f.color || def.color,
    w: f.w || 24, h: f.h || 28, x: 0, y: 0,
    facing: 1, grounded: true, vx: 0, vy: 0, melee: 0, invuln: 0,
    visualScale: 1, _poseOverride: "victory", _evoT: 0,
  };
}

export function drawDummy(ctx, p, fx, fy, scale, t) {
  p.x = fx - p.w / 2;
  p.y = fy - p.h;
  p.visualScale = scale;
  p.evoBurst = 0;
  drawCharacter(ctx, p, { x: 0, y: 0 }, t);
}

// ---------------------------------------------------------------------------
// Cinemática
// ---------------------------------------------------------------------------
let stage = null;
let running = null;

function ensureStage() {
  if (stage) return stage;
  const el = document.getElementById("evo-stage") || document.createElement("div");
  el.id = "evo-stage";
  el.dataset.dialog = "show";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "evo-description");
  el.setAttribute("aria-live", "assertive");
  el.innerHTML = '<canvas aria-hidden="true"></canvas><p class="evo-sr" id="evo-description"></p>';
  if (!el.isConnected) document.body.appendChild(el);
  const fc = fullCanvas(el.querySelector("canvas"));
  stage = { el, fc, sr: el.querySelector(".evo-sr") };
  addEventListener("resize", () => { if (stage) stage.fc.resize(); });
  return stage;
}

export function playEvolution(detail = {}) {
  const st = ensureStage();
  if (running) running.stop(true);

  const id = detail.id || "kilo";
  const evo = clamp(Number(detail.evo) || 1, 1, 4);
  const def = ROSTER.find((r) => r.id === id) || ROSTER[0];
  const newForm = (def.forms && def.forms[evo]) || {};
  const oldForm = (def.forms && def.forms[evo - 1]) || {};
  const finalForm = evo >= 4;
  const color = detail.color || newForm.color || def.color || "#7ee7ff";
  const designAccent = newForm.accent || newForm.color || def.color || color;
  const oldColor = oldForm.color || color;
  const cinemaProfile = EVOLUTION_CINEMA_PROFILES[def.id] || EVOLUTION_CINEMA_PROFILES.kilo;
  const accent = finalForm ? designAccent : (cinemaProfile.accent || color);
  const light = tint(accent, 0.55);
  const palette = finalForm ? [accent, light, "#ffffff", color] : [color, light, "#ffffff"];
  const toName = String(detail.toName || detail.name || newForm.name || "Nueva forma");
  const title = "¡" + toName.toUpperCase() + "!";
  const story = EVOLUTION_STAGE_COPY[evo] || EVOLUTION_STAGE_COPY[4] || { kicker: "EVOLUCIÓN" };
  const reduce = reducedMotion();

  // Línea de tiempo breve: impacto visual fuerte, regreso rápido al juego.
  const T = evolutionTiming({ reduced: reduce, finalForm });

  const pOld = makeDummy(def.id, evo - 1, oldColor);
  const pNew = makeDummy(def.id, evo, color);
  pOld._poseOverride = "idle";
  const parts = new Particles();
  const { el, fc } = st;
  const ctx = fc.ctx;

  st.sr.textContent = "Evolución completada: " + toName + ". Nueva forma " + (evo + 1) + " de 5.";
  el.classList.add("show");
  el.classList.toggle("finale", finalForm);
  // La cinemática usa un único personaje central. No se montan miniaturas ni
  // sprites auxiliares debajo del héroe, evitando cast visuales ajenos al elenco activo.
  const staleLadder = el.querySelector(".form-ladder");
  if (staleLadder) staleLadder.remove();
  sfx("evoCharge");
  duckMusic(true);
  let fanfared = false;

  let t0 = performance.now();
  let last = t0;
  let raf = 0;
  let skipAt = -1;
  let flashed = false;
  let burstDone = false;
  let spawnAcc = 0;
  let sparkAcc = 0;
  let finished = false;
  let failSafe = 0;

  function layout() {
    const W = fc.W, H = fc.H;
    const portrait = H > W * 1.1;
    const target = Math.min(H * (portrait ? 0.34 : 0.4), W * (portrait ? 0.62 : 0.5));
    const cy = H * (portrait ? 0.38 : 0.37);
    return { W, H, cx: W / 2, cy, target, footY: cy + target * 0.5, portrait };
  }

  function burst(L) {
    const n = reduce ? 4 : finalForm ? 22 : 16;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (reduce ? 160 : 420) + Math.random() * (finalForm ? 900 : 700);
      const kind = i % 3 === 0 ? "star" : i % 3 === 1 ? "streak" : "dot";
      const forward = Math.cos(a) > 0.2;
      parts.add({
        x: L.cx + Math.cos(a) * L.target * 0.62,
        y: L.cy + Math.sin(a) * L.target * 0.42,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        drag: kind === "streak" ? 0.93 : 0.95, g: kind === "star" ? 160 : 0,
        max: 0.9 + Math.random() * (finalForm ? 1.4 : 1.0),
        size: kind === "star" ? 5 + Math.random() * (L.target * 0.04) : kind === "streak" ? 2 + Math.random() * 2 : 2 + Math.random() * 3,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8,
        kind, color: palette[i % palette.length],
        behind: !forward,
      });
    }
  }

  function frame(now) {
    if (finished) return;
    try {
      const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let t = (now - t0) / 1000;
    if (skipAt >= 0 && t < T.out) { t0 -= (T.out - t) * 1000; t = T.out; }
    const L = layout();
    const { W, H, cx, cy, target, footY } = L;
    const scale = target / baseHeight(def.id, evo);
    const tf = t * 60; // tiempo en "frames" como el juego

    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // salida
    const out = seg(t, T.out, T.end);
    const fade = 1 - easeInOut(out);

    // sacudida
    const shakeK = reduce ? 0 : seg(t, T.flash, T.flash + (finalForm ? 0.6 : 0.42));
    if (shakeK > 0 && shakeK < 1) {
      const amp = (1 - shakeK) * (finalForm ? 8 : 6);
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    }

    // 1 · fondo
    const dark = easeOut(seg(t, 0, T.dark)) * fade;
    const charge = seg(t, T.charge, T.flash);
    const revealK = seg(t, T.reveal, T.reveal + 0.5);
    drawBackdrop(ctx, W, H, cx, cy, accent, dark, (0.35 + charge * 0.5 + revealK * 0.4) * fade);
    const rayA = (0.18 + charge * 0.18 + revealK * 0.24) * dark;
    const R = Math.hypot(W, H) * 0.75;
    const spin = reduce ? 0 : t * (0.25 + charge * 0.6 + revealK * 0.2);
    drawRays(ctx, cx, cy, R, accent, rayA * 0.07, spin, finalForm ? 6 : 5);
    if (!reduce) drawRays(ctx, cx, cy, R * 0.7, finalForm ? color : light, rayA * 0.025, -spin * 0.7, 4);

    // 2 · anillos de energía durante la carga
    if (!reduce && t < T.flash) {
      for (let i = 0; i < 2; i++) {
        const kk = ((t * (1.1 + charge * 2.5) + i / 3) % 1);
        const ring = 1 - kk; // hacia dentro
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = seg(t, T.oldIn, T.charge) * Math.sin(kk * Math.PI) * (0.22 + charge * 0.12);
        ctx.strokeStyle = i % 2 ? "#ffffff" : accent;
        ctx.lineWidth = 1.5 + charge * 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, target * (0.58 + ring * 0.42), target * (0.58 + ring * 0.42), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3 · partículas que convergen
    if (!reduce && t > T.oldIn && t < T.flash - 0.08) {
      spawnAcc += dt * (40 + charge * 220) * (finalForm ? 1.5 : 1);
      while (spawnAcc > 1) {
        spawnAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.max(W, H) * (0.45 + Math.random() * 0.25);
        parts.add({
          x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
          vx: 0, vy: 0, to: { x: cx, y: cy }, swirl: (Math.random() < 0.5 ? -1 : 1) * 900,
          max: 3, size: 1.6 + Math.random() * 2.4, kind: Math.random() < 0.5 ? "streak" : "dot",
          color: palette[(Math.random() * palette.length) | 0], behind: true,
        });
      }
    }
    // destellos de ambiente tras la revelación
    if (t > T.reveal && t < T.out) {
      sparkAcc += dt * (reduce ? 6 : finalForm ? 40 : 24);
      while (sparkAcc > 1) {
        sparkAcc -= 1;
        const back = 0.25 + Math.random() * 0.7;
        parts.add({
          x: cx - target * back, y: cy + (Math.random() - 0.45) * target * 0.7,
          vx: -(40 + Math.random() * 90), vy: -24 - Math.random() * 50, drag: 0.99,
          max: 0.7 + Math.random() * 0.7,
          size: 3 + Math.random() * (target * 0.03), kind: "spark",
          color: palette[(Math.random() * palette.length) | 0], behind: true,
        });
      }
    }

    const covers = (p) => Math.abs(p.x - cx) < target * 0.36 && p.y < footY + 4 && p.y > cy - target * 0.8;
    const behindSpark = (p) => p.behind || covers(p) || p.x < cx;
    parts.update(dt);
    ctx.save();
    ctx.globalAlpha = fade;
    parts.draw(ctx, behindSpark);
    ctx.restore();

    // 4 · personaje
    // Una sola fuente de verdad visual: el arte orgánico de characters/art.
    // La transición es un crossfade continuo, no un parpadeo entre dos dibujos
    // ni una silueta geométrica superpuesta.
    const morphK = easeInOut(seg(t, T.charge, T.flash));
    const introK = easeOut(seg(t, T.oldIn, T.oldIn + 0.35));
    const box = target * 2.2;
    const bob = reduce ? 0 : Math.sin(t * 2.2) * target * 0.010;
    const centerY = footY + bob;

    ctx.save();
    ctx.globalAlpha = fade;

    // Sombra/halo muy limpio para anclar al héroe a la escena.
    const ground = ctx.createRadialGradient(cx, footY, 0, cx, footY, target * 0.72);
    ground.addColorStop(0, rgba(accent, 0.24));
    ground.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.ellipse(cx, footY, target * 0.72, target * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    if (t < T.flash) {
      // Forma anterior: entra y se mantiene estable, sin jitter aleatorio.
      const oldAlpha = (1 - morphK) * clamp(introK + 0.18, 0, 1);
      if (oldAlpha > 0.001) {
        const oldScale = scale * (0.96 + introK * 0.04) * (1 - morphK * 0.035);
        ctx.save();
        ctx.globalAlpha = oldAlpha;
        drawDummy(ctx, pOld, cx, centerY, oldScale, tf);
        ctx.restore();
      }

      // Forma nueva: aparece progresivamente desde una escala menor y ocupa
      // exactamente el mismo centro y la misma línea de pies.
      if (morphK > 0.001) {
        const grow = easeOut(morphK);
        const newAlpha = morphK;
        const newScale = scale * (0.76 + 0.24 * grow);
        ctx.save();
        ctx.globalAlpha = newAlpha;
        drawDummy(ctx, pNew, cx, centerY, newScale, tf);
        ctx.restore();
      }

      // Un único anillo de carga para comunicar la transformación.
      if (!reduce && morphK > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.08 + morphK * 0.14;
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1.5, target * 0.018);
        ctx.beginPath();
        ctx.arc(cx, cy, target * (0.72 + morphK * 0.22), -Math.PI * 0.92, Math.PI * 0.92);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Revelación: el nuevo diseño orgánico aparece una vez, limpio y legible.
      const pop = reduce ? 1 : easeBack(revealK);
      const sc = scale * (0.78 + 0.22 * pop);

      ctx.save();
      ctx.globalAlpha = 0.98;
      drawDummy(ctx, pNew, cx, centerY, sc, tf);
      ctx.restore();

      if (!reduce) {
        const ringK = easeOut(seg(t, T.reveal, T.reveal + 0.65));
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (1 - ringK) * 0.52;
        ctx.strokeStyle = light;
        ctx.lineWidth = Math.max(1.5, target * 0.018);
        ctx.beginPath();
        ctx.arc(cx, footY, target * (0.72 + ringK * 0.46), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();

    // 5 · destello + onda + estallido
    if (t >= T.flash && !flashed) { flashed = true; sfx("evoFlash"); }
    if (flashed && !fanfared && t >= T.reveal + 0.25) { fanfared = true; sfx(finalForm ? "evoFinalFanfare" : "evoFanfare"); }
    if (flashed && !burstDone) { burstDone = true; burst(L); }
    if (!reduce) {
      ctx.save();
      ctx.globalAlpha = fade;
      const dt2 = t - T.flash;
      const maxR = Math.hypot(W, H) * 0.42;
      drawRing(ctx, cx, footY, target * 0.95, seg(dt2, 0.0, 0.55), light, target * 0.014, 0.20);
      // anillos lentos alrededor del personaje revelado
      // No additional rings after the reveal: keep the organic design readable.
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = fade;
    parts.draw(ctx, (p) => !behindSpark(p));
    ctx.restore();
    const flashA = reduce ? 0.14 * (1 - seg(t, T.flash, T.flash + 0.14)) * (t >= T.flash ? 1 : 0)
      : (t < T.flash
        ? Math.pow(seg(t, T.flash - 0.06, T.flash), 3) * 0.42
        : Math.pow(1 - seg(t, T.flash, T.flash + 0.16), 3) * 0.36);
    if (flashA > 0.001) {
      // destello radial (luz, no niebla): blanco en el centro, color hacia fuera
      const fr = Math.hypot(W, H) * 0.7;
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
      fg.addColorStop(0, "rgba(255,255,255," + flashA + ")");
      fg.addColorStop(0.35, "rgba(255,255,255," + flashA * 0.85 + ")");
      fg.addColorStop(1, rgba(light, flashA * 0.5));
      ctx.fillStyle = fg;
      ctx.fillRect(-40, -40, W + 80, H + 80);
    }

    // 6 · rótulos
    const txt = seg(t, T.reveal + (reduce ? 0 : 0.12), T.reveal + (reduce ? 0.2 : 0.55));
    if (txt > 0) {
      const base = Math.min(W * (L.portrait ? 0.105 : 0.07), H * 0.088, 100);
      const size = Math.max(30, base);
      const slam = reduce ? 1 : easeBack(txt);
      const ty = Math.min(H - size * 2.7, footY + target * 0.12 + size * 1.05);
      ctx.save();
      ctx.globalAlpha = clamp(txt * 2, 0, 1) * fade;
      // kicker
      drawTitle(ctx, "✦ " + story.kicker + " ✦", cx, ty - size * 0.82, Math.max(13, size * 0.3),
        tint(accent, 0.6), { font: FONT_BODY, weight: 800, spacing: "0.35em", stroke: false, glow: accent });
      // nombre
      ctx.save();
      ctx.translate(cx, ty);
      const s = lerp(1.6, 1, slam);
      ctx.scale(s, s);
      drawTitle(ctx, title, 0, 0, size, finalForm ? ["#fff6c8", accent, light] : ["#ffffff", light, accent],
        { maxWidth: W * 0.92 / s, glow: rgba(accent, 0.9) });
      ctx.restore();
      // barra y forma
      const sub = seg(t, T.reveal + 0.3, T.reveal + 0.7) * (reduce ? 0 : 1) + (reduce ? 1 : 0);
      ctx.globalAlpha = sub * fade;
      const y2 = ty + size * 0.85;
      const bw = Math.min(W * 0.5, size * 4) * easeOut(sub);
      const lg = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
      lg.addColorStop(0, rgba(accent, 0)); lg.addColorStop(0.5, rgba(accent, 1)); lg.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(cx - bw / 2, y2 - 1, bw, 2);
      drawTitle(ctx, "FORMA " + (evo + 1) + "/5", cx, y2 + size * 0.36, Math.max(13, size * 0.28), "#ffffff",
        { font: FONT_BODY, weight: 800, spacing: "0.3em", stroke: false });
      // pips de forma
      const pipY = y2 + size * 0.72, pipR = Math.max(4, size * 0.07), gap = pipR * 3.2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(cx + (i - 2) * gap, pipY, pipR, 0, Math.PI * 2);
        ctx.fillStyle = i <= evo ? (i === evo ? "#ffffff" : accent) : "rgba(255,255,255,0.18)";
        ctx.fill();
      }
      // La cinemática solo comunica el cambio de forma.
      // La historia y la habilidad desbloqueada se anuncian una sola vez por MessageManager.
      ctx.restore();
    }
    // Pista mínima para continuar o saltar la cinemática.
    if (t > 0.65 && t < T.out) {
      ctx.save();
      ctx.globalAlpha = 0.5 * seg(t, 0.8, 1.2);
      drawTitle(ctx, "Toca o pulsa una tecla para continuar", cx, H - 22, 11, "#cfe0f2",
        { font: FONT_BODY, weight: 600, spacing: "0.16em", stroke: false });
      ctx.restore();
    }

    ctx.restore();
    if (t >= T.end) { finish(); return; }
    raf = requestAnimationFrame(frame);
    } catch (err) {
      console.error("[ohana] evolution cinema recovered from render error", { id: def.id, evo, err });
      finish(true);
    }
  }

  function onSkip(e) {
    const t = (performance.now() - t0) / 1000;
    if (t < 0.8) return;
    if (e && e.type === "keydown") { e.preventDefault(); e.stopPropagation(); }
    if (skipAt < 0) skipAt = t;
  }

  function finish(silent) {
    if (finished) return;
    finished = true;
    if (failSafe) clearTimeout(failSafe);
    cancelAnimationFrame(raf);
    removeEventListener("keydown", onSkip, true);
    el.removeEventListener("pointerdown", onSkip);
    ctx.setTransform(fc.dpr, 0, 0, fc.dpr, 0, 0);
    ctx.clearRect(0, 0, fc.W, fc.H);
    el.classList.remove("show", "finale");
    duckMusic(false);
    running = null;
    if (!silent) {
      document.querySelectorAll(".game-notification.evo").forEach((n) => n.click());
      try { window.dispatchEvent(new CustomEvent("ohana-evolve-done", { detail: { id: def.id, evo } })); } catch (_) {}
    }
  }

  addEventListener("keydown", onSkip, true);
  el.addEventListener("pointerdown", onSkip);
  running = { stop: finish };
  loadFonts();
  // Fail-safe: a rendering exception, stalled RAF or browser hiccup must never
  // leave #evo-stage visible and the gameplay permanently blocked.
  failSafe = setTimeout(() => finish(true), Math.max(3500, (T.end + 1.5) * 1000));
  raf = requestAnimationFrame(frame);
}

if (!window.__ohanaEvoCinema) {
  window.__ohanaEvoCinema = true;
  addEventListener("ohana-evolve", (e) => playEvolution((e && e.detail) || {}));
}
