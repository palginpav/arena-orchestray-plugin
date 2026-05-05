'use strict';
// Module under test: lib/emit.js (emitAgent — slug and content validation)
// Contract: malformed slug, oversized content, and invalid output_dir are rejected
//           with descriptive errors before any filesystem write.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { emitAgent } = require('../../lib/emit');
const { ValidatorRejectedError } = require('../../lib/errors');
const { _resetLoaderCache } = require('../../lib/orchestray-loader');

function makeMinimalContent(slug) {
  return [
    '---',
    `name: ${slug}`,
    'description: Minimal agent for input validation tests.',
    'tools: Read',
    'model: sonnet',
    'effort: medium',
    'memory: project',
    'maxTurns: 25',
    '---',
    '',
    `# ${slug}`,
    '',
    'You are a minimal test agent.',
    '',
    '## Core principle',
    '',
    'Validate inputs.',
    '',
    '## Protocol',
    '',
    '1. Check slug format.',
    '2. Check content size.',
    '3. Check output_dir.',
    '4. Reject invalid inputs.',
    '',
    '## What you do not do',
    '',
    '- Do not accept malformed slugs.',
    '',
    '## Anti-patterns',
    '',
    '- Accepting invalid slugs.',
  ].join('\n');
}

test('emitAgent rejects slug with uppercase letters', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-inputval-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  let threw = false;
  try {
    emitAgent({ slug: 'MyAgent', content: makeMinimalContent('MyAgent'), output_dir: tmpDir });
  } catch (e) {
    threw = true;
    assert.ok(
      e instanceof ValidatorRejectedError || /slug/i.test(e.message),
      `Expected slug validation error, got: ${e.message}`
    );
  }
  assert.ok(threw, 'uppercase slug must be rejected');
});

test('emitAgent rejects slug starting with a digit', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-inputval-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  let threw = false;
  try {
    emitAgent({ slug: '1agent', content: makeMinimalContent('1agent'), output_dir: tmpDir });
  } catch (e) {
    threw = true;
    assert.ok(
      e instanceof ValidatorRejectedError || /slug/i.test(e.message),
      `Expected slug validation error, got: ${e.message}`
    );
  }
  assert.ok(threw, 'slug starting with digit must be rejected');
});

test('emitAgent rejects slug longer than 48 chars', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-inputval-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  const longSlug = 'a' + 'b'.repeat(48); // 49 chars — one over the limit
  let threw = false;
  try {
    emitAgent({ slug: longSlug, content: makeMinimalContent(longSlug), output_dir: tmpDir });
  } catch (e) {
    threw = true;
    assert.ok(
      e instanceof ValidatorRejectedError || /slug/i.test(e.message),
      `Expected slug validation error, got: ${e.message}`
    );
  }
  assert.ok(threw, '49-char slug must be rejected');
});

test('emitAgent rejects content exceeding 200 KB', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-inputval-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  const slug = 'oversize-agent';
  // Build content just over 200 KB.
  const padding = 'x'.repeat(200 * 1024 + 1);
  const oversize = makeMinimalContent(slug) + '\n\n' + padding;

  let threw = false;
  try {
    emitAgent({ slug, content: oversize, output_dir: tmpDir });
  } catch (e) {
    threw = true;
    assert.ok(
      /200 KB|200kb|size|cap/i.test(e.message),
      `Expected size cap error, got: ${e.message}`
    );
  }
  assert.ok(threw, '200 KB+ content must be rejected');
});

test('emitAgent accepts valid slug and content', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-inputval-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  const slug = 'valid-test-agent';
  const result = emitAgent({ slug, content: makeMinimalContent(slug), output_dir: tmpDir });
  assert.strictEqual(result.validation.ok, true, 'valid input must pass');
});

test('emitAgent rejects output_dir with ".." segment', (t) => {
  _resetLoaderCache();
  let threw = false;
  try {
    emitAgent({ slug: 'safe-slug', content: makeMinimalContent('safe-slug'), output_dir: '/tmp/../etc' });
  } catch (e) {
    threw = true;
    assert.ok(
      /traversal/i.test(e.message) || /not under any allowed root/i.test(e.message),
      `Expected traversal error, got: ${e.message}`
    );
  }
  assert.ok(threw, 'output_dir with ".." must be rejected');
});
