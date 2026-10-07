const VERSION = "ohana-223";
const CACHE = "ohana-static-" + VERSION;
const PRECACHE = [
  "./",
  "./index.html",
  "./multiplayer.html?v=" + VERSION,
  "./multiplayer.css?v=" + VERSION,
  "./multiplayer.js?v=" + VERSION,
    './multiplayer/mission.js',
  "./manifest.json",
  "./favicon.svg",
  "./style.css?v=" + VERSION,
  "./title-stage.css?v=" + VERSION,
  "./hud.css?v=" + VERSION,
  "./evo.css?v=" + VERSION,
  "./ending.css?v=" + VERSION,
  "./intro.css?v=" + VERSION,
  "./demo.css?v=" + VERSION,
  "./experience.css?v=" + VERSION,
  "./game.js?v=" + VERSION,
  "./characters/art/_template.js?v=" + VERSION,
  "./characters/art/cat.js?v=" + VERSION,
  "./characters/art/chispin.js?v=" + VERSION,
  "./characters/art/cuerno.js?v=" + VERSION,
  "./characters/art/dino.js?v=" + VERSION,
  "./characters/art/dragon.js?v=" + VERSION,
  "./characters/art/frita.js?v=" + VERSION,
  "./characters/art/index.js?v=" + VERSION,
  "./characters/art/kilo.js?v=" + VERSION,
  "./characters/art/lilo.js?v=" + VERSION,
  "./characters/art/pikachu.js?v=" + VERSION,
  "./characters/art/pizza.js?v=" + VERSION,
  "./characters/art/stitch.js?v=" + VERSION,
  "./characters/art/stitcho.js?v=" + VERSION,
  "./characters/art/yomi.js?v=" + VERSION,
  "./characters/draw.js?v=" + VERSION,
  "./characters/evolution.js?v=" + VERSION,
  "./characters/costume.js?v=" + VERSION,
  "./characters/definitive.js?v=" + VERSION,
  "./characters/look.js?v=" + VERSION,
  "./characters/rig.js?v=" + VERSION,
  "./characters/roster.js?v=" + VERSION,
  "./characters/signature.js?v=" + VERSION,
  "./characters/sprites.js?v=" + VERSION,
  "./engine/audio.js?v=" + VERSION,
  "./engine/boss-art.js?v=" + VERSION,
  "./engine/clock.js?v=" + VERSION,
  "./engine/collide.js?v=" + VERSION,
  "./engine/enemies.js?v=" + VERSION,
  "./engine/foe-brain.js?v=" + VERSION,
  "./engine/foe-rig.js?v=" + VERSION,
  "./engine/foes.js?v=" + VERSION,
  "./engine/input.js?v=" + VERSION,
  "./engine/music.js?v=" + VERSION,
  "./engine/particles.js?v=" + VERSION,
  "./systems/abilities.js?v=" + VERSION,
  "./systems/boss-adaptation.js?v=" + VERSION,
  "./systems/boss-bait-feedback.js?v=" + VERSION,
  "./systems/boss-bait.js?v=" + VERSION,
  "./systems/boss-behavior.js?v=" + VERSION,
  "./systems/boss-combat.js?v=" + VERSION,
  "./systems/boss-counterplay.js?v=" + VERSION,
  "./systems/boss-encounter-memory.js?v=" + VERSION,
  "./systems/boss-fx.js?v=" + VERSION,
  "./systems/boss-hud.js?v=" + VERSION,
  "./systems/boss-nido.js?v=" + VERSION,
  "./systems/combat-fx.js?v=" + VERSION,
  "./systems/combat-feedback.js?v=" + VERSION,
  "./systems/death-fx.js?v=" + VERSION,
  "./systems/demo.js?v=" + VERSION,
  "./systems/dialogs.js?v=" + VERSION,
  "./systems/ending.js?v=" + VERSION,
  "./systems/evo-cinema.js?v=" + VERSION,
  "./systems/floaters.js?v=" + VERSION,
  "./systems/hud.js?v=" + VERSION,
  "./systems/intro.js?v=" + VERSION,
  "./systems/magic.js?v=" + VERSION,
  "./systems/map.js?v=" + VERSION,
  "./systems/mutations.js?v=" + VERSION,
  "./systems/message-manager.js?v=" + VERSION,
  "./systems/notify.js?v=" + VERSION,
  "./systems/evolution-timing.js?v=" + VERSION,
  "./systems/objectives.js?v=" + VERSION,
  "./systems/passives.js?v=" + VERSION,
  "./systems/portals.js?v=" + VERSION,
  "./systems/rain.js?v=" + VERSION,
  "./systems/runtime.js?v=" + VERSION,
  "./systems/save.js?v=" + VERSION,
  "./systems/surprises.js?v=" + VERSION,
  "./systems/title-fx.js?v=" + VERSION,
  "./systems/title.js?v=" + VERSION,
  "./systems/experience.js?v=" + VERSION,
  "./systems/xp.js?v=" + VERSION,
  "./worlds/index.js?v=" + VERSION,
  "./worlds/room-atmosphere.js?v=" + VERSION,
  "./worlds/painted-hub.js?v=" + VERSION,
  "./worlds/terrain.js?v=" + VERSION,
  "./worlds/painted-rooms.js?v=" + VERSION,
  "./assets/sprites/bodies/cuerno-idle.svg?v=" + VERSION,
  "./assets/sprites/bodies/cuerno-run.svg?v=" + VERSION,
  "./assets/sprites/bodies/cuerno-jump.svg?v=" + VERSION,
  "./assets/sprites/bodies/cuerno-atk.svg?v=" + VERSION,
  "./assets/sprites/forms/kilo-0.png?v=" + VERSION,
  "./assets/sprites/forms/kilo-4.png?v=" + VERSION,
  "./assets/sprites/forms/pizza-0.png?v=" + VERSION,
  "./assets/sprites/forms/pizza-4.png?v=" + VERSION,
  "./assets/sprites/forms/cat-0.png?v=" + VERSION,
  "./assets/sprites/forms/cat-4.png?v=" + VERSION,
  "./assets/sprites/forms/yomi-0.png?v=" + VERSION,
  "./assets/sprites/forms/yomi-4.png?v=" + VERSION,
  "./assets/worlds/beach-bg.jpg?v=" + VERSION,
  "./assets/worlds/jungle-bg.jpg?v=" + VERSION,
  "./assets/worlds/volcano-bg.jpg?v=" + VERSION,
  "./assets/worlds/boss-bg.jpg?v=" + VERSION,
  "./assets/sprites/boss-queen.png?v=" + VERSION
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("ohana-static-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.endsWith("/.netlify/functions/game")) return;
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  const isScript = url.pathname.endsWith(".js");

  if (isScript) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() =>
        caches.match(request, { ignoreSearch: true })
          .then((cached) => cached || caches.match("./index.html"))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
