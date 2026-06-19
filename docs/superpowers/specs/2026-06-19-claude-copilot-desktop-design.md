---
status: approved
date: 2026-06-19
project: claude-copilot-desktop
target_repo: /Volumes/YUZI/Projects/claude-copilot-desktop
related:
  - ../../adr/0001-file-backed-resource-abstraction.md
  - ../../../CONTEXT.md
---

# Claude Copilot Desktop — Design

A Tauri 2 desktop client for managing Claude Code configuration. Spiritual sibling of the `vscode-claude-copilot` extension, but with a **scope-first information architecture** instead of the extension's resource-first panels.

## 1. Goals

- Cover the same 11 configuration surfaces as the VSCode extension (Plugins, MCP, Skills, Agents, Workflows, Output Styles, Rules, Hooks, Memory, Settings, Usage) for users whose primary editor isn't VSCode (e.g., Zed).
- Make every panel face exactly one scope at a time. No "user vs project" mixing within a view.
- Share metadata-level storage with the VSCode extension where it's free to do so (`providers.json`). Stay loosely coupled where sharing has real cost (provider credentials).

## 2. Non-Goals

| | Why |
|---|---|
| Embedded Claude chat / running prompts | The CLI and Claude Code own the chat surface. We manage config. |
| Plugin authoring scaffolding | `claude plugin init` already exists. |
| WYSIWYG markdown editor | Edits go to the user's primary editor (Zed). |
| Cloud sync of profiles / config across devices | Claude Code itself doesn't, neither do we. |
| Team / multi-user features | Single-user personal tool. |
| Managed scope (admin-pushed) | Same as the VSCode extension: defer until enterprise demand. |
| Linux release in v0.1 | macOS + Windows first; Linux when there's a real ask. |
| Embedded terminal | Zed handles that. |
| Multi-window | A single browse window covers all 11 panels. |

## 3. Audience & Identity

Primary user: a developer who has switched from VSCode to another editor (e.g., Zed) but still uses Claude Code's `~/.claude/` configuration ecosystem and wants the same visualization the VSCode extension provides.

The desktop app is **standalone**: separate repo, separate releases, separate issue tracker. It cooperates with the extension only through file-level conventions in `~/.claude/claude-copilot/`, never through API.

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri 2 Window                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Preact 10 + @preact/signals (frontend)               │  │
│  │  Tailwind 4 + local shadcn-style components           │  │
│  │  Vite 5 build                                         │  │
│  │             ↑                                         │  │
│  │             │  invoke() / listen() via Tauri IPC      │  │
│  │             ↓                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Rust backend (src-tauri/)                            │  │
│  │  - tokio async runtime                                │  │
│  │  - serde + serde_json + serde_yaml (parsing)          │  │
│  │  - notify (cross-platform fs watcher)                 │  │
│  │  - walkdir (recursive scan)                           │  │
│  │  - keyring (OS Keychain for provider credentials)     │  │
│  │  - regex, chrono, thiserror                           │  │
│  │  - ts-rs (Rust struct → TS interface code-gen)        │  │
│  │  - tauri-plugin-shell (spawn `claude` CLI)            │  │
│  │  - tauri-plugin-opener (Open in Zed / default editor) │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
              ↓ fs IO              ↓ shell           ↓ keychain
        ~/.claude/                claude CLI       system kc
```

**Key constraints**:

- Frontend has **zero Node fs dependency**. All file access goes through Rust IPC.
- Core logic (descriptor pattern, frontmatter parsing, 4-source hooks merge, etc.) is **reimplemented in Rust**, not shared from the VSCode extension's TS code. The two implementations evolve in parallel; bug fixes apply to both.
- Type contract via `ts-rs`: every Rust struct exposed to the frontend has `#[derive(serde::Serialize, ts_rs::TS)]`. Running `cargo test` regenerates `src/types/*.ts`. Manual type sync is impossible to drift.

## 5. Information Architecture

```
┌──────────────┬─────────────────────────────────────────────┐
│  Sidebar     │  Main area                                  │
│              │                                             │
│  🏠 User     │  [selected scope's name in header]          │
│  ──────────│  ┌─ Resource tabs (e.g., Plugins | Skills    │
│  📁 repo-a   │  │   | Agents | Workflows | Hooks | ...)   │
│  📁 repo-b   │  └─────────────────────────────────────     │
│  📁 repo-c   │                                             │
│  ──────────│  Resource list for selected tab              │
│              │  (chips, descriptions, action buttons)      │
│  ➕ Add      │                                             │
│              │  → Click item → detail dialog               │
│              │    - markdown preview (marked)              │
│              │    - "Open in Zed" primary action           │
│              │    - foldable Quick edit textarea           │
└──────────────┴─────────────────────────────────────────────┘
```

**Sidebar**:

- Pinned top: `User scope` (always present).
- Section header: `Projects`.
- List: scope rows for every project under `~/.claude/projects/` (Claude-known) UNION every project the user has added manually.
- Each project row shows: label (basename of path, with parent if collision), tooltip with full path.
- Stale project (path no longer exists on disk): grayed out, info badge.
- Bottom: `➕ Add Project…` button. Opens a folder picker; the chosen folder is stored in `state.json` under `manualProjects`.

**Main area**:

- Top: resource tabs (or vertical icon strip), one per resource available in the selected scope.
- Below: the selected resource's panel — list + actions (create, refresh, etc.). UI port of the VSCode extension's equivalent tree, but adapted to flat list with chips.
- Detail action: clicking a list item opens a **modal dialog** (native `<dialog>` element, no portal hack) with the markdown preview, an "Open in Zed" button, and a foldable Quick edit textarea.

## 6. Per-Scope Resource Matrix

| Resource | User scope | Project scope |
|---|---|---|
| Plugins / Marketplaces | ✓ (only here) | — |
| Skills | `~/.claude/skills/` | `<proj>/.claude/skills/` |
| Agents | `~/.claude/agents/` | `<proj>/.claude/agents/` |
| Workflows | `~/.claude/workflows/` | `<proj>/.claude/workflows/` |
| Output Styles | `~/.claude/output-styles/` | `<proj>/.claude/output-styles/` |
| Rules | `~/.claude/rules/` | `<proj>/.claude/rules/` |
| Hooks | user `settings.json` only | project `settings.json` + project `settings.local.json` + plugin `hooks/hooks.json` (plugin hooks always show under the user scope's Hooks panel — they're globally enabled) |
| MCP | `claude mcp list` (CLI) | project `settings.json#mcpServers` |
| Settings | user `settings.json` | project `settings.json` + project `settings.local.json` (two sub-tabs) |
| Memory | — | `~/.claude/projects/<slug>/memory/` |
| Usage | cross-project aggregation | sessions filtered to this project's slug |

**Intentional decisions**:

- Plugin-shipped variants of file-resources (e.g., a skill bundled with `superpowers`) are **not** duplicated under the top-level Skills/Agents/etc. panels. They appear only as expandable children under the corresponding Plugin row. (Continues ADR-0001's "no double exposure" policy.)
- Managed scope (admin-pushed) is out of scope for v0.1.

## 7. Frontend Stack & Repo Structure

```
claude-copilot-desktop/
├── src/                              # Preact frontend
│   ├── main.tsx
│   ├── App.tsx                       # router + global layout
│   ├── components/
│   │   ├── ui/                       # shadcn-style local components
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── combobox.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── switch.tsx
│   │   │   └── ...
│   │   ├── ScopeSidebar.tsx
│   │   ├── ResourceTabs.tsx
│   │   ├── ResourceList.tsx
│   │   └── ResourceDetail.tsx        # the modal
│   ├── panels/                       # one per resource (11 panels)
│   │   ├── PluginsPanel.tsx
│   │   ├── SkillsPanel.tsx
│   │   ├── AgentsPanel.tsx
│   │   └── ...
│   ├── lib/
│   │   ├── ipc.ts                    # invoke() + listen() typed wrappers
│   │   ├── signals.ts                # global state via signals
│   │   ├── i18n.ts                   # t() helper
│   │   └── markdown.ts               # marked wrapper
│   ├── types/                        # ts-rs auto-generated (do not edit)
│   │   └── *.ts
│   └── i18n/
│       ├── en.json
│       └── zh-cn.json
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs                    # tauri::Builder setup
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── scopes.rs
│   │   │   ├── plugins.rs
│   │   │   ├── agents.rs
│   │   │   ├── settings.rs
│   │   │   ├── providers.rs
│   │   │   ├── usage.rs
│   │   │   └── ...
│   │   ├── core/                     # logic ported from extension (Rust)
│   │   │   ├── mod.rs
│   │   │   ├── file_resource.rs      # descriptor + list/create/delete
│   │   │   ├── frontmatter.rs        # YAML, incl. comma-scalar tools
│   │   │   ├── hooks.rs              # 4-source merge
│   │   │   ├── plugins.rs            # installed_plugins.json
│   │   │   ├── mcp.rs
│   │   │   ├── settings.rs
│   │   │   ├── providers.rs          # profiles + matchProfileIdByEnv
│   │   │   └── usage.rs
│   │   ├── claude_cli.rs             # spawn `claude`, ClaudeCliMissingError
│   │   ├── watchers.rs               # notify-based fs watcher
│   │   └── secrets.rs                # keyring wrapper
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── components.json                   # shadcn config (for local copy workflow)
├── CLAUDE.md                         # project conventions
├── CONTEXT.md                        # glossary
├── docs/
│   ├── adr/
│   └── superpowers/specs/
└── README.md
```

**Library choices**:

- `preact` 10 + `@preact/signals`. State management is signals only — no Redux/Zustand. Panels own their data signals; sidebar owns selected-scope signal.
- `@preact/preact-router` for the URL-driven view switching. Routes:
  - `/scope/user/:resource`
  - `/scope/project/:projectId/:resource`
- `preact/compat` enabled so React-source shadcn components paste in without rewrites for the complex ones (Dialog, Combobox). Adds ~3 KB.
- `marked` for markdown rendering inside the detail dialog (read-only preview).
- Tailwind 4 via `@tailwindcss/vite`.

## 8. Backend Stack

| Crate | Role |
|---|---|
| `tauri` 2.x | Framework |
| `tokio` | Async runtime (Tauri dependency) |
| `serde`, `serde_json`, `serde_yaml` | Data parsing |
| `notify` 6.x | Cross-platform fs watcher |
| `walkdir` | Recursive directory scan |
| `keyring` | OS keychain access (provider credentials) |
| `regex` | Hook matcher patterns |
| `chrono` | Time handling (usage dashboard) |
| `thiserror` | Error types |
| `ts-rs` | Rust struct → TS interface code-gen |
| `tauri-plugin-shell` | Spawn `claude` CLI |
| `tauri-plugin-opener` | "Open in Zed / default editor" |

## 9. IPC Contract (Sketch)

A representative slice — not the full surface.

```typescript
// Scopes
invoke('list_scopes'): Promise<Scope[]>;
invoke('add_project', { path: string }): Promise<Scope>;
invoke('remove_manual_project', { id: string }): Promise<void>;

// File-resources (5 same-shape)
invoke('list_skills',   { scope: ScopeRef }): Promise<Skill[]>;
invoke('list_agents',   { scope: ScopeRef }): Promise<Agent[]>;
invoke('list_workflows',{ scope: ScopeRef }): Promise<Workflow[]>;
invoke('list_output_styles', { scope: ScopeRef }): Promise<OutputStyle[]>;
invoke('list_rules',    { scope: ScopeRef }): Promise<Rule[]>;

invoke('create_<kind>', { scope: ScopeRef, name: string }): Promise<T>;
invoke('delete_<kind>', { path: string }): Promise<void>;

invoke('read_file', { path: string }): Promise<string>;
invoke('write_file', { path: string, content: string }): Promise<void>;

// Output Styles extras
invoke('get_active_output_style', { scope: ScopeRef }): Promise<string | null>;
invoke('set_active_output_style', { scope: ScopeRef, name: string }): Promise<void>;

// Plugins (spawn claude CLI)
invoke('list_plugins'): Promise<InstalledPlugin[]>;
invoke('list_marketplaces'): Promise<Marketplace[]>;
invoke('list_available_plugins'): Promise<AvailablePlugin[]>;
invoke('install_plugin', { name: string }): Promise<void>;  // throws CliMissingError
invoke('uninstall_plugin', { name: string }): Promise<void>;
invoke('toggle_plugin', { name: string, enable: boolean }): Promise<void>;
invoke('add_marketplace', { source: string }): Promise<void>;
invoke('remove_marketplace', { name: string }): Promise<void>;
invoke('update_marketplace', { name?: string }): Promise<void>;

// MCP
invoke('list_mcp', { scope: ScopeRef }): Promise<McpServer[]>;
invoke('add_mcp',  { scope: ScopeRef, name, transport, urlOrCommand }): Promise<void>;
invoke('remove_mcp', { scope: ScopeRef, name }): Promise<void>;

// Hooks (read-only)
invoke('list_hooks', { scope: ScopeRef }): Promise<HookEntry[]>;

// Memory
invoke('list_memories', { projectId: string }): Promise<Memory[]>;
invoke('create_memory', { projectId: string, name: string }): Promise<Memory>;
invoke('delete_memory', { path: string }): Promise<void>;

// Settings
invoke('read_settings', { scope: ScopeRef, layer: 'user' | 'project' | 'local' }): Promise<SettingsDoc>;
invoke('write_settings', { scope: ScopeRef, layer, partial: PartialSettings }): Promise<void>;

// Provider profiles
invoke('list_profiles'): Promise<ProviderProfile[]>;
invoke('create_profile', { profile: ProfileInput, secret?: string }): Promise<ProviderProfile>;
invoke('update_profile', { id: string, profile: ProfileInput, secret?: string }): Promise<void>;
invoke('delete_profile', { id: string }): Promise<void>;
invoke('activate_profile', { id: string, scope: ScopeRef }): Promise<void>;

// Usage
invoke('query_usage', { scope: ScopeRef, granularity: 'day' | 'week' | 'month' }): Promise<UsageSnapshot>;

// External editor
invoke('open_in_default_editor', { path: string }): Promise<void>;

// Watcher events
listen<{ scopeId: string, kind: ResourceKind }>('resource-changed', cb);
listen<void>('providers-changed', cb);  // fires when ~/.claude/claude-copilot/providers.json mtime changes
```

`ScopeRef` is a union: `{ kind: 'user' } | { kind: 'project', id: string }`.

## 10. Persistence Layout

```
~/.claude/claude-copilot/
├── providers.json    ← shared with VSCode extension (both read/write)
├── state.json        ← desktop-only (UI state + manualProjects)
└── (no -desktop/ subdirectory)
```

**`providers.json`** — schema unchanged from what the VSCode extension already writes. Both apps treat it as the source of truth. Both apps watch it (via `notify` on the desktop side, via `vscode.workspace.createFileSystemWatcher` on the extension side) and reload on external changes.

**`state.json`** — desktop's own UI state. Schema:

```json
{
  "manualProjects": [
    { "id": "uuid", "path": "/abs/path", "label": "alias?", "addedAt": "ISO-8601" }
  ],
  "ui": {
    "locale": "zh-cn" | "en",
    "lastSelectedScopeId": "user" | "<projectId>",
    "lastSelectedResourceKind": "plugins" | "skills" | ...,
    "window": { "width": number, "height": number }
  }
}
```

**Write conflict handling** for `providers.json`: stat the file's mtime before writing; if it changed since we last read, refuse and reload. Race window between two simultaneously-running apps is small but the check makes it deterministic.

## 11. Provider Credential Storage (Path A — desktop half)

`keyring` crate, with this convention:

```
service:  "claude-copilot"
accounts: "claude-copilot.provider.<profileId>.apiKey"
          "claude-copilot.provider.<profileId>.authToken"
          "claude-copilot.provider.<profileId>.bedrockToken"
          "claude-copilot.provider.<profileId>.foundryApiKey"
```

The account strings deliberately match the VSCode extension's logical key in `src/core/providers.ts:111` (`claude-copilot.provider.${profileId}.${field}`).

**Why**: when the VSCode extension later (planned 0.3.0) migrates from `vscode.SecretStorage` to a `keytar`-based direct keychain access using **the same `service` and `account` convention**, the two apps automatically share credentials — no migration command needed.

**v0.1 reality** (until VSCode extension migrates):

- Desktop users enter credentials once when configuring a profile. Stored in keychain under the convention above.
- VSCode extension's existing secrets remain in its private SecretStorage. We don't try to read them (path X investigation confirmed `Code Safe Storage` wraps everything; direct keychain access can't see VSCode's secrets).
- No "Import from VSCode" button. Profile metadata flows freely; credentials don't.
- Documented as expected behavior in CLAUDE.md and the desktop's first-run welcome.

## 12. i18n

- Two bundles: `src/i18n/en.json` + `src/i18n/zh-cn.json`.
- `t(key, ...args)` helper, reads from a `locale` signal.
- Locale resolution at startup:
  1. `state.json#ui.locale` if present
  2. otherwise system locale via Tauri's `app.locale()`
  3. fallback `zh-cn`
- Settings panel exposes locale switcher — applies instantly (signal-driven).
- **Don't bulk-port the VSCode extension's 320-key bundle.** Only port keys actually referenced by the desktop's panels. (The extension's bundle has ~191 dead keys per the 0.2.0 audit — they get left behind.)

## 13. Distribution

Via the existing `tauri-cnb-autoupdate` skill at implementation time. Target state for v0.1:

- macOS + Windows (Linux deferred).
- GitHub Actions runs the cross-platform builds.
- macOS notarization via Apple Developer cert (out-of-band; required for unhindered installs).
- Windows: self-signed for v0.1; user clicks through SmartScreen once.
- CNB Release hosts the signed binaries and `updater.json`.
- Tauri's built-in updater pulls from the CNB URL.
- Release cadence: manual tag triggers the workflow.

## 14. Cross-Project Coordination (with `vscode-claude-copilot`)

Two separate releases, separate version trains, separate issue trackers. They cooperate strictly through file conventions:

| File | Owner | Reader |
|---|---|---|
| `~/.claude/claude-copilot/providers.json` | Both | Both |
| `~/.claude/claude-copilot/state.json` | Desktop | Desktop |
| `~/.claude/<the standard Claude config files>` | Claude Code | Both |

The VSCode extension's TODO needs a tracked item for the 0.3.0 secrets migration (refactor `src/lib/secrets.ts` to use `keytar` with the same service/account convention as this design). That item lives in the extension's repo, not here.

## 15. Open Questions (defer to implementation)

- App icon: placeholder for v0.1, real icon later.
- Window starting size: 1280×800 baseline; remembered between launches via `state.json`.
- Shadcn component coverage: don't pre-add all components; pull them in as each panel is built.
- IPC error envelope: settle when writing the first command (`{ ok: true, value } | { ok: false, error }` vs throwing). Recommend throwing — keeps `invoke()` call sites natural.
- Dark mode: respect system via `prefers-color-scheme`. No manual override in v0.1.

## 16. References

- [ADR-0001 — File-backed resource abstraction (VSCode extension)](../../adr/0001-file-backed-resource-abstraction.md)
- [CONTEXT.md — terminology shared with VSCode extension](../../../CONTEXT.md)
- Brainstorm conversation: this design's source-of-truth for "why we picked X over Y" details not repeated above.
