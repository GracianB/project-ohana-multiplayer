# OHANA Multiplayer Upgrade

Aplicar este ZIP sobre la raiz de `D:\GitHub\project-ohana-multiplayer`.

Incluye:
- campaña cooperativa Costa Hoku -> Jungla Alta -> Caldera -> Nido -> Reina
- mundo procedural propio para Nido, sin usar boss-bg.png como sustituto del escenario
- dodge autoritativo con i-frames y accion idempotente
- boton Shift / Esquiva
- FX visual de attack / ability / dodge en ambos clientes cuando llega el evento
- setpieces visuales por zona
- precache de multiplayer/mission.js
- prueba de dodge en multiplayer-room.test.js

NO incluye `node_modules`, `.git`, `dist` ni los archivos originales no relacionados.

Validacion realizada aqui:
- node --check multiplayer.js: PASS
- node --check netlify/lib/combat.mjs: PASS
- tests/multiplayer-room.test.js: PASS
- npm test sobre el ZIP subido: 200 PASS / 8 FAIL, pero los 8 fallos son por archivos que NO estaban incluidos en el ZIP fuente subido (`index.html` y `style.css`, y cobertura de recursos del SW), no por estos cambios.
- No se ha ejecutado una prueba E2E de navegador ni Netlify desde este entorno.
