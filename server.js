#!/usr/bin/env node
'use strict';

/**
 * server.js — Arena orchestray-plugin NDJSON JSON-RPC 2.0 dispatcher.
 *
 * Implements the MCP server contract for orchestray plugins:
 *   - initialize    → capabilities + serverInfo
 *   - tools/list    → 5 tools matching orchestray-plugin.json verbatim
 *   - tools/call    → dispatch by tool name
 *   - (anything else) → -32601 method not found
 *
 * Tools:
 *   arena-create   → returns CREATE_PROTOCOL + suggested_slug + next_steps
 *   arena-refine   → returns REFINE_PROTOCOL + target + next_steps
 *   arena-emit     → validator-bound write via lib/emit.js
 *   arena-list     → filesystem scan via lib/list-doctor.js
 *   arena-doctor   → per-file validation via lib/list-doctor.js
 */

const { z } = require('zod');
const { emitAgent } = require('./lib/emit');
const { redact } = require('./lib/output-redaction');
const { listAgents, doctor } = require('./lib/list-doctor');
const { CREATE_PROTOCOL, REFINE_PROTOCOL } = require('./lib/protocols');
const { ArenaError, BadParamsError, ToolNotFoundError } = require('./lib/errors');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------------------
// Tool input schemas (mirrors orchestray-plugin.json inputSchema)
// ---------------------------------------------------------------------------

const TOOL_SCHEMAS = {
  'arena-create': z.object({
    description: z.string().min(8).max(1000),
    suggested_slug: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/).optional(),
    output_dir: z.string().optional(),
  }).strict(),

  'arena-refine': z.object({
    target: z.string().min(1),
    output_dir: z.string().optional(),
  }).strict(),

  'arena-emit': z.object({
    slug: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/),
    content: z.string().min(50).max(204800),
    output_dir: z.string().optional(),
    overwrite: z.boolean().default(false),
    dry_run: z.boolean().default(false),
  }).strict(),

  'arena-list': z.object({
    dir: z.string().optional(),
    include_v0: z.boolean().default(true),
  }).strict(),

  'arena-doctor': z.object({
    dir: z.string().optional(),
  }).strict(),
};

// ---------------------------------------------------------------------------
// Tool declarations (returned verbatim from tools/list)
// ---------------------------------------------------------------------------

const TOOL_DECLS = [
  {
    name: 'arena-create',
    description: 'Begin creating a new Arena-trained custom agent. Returns the full sparring protocol the PM follows: draft v0 system prompt, write via arena-emit, run 3 rounds of in-conversation Required/Challenger sparring, emit v1.',
    inputSchema: {
      type: 'object',
      required: ['description'],
      properties: {
        description: { type: 'string', minLength: 8, maxLength: 1000 },
        suggested_slug: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,47}$' },
        output_dir: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'arena-refine',
    description: 'Begin refining an existing custom agent through Arena sparring. Returns the protocol for loading the target, running 3 rounds of Required/Challenger critique, emitting <slug>-arena-vN.',
    inputSchema: {
      type: 'object',
      required: ['target'],
      properties: {
        target: { type: 'string', description: "Either a slug like 'my-translator' (resolved against custom-agents dir) or an absolute path to a .md file." },
        output_dir: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'arena-emit',
    description: "Validator-bound atomic write of a custom-agent .md to ~/.claude/orchestray/custom-agents/. Runs Orchestray's validateCustomAgentFile() before write; rejects on validation failure. The PM crafts the content; this tool only validates and writes.",
    inputSchema: {
      type: 'object',
      required: ['slug', 'content'],
      properties: {
        slug: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,47}$' },
        content: { type: 'string', minLength: 50, maxLength: 204800 },
        output_dir: { type: 'string' },
        overwrite: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'arena-list',
    description: 'List Arena-trained custom agents under the custom-agents dir.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string' },
        include_v0: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'arena-doctor',
    description: 'Re-validate emitted Arena agent files against the current orchestray validator. Returns per-file pass/fail.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _defaultCustomAgentsDir() {
  return path.join(os.homedir(), '.claude', 'orchestray', 'custom-agents');
}

/**
 * Derive a kebab-case slug from a description string.
 * Lowercases, replaces non-alphanumeric runs with hyphens, trims, and
 * truncates to 48 characters.
 * @param {string} description
 * @returns {string}
 */
function _slugify(description) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '') || 'arena-agent';
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

const HANDLERS = {
  'arena-create': async (args) => {
    const slug = args.suggested_slug || _slugify(args.description);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          protocol: CREATE_PROTOCOL,
          suggested_slug: slug,
          custom_agents_dir: args.output_dir || _defaultCustomAgentsDir(),
          next_steps: [
            '1. Read the protocol carefully.',
            '2. Derive slug from description (or use suggested_slug).',
            '3. Draft v0 system prompt (~150-400 words) + frontmatter.',
            '4. Call arena-emit with slug and v0 content.',
            '5. Run 3 rounds of in-conversation Required/Challenger sparring.',
            '6. Compose refinement section from aggregated critiques.',
            '7. Call arena-emit with slug=<slug>-arena-v1 and v1 content.',
            '8. Tell user to restart Claude Code.',
          ],
        }),
      }],
    };
  },

  'arena-refine': async (args) => {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          protocol: REFINE_PROTOCOL,
          target: args.target,
          custom_agents_dir: args.output_dir || _defaultCustomAgentsDir(),
          next_steps: [
            '1. Read the protocol carefully.',
            '2. Resolve target: slug -> ~/.claude/orchestray/custom-agents/<target>.md or absolute path.',
            '3. Read target file; count existing refinement sections (cap: 3).',
            '4. Determine next version number N.',
            '5. Run 3 rounds of in-conversation Required/Challenger sparring.',
            '6. Compose refinement section (## Refinements (Arena vN)).',
            '7. Call arena-emit with slug=<slug>-arena-vN and refined content.',
            '8. Tell user to restart Claude Code.',
          ],
        }),
      }],
    };
  },

  'arena-emit': async (args) => {
    const result = await emitAgent(args);
    // Normalize key: emit.js returns outputPath; expose as output_path for consumers.
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          output_path: result.outputPath,
          validation: result.validation,
          restart_required: result.restart_required,
          text: result.text,
          ...(result.dryRun ? { dry_run: true, content: result.content } : {}),
        }),
      }],
    };
  },

  'arena-list': async (args) => {
    const agents = listAgents(args.dir, args.include_v0);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ agents }),
      }],
    };
  },

  'arena-doctor': async (args) => {
    const results = await doctor(args.dir);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ results, ok: results.every(r => r.ok) }),
      }],
    };
  },
};

// ---------------------------------------------------------------------------
// NDJSON JSON-RPC 2.0 dispatcher
// ---------------------------------------------------------------------------

function send(frame) {
  process.stdout.write(JSON.stringify(frame) + '\n');
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function err(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(frame) {
  const id = frame.id;
  const method = frame.method;
  const params = frame.params || {};

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'arena', version: '0.1.0' },
    });
  }

  if (method === 'tools/list') {
    return ok(id, { tools: TOOL_DECLS });
  }

  if (method === 'tools/call') {
    const toolName = params.name;
    const handler = HANDLERS[toolName];
    if (!handler) {
      return err(id, -32601, `tool not found: ${toolName}`);
    }

    const schema = TOOL_SCHEMAS[toolName];
    let parsedArgs;
    try {
      parsedArgs = schema.parse(params.arguments || {});
    } catch (e) {
      const msg = e && e.errors ? e.errors.map(x => x.message).join('; ') : String(e);
      return err(id, -32602, `invalid arguments for ${toolName}: ${redact(msg)}`);
    }

    try {
      const result = await handler(parsedArgs);
      return ok(id, result);
    } catch (e) {
      if (e instanceof ArenaError) {
        return err(id, e.code, redact(e.message));
      }
      // Unexpected error — internal error code.
      const msg = e && e.message ? e.message : String(e);
      return err(id, -32603, redact(msg));
    }
  }

  return err(id, -32601, `method not found: ${method}`);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (line.length === 0) continue;
    let frame;
    try { frame = JSON.parse(line); }
    catch (_e) { continue; }
    handle(frame);
  }
});

process.stdin.on('end', () => process.exit(0));
