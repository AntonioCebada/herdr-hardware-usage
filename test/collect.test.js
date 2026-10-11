'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseProcStatCpu,
  cpuPercent,
  parseMeminfo,
  statfsUsage,
  renderLine,
} = require('../lib/collect.js');

test('parseProcStatCpu parses a realistic aggregate line', () => {
  const sample = parseProcStatCpu('cpu  123 45 67 890 12 3 4 9 0 0');
  assert.deepEqual(sample, {
    user: 123,
    nice: 45,
    system: 67,
    idle: 890,
    iowait: 12,
    irq: 3,
    softirq: 4,
    steal: 9,
    total: 1153,
  });
});

test('parseProcStatCpu accepts a line with extra leading spaces', () => {
  const sample = parseProcStatCpu('cpu    1 2 3 4 5 6 7 8 0 0');
  assert.equal(sample.total, 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8);
});

test('parseProcStatCpu returns null for malformed input', () => {
  assert.equal(parseProcStatCpu(null), null);
  assert.equal(parseProcStatCpu(undefined), null);
  assert.equal(parseProcStatCpu(''), null);
  assert.equal(parseProcStatCpu('intr 1 2 3'), null);
  assert.equal(parseProcStatCpu('cpu 1 2 3'), null);
  assert.equal(parseProcStatCpu('cpu a b c d e f g h'), null);
});

test('cpuPercent computes busy time between two samples', () => {
  const prev = { idle: 100, iowait: 10, total: 200 };
  const curr = { idle: 150, iowait: 20, total: 300 };
  // idle delta 50 + iowait delta 10 = 60 non-busy out of 100 total -> 40% busy
  assert.equal(cpuPercent(prev, curr), 40);
});

test('cpuPercent counts iowait as non-busy time', () => {
  const prev = { idle: 0, iowait: 0, total: 100 };
  const curr = { idle: 0, iowait: 50, total: 200 };
  assert.equal(cpuPercent(prev, curr), 50);
});

test('cpuPercent returns null for unusable deltas', () => {
  assert.equal(cpuPercent(null, { idle: 1, iowait: 1, total: 10 }), null);
  assert.equal(cpuPercent({ idle: 1, iowait: 1, total: 10 }, null), null);
  // zero total delta
  assert.equal(cpuPercent({ idle: 1, iowait: 1, total: 10 }, { idle: 1, iowait: 1, total: 10 }), null);
  // negative deltas
  assert.equal(cpuPercent({ idle: 50, iowait: 5, total: 100 }, { idle: 1, iowait: 1, total: 10 }), null);
});

test('parseMeminfo computes used percent and megabytes', () => {
  const text = [
    'MemTotal:       16384000 kB',
    'MemFree:         1000000 kB',
    'MemAvailable:    8192000 kB',
    'Buffers:          500000 kB',
    'Cached:          2000000 kB',
  ].join('\n');
  const mem = parseMeminfo(text);
  assert.equal(mem.totalMb, 16000);
  assert.equal(mem.usedMb, 8000);
  assert.equal(mem.usedPercent, 50);
});

test('parseMeminfo returns null when fields are missing or non-numeric', () => {
  assert.equal(parseMeminfo('MemTotal: 1000 kB\n'), null);
  assert.equal(parseMeminfo('MemAvailable: 500 kB\n'), null);
  assert.equal(parseMeminfo('MemTotal: abc kB\nMemAvailable: 500 kB\n'), null);
  assert.equal(parseMeminfo(null), null);
});

test('statfsUsage computes used percent and gigabytes', () => {
  const usage = statfsUsage({ blocks: 1048576, bfree: 524288, bavail: 524288, bsize: 1024 });
  assert.equal(usage.totalGb, 1);
  assert.equal(usage.usedGb, 0.5);
  assert.equal(usage.usedPercent, 50);
});

test('statfsUsage returns null for non-finite or zero values', () => {
  assert.equal(statfsUsage(null), null);
  assert.equal(statfsUsage({ blocks: 0, bfree: 0, bavail: 0, bsize: 4096 }), null);
  assert.equal(statfsUsage({ blocks: NaN, bfree: 0, bavail: 0, bsize: 4096 }), null);
  assert.equal(statfsUsage({ blocks: 100, bfree: 10, bavail: 10, bsize: Infinity }), null);
});

test('renderLine formats metric parts into a single line', () => {
  const line = renderLine([
    { label: 'CPU', percent: 12.4 },
    { label: 'RAM', percent: 60 },
    { label: 'DISK /', percent: 62 },
  ]);
  assert.equal(line, 'CPU 12% · RAM 60% · DISK / 62%');
});

test('renderLine supports a custom separator and empty input', () => {
  assert.equal(renderLine([{ label: 'CPU', percent: 5 }], ' | '), 'CPU 5%');
  assert.equal(renderLine([], ' · '), '');
});
