# Foundation + Settings Panel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared webview component module (`ui.ts`) and redesign the Settings panel into a schema-driven, left-nav + search + scrollspy layout — without changing save semantics.

**Architecture:** Extract a vanilla `(props)→htmlString` component module. Split the 755-line `settings-form.ts` into `settings-state.ts` (model/RPC), `settings-schema.ts` (declarative section/field data), and `settings-form.ts` (render orchestration). A generic render/bind engine maps over the schema; left rail, scrollspy, and search all derive from the same `SECTIONS` array.

**Tech Stack:** TypeScript, Vite 8, Tailwind 4, vanilla DOM (no framework). RPC over `postMessage` via `./rpc`. i18n via `./l10n` `t()`.

> **Testing note (deviation from default TDD):** The approved spec ([2026-05-29-settings-redesign-design.md](../specs/2026-05-29-settings-redesign-design.md)) decided against adding a webview unit-test harness (none exists; vanilla DOM). Verification per task = `pnpm build` (vite typechecks all webview TS) + the listed manual F5 smoke checks. Core `pnpm test` (71 passing) must stay green — no `src/core` changes are expected in this plan.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `webview-ui/src/ui.ts` | Shared component vocabulary: `escapeHtml`, tokens, `button/card/badge/sectionHeader/field/emptyState/switchRow/toggleGroup/select/numberInput/textInput/modal` | **Create** |
| `webview-ui/src/usage-dashboard.ts` | Use shared `escapeHtml` | Modify (remove local `escapeHtml`) |
| `webview-ui/src/marketplace-browser.ts` | Use shared `escapeHtml` | Modify (remove local `escapeHtml`) |
| `webview-ui/src/provider-app.ts` | Use shared `escapeHtml` | Modify (remove local `escapeHtml`) |
| `webview-ui/src/settings-state.ts` | `FormState`, `SettingsData`, constants (`MODELS`/`ENV_FLAGS`/…), `settingsToForm`, `formToPartial`, `KNOWN_ENV_KEYS`, `KNOWN_KEYS` | **Create** (moved from settings-form) |
| `webview-ui/src/settings-schema.ts` | `Field` union, `SettingsSection`, `SECTIONS` declarative data | **Create** |
| `webview-ui/src/settings-form.ts` | Render orchestration: layout, generic render/bind engine, scrollspy, search, footer, RPC wiring | Rewrite (slimmed) |
| `l10n/bundle.l10n.json` / `.zh-cn.json` | New keys: nav category labels, search placeholder | Modify |
| `src/webview/settings-panel.ts` | Add new keys to `SETTINGS_KEYS` injection whitelist | Modify |

---

## Task 1: Create shared `ui.ts` module

**Files:**
- Create: `webview-ui/src/ui.ts`

- [ ] **Step 1: Write the module**

```ts
// webview-ui/src/ui.ts
// Shared, framework-free component vocabulary for all webview panels.
// Each helper returns an HTML string; event binding stays per-panel via data-* / id hooks.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ---- design tokens ----
export const T = {
  border: 'border-current/20',
  borderSubtle: 'border-current/15',
  borderFaint: 'border-current/10',
  input: 'w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm',
  inputMono: 'w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono',
  card: 'rounded-lg border border-current/15',
} as const;

export type BtnVariant = 'primary' | 'secondary' | 'ghost';

export function button(o: { label: string; id?: string; variant?: BtnVariant; size?: 'sm' | 'md'; disabled?: boolean; attrs?: string }): string {
  const size = o.size === 'sm' ? 'text-xs px-3 py-1' : 'text-sm px-4 py-1.5';
  const variant =
    o.variant === 'primary' ? 'border border-current/40 bg-current/10 hover:bg-current/20'
    : o.variant === 'ghost' ? 'opacity-70 hover:opacity-100'
    : 'border border-current/20 hover:bg-current/5';
  return `<button ${o.id ? `id="${o.id}"` : ''} ${o.disabled ? 'disabled' : ''} ${o.attrs ?? ''}
    class="rounded ${size} ${variant} disabled:opacity-40">${escapeHtml(o.label)}</button>`;
}

export function badge(text: string, o?: { variant?: 'default' | 'active' | 'warn' }): string {
  const v = o?.variant === 'active'
    ? 'text-[var(--vscode-textLink-foreground)] border-[var(--vscode-textLink-foreground)]/40'
    : o?.variant === 'warn' ? 'border-yellow-500/40 text-yellow-500' : 'border-current/30 opacity-80';
  return `<span class="text-[11px] px-2 py-0.5 rounded-full border ${v}">${escapeHtml(text)}</span>`;
}

export function card(inner: string, o?: { muted?: boolean; cls?: string }): string {
  return `<div class="${T.card} p-4 ${o?.muted ? 'bg-current/[0.03]' : ''} ${o?.cls ?? ''}">${inner}</div>`;
}

export function sectionHeader(title: string, desc?: string): string {
  return `<div>
    <h2 class="text-sm font-semibold uppercase tracking-wider opacity-75">${escapeHtml(title)}</h2>
    ${desc ? `<p class="text-xs opacity-55 mt-1">${escapeHtml(desc)}</p>` : ''}
  </div>`;
}

export function field(o: { label: string; hint?: string; control: string }): string {
  return `<div class="space-y-1.5">
    <div class="text-sm font-medium">${escapeHtml(o.label)}</div>
    ${o.hint ? `<div class="text-xs opacity-60">${escapeHtml(o.hint)}</div>` : ''}
    ${o.control}
  </div>`;
}

export function emptyState(text: string): string {
  return `<div class="text-sm opacity-60 py-4 text-center">${escapeHtml(text)}</div>`;
}

export function switchRow(o: { id: string; checked: boolean; label: string; desc?: string }): string {
  return `<label class="flex items-start gap-3 py-2 cursor-pointer">
    <span class="relative inline-block mt-0.5 shrink-0">
      <input type="checkbox" id="${o.id}" ${o.checked ? 'checked' : ''} class="peer sr-only" />
      <span class="block w-9 h-5 rounded-full bg-current/20 peer-checked:bg-blue-500 transition-colors"></span>
      <span class="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
    </span>
    <span class="flex-1 min-w-0">
      <span class="block text-sm">${escapeHtml(o.label)}</span>
      ${o.desc ? `<span class="block text-xs opacity-60 mt-0.5">${escapeHtml(o.desc)}</span>` : ''}
    </span>
  </label>`;
}

export function toggleGroup(o: { id: string; options: { value: string; label: string }[]; active: string }): string {
  return `<div class="inline-flex flex-wrap gap-1" data-toggle="${o.id}">${o.options.map(opt => `
    <button data-val="${escapeHtml(opt.value)}" class="px-3 py-1 text-xs rounded-md border transition-colors ${o.active === opt.value
      ? 'bg-current/15 border-current/40 font-medium'
      : 'bg-transparent border-current/20 opacity-70 hover:bg-current/5'}">${escapeHtml(opt.label)}</button>`).join('')}</div>`;
}

export function select(o: { id: string; options: { value: string; label: string; selected: boolean }[]; cls?: string }): string {
  return `<select id="${o.id}" class="${o.cls ?? T.input}">${o.options.map(opt =>
    `<option value="${escapeHtml(opt.value)}" ${opt.selected ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}</select>`;
}

export function numberInput(o: { attr: string; value: number | ''; cls?: string }): string {
  return `<input type="number" ${o.attr} value="${o.value === '' ? '' : o.value}" min="0" class="${o.cls ?? 'w-40 bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono'}" />`;
}

export function textInput(o: { id?: string; attr?: string; value: string; placeholder?: string; cls?: string }): string {
  return `<input type="text" ${o.id ? `id="${o.id}"` : ''} ${o.attr ?? ''} value="${escapeHtml(o.value)}" placeholder="${escapeHtml(o.placeholder ?? '')}" class="${o.cls ?? T.inputMono}" />`;
}

export function modal(o: { title: string; body: string; footer: string; closeId?: string }): string {
  return `<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
    <div class="relative w-full max-w-lg max-h-[85vh] overflow-auto rounded-lg border border-current/20 bg-[var(--vscode-editor-background)] shadow-2xl p-5 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold">${escapeHtml(o.title)}</h3>
        <button ${o.closeId ? `id="${o.closeId}"` : ''} aria-label="Close" class="text-lg leading-none opacity-60 hover:opacity-100 px-1">×</button>
      </div>
      <div class="space-y-3">${o.body}</div>
      <div class="flex gap-2 justify-end pt-2">${o.footer}</div>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Verify build & typecheck**

Run: `pnpm build`
Expected: build succeeds; `ui.ts` compiles. (No consumers yet — it should not error on unused since it's all exported.)

- [ ] **Step 3: Commit**

```bash
git add webview-ui/src/ui.ts
git commit -m "feat(ui): add shared webview component module"
```

---

## Task 2: Adopt shared `escapeHtml` in the other three panels

**Files:**
- Modify: `webview-ui/src/usage-dashboard.ts` (local `escapeHtml` ~line 38)
- Modify: `webview-ui/src/marketplace-browser.ts` (local `escapeHtml` ~line 31)
- Modify: `webview-ui/src/provider-app.ts` (local `escapeHtml` ~line 24)

- [ ] **Step 1: In each of the three files, delete the local `escapeHtml` function definition and add an import**

In `usage-dashboard.ts`, `marketplace-browser.ts`, `provider-app.ts`:
- Remove the local `function escapeHtml(...) {...}` block.
- Add at the top with the other imports: `import { escapeHtml } from './ui';`

(Leave all call sites unchanged — the signature is identical.)

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: build succeeds; no "escapeHtml is not defined" and no duplicate-definition errors.

- [ ] **Step 3: F5 smoke (optional but recommended)**

Open the Extension Development Host, open Usage / Marketplace / Provider panels — they render exactly as before (no visual change).

- [ ] **Step 4: Commit**

```bash
git add webview-ui/src/usage-dashboard.ts webview-ui/src/marketplace-browser.ts webview-ui/src/provider-app.ts
git commit -m "refactor(webview): use shared escapeHtml from ui.ts"
```

---

## Task 3: Extract `settings-state.ts` (model + RPC data, no behavior change)

**Files:**
- Create: `webview-ui/src/settings-state.ts`
- Modify: `webview-ui/src/settings-form.ts` (import from new module instead of local defs)

- [ ] **Step 1: Create `settings-state.ts` by moving these exact symbols out of the current `settings-form.ts`**

Move verbatim (cut from settings-form.ts, paste into settings-state.ts) and `export` each:
- Types: `Layer`, `LayerAvailability`, `InstalledPluginSummary`, `ProfileSummary`, `SettingsData`, `EnvDef`, `FormState` (lines 4–18, 38, 87–132).
- Constants: `MODELS`, `PERMISSION_MODES`, `EFFORT_LEVELS`, `AUTO_UPDATES_CHANNELS`, `VIEW_MODES`, `TUI_MODES`, `LANGUAGES`, `ENV_FLAGS`, `ENV_NUMBERS`, `PROVIDER_ENV`, `KNOWN_ENV_KEYS`, `FLAG_KEYS`, `NUMBER_KEYS` (lines 20–83).
- Pure functions: `toStringArr`, `settingsToForm`, `formToPartial` (lines 152–276).
- Add a new exported constant for the save whitelist (extracted from the inline array at lines 333–341):

```ts
export const KNOWN_KEYS: string[] = [
  'model', 'effortLevel', 'language', 'autoUpdatesChannel',
  'alwaysThinkingEnabled', 'showThinkingSummaries', 'verbose',
  'viewMode', 'tui', 'prefersReducedMotion', 'spinnerTipsEnabled', 'awaySummaryEnabled',
  'respectGitignore', 'includeGitInstructions', 'enableAllProjectMcpServers', 'includeCoAuthoredBy',
  'autoMemoryEnabled', 'autoDreamEnabled', 'autoMemoryDirectory',
  'cleanupPeriodDays', 'apiKeyHelper', 'skipDangerousModePermissionPrompt',
  'permissions', 'permissionMode', 'env', 'enabledPlugins',
];
```

`settings-state.ts` needs `escapeHtml`? No — none of the moved functions use it. It needs no imports except none (pure logic). Keep `settingsToForm`/`formToPartial` exactly as-is.

- [ ] **Step 2: Update `settings-form.ts` imports**

At the top of settings-form.ts add:
```ts
import {
  type Layer, type SettingsData, type FormState,
  MODELS, PERMISSION_MODES, EFFORT_LEVELS, AUTO_UPDATES_CHANNELS, VIEW_MODES, TUI_MODES, LANGUAGES,
  ENV_FLAGS, ENV_NUMBERS, settingsToForm, formToPartial, KNOWN_KEYS,
} from './settings-state';
```
Delete the now-moved definitions from settings-form.ts. Replace the inline `knownKeys: [ ... ]` array in `save()` with `knownKeys: KNOWN_KEYS`.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: succeeds; no duplicate/missing symbol errors. `settings.js` bundle size roughly unchanged.

- [ ] **Step 4: F5 smoke**

Open Settings panel: loads, shows all 9 sections, change a toggle → Save → reopens with value persisted. Reset works. Layer switch works. Behavior identical to before.

- [ ] **Step 5: Commit**

```bash
git add webview-ui/src/settings-state.ts webview-ui/src/settings-form.ts
git commit -m "refactor(settings): extract state model into settings-state.ts"
```

---

## Task 4: Create `settings-schema.ts` (declarative sections)

**Files:**
- Create: `webview-ui/src/settings-schema.ts`

This declares every "regular" field as data with `get`/`set` closures over `FormState`. Special sections (plugins, advanced/customEnv) are `custom` and rendered by id in settings-form. Feature-flags and numeric-limits are expanded from `ENV_FLAGS`/`ENV_NUMBERS`.

- [ ] **Step 1: Write the schema module**

```ts
// webview-ui/src/settings-schema.ts
import { t } from './l10n';
import {
  type FormState, MODELS, PERMISSION_MODES, EFFORT_LEVELS, AUTO_UPDATES_CHANNELS,
  VIEW_MODES, TUI_MODES, LANGUAGES, ENV_FLAGS, ENV_NUMBERS,
} from './settings-state';

export type Field =
  | { kind: 'select'; id: string; labelKey: string; descKey?: string; options: () => { value: string; label: string }[]; get: (f: FormState) => string; set: (f: FormState, v: string) => void }
  | { kind: 'toggleGroup'; id: string; labelKey: string; descKey?: string; options: () => { value: string; label: string }[]; get: (f: FormState) => string; set: (f: FormState, v: string) => void }
  | { kind: 'switch'; id: string; labelKey: string; descKey?: string; descRaw?: string; get: (f: FormState) => boolean; set: (f: FormState, v: boolean) => void }
  | { kind: 'number'; id: string; labelKey: string; descKey?: string; descRaw?: string; get: (f: FormState) => number | ''; set: (f: FormState, v: number | '') => void }
  | { kind: 'text'; id: string; labelKey: string; descKey?: string; placeholder?: string; get: (f: FormState) => string; set: (f: FormState, v: string) => void }
  | { kind: 'tagList'; id: 'allow' | 'deny' | 'ask' | 'dir'; labelKey: string; descKey?: string; placeholder: string; getList: (f: FormState) => string[] }
  | { kind: 'custom'; id: 'plugins' | 'advanced' };

export interface SettingsSection { id: string; labelKey: string; icon: string; fields: Field[] }

// helper to build {value,label} option lists
const opts = (values: string[], defaultLabel: string) =>
  () => [{ value: '', label: defaultLabel }, ...values.map(v => ({ value: v, label: v }))];

const flagFields: Field[] = ENV_FLAGS.map(fl => ({
  kind: 'switch' as const, id: 'env-flag-' + fl.key, labelKey: fl.labelKey, descRaw: fl.key,
  get: (f: FormState) => f.envFlags[fl.key] ?? false,
  set: (f: FormState, v: boolean) => { f.envFlags[fl.key] = v; },
}));

const numberFields: Field[] = ENV_NUMBERS.map(n => ({
  kind: 'number' as const, id: 'env-num-' + n.key, labelKey: n.labelKey, descRaw: n.key,
  get: (f: FormState) => f.envNumbers[n.key] ?? '',
  set: (f: FormState, v: number | '') => { f.envNumbers[n.key] = v; },
}));

export const SECTIONS: SettingsSection[] = [
  {
    id: 'permissions', labelKey: 'settings.section.permissions', icon: 'shield',
    fields: [
      { kind: 'toggleGroup', id: 'permMode', labelKey: 'settings.permissionMode', descKey: 'settings.permissionMode.desc',
        options: opts(PERMISSION_MODES, t('settings.modelDefault')), get: f => f.permDefaultMode, set: (f, v) => { f.permDefaultMode = v; } },
      { kind: 'tagList', id: 'allow', labelKey: 'settings.permissions.allow', descKey: 'settings.permissions.allow.desc', placeholder: 'Bash(npm run *)', getList: f => f.permAllow },
      { kind: 'tagList', id: 'ask', labelKey: 'settings.permissions.ask', descKey: 'settings.permissions.ask.desc', placeholder: 'Bash(git push *)', getList: f => f.permAsk },
      { kind: 'tagList', id: 'deny', labelKey: 'settings.permissions.deny', descKey: 'settings.permissions.deny.desc', placeholder: 'Bash(rm -rf *)', getList: f => f.permDeny },
      { kind: 'tagList', id: 'dir', labelKey: 'settings.permissions.additionalDirs', descKey: 'settings.permissions.additionalDirs.desc', placeholder: '/path/to/dir', getList: f => f.permAdditionalDirs },
      { kind: 'switch', id: 's-skipDangerous', labelKey: 'settings.skipDangerous', descKey: 'settings.skipDangerous.desc', get: f => f.skipDangerousModePermissionPrompt, set: (f, v) => { f.skipDangerousModePermissionPrompt = v; } },
      { kind: 'switch', id: 's-disableBypass', labelKey: 'settings.disableBypass', descKey: 'settings.disableBypass.desc', get: f => f.permDisableBypass, set: (f, v) => { f.permDisableBypass = v; } },
    ],
  },
  {
    id: 'ai', labelKey: 'settings.section.ai', icon: 'sparkle',
    fields: [
      { kind: 'select', id: 'f-model', labelKey: 'settings.defaultModel', options: () => MODELS.map(m => ({ value: m, label: m || t('settings.modelDefault') })), get: f => f.model, set: (f, v) => { f.model = v; } },
      { kind: 'toggleGroup', id: 'effortLevel', labelKey: 'settings.effort', descKey: 'settings.effort.desc', options: opts(EFFORT_LEVELS, t('settings.modelDefault')), get: f => f.effortLevel, set: (f, v) => { f.effortLevel = v; } },
      { kind: 'switch', id: 's-alwaysThinking', labelKey: 'settings.alwaysThinking', descKey: 'settings.alwaysThinking.desc', get: f => f.alwaysThinkingEnabled, set: (f, v) => { f.alwaysThinkingEnabled = v; } },
      { kind: 'switch', id: 's-showThinking', labelKey: 'settings.showThinking', descKey: 'settings.showThinking.desc', get: f => f.showThinkingSummaries, set: (f, v) => { f.showThinkingSummaries = v; } },
      { kind: 'switch', id: 's-verbose', labelKey: 'settings.verbose', descKey: 'settings.verbose.desc', get: f => f.verbose, set: (f, v) => { f.verbose = v; } },
    ],
  },
  {
    id: 'display', labelKey: 'settings.section.display', icon: 'device-desktop',
    fields: [
      { kind: 'select', id: 'f-language', labelKey: 'settings.language', descKey: 'settings.language.desc', options: () => LANGUAGES.map(l => ({ value: l.value, label: t(l.labelKey) })), get: f => f.language, set: (f, v) => { f.language = v; } },
      { kind: 'toggleGroup', id: 'viewMode', labelKey: 'settings.viewMode', descKey: 'settings.viewMode.desc', options: opts(VIEW_MODES, t('settings.modelDefault')), get: f => f.viewMode, set: (f, v) => { f.viewMode = v; } },
      { kind: 'toggleGroup', id: 'tui', labelKey: 'settings.tui', descKey: 'settings.tui.desc', options: opts(TUI_MODES, t('settings.modelDefault')), get: f => f.tui, set: (f, v) => { f.tui = v; } },
      { kind: 'toggleGroup', id: 'autoUpdatesChannel', labelKey: 'settings.autoUpdatesChannel', descKey: 'settings.autoUpdatesChannel.desc', options: opts(AUTO_UPDATES_CHANNELS, t('settings.modelDefault')), get: f => f.autoUpdatesChannel, set: (f, v) => { f.autoUpdatesChannel = v; } },
      { kind: 'switch', id: 's-reducedMotion', labelKey: 'settings.reducedMotion', descKey: 'settings.reducedMotion.desc', get: f => f.prefersReducedMotion, set: (f, v) => { f.prefersReducedMotion = v; } },
      { kind: 'switch', id: 's-spinnerTips', labelKey: 'settings.spinnerTips', descKey: 'settings.spinnerTips.desc', get: f => f.spinnerTipsEnabled, set: (f, v) => { f.spinnerTipsEnabled = v; } },
      { kind: 'switch', id: 's-awaySummary', labelKey: 'settings.awaySummary', descKey: 'settings.awaySummary.desc', get: f => f.awaySummaryEnabled, set: (f, v) => { f.awaySummaryEnabled = v; } },
    ],
  },
  { id: 'flags', labelKey: 'settings.section.flags', icon: 'settings-gear', fields: flagFields },
  { id: 'limits', labelKey: 'settings.section.limits', icon: 'symbol-number', fields: numberFields },
  {
    id: 'memory', labelKey: 'settings.section.memory', icon: 'database',
    fields: [
      { kind: 'switch', id: 's-autoMemory', labelKey: 'settings.autoMemory', descKey: 'settings.autoMemory.desc', get: f => f.autoMemoryEnabled, set: (f, v) => { f.autoMemoryEnabled = v; } },
      { kind: 'switch', id: 's-autoDream', labelKey: 'settings.autoDream', descKey: 'settings.autoDream.desc', get: f => f.autoDreamEnabled, set: (f, v) => { f.autoDreamEnabled = v; } },
      { kind: 'text', id: 'f-autoMemoryDir', labelKey: 'settings.autoMemoryDir', descKey: 'settings.autoMemoryDir.desc', placeholder: '~/my-memory-dir', get: f => f.autoMemoryDirectory, set: (f, v) => { f.autoMemoryDirectory = v; } },
    ],
  },
  {
    id: 'filesGit', labelKey: 'settings.section.filesGit', icon: 'git-merge',
    fields: [
      { kind: 'switch', id: 's-respectGitignore', labelKey: 'settings.respectGitignore', descKey: 'settings.respectGitignore.desc', get: f => f.respectGitignore, set: (f, v) => { f.respectGitignore = v; } },
      { kind: 'switch', id: 's-gitInstructions', labelKey: 'settings.gitInstructions', descKey: 'settings.gitInstructions.desc', get: f => f.includeGitInstructions, set: (f, v) => { f.includeGitInstructions = v; } },
      { kind: 'switch', id: 's-coauthored', labelKey: 'settings.includeCoAuthored', descKey: 'settings.includeCoAuthored.desc', get: f => f.includeCoAuthoredBy, set: (f, v) => { f.includeCoAuthoredBy = v; } },
      { kind: 'switch', id: 's-enableAllMcp', labelKey: 'settings.enableAllMcp', descKey: 'settings.enableAllMcp.desc', get: f => f.enableAllProjectMcpServers, set: (f, v) => { f.enableAllProjectMcpServers = v; } },
      { kind: 'number', id: 'f-cleanup', labelKey: 'settings.cleanupDays', descKey: 'settings.cleanupDays.desc', get: f => f.cleanupPeriodDays, set: (f, v) => { f.cleanupPeriodDays = v; } },
    ],
  },
  { id: 'plugins', labelKey: 'settings.section.plugins', icon: 'extensions', fields: [{ kind: 'custom', id: 'plugins' }] },
  { id: 'advanced', labelKey: 'settings.section.advanced', icon: 'tools', fields: [{ kind: 'custom', id: 'advanced' }] },
];
```

> Note: `t()` is evaluated at module-eval time for the static default labels (`t('settings.modelDefault')`). This matches the current behavior where these labels are computed once per render via the options builder — acceptable because the panel reloads (`window` re-eval) on locale change. If lazy eval is preferred, the `options` thunks already defer the per-call labels.

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: succeeds; types resolve. (No consumer yet besides type-checking.)

- [ ] **Step 3: Commit**

```bash
git add webview-ui/src/settings-schema.ts
git commit -m "feat(settings): declarative section/field schema"
```

---

## Task 5: Rewrite `settings-form.ts` render/bind as a generic schema engine (keep single-scroll layout for now)

This de-risks the schema engine before adding new layout: prove `SECTIONS` reproduces the existing UI and all controls still work. Layout/search come in Tasks 6–7.

**Files:**
- Modify: `webview-ui/src/settings-form.ts`

- [ ] **Step 1: Replace the render helpers and `renderForm`/`bind` with a generic engine**

Keep `mount`, `load`, `save`, `reset`, `openJson`, `switchLayer`, `markDirty`, `State`, the `LAYER_LABEL`/`LAYER_FILE` maps, `renderLayerBadge`, `renderProviderSelect`, `renderEnvCustom`, `renderPluginList`, the `message` listener, and `commitTag`. Change `State` to use a generic tag-input buffer:

```ts
import * as ui from './ui';
import { SECTIONS, type Field, type SettingsSection } from './settings-schema';
```

Replace the four input buffers (`allowInput/denyInput/askInput/dirInput`) in `State` with:
```ts
tagInput: Record<'allow' | 'deny' | 'ask' | 'dir', string>;
```
and initialize `tagInput: { allow: '', deny: '', ask: '', dir: '' }`. Update `reset()` to set `state.tagInput = { allow: '', deny: '', ask: '', dir: '' }`.

Rewrite `commitTag` and `renderTagList` to use `state.tagInput[kind]` instead of the four separate fields. The `renderTagList` body is unchanged except it reads `state.tagInput[kind]` for the input value.

Add the generic field renderer:

```ts
function renderField(field: Field, f: FormState): string {
  const label = t(field.labelKey);
  const hint = 'descRaw' in field && field.descRaw ? field.descRaw : (field.descKey ? t(field.descKey) : '');
  switch (field.kind) {
    case 'switch':
      return ui.switchRow({ id: field.id, checked: field.get(f), label, desc: hint });
    case 'toggleGroup':
      return ui.field({ label, hint, control: ui.toggleGroup({ id: field.id, options: field.options(), active: field.get(f) }) });
    case 'select':
      return ui.field({ label, hint, control: ui.select({ id: field.id, options: field.options().map(o => ({ ...o, selected: o.value === field.get(f) })) }) });
    case 'number':
      return ui.field({ label, hint, control: ui.numberInput({ attr: `data-num="${field.id}"`, value: field.get(f) }) });
    case 'text':
      return ui.field({ label, hint, control: ui.textInput({ id: field.id, value: field.get(f), placeholder: field.placeholder }) });
    case 'tagList':
      return ui.field({ label, hint, control: renderTagList(field.id, field.getList(f), state.tagInput[field.id], field.placeholder) });
    case 'custom':
      return field.id === 'plugins'
        ? `<div class="space-y-1">${renderPluginList()}</div><div class="text-[11px] opacity-50 mt-2">${t('settings.pluginsHint')}</div>`
        : (state.showAdvancedEnv
            ? `<div class="space-y-2">${renderEnvCustom()}</div>`
            : ui.button({ id: 'show-advanced', label: `${t('settings.advanced.show')} (${f.envCustom.length})`, size: 'sm' }));
  }
}

function renderSectionBody(sec: SettingsSection, f: FormState): string {
  return sec.fields.map(field => renderField(field, f)).join(
    sec.id === 'flags' ? '<div class="border-t border-current/10 my-1"></div>' : '');
}
```

> Note the `number` field now uses `data-num="<id>"`. The schema's `number` `set` closure is keyed by id; binding (below) looks up the field by id to call its `set`. The legacy `data-envn`/`#f-cleanup` handlers are replaced by this unified handler.

Add a schema index for binding lookups:
```ts
const FIELD_BY_ID = new Map<string, Field>();
for (const sec of SECTIONS) for (const fld of sec.fields) FIELD_BY_ID.set(fld.id, fld);
```

Replace the body of `renderForm()` so each section renders via `ui.card` / `ui.sectionHeader`:
```ts
function renderForm(): string {
  if (!state.form || !state.data) return '';
  const f = state.form;
  return SECTIONS.map(sec => `
    <section id="sec-${sec.id}" data-section="${sec.id}" class="rounded-lg border border-current/15 p-5 space-y-4 scroll-mt-4">
      ${ui.sectionHeader(t(sec.labelKey))}
      ${renderSectionBody(sec, f)}
    </section>`).join('');
}
```

- [ ] **Step 2: Rewrite `bind()` to dispatch generically by field kind**

Replace the per-field handlers with generic ones (keep tag-list, plugin, advanced-env, footer, and provider handlers, adapted to the new buffer):

```ts
function bind() {
  const f = state.form!;

  // toggle groups
  root.querySelectorAll<HTMLElement>('[data-toggle]').forEach(group => {
    const fld = FIELD_BY_ID.get(group.dataset.toggle!);
    if (!fld || fld.kind !== 'toggleGroup') return;
    group.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(btn => {
      btn.addEventListener('click', () => { fld.set(f, btn.dataset.val!); markDirty(); render(); });
    });
  });

  // switches
  for (const fld of FIELD_BY_ID.values()) {
    if (fld.kind !== 'switch') continue;
    root.querySelector<HTMLInputElement>('#' + fld.id)?.addEventListener('change', e => {
      fld.set(f, (e.target as HTMLInputElement).checked); markDirty(); render();
    });
  }

  // selects (re-render so dependent UI updates, matching legacy model/language behavior)
  for (const fld of FIELD_BY_ID.values()) {
    if (fld.kind !== 'select') continue;
    root.querySelector<HTMLSelectElement>('#' + fld.id)?.addEventListener('change', e => {
      fld.set(f, (e.target as HTMLSelectElement).value); markDirty(); render();
    });
  }

  // text inputs (no re-render — preserve focus while typing)
  for (const fld of FIELD_BY_ID.values()) {
    if (fld.kind !== 'text') continue;
    root.querySelector<HTMLInputElement>('#' + fld.id)?.addEventListener('input', e => {
      fld.set(f, (e.target as HTMLInputElement).value); markDirty();
    });
  }

  // number inputs (no re-render)
  root.querySelectorAll<HTMLInputElement>('input[data-num]').forEach(inp => {
    const fld = FIELD_BY_ID.get(inp.dataset.num!);
    if (!fld || fld.kind !== 'number') return;
    inp.addEventListener('input', () => {
      const v = inp.value.trim();
      fld.set(f, v === '' ? '' : Number(v)); markDirty();
    });
  });

  // tag lists (unchanged logic, new buffer)
  for (const kind of ['allow', 'deny', 'ask', 'dir'] as const) {
    const input = root.querySelector<HTMLInputElement>(`input[data-${kind}-input]`);
    input?.addEventListener('input', () => { state.tagInput[kind] = input.value; });
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitTag(kind); } });
    root.querySelector<HTMLButtonElement>(`button[data-${kind}-add]`)?.addEventListener('click', () => commitTag(kind));
    root.querySelectorAll<HTMLButtonElement>(`button[data-${kind}-remove]`).forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset[`${kind}Remove`]);
        const list = kind === 'allow' ? f.permAllow : kind === 'deny' ? f.permDeny : kind === 'ask' ? f.permAsk : f.permAdditionalDirs;
        list.splice(i, 1); markDirty(); render();
      });
    });
  }

  // plugins
  root.querySelectorAll<HTMLInputElement>('input[data-plugin]').forEach(cb => {
    cb.addEventListener('change', () => { f.enabledPlugins[cb.dataset.plugin!] = cb.checked; markDirty(); });
  });

  // advanced custom env
  root.querySelector<HTMLButtonElement>('#show-advanced')?.addEventListener('click', () => { state.showAdvancedEnv = true; render(); });
  root.querySelectorAll<HTMLInputElement>('input[data-envc-key]').forEach(inp => {
    inp.addEventListener('input', () => { f.envCustom[Number(inp.dataset.envcKey)]!.key = inp.value; markDirty(); });
  });
  root.querySelectorAll<HTMLInputElement>('input[data-envc-value]').forEach(inp => {
    inp.addEventListener('input', () => { f.envCustom[Number(inp.dataset.envcValue)]!.value = inp.value; markDirty(); });
  });
  root.querySelectorAll<HTMLButtonElement>('button[data-envc-remove]').forEach(btn => {
    btn.addEventListener('click', () => { f.envCustom.splice(Number(btn.dataset.envcRemove), 1); markDirty(); render(); });
  });
  root.querySelector<HTMLButtonElement>('#envc-add')?.addEventListener('click', () => { f.envCustom.push({ key: '', value: '' }); markDirty(); render(); });

  // footer + provider
  root.querySelector<HTMLButtonElement>('#save-btn')?.addEventListener('click', () => save());
  root.querySelector<HTMLButtonElement>('#reset-btn')?.addEventListener('click', () => reset());
  root.querySelector<HTMLButtonElement>('#json-btn')?.addEventListener('click', () => openJson());
  root.querySelector<HTMLSelectElement>('#layer-provider')?.addEventListener('change', async e => {
    const id = (e.target as HTMLSelectElement).value || null;
    await call('settings:setLayerProvider', { layer: state.layer, id });
    await load();
  });
}
```

Delete the now-unused legacy helpers: `switchControl`, `toggleGroup` (local), `section`, `field` (local) — they're replaced by `ui.*`. Keep `renderTagList`, `renderEnvCustom`, `renderPluginList`, `renderProviderSelect`, `renderLayerBadge` (adapt `renderTagList` to the buffer; others unchanged).

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: succeeds; no unused-symbol references; `settings.js` builds.

- [ ] **Step 4: F5 smoke — exhaustive control parity check**

Open Settings. Verify each works and persists across Save→reload:
- Permission mode toggle group; allow/ask/deny/dir tag add (button + Enter) + remove.
- skipDangerous / disableBypass switches.
- Model select; effort toggle; alwaysThinking/showThinking/verbose switches.
- Language select; viewMode/tui/autoUpdates toggles; reducedMotion/spinnerTips/awaySummary switches.
- All 15 feature-flag switches; all 6 numeric inputs.
- autoMemory/autoDream switches; autoMemoryDir text (cursor doesn't jump while typing).
- respectGitignore/gitInstructions/coauthored/enableAllMcp switches; cleanup number.
- Plugins checkboxes; Advanced "Show" → custom env add/edit/remove.
- Save / Reset / Edit JSON / provider select / layer switch.

- [ ] **Step 5: Commit**

```bash
git add webview-ui/src/settings-form.ts
git commit -m "refactor(settings): schema-driven generic render/bind engine"
```

---

## Task 6: Two-pane layout — left category nav + sticky context bar + scrollspy

**Files:**
- Modify: `webview-ui/src/settings-form.ts`

- [ ] **Step 1: Add nav + scrollspy state and helpers**

Add to `State`: `activeSection: string;` initialized to `SECTIONS[0].id`. Add a module-level holder for the observer so re-renders can disconnect it:
```ts
let scrollObserver: IntersectionObserver | null = null;
```

Add the rail renderer:
```ts
function renderNav(): string {
  return `<nav class="space-y-0.5">${SECTIONS.map(sec => `
    <button data-nav="${sec.id}" class="w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${
      state.activeSection === sec.id ? 'bg-current/10 font-medium' : 'opacity-70 hover:bg-current/5'}">
      <span class="codicon codicon-${sec.icon} opacity-70"></span>${escapeHtml(t(sec.labelKey))}
    </button>`).join('')}</nav>`;
}
```

> If the webview has no codicon font loaded, drop the `<span class="codicon …">` and keep text-only labels — confirm by checking whether other panels render codicons. (Provider/usage panels use emoji, not codicons, so **text-only labels are the safe default**; omit the codicon span unless codicon CSS is confirmed present.)

- [ ] **Step 2: Rewrite the top-level `render()` layout to two panes**

```ts
function render() {
  if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
  if (!state.form || !state.data) {
    root.innerHTML = `<div class="p-6 text-sm opacity-70">${state.loading ? t('common.loading') : t('common.preparing')}</div>`;
    return;
  }
  root.innerHTML = `
    <div class="flex flex-col h-screen">
      <header class="shrink-0 border-b border-current/15 px-5 py-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          ${renderLayerBadge()}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${state.dirty ? `<span class="text-xs px-2 py-0.5 rounded border border-current/30 opacity-80">${t('settings.unsaved')}</span>` : ''}
        </div>
      </header>
      <div class="flex-1 flex min-h-0">
        <aside class="w-48 shrink-0 border-r border-current/15 p-3 overflow-y-auto space-y-3">
          <input id="settings-search" type="text" placeholder="${escapeHtml(t('settings.search'))}" value="${escapeHtml(state.search)}"
            class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm" />
          ${renderNav()}
        </aside>
        <main id="settings-scroll" class="flex-1 overflow-y-auto p-5 space-y-4">
          ${renderProviderSelect()}
          <div class="space-y-4">${renderForm()}</div>
        </main>
      </div>
      <footer class="shrink-0 flex gap-2 px-5 py-2 border-t border-current/15 bg-[var(--vscode-editor-background)]">
        ${ui.button({ id: 'save-btn', label: state.saving ? t('settings.saving') : t('settings.save'), variant: 'primary', disabled: state.saving || !state.dirty })}
        ${ui.button({ id: 'reset-btn', label: t('settings.reset'), variant: 'secondary', disabled: !state.dirty })}
        <div class="flex-1"></div>
        ${ui.button({ id: 'json-btn', label: t('settings.editJson'), variant: 'ghost' })}
      </footer>
    </div>`;
  bind();
  bindNav();
}
```

> The scope-explainer box (old lines 606–611) and the `⚙️ Settings` H1 are removed — the layer badge in the header now carries that context, and the scope hints move into per-layer tooltips (kept in l10n, surfaced on the layer badge `title` attr). This is intentional decluttering per the redesign.

- [ ] **Step 3: Add nav click + scrollspy wiring**

```ts
function bindNav() {
  root.querySelectorAll<HTMLButtonElement>('button[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.nav!;
      state.activeSection = id;
      root.querySelector(`#sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // update rail highlight without full re-render
      root.querySelectorAll<HTMLButtonElement>('button[data-nav]').forEach(b =>
        b.classList.toggle('bg-current/10', b.dataset.nav === id));
    });
  });

  const scroller = root.querySelector<HTMLElement>('#settings-scroll');
  if (scroller) {
    scrollObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const id = (e.target as HTMLElement).dataset.section!;
          state.activeSection = id;
          root.querySelectorAll<HTMLButtonElement>('button[data-nav]').forEach(b =>
            b.classList.toggle('bg-current/10', b.dataset.nav === id));
        }
      }
    }, { root: scroller, rootMargin: '0px 0px -70% 0px', threshold: 0 });
    root.querySelectorAll<HTMLElement>('section[data-section]').forEach(s => scrollObserver!.observe(s));
  }
}
```

> Add `state.search` to `State` (init `''`) now even though search logic lands in Task 7 — the search input is rendered here. Wiring its `input` handler comes in Task 7.

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 5: F5 smoke**

Open Settings: two-pane layout renders; left rail lists 9 categories; clicking a category scrolls the right pane to it; scrolling the right pane highlights the current category in the rail; sticky header (layer badge) and sticky footer (Save/Reset/Edit JSON) stay in place; all controls from Task 5 still function.

- [ ] **Step 6: Commit**

```bash
git add webview-ui/src/settings-form.ts
git commit -m "feat(settings): left-nav + scrollspy two-pane layout"
```

---

## Task 7: Live search / filter

**Files:**
- Modify: `webview-ui/src/settings-form.ts`

- [ ] **Step 1: Add a search predicate and filtered rendering**

Add a helper that decides whether a field matches the query (by label and, for env flags/numbers, raw key):
```ts
function fieldMatches(field: Field, q: string): boolean {
  if (!q) return true;
  const hay = [t(field.labelKey), field.id, ('descRaw' in field ? field.descRaw : '') ?? ''].join(' ').toLowerCase();
  return hay.includes(q);
}
function sectionMatches(sec: SettingsSection, q: string): boolean {
  if (!q) return true;
  if (t(sec.labelKey).toLowerCase().includes(q)) return true;
  return sec.fields.some(fl => fl.kind !== 'custom' && fieldMatches(fl, q));
}
```

- [ ] **Step 2: Make `renderForm` and `renderNav` query-aware**

In `renderForm`, filter sections/fields by the lowercased `state.search`:
```ts
function renderForm(): string {
  if (!state.form || !state.data) return '';
  const f = state.form;
  const q = state.search.trim().toLowerCase();
  const visible = SECTIONS.filter(sec => sectionMatches(sec, q));
  if (visible.length === 0) return ui.emptyState(t('settings.search.empty'));
  return visible.map(sec => {
    const fields = sec.fields.filter(fl => fl.kind === 'custom' ? !q : fieldMatches(fl, q));
    if (fields.length === 0) return '';
    return `<section id="sec-${sec.id}" data-section="${sec.id}" class="rounded-lg border border-current/15 p-5 space-y-4 scroll-mt-4">
      ${ui.sectionHeader(t(sec.labelKey))}
      ${fields.map(fl => renderField(fl, f)).join(sec.id === 'flags' ? '<div class="border-t border-current/10 my-1"></div>' : '')}
    </section>`;
  }).join('');
}
```
In `renderNav`, only list sections that match: wrap the `SECTIONS.map` source with `SECTIONS.filter(sec => sectionMatches(sec, state.search.trim().toLowerCase()))`.

- [ ] **Step 3: Wire the search input (no full re-render of the input itself, to preserve focus)**

In `bindNav` (or a new `bindSearch` called from `render`), add:
```ts
const search = root.querySelector<HTMLInputElement>('#settings-search');
search?.addEventListener('input', () => {
  state.search = search.value;
  // re-render only the nav + main, keep the live input focused
  const nav = root.querySelector('aside nav');
  if (nav) nav.outerHTML = renderNav();
  const main = root.querySelector('#settings-scroll');
  if (main) { main.querySelector('.space-y-4:last-child')!.innerHTML = renderForm(); }
  bind(); bindNavOnly();
  root.querySelector<HTMLInputElement>('#settings-search')?.focus();
});
```

> To avoid re-binding the search input mid-keystroke (which would lose focus), factor the nav-click + scrollspy wiring into `bindNavOnly()` (everything in `bindNav` except the `search` listener). `render()` calls `bind()` + `bindNav()` (full); the search handler calls `bind()` + `bindNavOnly()` then restores focus. Simpler acceptable alternative: keep one `bindNav()` and just call `search.focus()` + place cursor at end after re-render.

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 5: F5 smoke**

Open Settings: type in the search box → right pane shows only matching sections/fields, rail shows only matching categories; clearing the box restores the full view; typing keeps focus in the search box; "no results" shows the empty state; a matched control still saves correctly.

- [ ] **Step 6: Commit**

```bash
git add webview-ui/src/settings-form.ts
git commit -m "feat(settings): live search/filter across sections"
```

---

## Task 8: l10n keys + injection whitelist + final verification

**Files:**
- Modify: `l10n/bundle.l10n.json`, `l10n/bundle.l10n.zh-cn.json`
- Modify: `src/webview/settings-panel.ts` (`SETTINGS_KEYS` whitelist)

- [ ] **Step 1: Add new l10n keys to BOTH bundles**

Add (English in `bundle.l10n.json`, Chinese in `bundle.l10n.zh-cn.json`):
```
"settings.search": "Search settings…"            / "搜索设置…"
"settings.search.empty": "No settings match"      / "没有匹配的设置"
```
(All other keys used — `settings.section.*`, `settings.permissionMode`, etc. — already exist; verify with the grep in Step 3.)

- [ ] **Step 2: Add the two new keys to `SETTINGS_KEYS` in `src/webview/settings-panel.ts`**

Find the `SETTINGS_KEYS` array (the injection whitelist) and add `'settings.search'`, `'settings.search.empty'`.

- [ ] **Step 3: Verify no missing/orphan keys, build, test**

Run:
```bash
node -e 'const cp=require("child_process");const en=require("./l10n/bundle.l10n.json"),zh=require("./l10n/bundle.l10n.zh-cn.json");
const used=cp.spawnSync("grep",["-rhoE","t\\(.settings\\.[a-zA-Z.]+","webview-ui/src","src"]).stdout.toString().match(/settings\.[a-zA-Z.]+/g)||[];
const miss=[...new Set(used)].filter(k=>!(k in en));console.log("missing in en:",miss);
console.log("en/zh key parity:",Object.keys(en).length===Object.keys(zh).length);'
pnpm build
pnpm test
```
Expected: `missing in en: []`; key parity `true`; build succeeds; `71 passing`.

- [ ] **Step 4: Final F5 regression pass**

Re-run the Task 5 Step 4 exhaustive control check **plus** Task 6/7 checks (nav, scrollspy, search) once more, in both an English and a Chinese VSCode locale if convenient (confirm search placeholder + category labels localize).

- [ ] **Step 5: Commit**

```bash
git add l10n/bundle.l10n.json l10n/bundle.l10n.zh-cn.json src/webview/settings-panel.ts
git commit -m "feat(settings): i18n keys for nav search + whitelist"
```

---

## Self-Review

**1. Spec coverage:**
- §1 Foundation `ui.ts` → Task 1 ✓; adopted in panels → Task 2 ✓ (escapeHtml; settings consumes more in Tasks 5–6).
- §2 left-nav + search + scrollspy + sticky context bar → Tasks 6 (nav/scrollspy/context bar) + 7 (search) ✓.
- §3 schema-driven, split into schema/state/form → Tasks 3 (state) + 4 (schema) + 5 (form engine) ✓.
- §4 search behavior (label/key, hide non-matching categories, empty query = full) → Task 7 ✓.
- §5 frozen: save model/`mergeForSave`/`_raw*` (state moved verbatim, `KNOWN_KEYS` unchanged), `setLayerProvider`, Edit-JSON, l10n via `t()` + whitelist, no framework → preserved across Tasks 3,5,8 ✓.
- Acceptance criteria 1–6 → covered by Tasks 1–2 (esc), 5–7 (layout/parity), 3–5 (split), 8 (l10n/build/test) ✓.

**2. Placeholder scan:** No "TBD/TODO/handle edge cases". Task 3 references existing code by exact symbol names + line numbers (a move, not new code) — acceptable. All new code shown in full.

**3. Type consistency:** `FormState` defined in Task 3, consumed by `settings-schema.ts` (Task 4) and `renderField`/`bind` (Task 5). `Field`/`SettingsSection`/`SECTIONS` defined Task 4, consumed Task 5+. `state.tagInput` introduced Task 5 and used by `renderTagList`/`commitTag`/bind consistently. `state.search`/`state.activeSection` introduced Task 6, consumed Task 7. `KNOWN_KEYS` defined Task 3, used in `save()` Task 3. Field ids in schema (`f-model`, `s-verbose`, `env-flag-*`, `env-num-*`, tagList `allow|deny|ask|dir`, custom `plugins|advanced`) match the binders. `data-num` attribute (Task 5) matches `input[data-num]` query (Task 5). No mismatches found.
