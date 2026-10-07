export const ROOM_W = 2240;
export const ROOM_H = 1260;

function stairs(x) {
  return [
    [x - 90, 700, 300, 22],
    [x - 60, 580, 280, 22],
    [x - 40, 460, 280, 22],
    [x - 20, 340, 280, 22],
    [x - 10, 220, 280, 22],
    [x, 110, 280, 22]
  ];
}

export const MAP_LAYOUT = [
  [null, "ridge", "space", null, null, null],
  ["lab", "cave", "hub", "beach", "jungle", null],
  [null, null, null, "reef", "volcano", "boss"]
];

export const ROOMS = {
  hub: {
    id: "hub", name: "Claro Ohana", short: "Claro", world: 6,
    doors: { right: "beach", left: "cave", up: "ridge", down: null },
    hint: "Piso bajo. ESTE costa · OESTE cueva · centro ARRIBA cumbre. Catapulta ESTE → Costa.",
    plats: [[0, 810, 1600, 90], [80, 680, 160, 18], [300, 620, 150, 18], ...stairs(760)],
    foes: [[620, 200, "cucaracho"], [980, 200, "cucaracho"], [1180, 200, "phosquito"]],
    orbs: [[400, 500], [900, 200]],
    portals: [{ type: "catapult", x: 330, y: 586, w: 100, h: 34, dest: "beach", label: "Costa" }]
  },
  beach: {
    id: "beach", name: "Costa Hoku", short: "Costa", world: 0,
    doors: { left: "hub", right: "jungle", up: null, down: "reef" },
    pit: true,
    hint: "Pozo central BAJA al Arrecife (agua). Forma 3 abre ESTE a la jungla. Catapulta OESTE → Claro.",
    plats: [
      [0, 810, 600, 90],
      [880, 810, 720, 90],
      [160, 680, 150, 18],
      [360, 560, 140, 18],
      [1000, 660, 160, 18],
      [1220, 540, 150, 18]
    ],
    foes: [[280, 200, "cucaracho"], [980, 200, "planta"], [420, 200, "cangrejo", true], [1180, 200, "cangrejo"], [560, 380, "gaviota"], [1280, 320, "gaviota"]],
    orbs: [[220, 620], [1280, 480]],
    portals: [
      { type: "catapult", x: 185, y: 646, w: 100, h: 34, dest: "hub", label: "Claro" }
    ]
  },
  jungle: {
    id: "jungle", name: "Jungla Alta", short: "Jungla", world: 1,
    doors: { left: "beach", right: null, up: null, down: "volcano" },
    needEvo: 2,
    pit: true,
    hint: "Fila media, ESTE. Hueco central ABAJO = Caldera (forma 4). BH → Caldera.",
    plats: [[0, 810, 680, 90], [920, 810, 680, 90], [180, 680, 150, 18], ...stairs(200)],
    foes: [[360, 440, "libelula"], [820, 480, "mosquito"], [1280, 460, "abeja"], [640, 200, "rana", true]],
    orbs: [[520, 420], [800, 180]],
    portals: [{ type: "blackhole", x: 1170, y: 710, w: 80, h: 80, dest: "volcano", label: "Caldera" }]
  },
  cave: {
    id: "cave", name: "Cueva Azul", short: "Cueva", world: 4,
    doors: { right: "hub", left: "lab", up: null, down: null },
    hint: "OESTE lab (forma 2). ESTE claro.",
    plats: [[0, 810, 1600, 90], [180, 660, 160, 18], [480, 520, 150, 18], [880, 620, 180, 18], [1180, 470, 150, 18]],
    foes: [[360, 200, "planta"], [720, 280, "murcielago"], [1100, 240, "murcielago"], [480, 200, "arana", true], [1240, 200, "arana"], [1040, 200, "phosquito"]],
    orbs: [[500, 420], [1200, 400]]
  },
  lab: {
    id: "lab", name: "Alien Lab", short: "Lab", world: 4,
    doors: { right: "cave", left: null, up: null, down: null },
    needEvo: 1,
    hint: "Solo salida ESTE. Si llueve, el paraguas está en el suelo.",
    plats: [[0, 810, 1600, 90], [180, 660, 180, 18], [480, 520, 180, 18], [860, 380, 180, 18], [1220, 540, 180, 18]],
    foes: [[400, 200, "planta"], [820, 200, "phosquito"], [1240, 200, "cucaracho"], [640, 200, "cucaracho"], [1000, 280, "arana"], [280, 280, "murcielago"]],
    orbs: [[520, 440], [900, 300]]
  },
  ridge: {
    id: "ridge", name: "Cumbre", short: "Cumbre", world: 3,
    doors: { down: "hub", right: "space", left: null, up: null },
    pit: true,
    hint: "Hueco central ABAJO = Claro. ESTE = órbita.",
    plats: [[0, 810, 680, 90], [920, 810, 680, 90], [200, 660, 160, 18], [500, 520, 150, 18], [1040, 620, 160, 18]],
    foes: [[480, 200, "phosquito"], [860, 200, "cucaracho"], [1200, 200, "cucaracho"], [320, 280, "murcielago"], [1040, 240, "murcielago"], [700, 200, "arana"]],
    orbs: [[720, 420], [1100, 280]]
  },
  space: {
    id: "space", name: "Órbita", short: "Órbita", world: 3,
    doors: { left: "ridge", down: "hub", right: null, up: null },
    needEvo: 1,
    pit: true,
    hint: "Pozo central ABAJO = Claro. BH secreto → Arrecife abajo.",
    plats: [[0, 810, 680, 90], [920, 810, 680, 90], [220, 640, 150, 18], [560, 480, 150, 18], [1100, 360, 160, 18]],
    foes: [[420, 280, "ufo", true], [980, 220, "ufo"], [640, 200, "phosquito"], [1280, 300, "brasita"]],
    orbs: [[640, 390], [1120, 260]],
    portals: [{ type: "blackhole", x: 1270, y: 270, w: 80, h: 80, dest: "reef", label: "→ Arrecife" }]
  },
  reef: {
    id: "reef", name: "Arrecife Abismo", short: "Arrecife", world: 5,
    doors: { left: null, right: null, up: "beach", down: null },
    hint: "Arriba = Costa. Peces y medusas (sueltan orbes). BH puede seguir a Órbita como atajo.",
    plats: [[0, 810, 1600, 90], [200, 660, 190, 18], [560, 520, 190, 18], [920, 640, 190, 18], [1220, 480, 190, 18], [740, 360, 180, 18]],
    foes: [[420, 300, "medusa"], [1040, 260, "medusa"], [280, 400, "pez"], [620, 360, "pez"], [900, 440, "pez"], [1100, 400, "pez"], [560, 340, "anguila", true], [1280, 380, "anguila"]],
    orbs: [[300, 560], [640, 440], [1000, 560], [1300, 400], [820, 280]],
    portals: [
      { type: "blackhole", x: 90, y: 710, w: 80, h: 80, dest: "space", label: "← Órbita" },
      { type: "catapult", x: 1280, y: 446, w: 100, h: 34, dest: "beach", label: "Costa" }
    ]
  },
  volcano: {
    id: "volcano", name: "Caldera", short: "Caldera", world: 2,
    doors: { left: "jungle", up: "jungle", right: "boss", down: null },
    needEvo: 3,
    hint: "Llegaste por el hueco de la Jungla. ESTE = nido. BH → Jungla.",
    plats: [[0, 810, 1600, 90], ...stairs(760)],
    foes: [[480, 200, "planta"], [720, 200, "escoria", true], [1100, 200, "escoria"], [560, 360, "brasita"], [1280, 300, "brasita"]],
    orbs: [[660, 200], [1100, 540]],
    portals: [{ type: "blackhole", x: 190, y: 710, w: 80, h: 80, dest: "jungle", label: "Jungla" }]
  },
  boss: {
    id: "boss", name: "Nido Final", short: "Nido", world: 2,
    doors: { left: "volcano", right: null, up: null, down: null },
    needEvo: 3,
    hint: "El monstruo está aquí. Prepárate. OESTE huye.",
    plats: [[0, 810, 1600, 90], [180, 620, 180, 18], [700, 500, 200, 18], [1180, 620, 180, 18]],
    foes: [],
    orbs: [[800, 420]],
    boss: true
  }
};

const SIGNATURES = {
  hub: "kilo", beach: "stitcho", jungle: "chispin", cave: "cat", lab: "dragon",
  ridge: "dino", space: "frita", reef: "pizza", volcano: "yomi", boss: "cuerno"
};

const SCALE = 1.4;
const LAYOUT = {
  hub: [[0,1134,2240,126],[180,960,220,22],[460,800,220,22],[860,980,200,22],[1080,820,200,22],[1300,660,200,22],[1520,500,200,22],[1740,340,200,22],[1900,180,220,22]],
  beach: [[0,1134,900,126],[1340,1134,900,126],[200,960,200,22],[480,780,200,22],[780,1000,220,22],[1040,930,180,22],[1500,960,200,22],[1760,760,200,22]],
  jungle: [[0,1134,900,126],[1340,1134,900,126],[160,960,180,22],[160,760,180,22],[380,560,180,22],[160,360,180,22],[380,180,180,22],[840,1000,200,22],[1040,920,180,22],[1560,960,200,22]],
  cave: [[0,1134,2240,126],[220,960,200,22],[520,780,200,22],[860,960,220,22],[1200,760,220,22],[1560,560,220,22],[1880,760,200,22]],
  lab: [[0,1134,2240,126],[200,980,220,22],[500,800,220,22],[840,600,220,22],[1200,420,220,22],[1600,640,220,22],[1920,860,200,22]],
  ridge: [[0,1134,900,126],[1340,1134,900,126],[180,960,200,22],[440,760,200,22],[840,1000,200,22],[1040,920,180,22],[1500,900,200,22],[1780,700,200,22]],
  space: [[0,1134,900,126],[1340,1134,900,126],[200,960,200,22],[480,740,200,22],[840,1000,200,22],[1040,920,180,22],[1520,860,220,22],[1800,620,220,22]],
  reef: [[0,1134,2240,126],[200,980,220,22],[500,800,220,22],[860,620,220,22],[1200,800,220,22],[1560,600,220,22],[1880,420,220,22]],
  volcano: [[0,1134,2240,126],[200,960,200,22],[1500,980,200,22],[1720,800,200,22],[1940,620,200,22],[1720,440,200,22],[1940,260,200,22]],
  boss: [[0,1134,2240,126],[280,900,240,22],[980,720,280,22],[1680,900,240,22]]
};
for (const room of Object.values(ROOMS)) {
  room.signatureCharacter = SIGNATURES[room.id] || "kilo";
  room.plats = LAYOUT[room.id] || room.plats;
  const cast = {
    hub: ["cucaracho", "cucaracho", "phosquito"],
    beach: ["cangrejo", "cangrejo", "gaviota", "gaviota"],
    jungle: ["libelula", "mosquito", "abeja", "rana"],
    cave: ["murcielago", "arana", "arana", "murcielago"],
    lab: ["phosquito", "ufo", "cucaracho"],
    ridge: ["gaviota", "murcielago", "murcielago"],
    space: ["ufo", "ufo", "phosquito"],
    reef: ["medusa", "pez", "anguila", "pez"],
    volcano: ["escoria", "escoria", "brasita", "brasita"]
  }[room.id];
  room.foes = (room.foes || []).map((f, i) => [Math.round(f[0] * SCALE), Math.round(f[1] * SCALE), cast ? cast[i % cast.length] : f[2], f[3]].filter((v) => v !== undefined));
  room.orbs = (room.orbs || []).map(([x, y]) => [Math.round(x * SCALE), Math.round(y * SCALE)]);
  for (const portal of room.portals || []) {
    const floors = room.plats.filter((pl) => pl[3] > 40).sort((a, b) => a[0] - b[0]);
    const floor = portal.type === "catapult" ? floors[0] : floors[floors.length - 1];
    if (!floor) continue;
    portal.w = portal.type === "blackhole" ? 96 : 120;
    portal.h = portal.type === "blackhole" ? 96 : 36;
    portal.x = portal.type === "catapult" ? floor[0] + 160 : floor[0] + Math.max(80, floor[2] - 280);
    portal.y = floor[1] - portal.h;
  }
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawSigns(ctx, room, cam, t, evo) {
  if (!room || !cam) return;
  const pulse = 0.5 + Math.sin(t / 8) * 0.18;
  const stage = evo || 0;

  // One clean, glowing sign per door. `anchor` = "left" | "right" | "center".
  function sign(wx, wy, arrow, destId, anchor) {
    const dest = ROOMS[destId];
    const lock = dest && dest.needEvo != null && stage < dest.needEvo;
    const label = dest ? (lock ? ("Forma " + (dest.needEvo + 1)) : (dest.short || dest.name || destId)) : destId;
    const text = arrow + "  " + label;
    ctx.save();
    ctx.font = "800 14px Outfit, system-ui, sans-serif";
    const w = Math.max(92, ctx.measureText(text).width + 28);
    const h = 32;
    let x = wx - cam.x;
    if (anchor === "right") x -= w;
    else if (anchor === "center") x -= w / 2;
    const y = wy - cam.y;
    const c = lock ? "255,150,170" : "126,231,255";
    ctx.shadowColor = "rgba(" + c + "," + (0.55 * pulse) + ")";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(8,16,22,.85)";
    rrect(ctx, x, y, w, h, 11); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(" + c + "," + (0.55 + pulse * 0.4) + ")";
    ctx.lineWidth = 1.5;
    rrect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 10); ctx.stroke();
    ctx.fillStyle = lock ? "#ffc2cd" : "#eafcff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }
  function wall(x, y, w, h) {
    ctx.fillStyle = "rgba(12,14,20,.88)";
    ctx.fillRect(x - cam.x, y - cam.y, w, h);
    ctx.fillStyle = "rgba(90,100,120,.4)";
    for (let i = 0; i < w; i += 20) ctx.fillRect(x - cam.x + i, y - cam.y, 8, h);
  }
  // Pit indicator (single): dark elliptical hole + swirl + label at bottom-centre gap.
  function pit(label, deadly) {
    const x = ROOM_W / 2 - cam.x, y = ROOM_H - 84 - cam.y;
    const c = deadly ? "255,120,140" : "126,231,255";
    const rim = deadly ? "40,8,14" : "6,28,40";
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // dark elliptical rim / mouth of the pit
    ctx.beginPath();
    ctx.ellipse(x, y + 36, 78, 28, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(" + rim + ",.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(" + c + "," + (0.35 + pulse * 0.35) + ")";
    ctx.lineWidth = 3;
    ctx.stroke();

    // depth mouth (radial): aqua descent vs black-hole mortal
    const hole = ctx.createRadialGradient(x, y + 36, 2, x, y + 36, 52);
    if (deadly) {
      hole.addColorStop(0, "rgba(0,0,0,.98)");
      hole.addColorStop(0.45, "rgba(0,0,0,.85)");
      hole.addColorStop(1, "rgba(0,0,0,0)");
    } else {
      hole.addColorStop(0, "rgba(0,40,60,.95)");
      hole.addColorStop(0.35, "rgba(4,80,110,.78)");
      hole.addColorStop(0.7, "rgba(20,140,170,.35)");
      hole.addColorStop(1, "rgba(40,180,200,0)");
    }
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.ellipse(x, y + 36, 58, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    // soft aqua glow ring for non-mortal descent
    if (!deadly) {
      ctx.strokeStyle = "rgba(126,231,255," + (0.4 + pulse * 0.4) + ")";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(x, y + 36, 82, 30, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // animated swirl / vortex arcs
    ctx.strokeStyle = "rgba(" + c + "," + (0.25 + pulse * 0.35) + ")";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const ang = t / 14 + i * (Math.PI / 2);
      const rx = 18 + i * 8;
      const ry = 6 + i * 3;
      ctx.beginPath();
      ctx.ellipse(x, y + 36, rx, ry, ang * 0.15, ang, ang + 1.4);
      ctx.stroke();
    }

    // chevrons pointing down into the hole
    ctx.strokeStyle = "rgba(" + c + "," + (0.55 + pulse * 0.45) + ")";
    ctx.lineWidth = 3.5;
    for (let i = 0; i < 2; i++) {
      const yy = y + 18 + i * 10 + Math.sin(t / 6 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(x - 14, yy);
      ctx.lineTo(x, yy + 8);
      ctx.lineTo(x + 14, yy);
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    // high-visibility label plate
    ctx.font = "900 16px Outfit, system-ui, sans-serif";
    const tw = Math.max(110, ctx.measureText(label).width + 28);
    const th = 28;
    const lx = x - tw / 2;
    const ly = y - 22;
    ctx.shadowColor = "rgba(" + c + "," + (0.55 * pulse) + ")";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(8,12,18,.9)";
    rrect(ctx, lx, ly, tw, th, 9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(" + c + "," + (0.6 + pulse * 0.35) + ")";
    ctx.lineWidth = 1.6;
    rrect(ctx, lx + 0.5, ly + 0.5, tw - 1, th - 1, 8);
    ctx.stroke();
    ctx.fillStyle = deadly ? "#ffd0d8" : "#eafcff";
    ctx.fillText(label, x, ly + th / 2 + 1);

    ctx.restore();
  }

  if (room.doors.right) sign(ROOM_W - 56, 500, "→", room.doors.right, "right"); else wall(ROOM_W - 16, 80, 20, 700);
  if (room.doors.left) sign(40, 356, "←", room.doors.left, "left"); else wall(-4, 80, 20, 700);
  if (room.doors.up) sign(800, 22, "↑", room.doors.up, "center");

  // Down / pit: exactly ONE indicator.
  if (room.doors.down) {
    if (room.pit) {
      const dest = ROOMS[room.doors.down];
      pit((dest && (dest.short || dest.name)) || "ABAJO", false);
    } else {
      sign(800, ROOM_H - 56, "↓", room.doors.down, "center");
    }
  } else if (room.pit) {
    // Beach pit = visual hint down to Arrecife (not lethal). Other lone pits stay deadly.
    if (room.id === "beach") pit("↓ ARRECIFE", false);
    else pit("POZO MORTAL", true);
  }
}
