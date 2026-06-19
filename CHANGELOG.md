# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**[English](CHANGELOG.md) | [中文](CHANGELOG.zh-CN.md)**

## [0.1.21] - 2026-06-19

### Added

**Five new resource panels** — surfacing the `.claude/` resources that Claude Code added over the last year:

- **Agents** (`~/.claude/agents/`, `.claude/agents/`) — subagent definitions. Recursive scan; identity from YAML `name` frontmatter (filename fallback). Tree shows `model · N tools · color` from the frontmatter; first-occurrence wins on duplicate names within a scope.
- **Workflows** (`~/.claude/workflows/`, `.claude/workflows/`) — saved `/<name>` scripts. Recursive scan; identity from filename.
- **Output Styles** (`~/.claude/output-styles/`, `.claude/output-styles/`) — system-prompt modifiers. Identity from YAML `name` (filename fallback). A "**Set Active**" command writes the chosen style to `.claude/settings.local.json#outputStyle` (matching what `/config` does). The active style is marked in the tree with a star icon.
- **Rules** (`~/.claude/rules/`, `.claude/rules/`) — modular CLAUDE.md companions. Recursive scan, including subdirectories like `frontend/`. Rules with a `paths:` frontmatter get a `path-scoped` chip in the tree.
- **Hooks** (read-only view, merges 4 sources: user / project / local settings.json + plugin `hooks/hooks.json`). Grouped by event (`PreToolUse`, `PostToolUse`, `SessionStart`, …); each handler tagged with source label. Click an entry to open its source file. Per-type icons: command / http / mcp_tool / prompt / agent.

**Documentation**
- New [ADR-0001](docs/adr/0001-file-backed-resource-abstraction.md) recording the file-backed resource abstraction decision: which resources share an abstraction, what the escape hatches are, and what is explicitly out of scope.
- New [CONTEXT.md](CONTEXT.md) project glossary: *scope*, *file-backed resource*, *bespoke module*, *first-wins*, *settings minimization*, *provider profile*.

### Changed

**Internal abstraction harvest** (zero user-facing change):
- New `src/core/file-resource.ts` (`FileResourceDescriptor` + `listResource` / `createResource` / `deleteResource` + frontmatter helpers). Two discovery modes: `recursive` (recursive `.md` scan with first-wins de-dup) and `flat-subdirs` (the Skills pattern: `<dir>/<basename>`).
- New `src/tree/file-resource-tree.ts` generic provider with cache + inflight loading and injectable display/tooltip adornments.
- New `src/commands/file-resource-commands.ts` generic `.create` / `.delete` registrar.
- Skills + Agents migrated to the abstraction: `skills-tree.ts` dropped from 72 to 13 LOC, `agents-tree.ts` from 73 to 27 LOC, with equivalent shrinkage on the command modules. Existing tests untouched and still pass.

### Fixed

- **Symlinked resources are now discovered.** `readdir` reports a symlinked directory as a non-directory, so symlinked skills / agents / output-styles / rules (and plugin-vendored skills) were silently dropped from their panels. Discovery now resolves symlinks and guards against symlink cycles.
- **No more clobbering `settings.local.json`.** Setting an active output style on a malformed `settings.local.json` previously parsed it as empty and overwrote the file, destroying the user's other keys (hooks / permissions / mcpServers). A corrupt file now surfaces an error instead of being silently replaced; reads no longer mask parse/permission errors.
- **Usage no longer hides errors.** A blanket catch reported every failure (including permission errors and bugs) as zero usage; only the benign "file vanished mid-scan" race is now tolerated.
- Resource listing tolerates a file disappearing mid-scan instead of blanking the whole panel.

### Tests
- 148 core-layer tests (up from 35) — added 10 Agents + 20 file-resource + 6 Workflows + 7 Rules + 9 Output Styles + 9 Hooks, plus symlink-discovery and corrupt-settings regression coverage.

## [0.1.20] - 2026-06-18

### Fixed

- Re-release 0.1.19 with README version badge and VSIX example synchronized to the correct version.

## [0.1.19] - 2026-06-18

### Fixed

- Provider switching appeared to succeed but the UI stayed on the previous profile when two profiles shared the same base URL + auth mode (e.g. two authToken accounts on the same endpoint). Active-provider inference now uses the recorded `active` profile as a tie-breaker, so switching between collided profiles actually sticks.
- Settings panel user-layer provider switch now keeps `providers.json` `active` in sync, matching the Provider Manager behavior.

## [0.1.18] - 2026-05-29

### Changed

**Provider profiles — dedicated manager, layer-aware switching**
- The sidebar "API Provider" node now opens a full **Provider Manager webview** instead of inline tree CRUD. Quick-add presets (including KIMI CODE), a profile library list, and a modal create/edit flow with required-name validation and secret-set hints
- The settings panel's provider selector is now **layer-scoped**: user / project / local layers each pick their own provider. The sidebar tree shows the per-layer provider name and "Inherited" for layers without an override
- The status bar shows the **effective** provider resolved across all layers as read-only status, not an inline switcher
- The manager page now notes that activating a profile writes its env to the **user layer** (`~/.claude/settings.json`); project / local layers can still override it
- Settings webview redesigned into a two-pane **left-nav + scrollspy** layout with live search/filter, driven by a declarative section/field schema

### Fixed

- Profile delete did nothing — confirmation now handled host-side
- `effectiveProfileId` used merged env, causing cross-layer match failures (e.g. user apiKey + project authToken)
- Save errors are now surfaced, and unsaved-switch confirmation goes through the host
- Status bar now refreshes on settings write / `setLayerProvider`

## [0.1.17] - 2026-04-22

### Added

**Provider profiles — save and switch API provider configs instantly**
- Save multiple Anthropic-compatible / Bedrock / Vertex / Foundry configs as named profiles
- **Settings tree — expandable provider group**: sidebar shows an expandable "API Provider" group listing subscription mode + all saved profiles. Active profile marked with a check icon. Inactive profiles show inline hover buttons for switch/edit/delete. Subscription mode shows only a switch button (no edit/delete). The group node itself shows a hover "+" button to create a new profile
- **Settings webview — expandable provider strip**: a collapsible section at the top of the settings panel showing the active profile name. When expanded, lists subscription mode + all profiles with switch/edit/delete buttons. Clicking a row or the switch button activates that profile without any toast notification
- Switch instantly from three entry points: status bar (rocket icon), Settings tree (expandable group), or Settings webview (top strip)
- Credentials stored in VSCode SecretStorage (OS keychain), never in `settings.json`
- Auto-migration: existing provider env in `settings.json` becomes a "Default" profile on first launch; existing behavior preserved
- Deleting the active profile falls back to subscription mode and cleans up env automatically
- New commands: Switch Provider Profile, Add Provider Profile, Edit Provider Profile, Delete Provider Profile, Activate Provider Profile (by ID)

## [0.1.16] - 2026-04-20

### Added

**Plugins panel — expandable tree**
- Installed plugin nodes are now collapsible; expand to see the plugin's own skills / agents / commands / hooks / MCP declarations
- Each child node opens the corresponding file (`SKILL.md`, `<name>.md`, `hooks.json`, `.mcp.json`, etc.)
- Plugins with no content keep `CollapsibleState.None` (no chevron)

**Settings — full visual overhaul**
- 9 categorized sections covering ~50 settings, curated from official [Claude Code docs](https://code.claude.com/docs/en/settings)
- **Provider switch**: Anthropic / AWS Bedrock / Google Vertex / Microsoft Foundry — each with dedicated credential fields (no mixing)
- **Auth mode switch** (Anthropic only): Subscription (Claude.ai OAuth) / API Key / Auth Token / Helper script — switching mode auto-clears credentials from other modes on save
- Permissions section with `allow` / `ask` / `deny` / `additionalDirectories` tag lists, `defaultMode` toggle, `disableBypassPermissionsMode`, `skipDangerousModePermissionPrompt`
- 15 feature flag switches (DISABLE_TELEMETRY, DISABLE_ERROR_REPORTING, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, …) instead of raw env editing
- 6 numeric limit inputs (MAX_OUTPUT_TOKENS, MAX_THINKING_TOKENS, API_TIMEOUT_MS, …)
- Display section: language / viewMode / tui / autoUpdatesChannel / prefersReducedMotion / spinnerTipsEnabled / awaySummaryEnabled
- Memory & Dream section: autoMemoryEnabled / autoDreamEnabled / autoMemoryDirectory
- API key and auth token inputs use password masking with show/hide toggle
- Scope intro banner below tabs explains User / Project / Local + priority order

**Usage dashboard — interactive charts**
- Hand-drawn SVG replaced with **Chart.js 4** via jsdelivr CDN (CSP whitelisted)
- Stacked bar chart with interactive tooltip and legend
- Doughnut chart for per-model output distribution
- **Day / Week / Month granularity toggle** — aggregates on the fly
- Week labels show actual date range (`4/14–4/20`) instead of raw ISO week number
- **Per-project stats** table with approximate cost share
- **Cost line overlay** on trend chart using blended rates across all models
- 6 summary cards: Input / Output / Cache Read / Cache Write / Sessions / Cost
- Official Anthropic pricing table covering Opus / Sonnet / Haiku 4.x and 3.5

**Marketplaces — update operations**
- Right-click / hover an individual marketplace → Update (runs `claude plugin marketplace update <name>`)
- Hover the Marketplaces group → Update All
- Marketplace tree node description now shows `updated 2d ago · owner/repo`; tooltip adds `X/Y installed` count
- Install/uninstall from the marketplace webview now shows native VS Code toast on success; button labels changed from abbreviated "装/卸" to full "安装/卸载"

**Tree caching**
- `SkillsTreeProvider` and `MemoryTreeProvider` cache initial load and pre-warm on root expansion — subsequent expand is instant

**Plugin metadata**
- Installed plugin detection now tracks actual file lists (not just type presence) for skills / agents / commands; plus flags for hooks and MCP
- Plugin tree node description: `v1.2.0 · skills · hooks · mcp` type tags

**Icons**
- Activity bar icon updated to a custom gear + orbit design (theme-tinted via `currentColor`)
- Marketplace listing icon: separate PNG (256×256) at `resources/marketplace-icon.png`

### Fixed

- **Settings CSP blocking `window.__l10n` injection** — inline script was rejected by strict CSP, causing the settings panel to render raw i18n keys ("settings.title" instead of "Settings"). Fixed by adding `'nonce-{nonce}'` to `script-src` and tagging both inline and module scripts with the nonce. Same fix applied to usage + marketplace panels.
- **Marketplace install button stuck at "..."** — `state.busy` was not cleared on success path; wrapped install/uninstall in try/finally
- **Settings hardcoded English labels** — tab labels "User / Project / Local" and fallback "(no workspace)" were literal strings; now go through `t()` with existing `tree.group.*` / `tree.layer.local` keys
- **`enabledPlugins` loses unmanaged entries on save** — `formToPartial` previously only wrote form's subset, wiping entries for plugins not in the installed list. Fixed via `_rawEnabledPlugins` shadow that preserves unknown entries (similar to `_rawPermissions`)
- **Top-level `permissionMode` legacy key** — our earlier UI wrote `permissionMode` at the top level, but the canonical key is `permissions.defaultMode`. On save, `permissionMode` is now included in `knownKeys` so the legacy entry gets cleaned up
- **`.vscodeignore` not excluding `out/*.map`** — `*.map` pattern only matched top-level; changed to `**/*.map`. Also excluded `CLAUDE.md` and `TODO.md` from vsix. Package size dropped from ~60 KB to ~34 KB (before the icon/chart additions)

### Changed

- `writeLayer` refactored to call pure `mergeForSave()` from `src/core/settings.ts`, now directly unit-tested
- All panels unified to `max-w-5xl` page width; h1 elevated to `text-2xl`
- `core/settings.ts` trimmed to three read functions + `mergeForSave` (removed unused `mergeSettings`, `writeUser`, `ensureFile`)
- Sticky save/reset button bar at bottom of settings page

### Tests

- 35 core-layer unit tests (up from 29)
- New coverage: `mergeForSave` semantics, `_rawPermissions`/`_rawEnabledPlugins` preservation, provider credential cleanup, legacy `permissionMode` migration

## [0.1.15] - 2026-04-20

### Changed
- Polish marketplace-facing files: keywords, homepage, bugs, bilingual README
- Repository URL changed to https://github.com/weixiaospace/vscode-claude-copilot

## [0.1.14] - 2026-04-20

### Added
- Initial public release
- Plugins & Marketplaces management panel
- MCP servers (user + project scope)
- Skills browser and edit
- Memory file management
- Settings visual editor (User / Project / Local three-layer)
- Usage dashboard with token analytics
- English + Simplified Chinese bilingual support

[Unreleased]: https://github.com/weixiaospace/vscode-claude-copilot/compare/v0.1.21...HEAD
[0.1.21]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.21
[0.1.20]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.20
[0.1.19]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.19
[0.1.18]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.18
[0.1.17]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.17
[0.1.16]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.16
[0.1.15]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.15
[0.1.14]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.14
