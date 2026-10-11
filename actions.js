#!/usr/bin/env node
'use strict';

// herdr plugin actions for hardware-usage.
//
// Usage:
//   node actions.js toggle-cpu
//   node actions.js toggle-ram
//   node actions.js toggle-disk
//   node actions.js status
//
// Settings are canonical in `${HERDR_PLUGIN_CONFIG_DIR}/config.json`, which
// herdr persists across install/update, and mirrored into `config.json` next
// to this script because that is the copy status.js reads (a tab bar command
// receives no HERDR_PLUGIN_* env). A toggle therefore takes effect on the next
// tab bar refresh.
//
// When run directly with plain Node outside herdr (development), the env var
// is absent and only the checkout copy is read and written.

const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_CONFIG,
  configSummaryText,
  mergeWriteTargets,
  resolveConfig,
} = require('./lib/settings.js');

const CHECKOUT_PATH = path.join(__dirname, 'config.json');
const PLUGIN_ROOT = process.env.HERDR_PLUGIN_ROOT;
const PLUGIN_CONFIG_DIR = process.env.HERDR_PLUGIN_CONFIG_DIR;
const PERSISTENT_PATH = PLUGIN_CONFIG_DIR
  ? path.join(PLUGIN_CONFIG_DIR, 'config.json')
  : null;

const LABELS = { cpu: 'CPU', ram: 'RAM', disk: 'DISK' };

function loadConfig() {
  return resolveConfig({
    persistentPath: PERSISTENT_PATH,
    checkoutPath: CHECKOUT_PATH,
    defaults: DEFAULT_CONFIG,
  });
}

function saveConfig(config) {
  for (const target of mergeWriteTargets({
    persistentPath: PERSISTENT_PATH,
    checkoutPath: CHECKOUT_PATH,
    config,
  })) {
    fs.mkdirSync(path.dirname(target.path), { recursive: true });
    fs.writeFileSync(target.path, target.json);
  }
}

function toggle(key) {
  const config = loadConfig();
  config[key] = !config[key];
  saveConfig(config);
  process.stdout.write(`${LABELS[key]} metric ${config[key] ? 'enabled' : 'disabled'}\n`);
}

function showStatus() {
  process.stdout.write(`${configSummaryText(loadConfig())}\n`);
  if (PERSISTENT_PATH) {
    process.stdout.write(`Config dir: ${PLUGIN_CONFIG_DIR}\n`);
    process.stdout.write('Config mode: persistent\n');
  } else {
    process.stdout.write('Config mode: checkout-only\n');
  }
  process.stdout.write(
    `Tab bar command: ${path.join(PLUGIN_ROOT || __dirname, 'status.js')}\n`,
  );
}

const actions = {
  'toggle-cpu': () => toggle('cpu'),
  'toggle-ram': () => toggle('ram'),
  'toggle-disk': () => toggle('disk'),
  status: showStatus,
};

try {
  const command = process.argv[2];
  const action = actions[command];
  if (!action) {
    process.stderr.write(
      `Unknown action: ${command ?? '(none)'}. Expected one of: ${Object.keys(actions).join(', ')}\n`,
    );
    process.exitCode = 1;
  } else {
    action();
  }
} catch (error) {
  process.stderr.write(`hardware-usage: ${error && error.message ? error.message : error}\n`);
  process.exitCode = 1;
}
