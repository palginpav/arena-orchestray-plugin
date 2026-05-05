#!/usr/bin/env node
'use strict';

/**
 * bin/arena-doctor.js — Arena file health checker.
 *
 * Scans ~/.claude/orchestray/custom-agents/ for files matching *-arena-v*.md
 * and re-validates each against the current validateCustomAgentFile(). Prints a
 * per-file verdict and exits 1 if any file fails.
 *
 * Options:
 *   --dir <path>       Directory to scan (default: ~/.claude/orchestray/custom-agents)
 *   --name-glob <re>   Regex to filter file names (default: /-arena-v\d+\.md$/)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Parse CLI args.
const args = process.argv.slice(2);
let dir = path.join(os.homedir(), '.claude', 'orchestray', 'custom-agents');
let nameGlobRe = /-arena-v\d+\.md$/;

/** Max length for --name-glob input to guard against ReDoS via very long inputs. */
const NAME_GLOB_MAX_LEN = 200;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) {
    dir = args[i + 1];
    i++;
  } else if (args[i] === '--name-glob' && args[i + 1]) {
    const globArg = args[i + 1];
    // M3: cap input length before RegExp compilation to prevent ReDoS.
    if (globArg.length > NAME_GLOB_MAX_LEN) {
      process.stderr.write(
        `[arena-doctor] --name-glob input too long (${globArg.length} > ${NAME_GLOB_MAX_LEN} chars)\n`
      );
      process.exit(2);
    }
    try {
      nameGlobRe = new RegExp(globArg);
    } catch (e) {
      process.stderr.write(`[arena-doctor] invalid --name-glob regex: ${e.message}\n`);
      process.exit(2);
    }
    i++;
  }
}

// Load validator from orchestray (required — no vendored fallback).
const { loadCustomAgents } = require('../lib/orchestray-loader');
const customAgentsMod = loadCustomAgents();
const { validateCustomAgentFile } = customAgentsMod;

if (!fs.existsSync(dir)) {
  process.stdout.write(`[arena-doctor] directory not found: ${dir}\n`);
  process.exit(0);
}

let files;
try {
  files = fs.readdirSync(dir);
} catch (e) {
  process.stderr.write(`[arena-doctor] cannot read directory ${dir}: ${e.message}\n`);
  process.exit(2);
}

const matching = files.filter(f => nameGlobRe.test(f));
if (matching.length === 0) {
  process.stdout.write(`[arena-doctor] no arena files found in ${dir}\n`);
  process.exit(0);
}

let bad = 0;
for (const f of matching.sort()) {
  const fullPath = path.join(dir, f);
  let result;
  try {
    result = validateCustomAgentFile(fullPath, {
      reservedNames: new Set(),
      shippedSpecialistNames: new Set(),
    });
  } catch (e) {
    process.stdout.write(`BAD ${f} (validator threw: ${e.message})\n`);
    bad++;
    continue;
  }
  if (result.ok) {
    process.stdout.write(`OK  ${f}\n`);
  } else {
    process.stdout.write(`BAD ${f} (${result.reason})\n`);
    bad++;
  }
}

process.exit(bad > 0 ? 1 : 0);
