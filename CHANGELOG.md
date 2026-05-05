# Changelog

## 0.1.0

Initial release. Orchestray plugin for adversarial refinement of custom agents.

- 5 MCP tools: arena-create, arena-refine, arena-emit, arena-list, arena-doctor
- PM acts as both Required and Challenger in live in-conversation roleplay
- No Anthropic API calls anywhere (subscription-model only)
- Validator-bound emission via Orchestray's validateCustomAgentFile
- Two-file output: <slug>.md (v0 baseline) AND <slug>-arena-v1.md (refined)
- 3-section refinement cap prevents prompt bloat
- Path-traversal, NFKD canonical-collision, atomic mkdtemp, symlink defense
- Requires Orchestray installed at ~/.claude/orchestray/ — no vendored fallback

---

## [archived] 0.0.x — Claude Code plugin design (archived)

Prior architecture using `.claude-plugin/plugin.json`, `.mcp.json`, and `commands/*.md`
slash commands. Replaced by orchestray-plugin format in 0.1.0.
Preserved in `archive/v0.0.x-batch-design/` for reference.
