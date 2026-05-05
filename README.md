# Arena — Adversarial Refinement Plugin for Orchestray

Hardens custom-agent system prompts through live in-conversation adversarial sparring.
Arena is an Orchestray plugin that provides 5 MCP tools guiding the PM through creating
and refining custom agents via roleplay — no Anthropic API calls required.

## How it works

1. You ask the PM to use Arena to create or refine a custom agent
2. Claude (as PM) calls `arena-create` or `arena-refine`, which returns the full protocol
3. PM drafts a v0 agent, emits it via `arena-emit`, then plays both **Required** (the agent)
   and **Challenger** (the critic) across 3 rounds in-conversation
4. After sparring, PM synthesizes critiques into a `## Refinements (Arena v1)` section
   and emits `<slug>-arena-v1.md` via the `arena-emit` tool
5. Restart Claude Code — your refined agent is available as a sub-agent

## Install

1. Install the npm package globally (or via npx):
   ```bash
   npm install -g arena-orchestray-plugin
   ```
2. Register the plugin with Orchestray:
   ```bash
   # Inside Claude Code, with Orchestray installed:
   /orchestray:plugin add $(npm root -g)/arena-orchestray-plugin
   /orchestray:plugin approve arena
   ```
3. Restart Claude Code (Orchestray plugins are discovered at SessionStart).

## Use

Tell the PM what you want:

> "Use Arena to create a custom agent that translates English to French
> with strict ICU-MessageFormat correctness."

Or invoke directly:

```
/orchestray:plugin invoke arena arena-create '{"description":"..."}'
```

The PM follows Arena's protocol: drafts a v0, writes it via `arena-emit`,
runs 3 rounds of in-conversation Required/Challenger sparring, then
emits `<slug>-arena-v1.md` alongside the v0 baseline.

## MCP Tools

| Tool | Description |
|------|-------------|
| `arena-create` | Begin creating a new Arena-trained agent; returns full create protocol |
| `arena-refine` | Begin refining an existing agent; returns full refine protocol |
| `arena-emit` | Validator-bound write of a custom-agent .md to custom-agents dir |
| `arena-list` | List Arena-trained agents under the custom-agents dir |
| `arena-doctor` | Re-validate Arena agent files against the current orchestray validator |

## What gets produced

For `arena-create` with description "my specialist":
- `~/.claude/orchestray/custom-agents/my-specialist.md` — v0 baseline (untouched)
- `~/.claude/orchestray/custom-agents/my-specialist-arena-v1.md` — refined version

Both files must pass `validateCustomAgentFile()` before they are written.

## Architecture

- **Orchestray plugin** — discovered via `orchestray-plugin.json`
- **server.js** — NDJSON JSON-RPC 2.0 dispatcher (5 MCP tools)
- **lib/emit.js** — validator-bound atomic write with full security stack
- **lib/protocols.js** — CREATE_PROTOCOL and REFINE_PROTOCOL prose
- **lib/list-doctor.js** — filesystem scan and per-file validation
- **lib/orchestray-loader.js** — requires orchestray; throws if missing

## Prerequisites

- [orchestray](https://github.com/palginpav/orchestray) installed at `~/.claude/orchestray/`
- Node.js >= 20
- Claude Code with Orchestray installed

## Security

- Path traversal defence (literal `..` + realpath allowlist check)
- NFKD canonical-collision check before every write
- Atomic `mkdtempSync` write + `validateCustomAgentFile()` before rename
- 3-section refinement cap; 200 KB size cap
- Error message redaction (no credential leaks in JSON-RPC responses)

See [docs/security.md](docs/security.md) for details.

## License

MIT
