# OHANA cooperativo · estado de implementación

La versión cooperativa vive en este repositorio y parte del commit estable `3dc726b6d03c682cfd1d782537a80dbf49c9c4cf`. World 1 y el elenco de diez personajes siguen reutilizando el motor y el arte existentes.

## Bloque actual

- Entrada independiente en `multiplayer.html` desde el menú de OHANA.
- Sala de dos jugadores, código de seis caracteres y selección del elenco existente.
- Estado compartido de presencia y posición; el cliente envía dirección, secuencia e identificador de acción. El servidor limita y calcula el desplazamiento.
- Sesión temporal para reconectar y deduplicación de acciones.
- Endpoint directo `/.netlify/functions/game`; el Service Worker lo excluye y las respuestas usan `Cache-Control: no-store`.
- Escrituras con ETag condicional y hasta cuatro reintentos de conflicto.

## Límites actuales

La sala y el movimiento están probados en dos contextos Playwright con un almacén de prueba en memoria. Aún no se han validado contra un sitio Netlify desplegado ni medido entre dispositivos reales. La Reina, enemigos, combate, habilidades y resultados compartidos pertenecen al siguiente bloque; esta entrega no es todavía la misión final del concurso.

Netlify Blobs tiene consistencia fuerte disponible para lecturas y escrituras condicionales, pero su documentación lo orienta a lecturas frecuentes y escrituras poco frecuentes. Antes de fijarlo como almacén definitivo, hay que medir latencia y conflictos con tráfico real de movimiento. El almacenamiento puede cambiarse detrás del servicio de salas sin cambiar el contrato HTTP.

## Validación

- `npm test`
- `npm run test:browser:multiplayer`
- `npm run test:browser`
- `npm run release:check`

La prueba Playwright de dos contextos valida el flujo de sala y movimiento a través del endpoint simulado; no equivale a dos dispositivos físicos ni a una URL pública.
