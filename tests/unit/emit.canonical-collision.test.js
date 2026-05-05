'use strict';
// Module under test: lib/emit.js (_nfkdLowerAscii + emitAgent canonical-collision check)
// Contract: slug that NFKD-collides with any name in the live CANONICAL_AGENTS set is rejected.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { _nfkdLowerAscii, emitAgent } = require('../../lib/emit');
const { loadCanonicalAgents, _resetLoaderCache } = require('../../lib/orchestray-loader');
const { ValidatorRejectedError } = require('../../lib/errors');

function makeAgentContent(slug) {
  return [
    '---',
    `name: ${slug}`,
    'description: Test agent for canonical collision checks.',
    'tools: Read',
    'model: sonnet',
    'effort: medium',
    'memory: project',
    'maxTurns: 25',
    '---',
    '',
    `# ${slug}`,
    '',
    'You are a test agent for canonical collision checks.',
    '',
    '## Core principle',
    '',
    'Check for canonical collisions.',
    '',
    '## Protocol',
    '',
    '1. Validate slugs against canonical agent names.',
    '2. Reject collisions immediately.',
    '3. Report the collision clearly.',
    '4. Do not proceed on collision.',
    '',
    '## What you do not do',
    '',
    '- Do not allow canonical name overrides.',
    '',
    '## Anti-patterns',
    '',
    '- Silently allowing name collisions.',
  ].join('\n');
}

test('loadCanonicalAgents returns CANONICAL_AGENTS as a Set', () => {
  _resetLoaderCache();
  const mod = loadCanonicalAgents();
  assert.ok(mod.CANONICAL_AGENTS instanceof Set, 'CANONICAL_AGENTS must be a Set');
  assert.ok(mod.CANONICAL_AGENTS.size > 0, 'CANONICAL_AGENTS must not be empty');
});

test('CANONICAL_AGENTS contains expected core agent names', () => {
  _resetLoaderCache();
  const mod = loadCanonicalAgents();
  const { CANONICAL_AGENTS } = mod;
  assert.ok(CANONICAL_AGENTS.has('pm'), 'pm must be canonical');
  assert.ok(CANONICAL_AGENTS.has('architect'), 'architect must be canonical');
  assert.ok(CANONICAL_AGENTS.has('developer'), 'developer must be canonical');
  assert.ok(CANONICAL_AGENTS.has('tester'), 'tester must be canonical');
  assert.ok(CANONICAL_AGENTS.has('reviewer'), 'reviewer must be canonical');
});

test('_nfkdLowerAscii collapses NFKD-equivalent unicode to ASCII base form', () => {
  // Cyrillic 'е' (U+0435) looks like 'e'; after NFKD it becomes non-ASCII and is stripped
  const cyrillicE = 'е'; // Cyrillic small letter ie
  const result = _nfkdLowerAscii(`review${cyrillicE}r`);
  // After normalization non-ASCII chars are removed, not substituted
  assert.notStrictEqual(result, 'reviewer', 'homoglyph should NOT equal the ASCII form after stripping');
});

test('every name in live CANONICAL_AGENTS NFKD-collides with its own lowercase form', () => {
  _resetLoaderCache();
  const mod = loadCanonicalAgents();
  for (const canon of mod.CANONICAL_AGENTS) {
    const normalized = _nfkdLowerAscii(canon);
    const expected = canon.toLowerCase().replace(/[^a-z0-9-]/g, '');
    assert.strictEqual(normalized, expected, `Unexpected normalization of canonical name: ${canon}`);
  }
});

test('emitAgent rejects slug "reviewer" with canonical-collision error', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-collision-test-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  let threw = false;
  try {
    emitAgent({
      slug: 'reviewer',
      content: makeAgentContent('reviewer'),
      output_dir: tmpDir,
      overwrite: false,
    });
  } catch (e) {
    threw = true;
    assert.ok(
      e instanceof ValidatorRejectedError || /canonical|collision/i.test(e.message),
      `Expected canonical-collision error, got: ${e.message}`
    );
  }
  assert.ok(threw, '"reviewer" slug must be rejected');
});

test('a safe custom slug does not collide with any canonical name', (t) => {
  _resetLoaderCache();
  const safeSlug = 'my-custom-coder-v1';
  const normSlug = _nfkdLowerAscii(safeSlug);
  const mod = loadCanonicalAgents();
  let collides = false;
  for (const canon of mod.CANONICAL_AGENTS) {
    if (_nfkdLowerAscii(canon) === normSlug) {
      collides = true;
      break;
    }
  }
  assert.strictEqual(collides, false, '"my-custom-coder-v1" must not collide with any canonical name');
});
