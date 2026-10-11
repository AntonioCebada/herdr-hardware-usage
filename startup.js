'use strict';

// Startup hook for the hardware-usage herdr plugin.
//
// herdr persists HERDR_PLUGIN_CONFIG_DIR across install/update but replaces the
// managed checkout. The canonical settings live in the persistent directory;
// status.js can only read the working copy next to itself (a tab bar command
// receives no HERDR_PLUGIN_* env). This hook re-applies the canonical config
// into the checkout every time herdr starts the plugin, so a reinstall or
// update cannot lose the user's settings.
//
// Startup must never matter: every error is swallowed and the process exits 0
// without writing anything to stdout. Without HERDR_PLUGIN_CONFIG_DIR (plain
// `node startup.js` during development) there is nothing to sync.

const fs = require('node:fs');
const path = require('node:path');

const { coerceConfig, readJson, serializeConfig } = require('./lib/settings.js');

const CHECKOUT_PATH = path.join(__dirname, 'config.json');

function sync() {
  const configDir = process.env.HERDR_PLUGIN_CONFIG_DIR;
  if (!configDir) return;

  const canonical = readJson(path.join(configDir, 'config.json'));
  if (!canonical) return;

  const json = serializeConfig(coerceConfig(canonical));

  let current = null;
  try {
    current = fs.readFileSync(CHECKOUT_PATH, 'utf8');
  } catch {
    // Missing checkout copy: recreate it below.
  }
  if (current === json) return;

  fs.mkdirSync(path.dirname(CHECKOUT_PATH), { recursive: true });
  fs.writeFileSync(CHECKOUT_PATH, json);
}

try {
  sync();
} catch {
  // A failed sync must never affect herdr startup.
}
