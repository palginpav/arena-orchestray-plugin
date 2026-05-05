'use strict';

/**
 * lib/protocols.js — Protocol prose for arena-create and arena-refine tools.
 *
 * Extracted from commands/arena-create.md and commands/arena-refine.md bodies.
 * Slash-command frontmatter stripped; tool references updated from
 * mcp__plugin_arena_core__emit to arena-emit.
 */

const CREATE_PROTOCOL = `# Arena Create Protocol

Use this protocol to create a new Arena agent based on the description provided.

# Phase 1 — Draft v0

1. Derive a kebab-case slug from the description, max 48 chars, regex \`^[a-z][a-z0-9-]{1,47}$\`.
2. Verify slug NOT in canonical Orchestray agent names. Read
   \`/home/palgin/orchestray/bin/_lib/canonical-agents.js\` to get the
   live list. NFKD-normalize before comparison.
3. Compose v0 system prompt: ~150-400 word body with role statement,
   core principle, 3-5 numbered protocol steps, "what you do not do"
   boundary, and 2-4 anti-patterns. The body is your honest first draft
   based on the user's description — not a placeholder.
4. Compose frontmatter: \`name\` (= slug), \`description\` (≤ 500 chars,
   no newlines), \`tools\` (subset of {Read, Glob, Grep, Bash, Write, Edit}
   based on the agent's role — be conservative, don't add unneeded tools),
   \`model: sonnet\`, \`effort: medium\`, \`memory: project\`, \`maxTurns: 25\`.
5. Call \`arena-emit\` with \`slug=<slug>\`, \`content=<full v0 .md>\`,
   \`output_dir=$HOME/.claude/orchestray/custom-agents\`, \`overwrite: false\`.
   The tool validates via Orchestray's \`validateCustomAgentFile()\` and
   either writes atomically or rejects with a clear error.
6. Tell user: "v0 written to <output_path>. Sparring begins now."

# Phase 2 — Spar (3 rounds, in conversation)

You play two roles. Be explicit which role you're in via headings.

**Crucial constraint**: NO Anthropic API calls. You (Claude in this
session) generate Required's responses by REASONING from ONLY the v0
system prompt, not from this conversation's broader context. Frame each
Required response with: "Required (per v0 system prompt only):". The
isolation is best-effort — be intellectually honest.

For each round R = 1, 2, 3:

1. Generate a representative test task for the agent's domain. Vary
   across rounds: round 1 = happy path, round 2 = edge case, round 3 =
   hostile/ambiguous input.
2. Print: \`## Round R/3 — Task: <task>\`
3. **As Required**: Print \`### Required's approach\` followed by a 100-300 word
   response framed strictly by the v0 system prompt.
4. **As Challenger**: Print \`### Challenger's critique\` followed by 3-5 numbered
   critiques. Each critique cites a specific phrase or step from
   Required's response (use quotes), names a concrete failure mode,
   ranks (critical / important / nice-to-have), and gives 2-3 sentence rationale.
5. Pause briefly — the user may interject with feedback or additional
   tasks. If they do, honor it for the current round, then continue.

# Phase 3 — Distill + emit v1

After all 3 rounds:

1. Aggregate critiques across rounds. Group by failure-mode name.
2. Compose the refinement section:

\`\`\`
## Refinements (Arena v1)

> Origin: Arena run on YYYY-MM-DD. Rounds: 3.

The following discipline supplements the system prompt above. When the
original prompt and a refinement appear to conflict, the refinement
governs for cases where the failure mode below would otherwise occur;
the original governs elsewhere.

### Failure modes to actively guard against
1. **<name>** — <description>. Specifically: <discipline rule>.
2. ...

### Required disciplines added by sparring
- <rule 1>
- <rule 2>
- ...

### Anti-patterns surfaced
- avoid <name>
- ...
\`\`\`

3. Build full v1 content: original v0 frontmatter (with \`name\`
   updated to \`<slug>-arena-v1\`, \`description\` augmented with " (Arena-refined v1)"
   if length permits) + ORIGINAL v0 system prompt body verbatim +
   the refinement section above.
4. Call \`arena-emit\` with \`slug=<slug>-arena-v1\`,
   \`content=<full v1 .md>\`. The v0 file is NOT touched.
5. Tell user:
   - "Refined agent emitted to <output_path>"
   - "Restart Claude Code to make the refined agent available."
   - "The v0 baseline is preserved at <slug>.md for diff comparison."

# Hard constraints

- Output \`.md\` files MUST pass \`validateCustomAgentFile()\`. The
  \`arena-emit\` tool checks this; failure aborts with a clear error.
- v1's \`tools\` list NEVER expands beyond v0's tools — refinement adds
  discipline, not capabilities.
- Both v0 and v1 frontmatter \`name\` MUST equal their respective file
  basenames.
- No Anthropic API calls. PM (this Claude session) plays both Required
  and Challenger roles entirely in-conversation via roleplay.
- Required's responses are PM-roleplayed in-conversation; they are NOT
  produced by any external LLM call.
- PM acts as Challenger after each Required response.
- Final emit produces both <slug>.md (untouched v0) AND <slug>-arena-v1.md (refined).
`;

const REFINE_PROTOCOL = `# Arena Refine Protocol

Use this protocol to refine an existing custom agent through Arena sparring.

# Phase 1 — Load existing agent

1. Resolve the agent file: look in \`$HOME/.claude/orchestray/custom-agents/<target>.md\`.
   If not found, also check \`$HOME/.claude/agents/<target>.md\`. If neither exists,
   report the error and stop. (If target is an absolute path, use it directly.)
2. Read the file. Parse the frontmatter to extract \`name\`, \`description\`, \`tools\`.
3. Count existing \`## Refinements (Arena v\` sections in the file body.
   If count >= 3, refuse: "This agent already has 3 Arena refinement sections (the cap).
   Create a new baseline or delete an older Arena-vN file before refining further."
4. Determine the next version number: scan \`$HOME/.claude/orchestray/custom-agents/\`
   for files matching \`<slug>-arena-v<N>.md\` and use max(N)+1. If none found, use 1.
5. Tell user: "Loaded <slug> (current refinements: <count>/3). Will produce
   <slug>-arena-v<next>.md. Sparring begins now."

# Phase 2 — Spar (3 rounds, in conversation)

You play two roles. Be explicit which role you're in via headings.

**Crucial constraint**: NO Anthropic API calls. You (Claude in this
session) generate Required's responses by REASONING from ONLY the loaded
system prompt, not from this conversation's broader context. Frame each
Required response with: "Required (per system prompt only):". The
isolation is best-effort — be intellectually honest.

For each round R = 1, 2, 3:

1. Generate a representative test task for the agent's domain. Vary
   across rounds: round 1 = happy path, round 2 = edge case, round 3 =
   hostile/ambiguous input.
2. Print: \`## Round R/3 — Task: <task>\`
3. **As Required**: Print \`### Required's approach\` followed by a 100-300 word
   response framed strictly by the loaded system prompt.
4. **As Challenger**: Print \`### Challenger's critique\` followed by 3-5 numbered
   critiques. Each critique cites a specific phrase or step from
   Required's response (use quotes), names a concrete failure mode,
   ranks (critical / important / nice-to-have), and gives 2-3 sentence rationale.
5. Pause briefly — the user may interject with feedback. If they do, honor it.

# Phase 3 — Distill + emit refined version

After all 3 rounds:

1. Aggregate critiques across rounds. Group by failure-mode name.
2. Compose the refinement section:

\`\`\`
## Refinements (Arena v<next>)

> Origin: Arena run on YYYY-MM-DD. Rounds: 3.

The following discipline supplements the system prompt above. When the
original prompt and a refinement appear to conflict, the refinement
governs for cases where the failure mode below would otherwise occur;
the original governs elsewhere.

### Failure modes to actively guard against
1. **<name>** — <description>. Specifically: <discipline rule>.
2. ...

### Required disciplines added by sparring
- <rule 1>
- <rule 2>
- ...

### Anti-patterns surfaced
- avoid <name>
- ...
\`\`\`

3. Build full refined content: original frontmatter (with \`name\` updated to
   \`<slug>-arena-v<next>\`, \`description\` augmented with " (Arena-refined v<next>)"
   if length permits) + ORIGINAL system prompt body verbatim + the refinement section.
4. Call \`arena-emit\` with \`slug=<slug>-arena-v<next>\`,
   \`content=<full refined .md>\`. The source file is NOT touched.
5. Tell user:
   - "Refined agent emitted to <output_path>"
   - "Restart Claude Code to make the refined agent available."
   - "The original baseline is preserved at <slug>.md for diff comparison."

# Hard constraints

- Output \`.md\` files MUST pass \`validateCustomAgentFile()\`. The
  \`arena-emit\` tool checks this; failure aborts with a clear error.
- The refined \`tools\` list NEVER expands beyond the source agent's tools.
- The frontmatter \`name\` MUST equal the output file basename.
- No Anthropic API calls. PM (this Claude session) plays both Required
  and Challenger roles entirely in-conversation via roleplay.
- Required's responses are PM-roleplayed in-conversation; they are NOT
  produced by any external LLM call.
- PM acts as Challenger after each Required response.
- Final emit produces both <slug>.md (untouched original) AND <slug>-arena-v<next>.md (refined).
`;

module.exports = { CREATE_PROTOCOL, REFINE_PROTOCOL };
