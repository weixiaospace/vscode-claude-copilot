# Claude Copilot — Context

A VSCode visualization layer for Claude Code CLI's configuration files. Does not run sessions, intercept tool calls, or replace any chat-side functionality.

## Language

**Scope**:
The layer that owns a config file. Claude Code recognizes `user` (`~/.claude/`), `project` (`.claude/` walked up from cwd), `managed` (admin-pushed, highest priority for conflict resolution), and `plugin` (shipped inside an installed plugin). Resolution generally follows: managed > project > user > plugin.

**File-backed resource**:
A user-authored config that lives as one-or-more `.md` files in a known directory under a scope. Skills, subagents, workflows, output styles, and rules share this shape. Visualization is uniform: scan directory, parse frontmatter, list with scope + name + description, optional create/delete. Backed by the abstraction in [ADR-0001](docs/adr/0001-file-backed-resource-abstraction.md).
_Avoid_: "simple resource", "Group X"

**Bespoke module**:
A config surface that does NOT fit the file-backed pattern. Plugins (manifest + delegated to `claude plugin` CLI), MCP (CLI/JSON hybrid), Settings (multi-layer overlay + WebView), Usage (computed analytics), Hooks (5-source merge), and Memory (file-backed but with MEMORY.md index update) each get their own module.
_Avoid_: "special resource", "Group Y"

**Closest wins**:
Claude Code's resolution rule for nested same-name resources within one scope: when a project has both `.claude/agents/review.md` and `./packages/foo/.claude/agents/review.md`, the one closest to the working directory wins. Introduced in CC 2.1.178.

**Settings minimization**:
Policy: the Settings panel only surfaces fields that have no dedicated module. As new modules are added (Agents, Hooks, Output Styles, etc.), the related fields move out of Settings and into the new module. Settings ends up as the residue.

**Provider profile**:
A named API-access configuration (Anthropic / Bedrock / Vertex / Foundry) stored in `~/.claude/claude-copilot/providers.json`. Credentials live in VSCode SecretStorage. Switching a profile rewrites the active `env` block in `settings.json` for the chosen scope. Active profile is inferred from env signature at read time; same-signature profiles disambiguate via `providers.json#active`.
