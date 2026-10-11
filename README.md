# Hardware Usage (herdr plugin)

Shows CPU, RAM, and disk usage percentages on the right side of the herdr tab
bar, with per-metric toggles.

Because the collecting command runs on the herdr **server**, `herdr --remote`
shows the stats of the machine running the server (the remote host), not the
local client.

- **CPU** — busy percentage derived from two `/proc/stat` samples.
- **RAM** — used percentage from `/proc/meminfo` (`MemTotal` − `MemAvailable`).
- **DISK** — used percentage from `fs.statfsSync(disk_path)`.

GPU metrics are intentionally out of scope for v1; they may be added later.

## How it fits herdr

This plugin does **not** draw on the tab bar itself. herdr renders the **last
line of stdout** of a `ui.tab_bar_right` command entry, and clears the entry if
the command fails, prints nothing, or times out. `status.js` is that command:

- It resolves its own location from `__dirname`, because a tab bar command does
  **not** receive any `HERDR_PLUGIN_*` environment variables.
- It prints exactly one line, for example:

  ```text
  CPU 12% · RAM 60% · DISK / 62%
  ```

- On any error it prints nothing and exits 0, so herdr clears the entry instead
  of showing an error.

The plugin's `actions` only edit `config.json`; they do not touch the tab bar.
A toggle takes effect on the next refresh interval of the tab bar entry.

## Manual install

The plugin does not modify your herdr configuration for you. Set it up manually:

1. Link the plugin directory (adjust the path to where you cloned this repo):

   ```sh
   herdr plugin link /absolute/path/to/herdr-hardware-usage
   ```

2. Make the status script executable:

   ```sh
   chmod +x /absolute/path/to/herdr-hardware-usage/status.js
   ```

3. Add a command entry to `ui.tab_bar_right` in your herdr `config.toml`,
   replacing the placeholder with the real absolute path to `status.js`:

   ```toml
   ui.tab_bar_right = [
     { type = "command", command = "/absolute/path/to/herdr-hardware-usage/status.js", interval_seconds = 5, timeout_seconds = 2 },
   ]
   ```

4. Validate and reload:

   ```sh
   herdr config check
   herdr server reload-config
   ```

## Switching metrics

Actions are invoked through herdr and take effect on the next refresh interval
(`interval_seconds` above):

```sh
herdr plugin action invoke local.hardware-usage.toggle-cpu
herdr plugin action invoke local.hardware-usage.toggle-ram
herdr plugin action invoke local.hardware-usage.toggle-disk
herdr plugin action invoke local.hardware-usage.status
```

You can also run the actions directly while developing:

```sh
node actions.js toggle-cpu   # prints: CPU metric disabled
node actions.js status       # prints the current configuration
```

## Notes

- Configuration lives in `config.json` next to the script (created with defaults
  on first run: all metrics enabled, disk path `/`). It is user state and is
  git-ignored. Edit it to change `disk_path` to another mount point.
- CPU needs two samples. The first run after a restart samples `/proc/stat`
  twice (~250 ms apart) and stores a sample in `.state.json`; later runs reuse
  the stored sample. Both files are git-ignored.
- Linux only (`platforms = ["linux"]`), as it reads procfs.
- GPU support may be added in a future version.
