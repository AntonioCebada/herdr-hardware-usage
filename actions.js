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
// Actions only read and write config.json next to this script. status.js reads
// the same file, so a toggle takes effect on the next tab bar refresh.

const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const DEFAULT_CONFIG = { cpu: true, ram: true, disk: true, disk_path: '/' };

const LABELS = { cpu: 'CPU', ram: 'RAM', disk: 'DISK' };

function coerceConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    cpu: !!source.cpu,
    ram: !!source.ram,
    disk: !!source.disk,
    disk_path:
      typeof source.disk_path === 'string' && source.disk_path.length > 0
        ? source.disk_path
        : DEFAULT_CONFIG.disk_path,
  };
}

function loadConfig() {
  try {
    return coerceConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

function toggle(key) {
  const config = loadConfig();
  config[key] = !config[key];
  saveConfig(config);
  process.stdout.write(`${LABELS[key]} metric ${config[key] ? 'enabled' : 'disabled'}\n`);
}

function showStatus() {
  const config = loadConfig();
  const state = (value) => (value ? 'enabled' : 'disabled');
  const lines = [
    `CPU metric: ${state(config.cpu)}`,
    `RAM metric: ${state(config.ram)}`,
    `DISK metric: ${state(config.disk)}`,
    `Disk path: ${config.disk_path}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
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
