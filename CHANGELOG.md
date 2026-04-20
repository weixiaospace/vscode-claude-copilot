# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**[English](CHANGELOG.md) | [中文](CHANGELOG.zh-CN.md)**

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

[Unreleased]: https://github.com/weixiaospace/vscode-claude-copilot/compare/v0.1.16...HEAD
[0.1.16]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.16
[0.1.15]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.15
[0.1.14]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.14
