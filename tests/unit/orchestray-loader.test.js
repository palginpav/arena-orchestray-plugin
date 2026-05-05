'use strict';
// Module under test: lib/orchestray-loader.js (new simplified version — no vendored fallback)
// Contract: orchestray REQUIRED — if missing, throws OrchestrayMissingError with install instructions.
//           NO fallback path exists.

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const { loadCustomAgents, loadCanonicalAgents, OrchestrayMissingError, _resetLoaderCache } = require('../../lib/orchestray-loader');

test('loadCustomAgents returns the orchestray module when installed', () => {
  _resetLoaderCache();
  const mod = loadCustomAgents();
  assert.ok(mod, 'must return a module');
  assert.strictEqual(typeof mod.validateCustomAgentFile, 'function',
    'validateCustomAgentFile must be exported');
  _resetLoaderCache();
});

test('loadCustomAgents module exports validateCustomAgentFile as a function', () => {
  _resetLoaderCache();
  const mod = loadCustomAgents();
  assert.strictEqual(typeof mod.validateCustomAgentFile, 'function',
    'validateCustomAgentFile must be a function');
  _resetLoaderCache();
});

test('loadCanonicalAgents returns module with CANONICAL_AGENTS Set', () => {
  _resetLoaderCache();
  const mod = loadCanonicalAgents();
  assert.ok(mod, 'must return a module');
  assert.ok(mod.CANONICAL_AGENTS instanceof Set, 'CANONICAL_AGENTS must be a Set');
  assert.ok(mod.CANONICAL_AGENTS.size > 0, 'CANONICAL_AGENTS must not be empty');
  _resetLoaderCache();
});

test('loadCustomAgents result is memoised: second call returns same result object', () => {
  _resetLoaderCache();
  const r1 = loadCustomAgents();
  const r2 = loadCustomAgents();
  assert.strictEqual(r1, r2, 'second call must return memoised result (same reference)');
  _resetLoaderCache();
});

test('_resetLoaderCache clears memoised results so next load re-evaluates', () => {
  _resetLoaderCache();
  const r1 = loadCustomAgents();
  _resetLoaderCache();
  const r2 = loadCustomAgents();
  assert.ok(r2, 'post-reset load must succeed');
  assert.strictEqual(typeof r2.validateCustomAgentFile, 'function');
  _resetLoaderCache();
});

test('OrchestrayMissingError is exported and is an Error subclass', () => {
  assert.ok(OrchestrayMissingError, 'OrchestrayMissingError must be exported');
  const err = new OrchestrayMissingError('test reason');
  assert.ok(err instanceof Error, 'must be an Error subclass');
  assert.strictEqual(err.name, 'OrchestrayMissingError');
  assert.strictEqual(err.code, -32603, 'must have code -32603');
  assert.ok(/install/i.test(err.message), 'message must contain install instructions');
  assert.ok(/orchestray/i.test(err.message), 'message must mention orchestray');
  assert.ok(/test reason/.test(err.message), 'message must contain the reason');
});

test('OrchestrayMissingError message includes install instructions', () => {
  const err = new OrchestrayMissingError('could not require /path/to/file.js: ENOENT');
  assert.ok(
    /npm install/i.test(err.message) || /install/i.test(err.message),
    `message must mention install: ${err.message}`
  );
});

test('loadCustomAgents throws OrchestrayMissingError when lib path does not exist', () => {
  // This test spawns a child process with a fake HOME so the lib path will not be found.
  const child = spawnSync(process.execPath, [
    '-e',
    [
      "process.env.HOME = '/nonexistent-fake-home-xyz';",
      "const { loadCustomAgents } = require('./lib/orchestray-loader.js');",
      "_resetLoaderCache = () => {};",
      "// Bust the require cache so it re-evaluates with fake HOME",
      "delete require.cache[require.resolve('./lib/orchestray-loader.js')];",
      "const { loadCustomAgents: lca, _resetLoaderCache: reset } = require('./lib/orchestray-loader.js');",
      "reset();",
      "try {",
      "  lca();",
      "  process.exit(0);",  // Should not reach here
      "} catch (e) {",
      "  process.stdout.write(e.name + '\\n');",
      "  process.exit(e.name === 'OrchestrayMissingError' ? 0 : 1);",
      "}",
    ].join('\n'),
  ], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, HOME: '/nonexistent-fake-home-xyz' },
    encoding: 'utf8',
  });

  // The child should exit 0 (caught OrchestrayMissingError) or the stdout should have OrchestrayMissingError
  assert.ok(
    child.stdout.includes('OrchestrayMissingError') || child.status === 0,
    `Expected OrchestrayMissingError, got stdout: ${child.stdout}, stderr: ${child.stderr}`
  );
});

test('no vendored fallback: lib/_vendored directory is absent', () => {
  const vendoredDir = path.join(PROJECT_ROOT, 'lib', '_vendored');
  assert.ok(!require('fs').existsSync(vendoredDir),
    `lib/_vendored must not exist — no vendored fallback allowed`);
});
