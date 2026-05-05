# Known limits

Arena v0.1.0 ships with the following known limitations.

## Sparring quality

The PM (Claude in session) plays both Required and Challenger roles. Role isolation
is best-effort — Claude's broader context inevitably bleeds into "Required's" responses.
The slash command instructs the PM to frame Required's responses based only on the
v0 system prompt, but this is a soft constraint enforced by the prompt, not a hard
technical boundary.

## NFKD collision detection is charset-specific

The NFKD collision check strips non-ASCII characters after normalization. This means
some homoglyphs (e.g. Greek `ο` for `o`) will be stripped, preventing the collision.
It does NOT detect visually identical ASCII rearrangements.

## 3-section refinement cap

Content with more than 3 `## Refinements (Arena v` sections is rejected. This is
a hard cap enforced by `lib/emit.js`. To refine an already-triply-refined agent,
create a new baseline from the current v3 file.

## Restart required

Agent files emitted by Arena are only visible to Claude Code after a session restart.
The plugin emits a reminder in every success message.

## orchestray required

Arena will not function without orchestray installed at `~/.claude/orchestray/`.
There is no vendored fallback. If orchestray is missing, all MCP tool calls fail
with an `OrchestrayMissingError` and instructions on how to install.

## Output directory allowlist

The `output_dir` parameter in `mcp__plugin_arena_core__emit` is restricted to a
fixed allowlist of roots. You cannot emit to arbitrary paths — only to
`~/.claude/orchestray/custom-agents/`, `<cwd>/out/`, `<cwd>/.tmp/`, or
`os.tmpdir()` and its subdirectories.
