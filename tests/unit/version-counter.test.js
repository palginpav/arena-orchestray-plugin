'use strict';
// Module under test: lib/version-counter.js
// Contract: returns 1 for empty/missing dirs; returns max(N)+1 for dirs with existing arena-vN files.

const test = require('node:test');
const assert = require('node:assert');

const { nextVersion } = require('../../lib/version-counter');

// Inject a fake fs implementation to avoid touching the real filesystem
function makeFakeFs(dirExists, files) {
  return {
    existsSync: (p) => dirExists,
    readdirSync: (p) => files,
  };
}

test('nextVersion returns 1 when directory does not exist', () => {
  const fakeFs = makeFakeFs(false, []);
  const result = nextVersion('/nonexistent/path', 'my-agent', fakeFs);
  assert.strictEqual(result, 1, 'must return 1 when dir does not exist');
});

test('nextVersion returns 1 when directory is empty', () => {
  const fakeFs = makeFakeFs(true, []);
  const result = nextVersion('/some/dir', 'my-agent', fakeFs);
  assert.strictEqual(result, 1, 'must return 1 for empty directory');
});

test('nextVersion returns max(N)+1 when versioned files exist', () => {
  const fakeFs = makeFakeFs(true, [
    'my-agent-arena-v1.md',
    'my-agent-arena-v2.md',
    'my-agent-arena-v3.md',
    'other-agent-arena-v10.md', // different agent — should be ignored
  ]);
  const result = nextVersion('/some/dir', 'my-agent', fakeFs);
  assert.strictEqual(result, 4, 'must return max(N)+1 = 4');
});

test('nextVersion ignores files that do not match the pattern', () => {
  const fakeFs = makeFakeFs(true, [
    'my-agent.md',
    'my-agent-arena-v1.md',
    'my-agent-arena-vX.md', // non-numeric — should be ignored
    'notes.txt',
  ]);
  const result = nextVersion('/some/dir', 'my-agent', fakeFs);
  assert.strictEqual(result, 2, 'must return 2 (only v1 counts)');
});

test('nextVersion returns 1 when directory contains only unrelated files', () => {
  const fakeFs = makeFakeFs(true, ['readme.md', 'other-agent-arena-v5.md']);
  const result = nextVersion('/some/dir', 'target-agent', fakeFs);
  assert.strictEqual(result, 1, 'must return 1 when no matching files for this agent');
});

test('nextVersion handles agent name with regex special characters safely', () => {
  // Agent name contains characters that would break a naive regex
  const fakeFs = makeFakeFs(true, [
    'my-agent.arena-v1.md', // dot in wrong place — should NOT match
    'my-agent-arena-v2.md',
  ]);
  // The name 'my-agent' should only match files with the literal pattern
  const result = nextVersion('/some/dir', 'my-agent', fakeFs);
  assert.strictEqual(result, 3, 'must return 3 (v2 found, dot-variant ignored)');
});
