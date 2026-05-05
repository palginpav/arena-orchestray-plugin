'use strict';

/**
 * lib/list-doctor.js — Small helpers for arena-list and arena-doctor tools.
 *
 * listAgents: filesystem scan for arena-trained custom agents.
 * doctor: re-validates each .md file against Orchestray's validateCustomAgentFile().
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadCustomAgents } = require('./orchestray-loader');

const DEFAULT_DIR = path.join(os.homedir(), '.claude', 'orchestray', 'custom-agents');

/**
 * List Arena-trained agents in a custom-agents directory.
 *
 * Files matching <slug>-arena-v<N>.md are treated as versioned refinements.
 * All other .md files are treated as v0 baselines (included only when includeV0 is true).
 *
 * @param {string|undefined} dir - Override directory; defaults to DEFAULT_DIR.
 * @param {boolean} includeV0 - Whether to include v0 baseline files.
 * @returns {{ slug: string, version: number, path: string, mtime: string }[]}
 */
function listAgents(dir, includeV0 = true) {
  const target = dir || DEFAULT_DIR;
  if (!fs.existsSync(target)) return [];
  const out = [];
  for (const f of fs.readdirSync(target)) {
    if (!f.endsWith('.md')) continue;
    const m = /^(.+?)-arena-v(\d+)\.md$/.exec(f);
    if (m) {
      const stat = fs.statSync(path.join(target, f));
      out.push({
        slug: m[1],
        version: parseInt(m[2], 10),
        path: path.join(target, f),
        mtime: stat.mtime.toISOString(),
      });
    } else if (includeV0) {
      const stat = fs.statSync(path.join(target, f));
      out.push({
        slug: path.basename(f, '.md'),
        version: 0,
        path: path.join(target, f),
        mtime: stat.mtime.toISOString(),
      });
    }
  }
  return out.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

/**
 * Validate each .md file in a directory against Orchestray's validateCustomAgentFile().
 *
 * @param {string|undefined} dir - Override directory; defaults to DEFAULT_DIR.
 * @returns {Promise<{ path: string, ok: boolean, reason?: string }[]>}
 */
async function doctor(dir) {
  const target = dir || DEFAULT_DIR;
  if (!fs.existsSync(target)) return [];
  const customAgentsMod = loadCustomAgents();
  const out = [];
  for (const f of fs.readdirSync(target)) {
    if (!f.endsWith('.md')) continue;
    const fullPath = path.join(target, f);
    let v;
    try {
      v = customAgentsMod.validateCustomAgentFile(fullPath, {
        reservedNames: new Set(),
        shippedSpecialistNames: new Set(),
      });
    } catch (e) {
      v = { ok: false, reason: e && e.message ? e.message : String(e) };
    }
    out.push({ path: fullPath, ok: v.ok, reason: v.ok ? undefined : v.reason });
  }
  return out;
}

module.exports = { listAgents, doctor, DEFAULT_DIR };
