#!/usr/bin/env node
'use strict';

/**
 * bin/arena-smoke.js — Arena plugin smoke harness (rdev2-04/rdev2-09 evidence).
 *
 * Tests the new emit-based architecture end-to-end without any LLM calls.
 * All content is pre-composed (as the PM would do in-conversation).
 *
 * Assertions:
 *   1. emitAgent() writes a valid file to /tmp for a well-formed agent.
 *   2. File lands at expected path, passes validateCustomAgentFile().
 *   3. Canonical-collision rejection: slug 'reviewer' throws.
 *   4. Path-traversal rejection: output_dir '/tmp/../etc' throws.
 *   5. 3-section refinement cap throws when content has >3 refinement sections.
 *   6. overwrite: false rejects a second write to the same slug.
 *   7. dry_run: true does not write a file but returns expected shape.
 *
 * Exit: 0 PASS, 1 assertion failure, 2 unexpected error.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const os = require('os');

// Load emit.js (uses orchestray-loader.js).
const { emitAgent } = require('../lib/emit');
const { ValidatorRejectedError } = require('../lib/errors');

function pass(msg) {
  console.log(`[smoke] PASS: ${msg}`);
}

// ---- Sample content (PM would compose this in-conversation) ----------------

const SMOKE_SLUG = 'smoke-test-agent';

function makeAgentContent(slug, extraSections) {
  const refinements = extraSections ? extraSections : '';
  return [
    '---',
    `name: ${slug}`,
    'description: A focused smoke-test agent for validating the Arena plugin emit path.',
    'tools: Read, Glob, Grep',
    'model: sonnet',
    'effort: medium',
    'memory: project',
    'maxTurns: 25',
    '---',
    '',
    `# ${slug}`,
    '',
    'You are a focused smoke-test agent. Your role is to validate the Arena plugin emit path.',
    '',
    '## Core principle',
    '',
    'Emit correctly formatted agent files and reject malformed inputs.',
    '',
    '## Protocol',
    '',
    '1. Read the input carefully.',
    '2. Validate the format against the spec.',
    '3. Report any discrepancies clearly.',
    '4. Do not guess — ask for clarification if the input is ambiguous.',
    '',
    '## What you do not do',
    '',
    '- Do not modify files outside your scope.',
    '- Do not skip validation steps.',
    '',
    '## Anti-patterns',
    '',
    '- Silently swallowing errors.',
    '- Guessing at ambiguous inputs.',
    refinements,
  ].join('\n');
}

// ---- Main ------------------------------------------------------------------

async function main() {
  console.log('[smoke] arena plugin smoke harness (new emit architecture)');

  // Use a tmp dir as the output dir so we do not pollute the real custom-agents dir.
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-smoke-'));
  let cleanedUp = false;
  function cleanup() {
    if (!cleanedUp) {
      try { fs.rmSync(tmpOut, { recursive: true, force: true }); } catch (_) {}
      cleanedUp = true;
    }
  }
  process.on('exit', cleanup);

  try {
    // -- 1. Basic emit: valid agent content lands at expected path --
    const content = makeAgentContent(SMOKE_SLUG);
    const result = emitAgent({
      slug: SMOKE_SLUG,
      content,
      output_dir: tmpOut,
      overwrite: false,
    });

    assert.strictEqual(result.restart_required, true, 'restart_required must be true');
    assert.ok(result.outputPath.endsWith(`${SMOKE_SLUG}.md`), `outputPath must end with ${SMOKE_SLUG}.md, got: ${result.outputPath}`);
    assert.ok(fs.existsSync(result.outputPath), 'output file must exist on disk');
    assert.strictEqual(result.validation.ok, true, `validation must pass, got: ${result.validation.reason}`);
    assert.ok(result.text && result.text.includes('Agent written to'), `text should mention "Agent written to", got: ${result.text}`);
    pass('emitAgent writes valid file, validation passes, restart_required: true');

    // -- 2. Re-validate the emitted file at rest --
    const { loadCustomAgents } = require('../lib/orchestray-loader');
    const customAgentsMod = loadCustomAgents();
    const reVal = customAgentsMod.validateCustomAgentFile(result.outputPath, {
      reservedNames: new Set(),
      shippedSpecialistNames: new Set(),
    });
    assert.strictEqual(reVal.ok, true, `post-write re-validation must pass, got: ${reVal.reason}`);
    assert.strictEqual(reVal.record.name, SMOKE_SLUG, `record.name must equal slug, got: ${reVal.record.name}`);
    pass('validateCustomAgentFile passes on emitted file at rest');

    // -- 3. Canonical-collision rejection: slug 'reviewer' --
    let collisionThrew = false;
    try {
      emitAgent({
        slug: 'reviewer',
        content: makeAgentContent('reviewer'),
        output_dir: tmpOut,
        overwrite: false,
      });
    } catch (e) {
      collisionThrew = true;
      assert.ok(
        e instanceof ValidatorRejectedError || /canonical|collision/i.test(e.message),
        `expected canonical-collision error, got: ${e.message}`
      );
    }
    assert.ok(collisionThrew, 'canonical slug collision must be rejected');
    pass('canonical-collision rejection: slug "reviewer" throws');

    // -- 4. Path-traversal rejection: output_dir '/tmp/../etc' --
    let traversalThrew = false;
    try {
      emitAgent({
        slug: SMOKE_SLUG,
        content,
        output_dir: '/tmp/../etc',
        overwrite: true,
      });
    } catch (e) {
      traversalThrew = true;
      assert.ok(
        /traversal/i.test(e.message) || /not under any allowed root/.test(e.message),
        `expected traversal error, got: ${e.message}`
      );
    }
    assert.ok(traversalThrew, 'path traversal must be rejected');
    pass('path-traversal rejection: "/tmp/../etc" throws');

    // -- 5. 3-section refinement cap: content with >3 refinement sections throws --
    const cappedContent = makeAgentContent('smoke-capped', [
      '## Refinements (Arena v1)',
      '> Origin: test.',
      '',
      '### Failure modes to actively guard against',
      '1. **fm-a** — description. Specifically: rule.',
      '',
      '## Refinements (Arena v2)',
      '> Origin: test.',
      '',
      '### Failure modes to actively guard against',
      '1. **fm-b** — description. Specifically: rule.',
      '',
      '## Refinements (Arena v3)',
      '> Origin: test.',
      '',
      '### Failure modes to actively guard against',
      '1. **fm-c** — description. Specifically: rule.',
      '',
      '## Refinements (Arena v4)',
      '> Origin: test.',
      '',
      '### Failure modes to actively guard against',
      '1. **fm-d** — description. Specifically: rule.',
    ].join('\n'));

    let capThrew = false;
    try {
      emitAgent({
        slug: 'smoke-capped',
        content: cappedContent,
        output_dir: tmpOut,
        overwrite: false,
      });
    } catch (e) {
      capThrew = true;
      assert.ok(
        e instanceof ValidatorRejectedError,
        `Expected ValidatorRejectedError, got: ${e && e.constructor.name}`
      );
      assert.ok(
        /refinement section count cap reached/i.test(e.message) || /cap/i.test(e.message),
        `expected cap error, got: ${e.message}`
      );
      assert.strictEqual(e.code, -32099, `expected code -32099, got ${e.code}`);
    }
    assert.ok(capThrew, '4th refinement section must be rejected');
    pass('3-section refinement cap throws on content with >3 sections');

    // -- 6. overwrite: false rejects a second write to same slug --
    let overwriteThrew = false;
    try {
      emitAgent({
        slug: SMOKE_SLUG,
        content,
        output_dir: tmpOut,
        overwrite: false,
      });
    } catch (e) {
      overwriteThrew = true;
      assert.ok(
        /output exists/i.test(e.message) || /overwrite/i.test(e.message),
        `expected overwrite error, got: ${e.message}`
      );
    }
    assert.ok(overwriteThrew, 'second write without overwrite must be rejected');
    pass('overwrite: false rejects duplicate slug');

    // -- 7. dry_run: true does not write a file --
    const drySlug = 'smoke-dry-run-agent';
    const dryContent = makeAgentContent(drySlug);
    const dryResult = emitAgent({
      slug: drySlug,
      content: dryContent,
      output_dir: tmpOut,
      overwrite: false,
      dry_run: true,
    });
    assert.strictEqual(dryResult.restart_required, true, 'dry_run result must have restart_required: true');
    assert.strictEqual(dryResult.dryRun, true, 'dry_run result must have dryRun: true');
    assert.ok(!fs.existsSync(dryResult.outputPath), `dry_run must not write file at ${dryResult.outputPath}`);
    assert.strictEqual(dryResult.validation.ok, true, 'dry_run validation must pass');
    pass('dry_run: true validates without writing');

  } finally {
    cleanup();
  }

  console.log('\n[smoke] PASS — all assertions met');
}

main().catch(err => {
  console.error('[smoke] FAIL:', err && err.stack ? err.stack : String(err));
  process.exit(err instanceof assert.AssertionError ? 1 : 2);
});
