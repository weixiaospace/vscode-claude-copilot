# 0001 — File-backed resource abstraction for authored configs

## Status
accepted (2026-06-19)

## Context
Claude Code's `.claude/` surface keeps growing: skills, subagents, workflows, output styles, rules. Our extension has bespoke `core/<name>.ts` + `tree/<name>-tree.ts` + `commands/<name>.ts` triples for each existing resource. Adding the four new ones naïvely would produce ~760 LOC of near-duplicate code. We needed to decide whether to extract an abstraction, when, and at what cost.

## Decision
Adopt a **harvest-after-2** path: write Agents as the next module by near-copy of Skills, then extract a `FileBackedResource` core after two real instances are in hand. Migrate Skills + Agents to the abstraction. Add Workflows, Output Styles, Rules as thin descriptors (~30 LOC each).

## Abstraction surface (as shipped)
Only the file-backed pattern is shared: scan a directory, parse markdown, scope = `user | project`. The descriptor is intentionally lean — seven fields, all required, no optional hooks:

```ts
interface FileResourceDescriptor<T> {
  kind: string;
  scopeRoots: { user(home): string; project(projectPath): string };
  discovery: 'recursive' | { kind: 'flat-subdirs'; basename: string };
  parse(filePath, content, scope): T;
  template(name): string;
  createFilePath(baseDir, scope, name): string;
  deletePath(filePath): string;
}
```

The four "hooks" the original draft of this ADR put on the descriptor (`identityFrom`, `closestWins`, `displayFields`, `activeSelection`) all migrated to higher layers when we wrote the actual code:

- **Identity strategy** is fully expressed inside each `parse()` callback (Skills uses `dir-name`, Agents uses `frontmatter.name || filename`, Output Styles uses the same hybrid, Workflows/Rules use `filename`). No enum needed.
- **Display / tooltip** moved to `TreeAdornment` injected at the `FileResourceTreeProvider<T>` constructor — keeps `core/` free of vscode imports and lets each tree decorate items with the i18n-aware `t()` helper.
- **Active selection** is bespoke to `OutputStylesTreeProvider`: it overrides `loadAll()` to fetch items + the active name in parallel, then overrides `getTreeItem()` to mark the active one. The descriptor stays unaware.
- **Closest-wins for nested project `.claude/` dirs** (CC 2.1.178's monorepo rule) is NOT implemented — within-scope same-name dedup is alphabetical-first-wins via `Array.sort + Set<seen>`. Adding closest-to-cwd would require walking the workspace tree at scan time; deferred.

This is a cleaner design than the original sketch — the descriptor stays a pure-data structure, and per-resource quirks (icons, rich display, active state) live with the trees that care.

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
- Adding a new file-backed resource becomes ~30 LOC core + ~15 LOC tree + ~12 LOC commands (5 resources at ship time validated this within ±10%).
- Closest-wins is intentionally out — if a user lands a monorepo where it matters, we'll add a `discovery: 'walk-up'` variant rather than retrofit it into `'recursive'`.
- Settings panel shrinks: fields with dedicated modules migrate out. See [CONTEXT.md → "Settings minimization"](../../CONTEXT.md). At 0.2.0 ship this turned out to be a no-op — the migration candidates (`outputStyle`, `hooks`) were never in the Settings WebView to begin with, and `enabledPlugins` provides layer-aware bulk toggling that the Plugins tree can't replicate.
