'use strict';

/**
 * lib/version-counter.js — Derive the next arena version number for an agent.
 *
 * Scans outputDir for files matching `${originalName}-arena-v<N>.md` and returns
 * max(N)+1, or 1 if no such files exist. The fs dependency is injectable for
 * deterministic unit testing without real filesystem access.
 */

const path = require('path');

/**
 * Return the next arena version number for originalName in outputDir.
 *
 * @param {string} outputDir - Directory to scan
 * @param {string} originalName - Base agent name (e.g. "sample-coder")
 * @param {typeof import('fs')} [fsImpl] - Injectable fs module (defaults to require('fs'))
 * @returns {number}
 */
function nextVersion(outputDir, originalName, fsImpl) {
  const fs = fsImpl || require('fs');
  let existsSync, readdirSync;
  if (typeof fs.existsSync === 'function') {
    existsSync = (p) => fs.existsSync(p);
    readdirSync = (p) => fs.readdirSync(p);
  } else {
    existsSync = fs.existsSync;
    readdirSync = fs.readdirSync;
  }

  if (!existsSync(outputDir)) return 1;

  let files;
  try {
    files = readdirSync(outputDir);
  } catch (_) {
    return 1;
  }

  const re = new RegExp(`^${originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-arena-v(\\d+)\\.md$`);
  let max = 0;
  for (const f of files) {
    const m = re.exec(f);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}

module.exports = { nextVersion };
