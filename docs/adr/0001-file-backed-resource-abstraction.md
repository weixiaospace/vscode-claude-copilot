# 0001 — File-backed resource abstraction for authored configs

## Status
accepted (2026-06-19)

## Context
Claude Code's `.claude/` surface keeps growing: skills, subagents, workflows, output styles, rules. Our extension has bespoke `core/<name>.ts` + `tree/<name>-tree.ts` + `commands/<name>.ts` triples for each existing resource. Adding the four new ones naïvely would produce ~760 LOC of near-duplicate code. We needed to decide whether to extract an abstraction, when, and at what cost.

## Decision
Adopt a **harvest-after-2** path: write Agents as the next module by near-copy of Skills, then extract a `FileBackedResource` core after two real instances are in hand. Migrate Skills + Agents to the abstraction. Add Workflows, Output Styles, Rules as thin descriptors (~30 LOC each).

## Abstraction surface
Only the file-backed pattern is shared: scan a directory, parse markdown, scope = user/project/(managed). The descriptor exposes these optional hooks (only what real resources need):

- `identityFrom`: `'dir-name' | 'filename' | 'frontmatter:<field>' | 'filename-or-frontmatter'`
- `closestWins`: nested-conflict resolution within a scope (introduced in CC 2.1.178)
- `displayFields`: pull rich frontmatter into tree node description/tooltip
- `activeSelection`: read/write the "currently selected one" to settings — currently only used by output styles, accepted as a slight leak

## What stays bespoke
Plugins, MCP, Settings, Usage, Hooks, and Memory remain independent modules. Their shapes (manifest + CLI delegation, hybrid CLI/JSON, multi-layer WebView, computed analytics, multi-source merge, index-file maintenance) differ enough that abstraction would either lose features or grow more leaky hooks than it saves.

## Explicitly out of scope of the abstraction
- `--add-dir` runtime extra scopes (we can't observe CLI flags)
- Rendered markdown preview (use VSCode's built-in)
- Frontmatter schema validation (Claude CLI does this)
- Plugin-shipped variants of these resources do NOT appear in top-level resource trees — they stay under the Plugins tree to avoid double exposure

## Considered options
- **Refactor-first** (~420 LOC total). Rejected: high risk of wrong abstraction with only Skills as a reference.
- **Pure incremental** (~760 LOC). Rejected: locks in duplication, re-emerges as tech debt within a quarter.
- **Harvest-after-2** (~540 LOC). Chosen: two real instances inform the abstraction shape, and the migration cost of two modules is small.

## Consequences
- Adding new file-backed resource types becomes ~30 LOC after harvest.
- `activeSelection` is a single-consumer hook for now. If no second consumer appears within 2 more resources, revisit and pull it out.
- Settings panel shrinks: fields with dedicated modules migrate out. See [CONTEXT.md → "Settings minimization"](../../CONTEXT.md).
