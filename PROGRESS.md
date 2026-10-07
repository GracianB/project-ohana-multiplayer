# PROJECT OHANA · Progreso

Última actualización: 05/10/2026

## Estado actual

### 05/10/2026 · Experience Recovery Block

El sistema de presentación del Mundo 1 ha sido reconstruido en capas separadas:

- **MessageManager 2.0**: una sola salida visual activa, prioridades semánticas y fallback de objetivo.
- **Room Voice**: la entrada a una sala tiene una única narración; el feedback visual de llegada no escribe texto.
- **Tutorial contextual**: pistas disparadas por acciones reales, una vez por sesión, teclado y touch.
- **Objetivos dinámicos**: cada sala tiene ID, destino y requisito; los bloqueos dependen del estado actual.
- **Evolution Flow**: cinemática más corta y visual, narración posterior única, sin letterbox.
- **HUD hierarchy**: objetivo persistente separado de mensajes temporales; boss HUD resumido.
- **Hero Presence**: identidad idle reutilizando firmas existentes, sin marcadores artificiales.
- **Combat Feel**: impacto visual prioritario y números de daño reservados para eventos relevantes.
- **Enemy Readability**: telegraphs con dirección gráfica además del color.
- **Accessibility Contract**: live regions por prioridad y reduced-motion aplicado desde infraestructura.
- **Experience E2E + visual matrix**: validación de contenido, singularidad, geometría y estados clave.

La caché canónica de esta línea de trabajo es `ohana-223`.

### 06/10/2026 · Organic Hero Render Recovery

El renderer vuelve a priorizar los diseños orgánicos completos de `characters/art/`; `characters/definitive.js` queda como fallback. Se preservan hitboxes, poses, combate y el cierre de Mundo 1.

### 06/10/2026 · Hero Identity Recovery

Se restauran las marcas visuales de identidad de los 10 héroes desde el snapshot histórico de `ohana-172`, manteniendo el runtime y el cierre actual de Mundo 1.

### Phase 20 · World 1 Closure Candidate

Existe una rama consolidada de cierre. El mundo **no se declara cerrado todavía**: la decisión depende de que `npm test`, `npm run test:browser`, `npm run test:visual` y `npm run release:check` terminen en PASS en CI.


Project Ohana es una demo jugable en navegador de plataformas 2D sobre Canvas, con:

- **10 personajes activos**
- **5 formas por personaje**
- **10 salas**
- **1 jefe final: la Reina del Nido**
- **3 habilidades por personaje (J / K / L)**
- **guardado v2**
- **simulación fija a 60 Hz**
- **GitHub Pages + CI**

## Hecho

| 04/10 | Infra de release: caché activa alineada en `ohana-96` para forzar la carga de la Phase 11 y evitar artefactos servidos por Service Worker. |
| Fecha | Qué |
|---|---|
| 04/10 | Intro cinematográfica de portada activa, con escena de Isla Hoku, aviso del Nido y salida por iris; eliminada la pantalla de carga básica. |
| 04/10 | Pase de personajes: feedback de giro/frenada; perfiles cinéticos por personaje, squash/stretch, anticipación e impacto de ataques, feedback de aterrizaje/dash y casteo de habilidades con color propio; nueva suite de regresión de animación en CI; caché `ohana-81`. |
| 04/10 | Pase de identidad de personajes: efectos cinéticos propios para los 10 héroes y showcase de sus habilidades en la pantalla de selección; caché `ohana-87`. |
| 04/10 | Firma de combate: 10 ataques básicos y 30 habilidades reciben trazos visuales específicos por personaje/poder; la lectura del impacto deja de depender solo del efecto genérico; caché `ohana-87`. |
| 04/10 | Identidad de evolución: las formas 0 → 4 ahora cambian lenguaje corporal, énfasis de silueta y firma visual por personaje; nueva capa aislada `characters/evolution.js`; 50 combinaciones forma/personaje cubiertas por regresión; caché `ohana-87`. |
| 04/10 | Evolución en combate: H/J/K/L escalan visualmente por etapa y por identidad de personaje; la progresión aumenta impacto, brillo, estela y densidad sin tocar daño, alcance ni hitbox; caché `ohana-87`. |
| 04/10 | Rediseño de evolución: se retira el concepto de forma divina y cada personaje recibe nombre y diseño de forma final propios, con siluetas/ornamentos diferenciados; caché `ohana-87`. |
| 04/10 | Cinemática de evolución 2.0: firmas gráficas específicas por héroe y etapa, medidor visual 0→forma final y reveal reforzado; sin cambios de gameplay; caché `ohana-87`. |
| 04/10 | Auditoría de coherencia del proyecto. Manifest alineado con 10 personajes, 5 formas y 10 salas. Documentación de progreso alineada con la ejecución real del CI. Referencias de caché y pruebas actualizadas. Añadida validación automática de consistencia en GitHub Actions. |
| 03/10 | Simulación fija a 60 Hz; módulos de reloj, entrada y diálogos; guardado periódico y en victoria/menú/pausa; controles táctiles con E; título visible, HUD accesible y foco de diálogos; final y evolución reutilizan sus capas; pruebas de regresión y CI antes de publicar. |
| 24/09 | **Fábrica** `engine/foes.js` (makeFoe fuera de game.js). Hitstop, vibración, cámara de director en el Nido. Rig crawler/flyer/brute. Save v2 (hp, nueve vidas, magia, kills). Ids `kilo` / `stitcho` / `chispin` con migración de saves viejos. XP alineada (`55 → 140 → 260 → 420`). Móvil: botón bajar + layout vertical. |
| 24/09 | Arreglo integral: el juego vuelve a cargar. |
| 24/09 | Personajes vectoriales, música procedural, Reina del Nido. |

## Personajes

Activos:

1. Kilo
2. Stitcho
3. Chispín
4. Michi
5. Dragón
6. Dino
7. Frita
8. Pizza
9. Yomi
10. Cuerno

Aliases heredados compatibles:

- `lilo` → `kilo`
- `stitch` → `stitcho`
- `pikachu` → `chispin`
- `michi` → `cat`

## Mundo

Hay **10 salas** en el mundo publicado:

1. Claro Ohana
2. Costa Hoku
3. Jungla Alta
4. Caldera
5. Nido Final
6. Cueva Azul
7. Alien Lab
8. Cumbre
9. Órbita
10. Arrecife Abismo

El Nido final requiere forma 4. El Arrecife funciona como desvío acuático y la Órbita conecta con él mediante vórtice.

## Evolución

La curva absoluta de XP es:

`0 → 55 → 140 → 260 → 420`

Las cinco formas son:

`0 · bebé` → `1 · base` → `2 · evolución` → `3 · forma alta` → `4 · forma final`

La evolución activa una cinemática y efectos visuales propios. Las cinco etapas culminan en formas finales únicas por personaje. La hitbox y el renderer visual permanecen conceptualmente separados.

## Guardado

Save v2 conserva, entre otros:

- personaje e id canónico
- forma y XP
- salud
- sala actual
- salas visitadas
- puntos y bajas
- estado de victoria
- magia y nueve vidas cuando corresponda

Los datos corruptos o incompatibles se descartan de forma defensiva sin romper la partida.

## Renderizado

El arte vectorial vive en:

`characters/art/`

El registro central es:

`characters/art/index.js`

La ruta vectorial es:

`game.js → characters/draw.js → characters/art/index.js → renderer del personaje`

La ruta pintada es:

`characters/draw.js → characters/sprites.js → assets/sprites/bodies/`

La vista por defecto es **vector**.

## Tests

El CI ejecuta **las ocho suites de regresión Node más un E2E real de navegador y el release gate**:

```bash
npm test
npm run test:browser
npm run release:check
```

El E2E real de navegador ejecuta `node tests/browser/e2e.mjs`.
La matriz visual ejecuta `node tests/browser/visual-regression.mjs`.

Las pruebas cubren, entre otras áreas:

- fábrica y comportamiento de enemigos
- RNG inyectable para enemigos y poses, con escenarios reproducibles
- smoke test de los 10 personajes × 5 formas ejecutando realmente cada renderer vectorial
- XP
- roster y aliases
- guardado
- colisiones
- cerebro de enemigos
- audio sin Web Audio
- magia
- partículas
- entrada teclado/táctil
- reloj fijo
- HUD
- habilidades

El pipeline ejecuta las pruebas antes del despliegue de GitHub Pages.

| 04/10 | **Boss Combat Director · Phase 15**: la Reina encadena rutinas de 2–4 ataques según fase y contexto del jugador, evita repetir patrón, reduce la ventana de reacción en la fase final y abre una ventana de castigo claramente telegráfica tras cada cadena; sin cambiar hitboxes ni daño base; caché `ohana-91`. |
| 04/10 | **Boss Reactive Director · Phase 16**: memoria determinista del jugador (dash, aire y presión), selección reactiva por patrón autorizado, desesperación de fase 3 al 22% de vida y recompensa `PUNISH` única durante cada ventana vulnerable; sin alterar daño base ni hitboxes; caché `ohana-92`. |
| 04/10 | **Boss Counterplay · Phase 17**: defensas limpias por DASH/AIRE/DISTANCIA generan racha de respuesta; tres respuestas consecutivas activan `BREAK` y amplían la recuperación vulnerable. La respuesta fallida reinicia la racha solo cuando el jugador estaba realmente expuesto; sin modificar daño base ni hitboxes; caché `ohana-93`. |

| 04/10 | **Boss Adaptive Encounter · Phase 18**: memoria corta de respuestas defensivas, enfriamiento determinista y adaptación de la siguiente preferencia cuando el jugador repite DASH/AIRE/DISTANCIA; la Reina puede marcar CEBO, pero solo selecciona patrones ya autorizados por fase; sin modificar daño, hitboxes ni física; caché `ohana-94`. |\n\n| 04/10 | **Boss Adaptive Bait · Phase 19**: convierte dos respuestas defensivas iguales en un CEBO de un solo uso; la rutina se elige solo entre patrones existentes de la fase y obliga a volver a observar al jugador antes de rearmarse; sin modificar daño, hitboxes, física ni RNG; caché `ohana-95`. |

| 04/10 | **Boss Bait Feedback · Phase 20**: registra el resultado real del CEBO; un CEBO leído reduce el tempo y uno eficaz lo aumenta dentro de ±2, haciendo la siguiente decisión ligeramente más rápida o lenta sin tocar daño, hitboxes, física ni RNG; feedback visual y HUD; caché `ohana-96`. |
| 04/10 | **Boss Encounter Memory · Phase 21**: memoria acotada de ocho observaciones; las respuestas limpias y CEBO leídos relajan el siguiente patrón, mientras fallos y CEBO eficaces elevan la presión hacia rutinas largas. La selección sigue cerrada al repertorio autorizado y no modifica daño, hitboxes, física ni RNG; caché `ohana-98`. |

| 04/10 | **Ability Fix · Kilo + Pizza**: restaurado el impacto funcional de `Giro hula`; Pizza ya no queda secuestrada por el agarre de queso y sus tres habilidades tienen cobertura de impacto; caché `ohana-98`. |
| 04/10 | **Ability Contract Hardening · Phase 22**: `Giro hula` recupera también la reflexión real de proyectiles hostiles durante el aro activo; el rebote es de un solo uso por proyectil dentro de una ventana corta y queda cubierto por regresión; caché `ohana-99`. |
| 05/10 | **Ability Runtime Hardening · Phase 25**: cooldown a 60 Hz, RNG inyectado, VFX deterministas, limpieza de estados, daño seguro y límite de proyectiles; caché `ohana-100`. |
| 05/10 | **VFX Determinism · Phase 26**: pasivos y partículas dejan de consumir `Math.random()`; partículas reproducibles y acotadas a 72, con sanitización numérica y limpieza explícita entre salas/sesiones; caché `ohana-101`. |
| 05/10 | **Combat Mutation Firewall · Phase 27**: daño de enemigos/jugador, XP, puntuación y bajas pasan por mutaciones numéricas seguras; se eliminan operaciones directas susceptibles de propagar `NaN`; caché `ohana-102`. |
| 05/10 | **Runtime Budget + Portal Determinism · Phase 28**: colecciones transitorias acotadas (enemigos/proyectiles/ghosts/orbs), números flotantes limitados a 96 y VFX de portales sin azar ni reloj de pared; caché `ohana-103`. |
| 05/10 | **Runtime Integrity Guard · Phase 29**: saneamiento preventivo de estado crítico y colecciones antes de cada paso de simulación; límites finitos para HP, XP, score, movimiento, proyectiles, enemigos y FX; recompensa `PUNISH` vuelve al guard de puntuación; caché `ohana-104`. |
| 05/10 | **Runtime Fail-Closed · Phase 30**: el bucle principal contiene errores de simulación o render, registra el contexto, limpia input/reloj y pausa de forma segura sin matar el `requestAnimationFrame`; caché `ohana-105`. |
| 05/10 | **CI Hardening · Phase 31**: GitHub Actions usa `actions/checkout@v7` y `actions/setup-node@v7`, con límites de 10 minutos para test y deploy. |
| 05/10 | **RNG Domain Separation · Phase 32**: VFX de celebración, glide, cámara y overlays usan una fuente determinista separada del RNG de simulación; la IA/combate conserva el RNG compartido exclusivamente; caché `ohana-106`. |
| 05/10 | **Deterministic Gameplay Core · Phase 33**: las decisiones jugables de sorpresas y lluvia consumen RNG inyectable de simulación; la convocatoria del Nido abandona `setTimeout` y usa 132 ticks a 60 Hz, pausables y reproducibles; caché `ohana-107`. |
| 05/10 | **Global Mutation Firewall · Phase 34**: HP, XP, score, combo, bajas y escalados de vida críticos se enrutan por `systems/mutations.js`; los sistemas externos dejan de realizar aritmética directa sobre estado crítico; caché `ohana-108`. |
| 05/10 | **Runtime Budget 2 · Phase 35**: presupuestos y compactación de colecciones pasan a `systems/runtime.js`; se acotan `bolts` y `slashes`, y el guard evita asignaciones de arrays innecesarias en el fast path; caché `ohana-109`. |
| 05/10 | **Browser Gameplay E2E · Phase 36**: el E2E de Chromium ejecuta una secuencia real de inicio, habilidad, dash, evolución, sala, lluvia, forma final y boss; verifica daño real y transición a fase 3 mediante el navegador; caché `ohana-110`. |
| 05/10 | **Test Harness Isolation · Phase 37**: la API `window.__OHANA_E2E` solo se expone en `127.0.0.1` con `?e2e=1`; GitHub Pages no la activa aunque se añada el parámetro; caché `ohana-111`. |
| 05/10 | **Mutation Closure · Phase 38**: el último incremento directo de combo pasa al firewall global `systems/mutations.js`; los contadores críticos de gameplay quedan sin aritmética directa externa; caché `ohana-113`. |

## Publicación y caché

GitHub Pages publica desde `main`.

La versión de caché declarada actualmente en `index.html` es:

`ohana-221`

Las referencias documentales se mantienen alineadas con esta versión.

El tacto (ohana-77): el dash es un sprint corto que puedes cortar, el golpe no se lo come el hitstop, pisas al caer y el roce ya no te lanza en bucle.

## Pendiente técnico

La auditoría y el gate actuales no dejan deuda crítica conocida. El mantenimiento futuro queda limitado a extender la cobertura cuando se incorporen nuevas formas, poses, sistemas o superficies de navegador.

## Regla de mantenimiento

Cuando cambien personajes, salas, formas, caché o suites de tests, actualizar en la misma entrega:

`manifest.json` · `README.md` · `PROGRESS.md` · `IMPROVEMENTS.md` · CI

## Phase 41 - Cuerno Paint Closure

- Cuerno incorpora sprites pintados SVG para `idle`, `run`, `jump` y `atk`.
- `characters/sprites.js` usa esta ruta únicamente para Cuerno y conserva PNG para el resto del catálogo.
- El Service Worker precachea las cuatro variantes pintadas.
- La regresión verifica existencia, estructura y contrato de carga de las cuatro poses.
- Cache: `ohana-115`.

## Phase 40 - Cache Graph Closure

- El Service Worker precachea los módulos JavaScript de runtime con la versión de caché actual.
- El pipeline verifica que `index.html` y `sw.js` compartan la misma versión.
- La regresión de hardening comprueba que ningún `.js` de runtime quede fuera del precache.
- Cache: `ohana-115`.

## Phase 39 - Session Reset Closure

- `start()` limpia el estado transitorio antes de iniciar o resumir una partida.
- `summonDelay` se reinicia a `0`.
- Se reinician `doorWait`, `doorHold`, `finale`, `fading`, `flash`, `hitstop` y cámara.
- Se reinician los contadores de fallos de runtime.
- La progresión persistente continúa restaurándose mediante `saveStore`.
- Cache: `ohana-113`.


## Phase 42 - Offline E2E Closure

- El arranque offline se verifica en Chromium después de instalar y activar el Service Worker.
- La prueba recarga sin red y valida DOM, Canvas, control del SW y ejecución real del juego.
- También comprueba que JavaScript, CSS y un asset pintado se sirven desde caché.
- El contrato de precache rechaza entradas duplicadas además de módulos runtime ausentes.
- Cache: `ohana-116`.


## Phase 43 - ESM Dependency Closure

- El CI audita todas las importaciones locales relativas de los módulos JavaScript de runtime.
- Se comprueban rutas directas, sufijo `.js` y `index.js`, rechazando dependencias locales sin destino.
- Cache: `ohana-117`.


## Phase 44 - Save Transaction Closure

- El guardado escribe primero en un staging `ohana.tmp` y solo lo confirma sobre `ohana` después.
- Un fallo de quota/escritura no destruye el checkpoint previo y el staging puede servir como recuperación defensiva.
- Los saves con una versión explícita desconocida se rechazan; v2 sigue siendo el contrato publicado.
- Cache: `ohana-118`.


## Phase 45 - Input Lifecycle Closure

- El estado de entrada se limpia en `blur`, `focus`, `pagehide` y cualquier cambio de visibilidad.
- La limpieza afecta teclado, watchdog y punteros retenidos, sin depender de `keyup`.
- Se mantiene el watchdog de 1200 ms para teclados que pierden su evento de liberación.
- Cache: `ohana-119`.


## Block B - Quality Closure · Phases 46-49

- Phase 46: contratos de diálogo con Escape, foco, inert y restauración del foco de origen.
- Phase 47: presupuestos runtime explícitos y prueba E2E de tiempo de simulación.
- Phase 48: matriz navegador con desktop, touch y reduced-motion.
- Phase 49: conexiones de puertas verificadas como recíprocas a nivel de grafo.
- Cache: `ohana-120`.


## Block C - Determinism Closure · Phases 50-54

- Phase 50: transición verificable de Reina del Nido por umbrales 1→2→3.
- Phase 51: todos los recursos declarados por el Service Worker deben existir físicamente.
- Phase 53: el harness E2E inyecta corrupción numérica y verifica recuperación fail-closed.
- Phase 54: el harness puede fijar una semilla de simulación y exige dos ejecuciones idénticas.
- Cache: `ohana-121`.

- Release Gate: `node tools/release-gate.mjs` / `release:check` antes de publicar.

## V33 · EXPERIENCE
- Cache: `ohana-122`
- Combat feel, movement feedback, dynamic camera, boss presence y evolution presentation.


## V34.1 · EXPERIENCE CRITICAL CLOSURE

- Cámara de juego centrada en el viewport para evitar deriva lateral de mapa y mensajes.
- Intro de la Reina con caída desde arriba, aterrizaje telegráfico y golpe de entrada.
- La Reina derrotada deja de dibujarse desde el primer frame de muerte y no reaparece durante la finale.
- Pizza L queda validada con teclado real y el VFX de Horno soporta el primer frame antes de la actualización de simulación.
- Ocultar la pestaña pausa la sesión actual sin resetear sala, victoria, finale ni progreso persistente.
- Cache: `ohana-126`


## Mundo 1 · contrato de cierre

- Cada sala muestra un objetivo y lo marca hecho al cumplir la salida.
- El claro (S/A/B/C) y el mejor tiempo se guardan en el save v2, sin cambiar la versión.
- El ending nombra al héroe y a su forma. Vector sigue siendo la cara. Pintura es el piloto de Michi/Kilo, opt-in.
- Cache: `ohana-126`.


## Parada

El criterio está en `WORLD-1.md`. Gameplay congelado salvo bug demostrable. Cache `ohana-126`.



## Polish Stabilization 2026-10-06

- La versión publicada queda sincronizada en `ohana-209` entre `index.html`, módulos de portada y Service Worker.
- El carrusel usa un único modelo estructural de tres columnas, con héroe central y laterales contenidos.
- La evolución mantiene el arte orgánico como fuente visual y reduce rayos, anillos, partículas y flash para preservar la silueta.
- Las notificaciones transitorias se limpian al cambiar de sala para impedir acumulación de mensajes fuera de contexto.
- Lilo ya no recibe el halo dorado legado en su forma final.


## Polish Pass 2026-10-06

Arte orgánico como fuente única del héroe, cinemática de evolución limpia, fondos procedurales por defecto, carrusel contenido, controles visibles y robustos, atajo QA Ctrl+Z, rutas de salto suavizadas y atmósfera procedural específica para las 10 salas. Cache: ohana-209.
