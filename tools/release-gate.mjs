import fs from "node:fs";
import { ROSTER } from "../characters/roster.js";
import { ROOMS } from "../systems/map.js";
import {
  EVOLUTION_STAGES,
  EVOLUTION_COMBAT_STAGES,
  EVOLUTION_SIGNATURES,
  EVOLUTION_FINAL_DESIGNS,
  evolutionProfile,
} from "../characters/evolution.js";

const read = (file) => fs.readFileSync(file, "utf8");
const errors = [];
const manifest = JSON.parse(read("manifest.json"));
const index = read("index.html");
const progress = read("PROGRESS.md");
const improvements = read("IMPROVEMENTS.md");
const readme = read("README.md");
const sw = read("sw.js");
const packageJson = JSON.parse(read("package.json"));
const multiplayerPage = read("multiplayer.html");
const multiplayerClient = read("multiplayer.js");
const multiplayerFunction = read("netlify/functions/game.ts");
const netlifyConfig = read("netlify.toml");

const activeCharacters = ROSTER.length;
const formsPerCharacter = activeCharacters ? Math.min(...ROSTER.map((character) => character.forms.length)) : 0;
const roomCount = Object.keys(ROOMS).length;

if (activeCharacters !== 10) errors.push("se esperan 10 personajes activos");
if (formsPerCharacter !== 5 || ROSTER.some((character) => character.forms.length !== 5)) errors.push("cada personaje debe tener 5 formas");
if (roomCount !== 10) errors.push("se esperan 10 salas");
if (EVOLUTION_STAGES.length !== 5 || EVOLUTION_COMBAT_STAGES.length !== 5) errors.push("la evolución debe tener 5 etapas");
if (EVOLUTION_SIGNATURES.length !== 50 || new Set(EVOLUTION_SIGNATURES).size !== 50) errors.push("se esperan 50 firmas de evolución únicas");
if (Object.keys(EVOLUTION_FINAL_DESIGNS).length !== 10) errors.push("se esperan 10 diseños finales");

const motifs = Object.values(EVOLUTION_FINAL_DESIGNS).map((design) => design.motif);
if (new Set(motifs).size !== motifs.length) errors.push("los motivos finales no son únicos");

const combatValues = ROSTER.flatMap((character) =>
  EVOLUTION_COMBAT_STAGES.map((stage) => evolutionProfile({ id: character.id, evo: stage.id }).combat.attack)
);
if (combatValues.some((value) => !Number.isFinite(value) || value <= 0)) errors.push("hay valores de combate de evolución no válidos");

for (const [content, label] of [
  [manifest.description || "", "manifest"],
  [readme, "README"],
  [progress, "PROGRESS"],
  [improvements, "IMPROVEMENTS"],
]) {
  if (!new RegExp(activeCharacters + "\\s+personajes", "i").test(content)) errors.push(label + ": falta cifra de personajes");
  if (!new RegExp(formsPerCharacter + "\\s+formas", "i").test(content)) errors.push(label + ": falta cifra de formas");
  if (!new RegExp(roomCount + "\\s+salas", "i").test(content)) errors.push(label + ": falta cifra de salas");
}

const swVersion = sw.match(/const VERSION = "(ohana-\d+)"/)?.[1] || "";
const indexVersions = [...index.matchAll(/ohana-(\d+)/g)].map((match) => match[0]);
if (!swVersion) errors.push("sw.js: falta VERSION");
if (new Set(indexVersions).size !== 1 || indexVersions[0] !== swVersion) errors.push("index.html y sw.js no comparten una única versión");
if (swVersion && !progress.includes(swVersion)) errors.push("PROGRESS no refleja la caché actual");

const precacheStart = sw.indexOf("const PRECACHE = [");
const precacheEnd = sw.indexOf("];", precacheStart);
if (precacheStart < 0 || precacheEnd < 0) errors.push("sw.js: PRECACHE no es parseable");
const precacheBlock = precacheStart >= 0 && precacheEnd >= 0 ? sw.slice(precacheStart, precacheEnd) : "";
const precacheEntries = [...precacheBlock.matchAll(/"\.\/([^"]+)(?:\?v=" \+ VERSION)?"/g)]
  .map((match) => match[1])
  .filter(Boolean);
const duplicateEntries = precacheEntries.filter((value, i, all) => all.indexOf(value) !== i);
if (duplicateEntries.length) errors.push("PRECACHE contiene duplicados: " + [...new Set(duplicateEntries)].join(", "));

const runtimeFiles = ["./game.js"];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = dir + "/" + entry.name;
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && entry.name.endsWith(".js")) runtimeFiles.push(file);
  }
};
for (const dir of ["./characters", "./engine", "./systems", "./worlds"]) walk(dir);

const jsPrecache = new Set(
  [...sw.matchAll(/"\.\/([^"]+\.js)\?v=" \+ VERSION/g)].map((match) => match[1])
);
for (const file of runtimeFiles) {
  const normalized = file.replace(/^\.\//, "");
  if (!jsPrecache.has(normalized)) errors.push("JS fuera del precache: " + normalized);
}
if (jsPrecache.size !== runtimeFiles.length) errors.push("precache JS y runtime no tienen cardinalidad idéntica");

const referencedAssets = [...new Set(
  precacheEntries.map((value) => value.split(/[?#]/, 1)[0]).filter((value) => value && value !== ".")
)];
for (const asset of referencedAssets) {
  if (!fs.existsSync("./" + asset)) errors.push("recurso precacheado inexistente: " + asset);
}

if (packageJson.scripts?.test !== "node --test tests/*.js") {
  errors.push("package.json: script test inesperado");
}
if (packageJson.scripts?.["test:browser"] !== "node tests/browser/e2e.mjs") errors.push("package.json: falta test:browser esperado");
if (packageJson.scripts?.["test:browser:multiplayer"] !== "node tests/browser/multiplayer-e2e.mjs") errors.push("package.json: falta test:browser:multiplayer");
if (packageJson.scripts?.["test:visual"] !== "node tests/browser/visual-regression.mjs") errors.push("package.json: falta test:visual");
if (packageJson.scripts?.["release:check"] !== "node tools/release-gate.mjs") errors.push("package.json: falta release:check");

if (!progress.includes("node tests/browser/e2e.mjs")) errors.push("PROGRESS: falta E2E real");
if (!progress.includes("node tests/browser/visual-regression.mjs")) errors.push("PROGRESS: falta matriz visual");
if (!progress.includes("release:check")) errors.push("PROGRESS: falta release gate");

const messageSources = [
  ["game.js", read("game.js")],
  ["systems/demo.js", read("systems/demo.js")],
  ["systems/boss-nido.js", read("systems/boss-nido.js")],
];
for (const [file, source] of messageSources) {
  if (/\bshowNotification\s*\(/.test(source)) errors.push(file + ": usa el legacy showNotification");
}
for (const [file, source] of [
  ["index.html", index],
  ["demo.css", read("demo.css")],
]) {
  if (/demo-ribbon|demo-obj|demo-tut|id=["']room-banner["']/.test(source)) {
    errors.push(file + ": contiene overlay legacy retirado");
  }
}

if (!fs.existsSync("./systems/message-manager.js")) errors.push("falta MessageManager");
if (!fs.existsSync("./systems/objectives.js")) errors.push("falta objectives.js");
if (!fs.existsSync("./systems/evolution-timing.js")) errors.push("falta evolution-timing.js");
if (!fs.existsSync("./systems/combat-feedback.js")) errors.push("falta combat-feedback.js");

if (!multiplayerPage.includes('href="./multiplayer.html"') && !index.includes('href="./multiplayer.html"')) errors.push("falta entrada al modo cooperativo desde World 1");
if (!multiplayerClient.includes('const endpoint = "/.netlify/functions/game"')) errors.push("multiplayer.js debe llamar directamente a /.netlify/functions/game");
if (/\/api\/game|config\.path/.test(multiplayerClient + multiplayerFunction + netlifyConfig)) errors.push("la función multiplayer no debe usar /api/game ni config.path");
if (!multiplayerFunction.includes('"cache-control": "no-store, max-age=0"')) errors.push("la función multiplayer debe responder Cache-Control: no-store");
if (!sw.includes('url.pathname.endsWith("/.netlify/functions/game")')) errors.push("el Service Worker debe excluir explícitamente la función multiplayer");
if (!netlifyConfig.includes('functions = "netlify/functions"')) errors.push("netlify.toml debe registrar el directorio estándar de Functions");
if (!fs.existsSync("./netlify/lib/room-service.mjs")) errors.push("la lógica reutilizable de salas debe vivir fuera de netlify/functions");

if (errors.length) {
  console.error("[OHANA] RELEASE GATE FAIL");
  for (const error of errors) console.error(" - " + error);
  process.exit(1);
}

console.log("[OHANA] RELEASE GATE PASS");
console.log(" - cache: " + swVersion);
console.log(" - " + activeCharacters + " personajes / " + formsPerCharacter + " formas / " + roomCount + " salas");
console.log(" - " + runtimeFiles.length + " módulos JS runtime precacheados");
console.log(" - " + referencedAssets.length + " recursos precacheados existentes");
console.log(" - scripts: test + test:browser + test:browser:multiplayer + release:check");
