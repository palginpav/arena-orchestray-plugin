'use strict';

/**
 * lib/emit.js — Validator-bound atomic write of a custom-agent .md file.
 *
 * Takes raw content already composed by the PM (in-conversation), validates slug
 * and output_dir, enforces security invariants (path traversal, canonical-collision,
 * NFKD normalization, 3-section refinement cap, 200 KB cap, symlink defense),
 * writes atomically via mkdtempSync, calls validateCustomAgentFile(), then
 * renames into place. No LLM calls, no transcript reads, no frontmatter merging.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadCustomAgents, loadCanonicalAgents } = require('./orchestray-loader');
const { ValidatorRejectedError } = require('./errors');

/** Valid slug pattern: lowercase, starts with letter, 2-48 chars. */
const SLUG_RE = /^[a-z][a-z0-9-]{1,47}$/;

/** Prefix that identifies active refinement sections (D3 cap). */
const REFINEMENT_HEADING_PREFIX = '## Refinements (Arena v';

/** Hard cap on stacked refinement sections in the content being written (D3). */
const REFINEMENT_SECTION_CAP = 3;

/**
 * NFKD-normalize a string for canonical-collision detection.
 * @param {string} s
 * @returns {string}
 */
function _nfkdLowerAscii(s) {
  return s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9-]/g, '');
}

/**
 * Count active refinement section headings in a content string.
 * @param {string} content
 * @returns {number}
 */
function _countRefinementSections(content) {
  let count = 0;
  let idx = 0;
  while ((idx = content.indexOf(REFINEMENT_HEADING_PREFIX, idx)) !== -1) {
    count++;
    idx += REFINEMENT_HEADING_PREFIX.length;
  }
  return count;
}

/**
 * Resolve output_dir with path-traversal defence.
 * Rejects `..` segments; realpath-checks against allowed roots.
 * Order: literal-dotdot check → path.resolve → allowed-root check → mkdir → realpath → re-check.
 * @param {string} dir
 * @returns {string} - Resolved real path
 */
function _resolveOutputDir(dir) {
  // 1. Literal traversal segment — fast reject before any filesystem mutation.
  if (dir.includes('..')) {
    throw new ValidatorRejectedError('output_dir contains parent traversal segment');
  }
  const allowed = [
    path.resolve(os.homedir(), '.claude', 'orchestray', 'custom-agents'),
    path.resolve(process.cwd(), 'out'),
    path.resolve(process.cwd(), 'prototype', 'out'),
    path.resolve(process.cwd(), '.tmp'),
    path.resolve(os.tmpdir()),
  ];
  // 2. Resolve absolute path WITHOUT creating it.
  const absDir = path.resolve(dir);
  // 3. Check absolute path against allowlist before any filesystem write.
  let underRoot = null;
  for (const root of allowed) {
    if (absDir === root || absDir.startsWith(root + path.sep)) { underRoot = root; break; }
  }
  if (!underRoot) {
    throw new ValidatorRejectedError(
      `output_dir ${absDir} is not under any allowed root (${allowed.join(', ')})`
    );
  }
  // 4. Now safe to create — target is inside a known-safe root.
  if (!fs.existsSync(absDir)) {
    fs.mkdirSync(absDir, { recursive: true });
  }
  // 5. realpath defence against symlinks inside allowed root pointing outside.
  const real = fs.realpathSync(absDir);
  for (const root of allowed) {
    if (real === root || real.startsWith(root + path.sep)) return real;
  }
  throw new ValidatorRejectedError(
    `output_dir ${dir} resolves via symlink to ${real} which is outside allowed roots`
  );
}

/**
 * Emit a custom-agent .md file from PM-composed raw content.
 *
 * Security invariants applied:
 * - Slug validated against SLUG_RE
 * - NFKD canonical-collision check against orchestray's CANONICAL_AGENTS
 * - output_dir path-traversal defence (literal `..` + realpath)
 * - Refinement section cap: content may not contain > 3 "## Refinements (Arena v" headings
 * - 200 KB content size cap
 * - Atomic mkdtempSync write followed by validateCustomAgentFile before rename
 * - No overwrite unless overwrite: true
 *
 * @param {{
 *   slug: string,
 *   content: string,
 *   output_dir?: string,
 *   overwrite?: boolean,
 *   dry_run?: boolean,
 * }} opts
 * @returns {{
 *   outputPath: string,
 *   validation: object,
 *   restart_required: true,
 *   text: string,
 *   content?: string,
 *   dryRun?: boolean,
 * }}
 */
function emitAgent(opts) {
  const {
    slug,
    content,
    output_dir: providedOutputDir,
    overwrite = false,
    dry_run: dryRun = false,
  } = opts;

  // Slug validation.
  if (!SLUG_RE.test(slug)) {
    throw new ValidatorRejectedError(`slug "${slug}" fails regex ${SLUG_RE.source}`);
  }

  // NFKD canonical-collision check.
  const canonMod = loadCanonicalAgents();
  const { CANONICAL_AGENTS } = canonMod;
  const normSlug = _nfkdLowerAscii(slug);
  for (const canon of CANONICAL_AGENTS) {
    if (_nfkdLowerAscii(canon) === normSlug) {
      throw new ValidatorRejectedError(
        `slug "${slug}" NFKD-collides with canonical agent name "${canon}"`
      );
    }
  }

  // Refinement section cap: count occurrences in the content to be written.
  // D3: max 3 active "## Refinements (Arena v" sections allowed.
  const sectionCount = _countRefinementSections(content);
  if (sectionCount > REFINEMENT_SECTION_CAP) {
    throw new ValidatorRejectedError(
      `refinement section count cap reached (${REFINEMENT_SECTION_CAP}); ` +
      `content contains ${sectionCount} refinement sections. ` +
      `Use a different slug or delete an older Arena-vN file`
    );
  }

  // 200 KB cap (H5).
  const byteLen = Buffer.byteLength(content, 'utf8');
  if (byteLen > 200 * 1024) {
    throw new ValidatorRejectedError(`content size ${byteLen} bytes exceeds 200 KB cap`);
  }

  // Resolve output dir.
  const outputDir = _resolveOutputDir(
    providedOutputDir || path.join(os.homedir(), '.claude', 'orchestray', 'custom-agents')
  );

  const finalPath = path.join(outputDir, `${slug}.md`);
  if (!dryRun) {
    if (fs.existsSync(finalPath) && !overwrite) {
      throw new ValidatorRejectedError(
        `output exists at ${finalPath} (pass overwrite: true to replace)`
      );
    }
  }

  // Write to tmp dir (basename must match slug for validator's filename===name check).
  // Atomic: mkdtempSync creates the directory atomically with a unique suffix.
  const tmpDir = fs.mkdtempSync(path.join(outputDir, '.arena-tmp-'));
  fs.chmodSync(tmpDir, 0o700);
  const tmpPath = path.join(tmpDir, `${slug}.md`);
  fs.writeFileSync(tmpPath, content, { mode: 0o600, encoding: 'utf8' });

  // Validator-bound write: validate before atomic rename.
  const customAgentsMod = loadCustomAgents();
  let validation;
  try {
    validation = customAgentsMod.validateCustomAgentFile(tmpPath, {
      reservedNames: new Set(),
      shippedSpecialistNames: new Set(),
    });
  } catch (e) {
    try { fs.unlinkSync(tmpPath); fs.rmdirSync(tmpDir); } catch (_) {}
    throw new ValidatorRejectedError(
      'validateCustomAgentFile threw: ' + (e && e.message ? e.message : String(e))
    );
  }

  if (!validation.ok) {
    try { fs.unlinkSync(tmpPath); fs.rmdirSync(tmpDir); } catch (_) {}
    throw new ValidatorRejectedError(
      `validateCustomAgentFile rejected the file: ${validation.reason}`
    );
  }

  if (dryRun) {
    try { fs.unlinkSync(tmpPath); fs.rmdirSync(tmpDir); } catch (_) {}
    return {
      outputPath: finalPath,
      validation,
      restart_required: true,
      text: `Agent would be written to ${finalPath}. (dry_run: true — no file written)`,
      content,
      dryRun: true,
    };
  }

  // Atomic rename tmp → final.
  try {
    fs.renameSync(tmpPath, finalPath);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    try { fs.rmdirSync(tmpDir); } catch (_) {}
    throw e;
  }
  try { fs.rmdirSync(tmpDir); } catch (_) {}

  return {
    outputPath: finalPath,
    validation,
    restart_required: true,
    text: `Agent written to ${finalPath}. Restart Claude Code (Ctrl+D, then re-launch) for the new agent to be visible.`,
  };
}

module.exports = {
  emitAgent,
  _resolveOutputDir,
  _countRefinementSections,
  _nfkdLowerAscii,
};
