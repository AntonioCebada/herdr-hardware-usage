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

- (pendiente)
