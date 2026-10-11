'use strict';

// Pure, dependency-free helpers for reading Linux hardware usage.
// Everything here is synchronous and side-effect free so it can be unit tested
// without touching procfs or the filesystem.

const BYTES_PER_GIB = 1024 ** 3;
const GB_DECIMAL = 1e9;
const KB_PER_MB = 1024;
const KB_PER_GIB = 1024 ** 2;

const STAT_FIELDS = [
  'user',
  'nice',
  'system',
  'idle',
  'iowait',
  'irq',
  'softirq',
  'steal',
];

/**
 * Parse the aggregate "cpu" line of /proc/stat.
 *
 * @param {string|null} line e.g. "cpu  123 45 67 890 12 3 4 9 0 0"
 * @returns {{user:number, nice:number, system:number, idle:number,
 *            iowait:number, irq:number, softirq:number, steal:number,
 *            total:number}|null}
 */
function parseProcStatCpu(line) {
  if (typeof line !== 'string') return null;

  const parts = line.trim().split(/\s+/);
  if (parts[0] !== 'cpu') return null;

  const values = parts.slice(1, 1 + STAT_FIELDS.length);
  if (values.length !== STAT_FIELDS.length) return null;

  const numbers = values.map((raw) => Number(raw));
  if (numbers.some((value) => !Number.isFinite(value) || value < 0)) return null;

  const sample = {};
  let total = 0;
  STAT_FIELDS.forEach((field, index) => {
    sample[field] = numbers[index];
    total += numbers[index];
  });
  sample.total = total;

  return sample;
}

/**
 * Busy CPU percentage between two samples. Idle and iowait are treated as
 * non-busy time.
 *
 * @param {{idle:number, iowait:number, total:number}|null} prev
 * @param {{idle:number, iowait:number, total:number}|null} curr
 * @returns {number|null}
 */
function cpuPercent(prev, curr) {
  if (!prev || !curr) return null;

  const totalDelta = curr.total - prev.total;
  const idleDelta = curr.idle - prev.idle;
  const iowaitDelta = curr.iowait - prev.iowait;

  if (!Number.isFinite(totalDelta) || totalDelta <= 0) return null;
  if (idleDelta < 0 || iowaitDelta < 0) return null;

  const nonBusy = (idleDelta + iowaitDelta) / totalDelta;
  return 100 * (1 - nonBusy);
}

/**
 * Parse /proc/meminfo, using MemTotal and MemAvailable.
 *
 * @param {string|null} text
 * @returns {{usedPercent:number, totalMb:number, usedMb:number}|null}
 */
function parseMeminfo(text) {
  if (typeof text !== 'string') return null;

  const readField = (name) => {
    const match = text.match(new RegExp(`^${name}:\\s+(\\d+)\\s*kB`, 'm'));
    return match ? Number(match[1]) : NaN;
  };

  const totalKb = readField('MemTotal');
  const availableKb = readField('MemAvailable');

  if (!Number.isFinite(totalKb) || !Number.isFinite(availableKb) || totalKb <= 0) {
    return null;
  }

  const usedKb = totalKb - availableKb;
  // GB fields are decimal (kB * 1024 bytes / 1e9) so module sizes match their
  // vendor labels (a 16 GB module reports ~16GB, not 15 GiB).
  return {
    usedPercent: (100 * usedKb) / totalKb,
    totalMb: totalKb / KB_PER_MB,
    usedMb: usedKb / KB_PER_MB,
    totalGb: (totalKb * KB_PER_MB) / GB_DECIMAL,
    usedGb: (usedKb * KB_PER_MB) / GB_DECIMAL,
  };
}

/**
 * Compute disk usage from a statfs-like object (e.g. fs.statfsSync output).
 *
 * @param {{blocks:number, bfree:number, bavail:number, bsize:number}|null} statfs
 * @returns {{usedPercent:number, totalGb:number, usedGb:number}|null}
 */
function statfsUsage(statfs) {
  if (!statfs) return null;

  const { blocks, bavail, bsize } = statfs;
  if (![blocks, bavail, bsize].every((value) => Number.isFinite(value))) return null;
  if (blocks <= 0 || bsize <= 0) return null;

  const usedBlocks = blocks - bavail;
  return {
    usedPercent: (100 * usedBlocks) / blocks,
    totalGb: (blocks * bsize) / BYTES_PER_GIB,
    usedGb: (usedBlocks * bsize) / BYTES_PER_GIB,
  };
}

/**
 * Render metric parts as the single status line herdr displays.
 *
 * Each part carries its own pre-rendered `text`; collectors own formatting so
 * metrics with value pairs (e.g. "RAM 2.4/16GB") render naturally.
 *
 * @param {Array<{text:string}|null|undefined>} parts
 * @param {string} [separator]
 * @returns {string}
 */
function renderLine(parts, separator = ' · ') {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join(separator);
}

module.exports = {
  parseProcStatCpu,
  cpuPercent,
  parseMeminfo,
  statfsUsage,
  renderLine,
};
