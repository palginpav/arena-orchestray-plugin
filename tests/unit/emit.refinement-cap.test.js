'use strict';
// Module under test: lib/emit.js (_countRefinementSections, emitAgent)
// Contract: D3 — content with more than 3 "## Refinements (Arena v" sections is rejected
//           with a ValidatorRejectedError containing "refinement section count cap reached".

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { _countRefinementSections, emitAgent } = require('../../lib/emit');
const { _resetLoaderCache } = require('../../lib/orchestray-loader');
const { ValidatorRejectedError } = require('../../lib/errors');

function makeAgentWithSections(slug, sectionCount) {
  const base = [
    '---',
    `name: ${slug}`,
    'description: A test agent with refinement sections.',
    'tools: Read',
    'model: sonnet',
    'effort: medium',
    'memory: project',
    'maxTurns: 25',
    '---',
    '',
    `# ${slug}`,
    '',
    'You are a test agent.',
    '',
    '## Core principle',
    '',
    'Test the cap.',
    '',
    '## Protocol',
    '',
    '1. Check the cap.',
    '2. Reject over-cap.',
    '3. Report clearly.',
    '4. Do not guess.',
    '',
    '## What you do not do',
    '',
    '- Do not exceed refinement cap.',
    '',
    '## Anti-patterns',
    '',
    '- Over-refinement.',
  ].join('\n');

  const sections = [];
  for (let i = 1; i <= sectionCount; i++) {
    sections.push([
      `## Refinements (Arena v${i})`,
      '',
      `> Origin: test run on 2026-05-05. Rounds: 3.`,
      '',
      '### Failure modes to actively guard against',
      `1. **fm-${i}** — description. Specifically: rule.`,
      '',
      '### Required disciplines added by sparring',
      '- rule 1',
      '',
      '### Anti-patterns surfaced',
      '- avoid pattern',
    ].join('\n'));
  }

  return base + '\n\n' + sections.join('\n\n') + '\n';
}

test('_countRefinementSections returns 0 for body with no refinements', () => {
  const body = '# Agent\n\nYou are a helpful agent.\n';
  assert.strictEqual(_countRefinementSections(body), 0);
});

test('_countRefinementSections returns 1 for single refinement heading', () => {
  const body = '# Agent\n\n## Refinements (Arena v1)\n\nSome content.\n';
  assert.strictEqual(_countRefinementSections(body), 1);
});

test('_countRefinementSections returns 3 for three refinement headings', () => {
  const body = [
    '# Agent',
    '',
    '## Refinements (Arena v1)',
    '> Origin: test.',
    '',
    '## Refinements (Arena v2)',
    '> Origin: test.',
    '',
    '## Refinements (Arena v3)',
    '> Origin: test.',
    '',
  ].join('\n');
  assert.strictEqual(_countRefinementSections(body), 3);
});

test('emitAgent accepts content with exactly 3 refinement sections', (t) => {
  _resetLoaderCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-cap-ok-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  const slug = 'cap-ok-agent';
  const content = makeAgentWithSections(slug, 3);
  const result = emitAgent({ slug, content, output_dir: tmpDir });
  assert.strictEqual(result.validation.ok, true, 'content with exactly 3 sections must be accepted');
});

test('emitAgent throws ValidatorRejectedError with "refinement section count cap reached" for content with 4 sections', async (t) => {
  _resetLoaderCache();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-cap-test-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  const slug = 'cap-exceeded-agent';
  const content = makeAgentWithSections(slug, 4);

  let threw = false;
  let caughtError = null;
  try {
    emitAgent({ slug, content, output_dir: tmpDir });
  } catch (e) {
    threw = true;
    caughtError = e;
  }

  assert.strictEqual(threw, true, 'content with 4 refinement sections must throw');
  assert.ok(
    caughtError instanceof ValidatorRejectedError,
    `Expected ValidatorRejectedError, got: ${caughtError && caughtError.constructor.name}`
  );
  assert.ok(
    /refinement section count cap reached/i.test(caughtError.message),
    `Error message must contain "refinement section count cap reached", got: ${caughtError && caughtError.message}`
  );
  assert.strictEqual(caughtError.code, -32099, `Error code must be -32099, got: ${caughtError && caughtError.code}`);
});
