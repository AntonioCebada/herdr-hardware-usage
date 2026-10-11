"use strict";

// Unit tests for the persistent-config layer.
//
// Every path is passed explicitly (temporary directories, never the ambient
// HERDR_PLUGIN_CONFIG_DIR) so the suite behaves the same whether or not it is
// run inside herdr.

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_CONFIG,
  CONFIG_SCHEMA,
  readJson,
  coerceConfig,
  resolveConfig,
  mergeWriteTargets,
  configSummaryText,
} = require("../lib/settings.js");

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hardware-usage-settings-"));
  tempDirs.push(dir);
  return dir;
}

function writeRaw(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function writeJson(filePath, value) {
  writeRaw(filePath, JSON.stringify(value));
}

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("DEFAULT_CONFIG holds the documented defaults", () => {
  assert.deepEqual(DEFAULT_CONFIG, {
    cpu: true,
    ram: true,
    disk: true,
    disk_path: "/",
  });
});

test("CONFIG_SCHEMA describes the expected config shape", () => {
  assert.deepEqual(CONFIG_SCHEMA, {
    cpu: "boolean",
    ram: "boolean",
    disk: "boolean",
    disk_path: "string",
  });
});

test("readJson returns the parsed object, or null when unusable", () => {
  const dir = makeTempDir();
  const good = path.join(dir, "good.json");
  const malformed = path.join(dir, "malformed.json");
  const missing = path.join(dir, "missing.json");

  writeJson(good, { cpu: false });
  writeRaw(malformed, "{ not json");

  assert.deepEqual(readJson(good), { cpu: false });
  assert.equal(readJson(malformed), null);
  assert.equal(readJson(missing), null);
  assert.equal(readJson(null), null);
  assert.equal(readJson(undefined), null);
});

test("resolveConfig prefers a valid persistent file over the checkout", () => {
  const dir = makeTempDir();
  const persistentPath = path.join(dir, "persistent", "config.json");
  const checkoutPath = path.join(dir, "checkout", "config.json");

  writeJson(persistentPath, {
    cpu: false,
    ram: true,
    disk: false,
    disk_path: "/data",
  });
  writeJson(checkoutPath, { cpu: true, ram: true, disk: true, disk_path: "/" });

  assert.deepEqual(
    resolveConfig({ persistentPath, checkoutPath, defaults: DEFAULT_CONFIG }),
    { cpu: false, ram: true, disk: false, disk_path: "/data" },
  );
});

test("resolveConfig prefers a valid persistent file even when the checkout is malformed", () => {
  const dir = makeTempDir();
  const persistentPath = path.join(dir, "persistent", "config.json");
  const checkoutPath = path.join(dir, "checkout", "config.json");

  writeJson(persistentPath, {
    cpu: false,
    ram: true,
    disk: true,
    disk_path: "/mnt",
  });
  writeRaw(checkoutPath, "{ broken");

  assert.deepEqual(
    resolveConfig({ persistentPath, checkoutPath, defaults: DEFAULT_CONFIG }),
    { cpu: false, ram: true, disk: true, disk_path: "/mnt" },
  );
});

test("resolveConfig falls back to the checkout when the persistent file is malformed", () => {
  const dir = makeTempDir();
  const persistentPath = path.join(dir, "persistent", "config.json");
  const checkoutPath = path.join(dir, "checkout", "config.json");

  writeRaw(persistentPath, "{ not json");
  writeJson(checkoutPath, { cpu: true, ram: false, disk: true, disk_path: "/home" });

  assert.deepEqual(
    resolveConfig({ persistentPath, checkoutPath, defaults: DEFAULT_CONFIG }),
    { cpu: true, ram: false, disk: true, disk_path: "/home" },
  );
});

test("resolveConfig falls back to the checkout when the persistent file is missing", () => {
  const dir = makeTempDir();
  const persistentPath = path.join(dir, "persistent", "config.json");
  const checkoutPath = path.join(dir, "checkout", "config.json");

  writeJson(checkoutPath, { cpu: false, ram: false, disk: false, disk_path: "/var" });

  assert.deepEqual(
    resolveConfig({ persistentPath, checkoutPath, defaults: DEFAULT_CONFIG }),
    { cpu: false, ram: false, disk: false, disk_path: "/var" },
  );
});

test("resolveConfig returns defaults when both files are malformed", () => {
  const dir = makeTempDir();
  const persistentPath = path.join(dir, "persistent", "config.json");
  const checkoutPath = path.join(dir, "checkout", "config.json");

  writeRaw(persistentPath, "{ not json");
  writeRaw(checkoutPath, "also not json");

  assert.deepEqual(
    resolveConfig({ persistentPath, checkoutPath, defaults: DEFAULT_CONFIG }),
    { cpu: true, ram: true, disk: true, disk_path: "/" },
  );
});

test("resolveConfig returns defaults when both files are missing", () => {
  const dir = makeTempDir();

  assert.deepEqual(
    resolveConfig({
      persistentPath: path.join(dir, "persistent", "config.json"),
      checkoutPath: path.join(dir, "checkout", "config.json"),
      defaults: DEFAULT_CONFIG,
    }),
    { cpu: true, ram: true, disk: true, disk_path: "/" },
  );
});

test("resolveConfig uses only the checkout when persistentPath is null (env absent)", () => {
  const dir = makeTempDir();
  const checkoutPath = path.join(dir, "checkout", "config.json");
  writeJson(checkoutPath, { cpu: true, ram: false, disk: false, disk_path: "/tmp" });

  assert.deepEqual(
    resolveConfig({ persistentPath: null, checkoutPath, defaults: DEFAULT_CONFIG }),
    { cpu: true, ram: false, disk: false, disk_path: "/tmp" },
  );

  assert.deepEqual(
    resolveConfig({
      persistentPath: null,
      checkoutPath: path.join(dir, "missing.json"),
      defaults: DEFAULT_CONFIG,
    }),
    { cpu: true, ram: true, disk: true, disk_path: "/" },
  );
});

test("coerceConfig mirrors the coercion semantics status.js uses", () => {
  // Falsy/truthy metric flags and a non-empty disk_path string.
  assert.deepEqual(
    coerceConfig({ cpu: 0, ram: "yes", disk: 1, disk_path: "/mnt" }),
    { cpu: false, ram: true, disk: true, disk_path: "/mnt" },
  );
  // Empty or non-string disk_path falls back to the default path.
  assert.deepEqual(
    coerceConfig({ cpu: true, ram: false, disk: true, disk_path: "" }),
    { cpu: true, ram: false, disk: true, disk_path: "/" },
  );
  assert.deepEqual(
    coerceConfig({ cpu: true, ram: false, disk: true, disk_path: null }),
    { cpu: true, ram: false, disk: true, disk_path: "/" },
  );
  // Non-object input yields an all-disabled config (not the defaults).
  assert.deepEqual(coerceConfig(null), {
    cpu: false,
    ram: false,
    disk: false,
    disk_path: "/",
  });
  assert.deepEqual(coerceConfig(undefined), {
    cpu: false,
    ram: false,
    disk: false,
    disk_path: "/",
  });
  // A custom defaults object supplies the disk_path fallback.
  assert.deepEqual(coerceConfig({}, { disk_path: "/custom" }), {
    cpu: false,
    ram: false,
    disk: false,
    disk_path: "/custom",
  });
});

test("mergeWriteTargets writes both persistent and checkout copies", () => {
  const persistentPath = "/tmp/persistent/config.json";
  const checkoutPath = "/tmp/checkout/config.json";
  const config = { cpu: true, ram: false, disk: true, disk_path: "/data" };
  const json = '{\n  "cpu": true,\n  "ram": false,\n  "disk": true,\n  "disk_path": "/data"\n}\n';

  assert.deepEqual(
    mergeWriteTargets({ persistentPath, checkoutPath, config }),
    [
      { path: persistentPath, json },
      { path: checkoutPath, json },
    ],
  );
});

test("mergeWriteTargets writes only the checkout when persistentPath is null", () => {
  const checkoutPath = "/tmp/checkout/config.json";
  const config = { cpu: true, ram: true, disk: true, disk_path: "/" };
  const json = '{\n  "cpu": true,\n  "ram": true,\n  "disk": true,\n  "disk_path": "/"\n}\n';

  assert.deepEqual(mergeWriteTargets({ persistentPath: null, checkoutPath, config }), [
    { path: checkoutPath, json },
  ]);
});

test("mergeWriteTargets collapses to one entry when both paths are equal", () => {
  const sharedPath = "/tmp/shared/config.json";
  const config = { cpu: false, ram: false, disk: false, disk_path: "/" };
  const json = '{\n  "cpu": false,\n  "ram": false,\n  "disk": false,\n  "disk_path": "/"\n}\n';

  assert.deepEqual(
    mergeWriteTargets({ persistentPath: sharedPath, checkoutPath: sharedPath, config }),
    [{ path: sharedPath, json }],
  );
});

test("mergeWriteTargets writes JSON with two-space indent and a trailing newline", () => {
  const config = { cpu: true, ram: true, disk: true, disk_path: "/" };
  const [target] = mergeWriteTargets({
    persistentPath: null,
    checkoutPath: "/tmp/checkout/config.json",
    config,
  });

  assert.equal(target.json, `${JSON.stringify(config, null, 2)}\n`);
  assert.ok(target.json.endsWith("\n"));
});

test("configSummaryText renders the current status wording", () => {
  assert.equal(
    configSummaryText({ cpu: true, ram: false, disk: true, disk_path: "/data" }),
    "CPU metric: enabled\nRAM metric: disabled\nDISK metric: enabled\nDisk path: /data",
  );
});
