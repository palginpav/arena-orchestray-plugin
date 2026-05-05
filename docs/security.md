# Security Model

Arena is a Claude Code plugin. It runs as a Claude Code plugin process under the
user's session, NOT as a standalone service.

## Threat model

The plugin writes `.md` files to `~/.claude/orchestray/custom-agents/`. The primary
threats are:

1. Path traversal — writing outside the allowed output directory
2. Canonical name collision — overwriting or shadowing orchestray's built-in agents
3. Content injection — writing oversized or malformed agent files that corrupt state
4. Symlink attacks — following a symlink to write outside an allowed root

## Controls

### Path traversal defence

`_resolveOutputDir` in `lib/emit.js` applies a multi-layer check:
1. **Literal `..` rejection** — fast-fail before any filesystem operation
2. **Allowlist check on resolved path** — `path.resolve()` then check against allowed roots
3. **mkdirSync only after allowlist pass** — no directory is created at a rejected path
4. **realpath re-check** — after mkdir, `realpathSync` catches symlinks inside allowed roots

Allowed output roots:
- `~/.claude/orchestray/custom-agents/`
- `<cwd>/out/`
- `<cwd>/.tmp/`
- `os.tmpdir()`

### NFKD canonical-collision check

Before writing, the slug is NFKD-normalized and compared against orchestray's
`CANONICAL_AGENTS` set. Unicode homoglyphs (e.g. Cyrillic `е` for `e`) are collapsed
to their ASCII base forms and then stripped. A slug like `reviewer` or a visually
similar homoglyph will be rejected.

### Atomic write + validator-bound emission

All writes go through:
1. `mkdtempSync` creates an isolated temp dir (mode 0o700)
2. File written to temp path (mode 0o600)
3. `validateCustomAgentFile()` from orchestray validates the temp file
4. On validation pass: `renameSync` to final path (atomic on POSIX)
5. On validation fail: temp file removed, error thrown

No file ever reaches the final path unless it passes the validator.

### Refinement section cap

Content passed to `emitAgent` may not contain more than 3 `## Refinements (Arena v`
sections. This prevents unbounded stacking of refinement blocks.

### 200 KB size cap

Content exceeding 200 KB is rejected before any filesystem write.

### Output redaction

`lib/output-redaction.js` strips credential patterns (Bearer tokens, PEM blocks,
JWTs, generic key=value pairs) from error messages before they appear in JSON-RPC
error responses or stderr.

### Error sanitization

The MCP server (`server/arena-emit.js`) converts NodeJS `ErrnoException` errors
(ENOENT, EACCES, EPERM, etc.) to generic messages before returning them in
JSON-RPC error responses. Host-absolute file paths never appear in responses.

## No API keys

Arena does NOT call any Anthropic API. There are no API keys to protect.
The PM (Claude in the current session) plays both Required and Challenger
roles in-conversation via roleplay. No external LLM calls are made by the plugin.

## Orchestray required

Arena requires orchestray to be installed at `~/.claude/orchestray/`. If orchestray
is missing, `loadCustomAgents()` and `loadCanonicalAgents()` throw `OrchestrayMissingError`
with install instructions. There is NO vendored fallback.

This is intentional: the security invariants depend on orchestray's
`validateCustomAgentFile()` being up-to-date. A vendored copy would drift out of
sync with orchestray's schema and invalidate the validator-bound emission guarantee.
