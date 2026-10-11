# Feature: hardware-usage-plugin

Plugin de herdr que muestra uso de CPU, RAM y disco en el lado derecho de la tab bar,
con selección de qué métricas mostrar (accions toggle).

## Contexto de diseño (acordado con el usuario)

- Runtime: Node.js stdlib (sin npm install; el usuario prefiere pnpm, no aplica por el momento).
- Métricas v1: CPU (delta /proc/stat), RAM (/proc/meminfo), disk (fs.statfsSync). Sin GPU.
- El plugin NO dibuja en la tab bar: herdr renderiza la última línea de output de una
  entrada `command` en `ui.tab_bar_right` (interval_seconds, timeout_seconds, corre en server).
- El comando de tab bar NO recibe env de plugin: status.js se auto-localiza con __dirname.
- config.toml: setup MANUAL (el plugin documenta el snippet; nunca edita el config del usuario).
- Restricciones del usuario: NO ejecutar `herdr plugin link`, NO editar ~/.config/herdr/config.toml.

## Tareas

1. [x] Scaffold: manifest herdr-plugin.toml — id local.hardware-usage, platforms linux, actions toggle-cpu/ram/disk/status.
2. [ ] Test-first: parsers de /proc/stat, /proc/meminfo y statfs (node:test) — RED antes de implementar.
3. [ ] Collector status.js: lee config.json (cpu/ram/disk/disk_path), imprime una línea "CPU 12% · RAM 60% · / 62%".
       Estado de delta CPU en .state.json junto al script (pragma: primera vez muestreo interno).
       Salida solo stdout al final; cualquier error → stdout vacío exit 0 (herdr limpia la entrada).
4. [ ] Acciones: actions.js toggle-cpu/toggle-ram/toggle-disk/status (reescribe config.json; surte efecto al próximo tick).
5. [ ] README (EN, artefacto técnico): install/link manual, snippet ui.tab_bar_right, acciones, notas de plataform.
6. [ ] Commit de unidad de trabajo en rama feature (repo unborn main): rama feat/hardware-usage-plugin.

## Evidencia

- Commit: `0e140c2 feat: add hardware-usage plugin v1 (CPU/RAM/disk tab bar metrics)` en rama `feat/hardware-usage-plugin`.
- TDD: RED observado (`Cannot find module '../lib/collect.js'`) → GREEN 12/12 (`node --test test/collect.test.js`).
- Funcional: `./status.js` × 2 → `CPU 3% · RAM 17% · DISK / 17%`; toggles cpu/ram verificados; error path → stdout vacío exit 0.
- Verificación de sintaxis de tests: usar `node --test` o `node --test test/collect.test.js` (Node v24 no acepta directorio posicional).
- Pendiente del usuario: `herdr plugin link` + snippet `ui.tab_bar_right` (restricción explícita: no lo hace el agente).
- v1 feedback (commit posterior): RAM → `RAM 2.8/16GB` (usado/límite, GB decimal kB×1024/1e9 para coincidir con la capacidad nominal); DISK → `DISK 17%` sin mostrar la ruta. renderLine ahora recibe texto pre-renderizado por métrica. Tests 13/13 verdes.
- El usuario confirmó por chat que linkeó y configuró el plugin, y funciona.
- v0.2.0 (commit 20301f6): configuración persistente — canonica en HERDR_PLUGIN_CONFIG_DIR/config.json (sobrevive install/update desde GitHub), startup.js re-sincroniza al checkout al iniciar el server, toggles escriben ambos sitios. lib/settings.js con tests; 29/29 verdes. status.js sin cambios a propósito (los comandos de tab bar no reciben env).
