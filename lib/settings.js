'use strict';

// Settings resolution for the hardware-usage herdr plugin.
//
// herdr keeps a persistent plugin config directory (HERDR_PLUGIN_CONFIG_DIR)
// that survives reinstall/update, while the managed checkout is replaced.
// Settings are therefore canonical in `${HERDR_PLUGIN_CONFIG_DIR}/config.json`
// and mirrored into `config.json` next to the scripts, which is the copy
// status.js reads (a tab bar command receives no HERDR_PLUGIN_* env and
// resolves everything from __dirname).
//
// This module is pure apart from reading files, so the whole precedence logic
// is unit testable without herdr and without touching the ambient environment.

const fs = require('node:fs');

// User-visible defaults: every metric on, disk at the filesystem root.
const DEFAULT_CONFIG = Object.freeze({
  cpu: true,
  ram: true,
  disk: true,
  disk_path: '/',
});

// Expected config shape, kept next to coerceConfig as the single documented
// contract: boolean metric flags plus a non-empty disk_path string.
const CONFIG_SCHEMA = Object.freeze({
  cpu: 'boolean',
  ram: 'boolean',
  disk: 'boolean',
  disk_path: 'string',
});

// Normalizes a defaults object into the full config shape. Used both for the
// disk_path fallback in coerceConfig and for the "nothing usable found" case.
function normalizeDefaults(defaults) {
  const base = defaults && typeof defaults === 'object' ? defaults : DEFAULT_CONFIG;
  return {
    cpu: base.cpu === undefined ? DEFAULT_CONFIG.cpu : !!base.cpu,
    ram: base.ram === undefined ? DEFAULT_CONFIG.ram : !!base.ram,
    disk: base.disk === undefined ? DEFAULT_CONFIG.disk : !!base.disk,
    disk_path:
      typeof base.disk_path === 'string' && base.disk_path.length > 0
        ? base.disk_path
        : DEFAULT_CONFIG.disk_path,
  };
}

/**
 * Parse a JSON file into a plain config-shaped object.
 *
 * @param {string|null|undefined} filePath
 * @returns {object|null} parsed object, or null when the path is unusable,
 *   missing, unreadable, malformed JSON, or not a JSON object.
 */
function readJson(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    // Missing/unreadable/malformed: callers treat this as "no config here".
    return null;
  }
}

/**
 * Coerce a raw config object into the documented shape.
 *
 * The coercion matches status.js's own coerceConfig (which cannot import this
 * module because it must stay dependency-free for the tab bar command):
 * truthiness for the metric flags and a non-empty string for disk_path.
 *
 * @param {*} raw
 * @param {{cpu?:boolean, ram?:boolean, disk?:boolean, disk_path?:string}} [defaults]
 * @returns {{cpu:boolean, ram:boolean, disk:boolean, disk_path:string}}
 */
function coerceConfig(raw, defaults) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = normalizeDefaults(defaults);
  return {
    cpu: !!source.cpu,
    ram: !!source.ram,
    disk: !!source.disk,
    disk_path:
      typeof source.disk_path === 'string' && source.disk_path.length > 0
        ? source.disk_path
        : base.disk_path,
  };
}

/**
 * Resolve the effective config with persistent-first precedence:
 *   1. valid persistent file, else
 *   2. valid checkout file, else
 *   3. defaults.
 *
 * A malformed or missing file never masks a valid one at the next level.
 *
 * @param {{persistentPath?:string|null, checkoutPath?:string|null,
 *          defaults?:object}} [options]
 * @returns {{cpu:boolean, ram:boolean, disk:boolean, disk_path:string}}
 */
function resolveConfig({ persistentPath = null, checkoutPath = null, defaults } = {}) {
  const base = normalizeDefaults(defaults);

  const persistent = readJson(persistentPath);
  if (persistent) return coerceConfig(persistent, base);

  const checkout = readJson(checkoutPath);
  if (checkout) return coerceConfig(checkout, base);

  return base;
}

/**
 * Serialize a config as pretty JSON with a trailing newline.
 *
 * @param {object} config
 * @returns {string}
 */
function serializeConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Decide which files a toggle must write.
 *
 * Both the persistent and the checkout copy are written when the persistent
 * layer is active and points somewhere else; otherwise only the checkout is
 * written. Equal paths collapse to a single write.
 *
 * @param {{persistentPath?:string|null, checkoutPath?:string|null,
 *          config:object}} options
 * @returns {Array<{path:string, json:string}>}
 */
function mergeWriteTargets({ persistentPath = null, checkoutPath = null, config } = {}) {
  const json = serializeConfig(config);
  const targets = [];

  if (typeof persistentPath === 'string' && persistentPath.length > 0) {
    targets.push({ path: persistentPath, json });
    if (persistentPath !== checkoutPath) {
      targets.push({ path: checkoutPath, json });
    }
  } else {
    targets.push({ path: checkoutPath, json });
  }

  return targets.filter((target) => typeof target.path === 'string' && target.path.length > 0);
}

/**
 * Render the human-readable config summary printed by the status action.
 *
 * @param {*} config
 * @returns {string}
 */
function configSummaryText(config) {
  const cfg = coerceConfig(config);
  const state = (value) => (value ? 'enabled' : 'disabled');
  return [
    `CPU metric: ${state(cfg.cpu)}`,
    `RAM metric: ${state(cfg.ram)}`,
    `DISK metric: ${state(cfg.disk)}`,
    `Disk path: ${cfg.disk_path}`,
  ].join('\n');
}

module.exports = {
  DEFAULT_CONFIG,
  CONFIG_SCHEMA,
  readJson,
  coerceConfig,
  resolveConfig,
  serializeConfig,
  mergeWriteTargets,
  configSummaryText,
};
