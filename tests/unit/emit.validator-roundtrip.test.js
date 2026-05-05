'use strict';
// Module under test: lib/emit.js (emitAgent)
// Contract: emitAgent produces a file that passes validateCustomAgentFile() both before
//           (via the atomic write) and after (re-validation at rest).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { emitAgent } = require('../../lib/emit');
const { loadCustomAgents, _resetLoaderCache } = require('../../lib/orchestray-loader');

function makeValidAgentContent(slug) {
  return [
    '---',
    `name: ${slug}`,
    'description: A valid test agent for round-trip validation.',
    'tools: Read, Glob',
    'model: sonnet',
    'effort: medium',
    'memory: project',
    'maxTurns: 25',
    '---',
    '',
    `# ${slug}`,
    '',
    'You are a focused test agent for validating the round-trip emit path.',
    '',
    '## Core principle',
    '',
    'Emit correctly and validate at rest.',
    '',
    '## Protocol',
    '',
    '1. Compose valid frontmatter.',
    '2. Write valid body.',
    '3. Call emitAgent with the composed content.',
    '4. Re-validate the file at rest.',
    '',
    '## What you do not do',
    '',
    '- Do not skip validation.',
    '',
    '## Anti-patterns',
    '',
    '- Invalid frontmatter.',
  ].join('\n');
}

test('emitAgent writes file that passes validateCustomAgentFile at rest', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-roundtrip-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  const slug = 'roundtrip-agent';
  const content = makeValidAgentContent(slug);

  const result = emitAgent({ slug, content, output_dir: tmpDir });

  assert.strictEqual(result.validation.ok, true, `emit-time validation must pass, got: ${result.validation.reason}`);
  assert.ok(fs.existsSync(result.outputPath), 'output file must exist on disk');

  // Re-validate at rest.
  const customAgentsMod = loadCustomAgents();
  const reVal = customAgentsMod.validateCustomAgentFile(result.outputPath, {
    reservedNames: new Set(),
    shippedSpecialistNames: new Set(),
  });
  assert.strictEqual(reVal.ok, true, `post-write re-validation must pass, got: ${reVal.reason}`);
  assert.strictEqual(reVal.record.name, slug, `record.name must equal slug, got: ${reVal.record.name}`);
});

test('emitAgent result has restart_required: true', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-restart-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  const slug = 'restart-required-agent';
  const content = makeValidAgentContent(slug);

  const result = emitAgent({ slug, content, output_dir: tmpDir });
  assert.strictEqual(result.restart_required, true, 'result must have restart_required: true');
});

test('emitAgent result text mentions "Agent written to"', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-text-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  const slug = 'text-check-agent';
  const content = makeValidAgentContent(slug);

  const result = emitAgent({ slug, content, output_dir: tmpDir });
  assert.ok(
    result.text && result.text.includes('Agent written to'),
    `result.text must mention "Agent written to", got: ${result.text}`
  );
});

test('emitAgent with dry_run: true does not write file', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-dryrun-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  const slug = 'dryrun-agent';
  const content = makeValidAgentContent(slug);

  const result = emitAgent({ slug, content, output_dir: tmpDir, dry_run: true });
  assert.strictEqual(result.dryRun, true, 'dry_run result must have dryRun: true');
  assert.strictEqual(result.validation.ok, true, 'dry_run validation must pass');
  assert.ok(!fs.existsSync(result.outputPath), `dry_run must not write file at ${result.outputPath}`);
});
