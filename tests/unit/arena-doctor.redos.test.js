'use strict';
// Module under test: bin/arena-doctor.js — M3 ReDoS guard.
// Covers:
//   1. --name-glob input of length 300 exits with code 2 and a clear error message.
//   2. --name-glob of length 200 (at the limit) is accepted.
//   3. Normal --name-glob usage still works.

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');

const DOCTOR = path.resolve(__dirname, '../../bin/arena-doctor.js');

test('M3: --name-glob of length 300 causes arena-doctor to exit 2 with clear error', () => {
  const longGlob = 'a'.repeat(300);
  const result = spawnSync(process.execPath, [DOCTOR, '--name-glob', longGlob], {
    encoding: 'utf8',
    env: process.env,
  });

  assert.strictEqual(result.status, 2,
    `Expected exit code 2, got ${result.status}. stderr: ${result.stderr}`);
  assert.ok(
    /too long|300|200/i.test(result.stderr),
    `stderr must mention the length limit, got: "${result.stderr}"`
  );
});

test('M3: --name-glob of exactly 200 chars is accepted (no exit 2)', () => {
  // 200 chars of literal 'a' is a valid regex.
  const maxGlob = 'a'.repeat(200);
  // Point to a non-existent dir so arena-doctor exits 0 (dir not found) or 1 (bad files).
  // We just care it does NOT exit 2 (the length-guard path).
  const result = spawnSync(
    process.execPath,
    [DOCTOR, '--name-glob', maxGlob, '--dir', '/nonexistent-arena-dir-xyz'],
    {
      encoding: 'utf8',
      env: process.env,
    }
  );

  assert.notStrictEqual(result.status, 2,
    `--name-glob of 200 chars should not trigger the length guard (exit 2), got status ${result.status}`);
  assert.ok(
    !/too long/i.test(result.stderr),
    `stderr must not contain "too long", got: "${result.stderr}"`
  );
});

test('M3: --name-glob of 201 chars causes exit 2', () => {
  const overGlob = 'b'.repeat(201);
  const result = spawnSync(process.execPath, [DOCTOR, '--name-glob', overGlob], {
    encoding: 'utf8',
    env: process.env,
  });

  assert.strictEqual(result.status, 2,
    `Expected exit code 2 for 201-char input, got ${result.status}. stderr: ${result.stderr}`);
});
