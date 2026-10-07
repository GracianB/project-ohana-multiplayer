// ============================================================================
// OHANA MULTIPLAYER · CAMPAIGN
// Shared progression definition. Gameplay state is still owned by the server.
// ============================================================================
export const START_EVOLUTION = 1;
export const START_XP = 55;

const foe = (id, name, kind, x, hp, damage, xp, range = 220, interval = 2600) => ({
  id, name, kind, x, hp, damage, xp, range, interval,
});

export const CAMPAIGN = Object.freeze([
  Object.freeze({
    id: "hoku",
    name: "Costa Hoku",
    chapter: "La costa donde comienza la familia",
    worldId: "beach",
    hint: "Derrotad a las Guardianas de la costa y reuníos en el portal.",
    clearXp: 70,
    boss: false,
    enemies: [
      foe("hoku-crab", "Guardiana Cangrejo", "cangrejo", 600, 86, 14, 45, 230, 2300),
      foe("hoku-gull", "Guardiana Gaviota", "gaviota", 900, 72, 12, 45, 260, 2700),
    ],
  }),
  Object.freeze({
    id: "jungle",
    name: "Jungla Alta",
    chapter: "La selva despierta",
    worldId: "jungle",
    hint: "Avanzad juntos. Los enemigos aéreos obligan a mirar arriba.",
    clearXp: 100,
    boss: false,
    enemies: [
      foe("jungle-frog", "Guardiana Rana", "rana", 560, 104, 17, 55, 220, 2300),
      foe("jungle-bee", "Guardiana Avispa", "avispa", 820, 94, 19, 55, 270, 2600),
      foe("jungle-bat", "Murciélago", "murcielago", 1010, 88, 16, 45, 250, 2900),
    ],
  }),
  Object.freeze({
    id: "caldera",
    name: "Caldera",
    chapter: "El fuego cambia las reglas",
    worldId: "volcano",
    hint: "El calor aprieta. Aprovechad cada apertura y no os separéis.",
    clearXp: 130,
    boss: false,
    enemies: [
      foe("caldera-brasita", "Brasita", "brasita", 560, 120, 20, 65, 250, 2200),
      foe("caldera-escoria", "Escoria", "escoria", 760, 132, 22, 70, 235, 2500),
      foe("caldera-bat", "Murciélago de Lava", "murcielago", 990, 116, 21, 60, 270, 2700),
    ],
  }),
  Object.freeze({
    id: "nest",
    name: "Nido",
    chapter: "La última puerta",
    worldId: "boss",
    hint: "El Nido está abierto. Preparad vuestra evolución para la Reina.",
    clearXp: 160,
    boss: false,
    enemies: [
      foe("nest-spider", "Tejedora del Nido", "arana", 620, 150, 24, 80, 240, 2300),
      foe("nest-wasp", "Centinela del Nido", "avispa", 900, 138, 23, 75, 280, 2500),
    ],
  }),
  Object.freeze({
    id: "queen",
    name: "Reina del Nido",
    chapter: "El corazón de World 1",
    worldId: "boss",
    hint: "La Reina os espera.",
    clearXp: 0,
    boss: true,
    enemies: [],
  }),
]);

export const CAMPAIGN_LENGTH = CAMPAIGN.length;
