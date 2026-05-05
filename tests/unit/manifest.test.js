'use strict';
// Module under test: orchestray-plugin.json
// Contract: orchestray-plugin manifest must parse through parseManifest(),
//           declare 5 specific tools, name='arena', transport='stdio', runtime='node'.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseManifest } = require('/home/palgin/orchestray/bin/_lib/plugin-manifest-schema');

const MANIFEST_PATH = path.resolve(__dirname, '../../orchestray-plugin.json');
const EXPECTED_TOOLS = ['arena-create', 'arena-doctor', 'arena-emit', 'arena-list', 'arena-refine'];

test('orchestray-plugin.json exists', () => {
  assert.ok(fs.existsSync(MANIFEST_PATH), 'orchestray-plugin.json must exist');
});

test('orchestray-plugin.json is valid JSON', () => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(raw); }, 'manifest must be valid JSON');
  assert.ok(parsed, 'parsed manifest must not be null');
});

test('orchestray-plugin.json parses through parseManifest', () => {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  let parsed;
  assert.doesNotThrow(() => { parsed = parseManifest(raw); }, 'parseManifest must not throw');
  assert.ok(parsed, 'parsed manifest must not be null');
});

test('manifest name field is "arena"', () => {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const parsed = parseManifest(raw);
  assert.strictEqual(parsed.name, 'arena', 'manifest name must be "arena"');
});

test('manifest transport is "stdio"', () => {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const parsed = parseManifest(raw);
  assert.strictEqual(parsed.transport, 'stdio', 'manifest transport must be "stdio"');
});

test('manifest runtime is "node"', () => {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const parsed = parseManifest(raw);
  assert.strictEqual(parsed.runtime, 'node', 'manifest runtime must be "node"');
});

test('manifest entrypoint is "server.js"', () => {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const parsed = parseManifest(raw);
  assert.strictEqual(parsed.entrypoint, 'server.js', 'manifest entrypoint must be "server.js"');
});

test('manifest declares exactly 5 tools', () => {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const parsed = parseManifest(raw);
  assert.strictEqual(parsed.tools.length, 5, 'manifest must declare exactly 5 tools');
});

test('manifest tool names match expected set', () => {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const parsed = parseManifest(raw);
  const names = parsed.tools.map(t => t.name).sort();
  assert.deepStrictEqual(names, EXPECTED_TOOLS, `tool names must be ${EXPECTED_TOOLS.join(', ')}`);
});

test('manifest version is semver', () => {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const parsed = parseManifest(raw);
  assert.ok(
    /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?(\+[A-Za-z0-9.-]+)?$/.test(parsed.version),
    `manifest version "${parsed.version}" must be semver`
  );
});

test('manifest description is ≤ 500 chars', () => {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const parsed = parseManifest(raw);
  assert.ok(
    parsed.description.length <= 500,
    `manifest description must be ≤ 500 chars, got ${parsed.description.length}`
  );
});

test('all tool names match server.js HANDLERS keys', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
  for (const tool of manifest.tools) {
    assert.ok(
      serverSrc.includes(`'${tool.name}'`),
      `server.js must reference tool '${tool.name}'`
    );
  }
});

test('manifest round-trip parse is stable', () => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const reparsed = JSON.parse(JSON.stringify(parsed));
  assert.deepStrictEqual(reparsed, parsed, 'round-trip parse must produce identical structure');
});

test('each tool has description and inputSchema', () => {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const parsed = parseManifest(raw);
  for (const tool of parsed.tools) {
    assert.ok(
      typeof tool.description === 'string' && tool.description.length > 0,
      `tool ${tool.name} must have a non-empty description`
    );
    assert.ok(
      tool.inputSchema && typeof tool.inputSchema === 'object',
      `tool ${tool.name} must have an inputSchema`
    );
  }
});
