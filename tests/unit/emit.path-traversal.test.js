'use strict';
// Module under test: lib/emit.js (_resolveOutputDir)
// Contract: path traversal attack shapes are rejected before any filesystem write.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { _resolveOutputDir } = require('../../lib/emit');
const { ValidatorRejectedError } = require('../../lib/errors');

// Attack shape 1: literal '..' segment in path
test('rejects output_dir containing literal ".." segment', () => {
  assert.throws(
    () => _resolveOutputDir('/tmp/../etc'),
    /traversal/i,
    'literal ".." in path must throw a traversal error'
  );
});

// Attack shape 2: home-dir escape via path.join(".." resolution)
test('rejects output_dir using ~/.claude/../../etc pattern with semantic error', () => {
  const homeEscape = path.join(os.homedir(), '.claude', '..', '..', 'etc');
  let threw = false;
  let errorMsg = '';
  try {
    _resolveOutputDir(homeEscape);
  } catch (e) {
    threw = true;
    errorMsg = (e && e.message) ? e.message : String(e);
  }
  assert.strictEqual(threw, true, '~/.claude/../../etc pattern must cause an error');
  assert.ok(
    /not under any allowed root/i.test(errorMsg),
    `Expected semantic 'not under any allowed root' error, got: ${errorMsg}`
  );
});

// Attack shape 3: absolute path outside allowed roots
test('rejects absolute output_dir outside allowed roots with semantic error before mkdir', () => {
  const outsidePath = '/var/secret-injected';
  let threw = false;
  let errorMsg = '';
  try {
    _resolveOutputDir(outsidePath);
  } catch (e) {
    threw = true;
    errorMsg = (e && e.message) ? e.message : String(e);
  }
  assert.strictEqual(threw, true, 'absolute path outside allowed root must be rejected');
  assert.ok(
    /not under any allowed root/i.test(errorMsg),
    `Expected semantic 'not under any allowed root' error, got: ${errorMsg}`
  );
  assert.ok(!fs.existsSync(outsidePath), 'no directory must be created at rejected path');
});

// Attack shape 4: symlink pointing to a directory outside allowed roots
test('rejects output_dir that is a symlink pointing outside allowed roots', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-sym-test-'));
  try {
    const symlinkPath = path.join(tmpBase, 'link-to-etc');
    try {
      fs.symlinkSync('/etc', symlinkPath);
    } catch (_) {
      return; // Symlink creation failed — skip
    }
    if (!fs.existsSync('/etc')) return;

    assert.throws(
      () => _resolveOutputDir(symlinkPath),
      /not under any allowed root|outside allowed roots/i,
      'symlink pointing to /etc must be rejected as outside allowed roots'
    );
  } finally {
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
  }
});

// Happy path: os.tmpdir() is an allowed root
test('accepts output_dir inside os.tmpdir()', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-pt-test-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });
  const result = _resolveOutputDir(tmpDir);
  assert.ok(typeof result === 'string', 'resolved path must be a string');
  assert.ok(result.startsWith(os.tmpdir()), 'resolved path must be under tmpdir');
});
