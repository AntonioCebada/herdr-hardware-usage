#!/usr/bin/env node
'use strict';

// Hardware usage collector for herdr.
//
// This script is meant to be wired into herdr's `ui.tab_bar_right` as a
// `type = "command"` entry. herdr runs it via `/bin/sh -lc`, prints the LAST
// line of stdout on the tab bar, and clears the entry on failure/empty/timeout.
//
// Because a tab bar command receives no HERDR_PLUGIN_* environment variables,
// everything is resolved relative to __dirname (the plugin directory).

const fs = require('node:fs');
const path = require('node:path');

const {
  parseProcStatCpu,
  cpuPercent,
  parseMeminfo,
  statfsUsage,
  renderLine,
} = require('./lib/collect.js');

const PLUGIN_DIR = __dirname;
const CONFIG_PATH = path.join(PLUGIN_DIR, 'config.json');
const STATE_PATH = path.join(PLUGIN_DIR, '.state.json');

const DEFAULT_CONFIG = { cpu: true, ram: true, disk: true, disk_path: '/' };
const SEPARATOR = ' · ';
const FIRST_SAMPLE_DELAY_MS = 250;

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

// Reads config.json, creating it with defaults when it does not exist yet.
// Malformed values are silently coerced; read/parse failures fall back to
// defaults without throwing.
function loadConfig() {
  let exists = true;
  try {
    fs.accessSync(CONFIG_PATH);
  } catch {
    exists = false;
  }

  if (!exists) {
    try {
      fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
    } catch {
      // Best effort only; the collector must never fail loudly.
    }
    return { ...DEFAULT_CONFIG };
  }

  try {
    return coerceConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function readCpuSample() {
  const text = fs.readFileSync('/proc/stat', 'utf8');
  const line = text.split('\n').find((entry) => entry.startsWith('cpu '));
  if (!line) return null;
  return parseProcStatCpu(line);
}

function readPreviousSample() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (state && state.cpu && typeof state.cpu === 'object') {
      return {
        idle: Number(state.cpu.idle),
        iowait: Number(state.cpu.iowait),
        total: Number(state.cpu.total),
      };
    }
  } catch {
    // No usable previous sample.
  }
  return null;
}

function writeSample(sample) {
  try {
    fs.writeFileSync(
      STATE_PATH,
      `${JSON.stringify({ cpu: sample, savedAt: Date.now() })}\n`,
    );
  } catch {
    // Losing the sample only costs an extra warm-up cycle next run.
  }
}

function sleepSync(ms) {
  const shared = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(shared, 0, 0, ms);
}

// Returns busy CPU percent. On the very first run there is no previous sample,
// so a short second sample is taken to produce a real delta.
function collectCpuPercent() {
  const current = readCpuSample();
  if (!current) return null;

  const previous = readPreviousSample();
  if (previous) {
    writeSample(current);
    return cpuPercent(previous, current);
  }

  sleepSync(FIRST_SAMPLE_DELAY_MS);
  const second = readCpuSample();
  if (!second) return null;
  writeSample(second);
  return cpuPercent(current, second);
}

function collectRamPercent() {
  const text = fs.readFileSync('/proc/meminfo', 'utf8');
  const mem = parseMeminfo(text);
  return mem ? mem.usedPercent : null;
}

function collectDiskPercent(diskPath) {
  const statfs = fs.statfsSync(diskPath);
  const usage = statfsUsage(statfs);
  return usage ? usage.usedPercent : null;
}

function buildParts(config) {
  const parts = [];

  if (config.cpu) {
    const percent = collectCpuPercent();
    if (percent !== null) parts.push({ label: 'CPU', percent });
  }

  if (config.ram) {
    const percent = collectRamPercent();
    if (percent !== null) parts.push({ label: 'RAM', percent });
  }

  if (config.disk) {
    const percent = collectDiskPercent(config.disk_path);
    if (percent !== null) parts.push({ label: `DISK ${config.disk_path}`, percent });
  }

  return parts;
}

function main() {
  const config = loadConfig();
  const line = renderLine(buildParts(config), SEPARATOR);
  if (line) process.stdout.write(`${line}\n`);
}

try {
  main();
} catch {
  // Any failure (missing procfs, statfs errors, ...) must produce empty output
  // so herdr clears the tab bar entry instead of showing an error.
}
// Exit naturally with code 0. Calling process.exit() here could truncate the
// line still buffered on a pipe, which is exactly how herdr reads us.
