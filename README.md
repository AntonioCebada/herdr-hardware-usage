# Hardware Usage (plugin de herdr)

Muestra el porcentaje de uso de CPU, RAM y disco en el lado derecho de la tab
bar de herdr, con toggles por métrica (elegir cuáles mostrar y cuáles no).

Como el comando colector corre en el **server** de herdr, al usar
`herdr --remote` se muestran las métricas de la máquina donde corre el server
(el host remoto), no las del cliente local.

- **CPU** — porcentaje de uso calculado a partir de dos muestras de `/proc/stat`.
- **RAM** — GB usados / límite total en GB **decimal** desde `/proc/meminfo`
  (`MemTotal` − `MemAvailable`), por ejemplo `RAM 2.8/16GB` (así un módulo de
  16 GB del fabricante se muestra como 16GB, no 15 GiB).
- **DISK** — porcentaje de uso desde `fs.statfsSync(disk_path)` (sin mostrar la ruta).

La métrica de GPU queda fuera del alcance de la v1 a propósito; puede agregarse más adelante.

## Cómo se integra con herdr

Este plugin **no dibuja** sobre la tab bar. herdr renderiza la **última línea
de stdout** de una entrada de tipo `command` en `ui.tab_bar_right`, y limpia la
entrada si el comando falla, no imprime nada o se pasa del timeout.
`status.js` es ese comando:

- Resuelve su propia ubicación con `__dirname`, porque un comando de la tab bar
  **no** recibe ninguna variable de entorno `HERDR_PLUGIN_*`.
- Imprime exactamente una línea, por ejemplo:

  ```text
  CPU 12% · RAM 2.8/16GB · DISK 62%
  ```

- Ante cualquier error no imprime nada y sale con código 0, así herdr limpia
  la entrada en lugar de mostrar un error.

Las acciones (`actions`) del plugin solo editan `config.json`; no tocan la tab
bar. Un toggle surte efecto en el próximo intervalo de refresco de la entrada.

## Instalación manual

El plugin no modifica la configuración de herdr por vos. Configuración manual:

1. Linkear el directorio del plugin (ajustar la ruta al directorio clonado del repo):

   ```sh
   herdr plugin link /ruta/absoluta/a/herdr-hardware-usage
   ```

2. Hacer ejecutable el script de status:

   ```sh
   chmod +x /ruta/absoluta/a/herdr-hardware-usage/status.js
   ```

3. Agregar una entrada de tipo `command` a `ui.tab_bar_right` en tu
   `config.toml` de herdr, reemplazando el placeholder por la ruta absoluta
   real a `status.js`:

   ```toml
   [ui]
   tab_bar_right = [
     { type = "command", command = "/ruta/absoluta/a/herdr-hardware-usage/status.js", interval_seconds = 5, timeout_seconds = 2 },
   ]
   ```

4. Validar y recargar:

   ```sh
   herdr config check
   herdr server reload-config
   ```

## Eligiendo métricas

Las acciones se invocan a través de herdr y surten efecto en el próximo
intervalo de refresco (`interval_seconds` de arriba):

```sh
herdr plugin action invoke local.hardware-usage.toggle-cpu
herdr plugin action invoke local.hardware-usage.toggle-ram
herdr plugin action invoke local.hardware-usage.toggle-disk
herdr plugin action invoke local.hardware-usage.status
```

También se puede invocar directamente durante el desarrollo:

```sh
node actions.js toggle-cpu   # imprime: CPU metric disabled
node actions.js status       # imprime la configuración actual
```

## Desarrollo con install

Cuando el plugin se instala desde GitHub, herdr administra el checkout y lo
**reemplaza** en cada reinstalación o actualización. Por eso los ajustes no
pueden vivir solo dentro del checkout: la configuración canónica queda en el
config dir del plugin y el hook de arranque vuelve a aplicar los ajustes
persistidos sobre la copia de trabajo apenas arranca el server de herdr.

## Notas

- La configuración canónica vive en el **config dir del plugin**
  (`herdr plugin config-dir local.hardware-usage` imprime la ruta; normalmente
  `$HERDR_PLUGIN_CONFIG_DIR/config.json`). herdr conserva ese directorio entre
  reinstalaciones y actualizaciones, así que los ajustes sobreviven. Se crea
  con defaults en la primera corrida: todas las métricas activadas, disco en
  la ruta `/`.
- Junto al script queda una **copia de trabajo** de `config.json`, que es la
  que lee `status.js` (un comando de la tab bar no recibe env del plugin). El
  hook de arranque (`[[startup]]` en `herdr-plugin.toml`) sincroniza la
  configuración canónica hacia esa copia cuando arranca el server de herdr, y
  los toggles escriben ambos sitios, así que el cambio surte efecto en el
  próximo refresco.
- `config.json` es estado del usuario y está ignorado por git. Editarlo (en
  cualquiera de los dos sitios) para cambiar `disk_path` a otro punto de
  montaje.
- La CPU necesita dos muestras. La primera corrida después de un restart
  lee `/proc/stat` dos veces (~250 ms de diferencia) y guarda una muestra en
  `.state.json`; las corridas siguientes reutilizan la muestra guardada.
  Ambos archivos están ignorados por git.
- La RAM se muestra en GB decimal (kB × 1024 / 1e9) para coincidir con la
  capacidad nominal del fabricante.
- Solo Linux (`platforms = ["linux"]`), porque lee procfs.
- El soporte de GPU puede agregarse en una versión futura.
