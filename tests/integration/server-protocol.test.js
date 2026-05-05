'use strict';
// Integration test: server.js MCP protocol compliance.
// Spawns server.js as a child process, sends NDJSON initialize/tools/list/tools/call,
// asserts response shapes for all 5 tools.

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SERVER = path.resolve(__dirname, '../../server.js');
const PROJECT_ROOT = path.resolve(__dirname, '../..');

function makeAgentContent(slug) {
  return [
    '---',
    `name: ${slug}`,
    'description: Integration test agent for server protocol testing.',
    'tools: Read',
    'model: sonnet',
    'effort: medium',
    'memory: project',
    'maxTurns: 25',
    '---',
    '',
    `# ${slug}`,
    '',
    'You are an integration test agent for server protocol testing.',
    '',
    '## Core principle',
    '',
    'Test the MCP protocol compliance of the arena server.',
    '',
    '## Protocol',
    '',
    '1. Send NDJSON frames to stdin.',
    '2. Read NDJSON frames from stdout.',
    '3. Validate the response shape.',
    '4. Assert protocol compliance.',
    '',
    '## What you do not do',
    '',
    '- Do not call real APIs.',
    '',
    '## Anti-patterns',
    '',
    '- Hardcoding expected responses.',
  ].join('\n');
}

/**
 * Send frames to server.js and collect responses.
 * @param {object[]} frames
 * @param {{ timeout?: number }} opts
 * @returns {Promise<object[]>}
 */
function runServer(frames, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses = [];
    let outBuf = '';

    child.stdout.on('data', chunk => {
      outBuf += chunk.toString();
      let nl;
      while ((nl = outBuf.indexOf('\n')) !== -1) {
        const line = outBuf.slice(0, nl).trim();
        outBuf = outBuf.slice(nl + 1);
        if (line) {
          try { responses.push(JSON.parse(line)); } catch (_) {}
        }
      }
    });

    child.on('close', () => resolve(responses));
    child.on('error', reject);

    for (const frame of frames) {
      child.stdin.write(JSON.stringify(frame) + '\n');
    }
    child.stdin.end();

    setTimeout(() => {
      child.kill();
      resolve(responses);
    }, opts.timeout || 8000);
  });
}

// ---------------------------------------------------------------------------
// Protocol basics
// ---------------------------------------------------------------------------

test('initialize returns protocolVersion and serverInfo', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  ]);

  const resp = responses.find(r => r.id === 1);
  assert.ok(resp, 'must receive response with id=1');
  assert.ok(resp.result, 'result must be present');
  assert.ok(resp.result.protocolVersion, 'protocolVersion must be present');
  assert.ok(resp.result.serverInfo, 'serverInfo must be present');
  assert.ok(resp.result.serverInfo.name, 'serverInfo.name must be present');
  assert.strictEqual(resp.result.serverInfo.name, 'arena', 'serverInfo.name must be "arena"');
});

test('tools/list returns exactly 5 tools', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp, 'must receive response with id=2');
  assert.ok(resp.result, 'result must be present');
  assert.ok(Array.isArray(resp.result.tools), 'tools must be an array');
  assert.strictEqual(resp.result.tools.length, 5, 'must have exactly 5 tools');
});

test('tools/list tool names match manifest', { timeout: 10000 }, async () => {
  const expectedNames = ['arena-create', 'arena-refine', 'arena-emit', 'arena-list', 'arena-doctor'];
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]);

  const resp = responses.find(r => r.id === 2);
  const toolNames = resp.result.tools.map(t => t.name).sort();
  assert.deepStrictEqual(toolNames.sort(), expectedNames.sort(),
    'tools/list names must match manifest');
});

test('tools/list each tool has description and inputSchema', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]);

  const resp = responses.find(r => r.id === 2);
  for (const tool of resp.result.tools) {
    assert.ok(typeof tool.description === 'string' && tool.description.length > 0,
      `tool ${tool.name} must have a description`);
    assert.ok(tool.inputSchema && tool.inputSchema.type === 'object',
      `tool ${tool.name} must have inputSchema of type object`);
  }
});

test('unknown method returns -32601', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'unknown/method', params: {} },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp, 'must receive response with id=2');
  assert.ok(resp.error, 'must have error for unknown method');
  assert.strictEqual(resp.error.code, -32601, 'must return -32601 for unknown method');
});

test('tools/call with unknown tool name returns -32601', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'nonexistent-tool', arguments: {} },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp, 'must receive response with id=2');
  assert.ok(resp.error, 'must have error for unknown tool');
  assert.strictEqual(resp.error.code, -32601, 'must return -32601 for unknown tool');
});

// ---------------------------------------------------------------------------
// arena-create
// ---------------------------------------------------------------------------

test('arena-create returns protocol, suggested_slug, custom_agents_dir, next_steps', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'arena-create',
        arguments: { description: 'A helpful translation agent for French to English.' },
      },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp, 'must receive response with id=2');
  assert.ok(!resp.error, `must not have error: ${JSON.stringify(resp.error)}`);
  assert.ok(Array.isArray(resp.result.content) && resp.result.content.length > 0,
    'result.content must be a non-empty array');

  const textContent = resp.result.content.find(c => c.type === 'text');
  assert.ok(textContent, 'must have text content');

  const payload = JSON.parse(textContent.text);
  assert.ok(typeof payload.protocol === 'string' && payload.protocol.length > 100,
    'protocol must be a non-trivial string');
  assert.ok(typeof payload.suggested_slug === 'string' && payload.suggested_slug.length > 0,
    'suggested_slug must be present');
  assert.ok(typeof payload.custom_agents_dir === 'string',
    'custom_agents_dir must be present');
  assert.ok(Array.isArray(payload.next_steps) && payload.next_steps.length > 0,
    'next_steps must be a non-empty array');
});

test('arena-create with suggested_slug uses it', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'arena-create',
        arguments: { description: 'A helpful translation agent.', suggested_slug: 'my-translator' },
      },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  const payload = JSON.parse(resp.result.content[0].text);
  assert.strictEqual(payload.suggested_slug, 'my-translator', 'suggested_slug must be used');
});

test('arena-create with missing description returns -32602', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'arena-create', arguments: {} },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp.error, 'must have error for missing description');
  assert.strictEqual(resp.error.code, -32602, 'must return -32602 for invalid arguments');
});

// ---------------------------------------------------------------------------
// arena-refine
// ---------------------------------------------------------------------------

test('arena-refine returns protocol, target, custom_agents_dir, next_steps', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'arena-refine',
        arguments: { target: 'my-translator' },
      },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp, 'must receive response with id=2');
  assert.ok(!resp.error, `must not have error: ${JSON.stringify(resp.error)}`);

  const payload = JSON.parse(resp.result.content[0].text);
  assert.ok(typeof payload.protocol === 'string' && payload.protocol.length > 100,
    'protocol must be a non-trivial string');
  assert.strictEqual(payload.target, 'my-translator', 'target must be echoed back');
  assert.ok(typeof payload.custom_agents_dir === 'string',
    'custom_agents_dir must be present');
  assert.ok(Array.isArray(payload.next_steps) && payload.next_steps.length > 0,
    'next_steps must be a non-empty array');
});

test('arena-refine with missing target returns -32602', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'arena-refine', arguments: {} },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp.error, 'must have error for missing target');
  assert.strictEqual(resp.error.code, -32602, 'must return -32602 for invalid arguments');
});

// ---------------------------------------------------------------------------
// arena-emit
// ---------------------------------------------------------------------------

test('arena-emit with valid content returns success shape', { timeout: 10000 }, async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-server-test-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  const slug = 'server-proto-agent';
  const content = makeAgentContent(slug);

  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'arena-emit',
        arguments: { slug, content, output_dir: tmpDir, overwrite: false },
      },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp, 'must receive response with id=2');
  assert.ok(!resp.error, `must not have error: ${JSON.stringify(resp.error)}`);

  const textContent = resp.result.content.find(c => c.type === 'text');
  assert.ok(textContent, 'must have text content');

  const payload = JSON.parse(textContent.text);
  assert.ok(payload.output_path, 'output_path must be present');
  assert.ok(payload.validation && payload.validation.ok === true, 'validation.ok must be true');
  assert.strictEqual(payload.restart_required, true, 'restart_required must be true');
  assert.ok(payload.text, 'text must be present');
});

test('arena-emit with invalid slug returns -32602', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'arena-emit',
        arguments: { slug: 'INVALID-SLUG', content: 'x'.repeat(100) },
      },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp.error, 'must have error for invalid slug');
  assert.ok(resp.error.code, 'error must have code');
});

// ---------------------------------------------------------------------------
// arena-list
// ---------------------------------------------------------------------------

test('arena-list returns agents array', { timeout: 10000 }, async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-list-test-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  // Create synthetic .md files for arena-list to find.
  fs.writeFileSync(path.join(tmpDir, 'my-agent.md'), 'dummy content', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'my-agent-arena-v1.md'), 'dummy refined content', 'utf8');

  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'arena-list', arguments: { dir: tmpDir } },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp, 'must receive response with id=2');
  assert.ok(!resp.error, `must not have error: ${JSON.stringify(resp.error)}`);

  const payload = JSON.parse(resp.result.content[0].text);
  assert.ok(Array.isArray(payload.agents), 'agents must be an array');
  assert.strictEqual(payload.agents.length, 2, 'must find both .md files');

  const v1 = payload.agents.find(a => a.version === 1);
  assert.ok(v1, 'must include versioned agent');
  assert.strictEqual(v1.slug, 'my-agent', 'versioned agent slug must be "my-agent"');
});

test('arena-list with include_v0=false omits v0 files', { timeout: 10000 }, async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-list-v0-test-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  fs.writeFileSync(path.join(tmpDir, 'my-agent.md'), 'dummy', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'my-agent-arena-v1.md'), 'dummy refined', 'utf8');

  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'arena-list', arguments: { dir: tmpDir, include_v0: false } },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  const payload = JSON.parse(resp.result.content[0].text);
  assert.strictEqual(payload.agents.length, 1, 'must return only versioned agents');
  assert.strictEqual(payload.agents[0].version, 1, 'remaining agent must be v1');
});

test('arena-list with non-existent dir returns empty array', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'arena-list', arguments: { dir: '/tmp/arena-nonexistent-dir-xyz123' } },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(!resp.error, 'must not error for non-existent dir');
  const payload = JSON.parse(resp.result.content[0].text);
  assert.deepStrictEqual(payload.agents, [], 'must return empty array for non-existent dir');
});

// ---------------------------------------------------------------------------
// arena-doctor
// ---------------------------------------------------------------------------

test('arena-doctor returns results and ok fields', { timeout: 10000 }, async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-doctor-test-'));
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  // Create a valid agent file for doctor to check.
  const slug = 'doctor-test-agent';
  const content = makeAgentContent(slug);
  fs.writeFileSync(path.join(tmpDir, `${slug}.md`), content, 'utf8');

  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'arena-doctor', arguments: { dir: tmpDir } },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(resp, 'must receive response with id=2');
  assert.ok(!resp.error, `must not have error: ${JSON.stringify(resp.error)}`);

  const payload = JSON.parse(resp.result.content[0].text);
  assert.ok(Array.isArray(payload.results), 'results must be an array');
  assert.ok(typeof payload.ok === 'boolean', 'ok must be a boolean');
  assert.strictEqual(payload.results.length, 1, 'must check 1 file');
  assert.ok(typeof payload.results[0].path === 'string', 'result.path must be a string');
  assert.ok(typeof payload.results[0].ok === 'boolean', 'result.ok must be a boolean');
});

test('arena-doctor with non-existent dir returns empty results', { timeout: 10000 }, async () => {
  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'arena-doctor', arguments: { dir: '/tmp/arena-nonexistent-doctor-xyz123' } },
    },
  ]);

  const resp = responses.find(r => r.id === 2);
  assert.ok(!resp.error, 'must not error for non-existent dir');
  const payload = JSON.parse(resp.result.content[0].text);
  assert.deepStrictEqual(payload.results, [], 'must return empty results');
  assert.strictEqual(payload.ok, true, 'ok must be true when no files to check');
});

// ---------------------------------------------------------------------------
// Manifest divergence check (loader would kill plugin if tools don't match)
// ---------------------------------------------------------------------------

test('manifest and server.js tool lists are in sync', { timeout: 10000 }, async () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../orchestray-plugin.json'), 'utf8'));
  const manifestNames = manifest.tools.map(t => t.name).sort();

  const responses = await runServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]);

  const resp = responses.find(r => r.id === 2);
  const serverNames = resp.result.tools.map(t => t.name).sort();

  assert.deepStrictEqual(serverNames, manifestNames,
    'server.js tools/list must exactly match orchestray-plugin.json tool declarations');
});
