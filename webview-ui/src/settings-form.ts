import { call } from './rpc';
import { t } from './l10n';

type Layer = 'user' | 'project' | 'local';

interface LayerAvailability { user: boolean; project: boolean; local: boolean }
interface InstalledPluginSummary { key: string; name: string; marketplace: string }

interface ProfileSummary { id: string; name: string; kind: string; baseUrl: string }

interface SettingsData {
  layer: Layer;
  settings: Record<string, unknown>;
  availableLayers: LayerAvailability;
  installedPlugins: InstalledPluginSummary[];
  profiles: ProfileSummary[];
  activeProfileId: string | null;
}

// ==================== Constants (from docs.claude.com/en/docs/claude-code/settings) ====================

const MODELS = ['', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
const PERMISSION_MODES = ['default', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions'];
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const AUTO_UPDATES_CHANNELS = ['latest', 'stable'];
const VIEW_MODES = ['default', 'verbose', 'focus'];
const TUI_MODES = ['default', 'fullscreen'];
const LANGUAGES = [
  { value: '', labelKey: 'settings.lang.default' },
  { value: 'english', labelKey: 'settings.lang.en' },
  { value: 'chinese', labelKey: 'settings.lang.zh' },
  { value: 'japanese', labelKey: 'settings.lang.ja' },
  { value: 'spanish', labelKey: 'settings.lang.es' },
  { value: 'french', labelKey: 'settings.lang.fr' },
  { value: 'german', labelKey: 'settings.lang.de' },
];

interface EnvDef { key: string; labelKey: string }
const ENV_FLAGS: EnvDef[] = [
  { key: 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', labelKey: 'settings.env.agentTeams' },
  { key: 'DISABLE_TELEMETRY', labelKey: 'settings.env.disableTelemetry' },
  { key: 'DISABLE_ERROR_REPORTING', labelKey: 'settings.env.disableErrorReporting' },
  { key: 'DISABLE_AUTOUPDATER', labelKey: 'settings.env.disableAutoUpdater' },
  { key: 'DISABLE_FEEDBACK_COMMAND', labelKey: 'settings.env.disableFeedback' },
  { key: 'DISABLE_BUG_COMMAND', labelKey: 'settings.env.disableBugCommand' },
  { key: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', labelKey: 'settings.env.disableNonEssentialTraffic' },
  { key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', labelKey: 'settings.env.disableAutoMemory' },
  { key: 'CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS', labelKey: 'settings.env.disableGitInstructions' },
  { key: 'CLAUDE_CODE_DISABLE_THINKING', labelKey: 'settings.env.disableThinking' },
  { key: 'CLAUDE_CODE_DISABLE_1M_CONTEXT', labelKey: 'settings.env.disable1mContext' },
  { key: 'CLAUDE_CODE_DISABLE_FAST_MODE', labelKey: 'settings.env.disableFastMode' },
  { key: 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', labelKey: 'settings.env.disableBgTasks' },
  { key: 'CLAUDE_CODE_DISABLE_TERMINAL_TITLE', labelKey: 'settings.env.disableTerminalTitle' },
  { key: 'CLAUDE_CODE_SKIP_BASH_ENV_SNAPSHOT', labelKey: 'settings.env.skipBashEnv' },
];

const ENV_NUMBERS: EnvDef[] = [
  { key: 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', labelKey: 'settings.env.maxOutputTokens' },
  { key: 'MAX_THINKING_TOKENS', labelKey: 'settings.env.maxThinkingTokens' },
  { key: 'CLAUDE_CODE_MAX_RETRIES', labelKey: 'settings.env.maxRetries' },
  { key: 'API_TIMEOUT_MS', labelKey: 'settings.env.apiTimeoutMs' },
  { key: 'BASH_DEFAULT_TIMEOUT_MS', labelKey: 'settings.env.bashDefaultTimeoutMs' },
  { key: 'BASH_MAX_OUTPUT_LENGTH', labelKey: 'settings.env.bashMaxOutputLength' },
];

const PROVIDER_ENV = {
  bedrock: 'CLAUDE_CODE_USE_BEDROCK',
  vertex: 'CLAUDE_CODE_USE_VERTEX',
  foundry: 'CLAUDE_CODE_USE_FOUNDRY',
};

const KNOWN_ENV_KEYS = new Set<string>([
  ...ENV_FLAGS.map(f => f.key),
  ...ENV_NUMBERS.map(n => n.key),
  'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_SUBAGENT_MODEL',
  PROVIDER_ENV.bedrock, PROVIDER_ENV.vertex, PROVIDER_ENV.foundry,
  'AWS_BEARER_TOKEN_BEDROCK', 'ANTHROPIC_BEDROCK_BASE_URL', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
  'ANTHROPIC_VERTEX_PROJECT_ID', 'ANTHROPIC_VERTEX_BASE_URL', 'CLAUDE_CODE_SKIP_VERTEX_AUTH',
  'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_FOUNDRY_BASE_URL', 'ANTHROPIC_FOUNDRY_RESOURCE', 'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
]);

const FLAG_KEYS = new Set(ENV_FLAGS.map(f => f.key));
const NUMBER_KEYS = new Set(ENV_NUMBERS.map(n => n.key));

// ==================== Form state ====================

interface FormState {
  // Core
  model: string;
  effortLevel: string;
  language: string;
  autoUpdatesChannel: string;
  alwaysThinkingEnabled: boolean;
  showThinkingSummaries: boolean;
  verbose: boolean;
  // Display
  viewMode: string;
  tui: string;
  prefersReducedMotion: boolean;
  spinnerTipsEnabled: boolean;
  awaySummaryEnabled: boolean;
  // Files / Git
  respectGitignore: boolean;
  includeGitInstructions: boolean;
  enableAllProjectMcpServers: boolean;
  includeCoAuthoredBy: boolean;
  // Memory / Dream (superpowers-era features)
  autoMemoryEnabled: boolean;
  autoDreamEnabled: boolean;
  autoMemoryDirectory: string;
  // Session / Cleanup
  cleanupPeriodDays: number | '';
  apiKeyHelper: string;
  skipDangerousModePermissionPrompt: boolean;
  // Permissions
  permDefaultMode: string;
  permAllow: string[];
  permDeny: string[];
  permAsk: string[];
  permAdditionalDirs: string[];
  permDisableBypass: boolean;
  _rawPermissions: Record<string, unknown>;
  // Provider env passthrough (read-only shadow — never modified by this form)
  _rawProviderEnv: Record<string, string>;
  // Env flags & numbers
  envFlags: Record<string, boolean>;
  envNumbers: Record<string, number | ''>;
  envCustom: Array<{ key: string; value: string }>;
  // Plugins
  enabledPlugins: Record<string, boolean>;
  _rawEnabledPlugins: Record<string, boolean>;
}

interface State {
  layer: Layer;
  data: SettingsData | null;
  form: FormState | null;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  allowInput: string;
  denyInput: string;
  askInput: string;
  dirInput: string;
  showAdvancedEnv: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function toStringArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map(String) : [];
}

function settingsToForm(settings: Record<string, unknown>, installedPlugins: InstalledPluginSummary[]): FormState {
  const envObj = { ...(settings.env as Record<string, unknown> ?? {}) } as Record<string, string>;
  const enabledPluginsObj = (settings.enabledPlugins ?? {}) as Record<string, boolean>;
  const enabled: Record<string, boolean> = {};
  for (const p of installedPlugins) enabled[p.key] = enabledPluginsObj[p.key] !== false;

  const envFlags: Record<string, boolean> = {};
  for (const f of ENV_FLAGS) envFlags[f.key] = envObj[f.key] === '1';
  const envNumbers: Record<string, number | ''> = {};
  for (const n of ENV_NUMBERS) {
    const v = envObj[n.key];
    envNumbers[n.key] = v && !Number.isNaN(Number(v)) ? Number(v) : '';
  }

  const apiKeyHelperVal = typeof settings.apiKeyHelper === 'string' ? settings.apiKeyHelper : '';

  const envCustom = Object.entries(envObj)
    .filter(([k]) => !KNOWN_ENV_KEYS.has(k))
    .map(([key, value]) => ({ key, value: String(value) }));

  const permObj = (settings.permissions ?? {}) as Record<string, unknown>;
  const { defaultMode, allow, deny, ask, additionalDirectories, disableBypassPermissionsMode, ...restPerm } = permObj;

  const _rawProviderEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(envObj)) {
    if (KNOWN_ENV_KEYS.has(k) && !FLAG_KEYS.has(k) && !NUMBER_KEYS.has(k)) _rawProviderEnv[k] = String(v);
  }

  return {
    model: typeof settings.model === 'string' ? settings.model : '',
    effortLevel: typeof settings.effortLevel === 'string' ? settings.effortLevel : '',
    language: typeof settings.language === 'string' ? settings.language : '',
    autoUpdatesChannel: typeof settings.autoUpdatesChannel === 'string' ? settings.autoUpdatesChannel : '',
    alwaysThinkingEnabled: settings.alwaysThinkingEnabled === true,
    showThinkingSummaries: settings.showThinkingSummaries === true,
    verbose: settings.verbose === true,
    viewMode: typeof settings.viewMode === 'string' ? settings.viewMode : '',
    tui: typeof settings.tui === 'string' ? settings.tui : '',
    prefersReducedMotion: settings.prefersReducedMotion === true,
    spinnerTipsEnabled: settings.spinnerTipsEnabled !== false,
    awaySummaryEnabled: settings.awaySummaryEnabled !== false,
    respectGitignore: settings.respectGitignore !== false,
    includeGitInstructions: settings.includeGitInstructions !== false,
    enableAllProjectMcpServers: settings.enableAllProjectMcpServers === true,
    includeCoAuthoredBy: settings.includeCoAuthoredBy !== false,
    autoMemoryEnabled: settings.autoMemoryEnabled !== false,
    autoDreamEnabled: settings.autoDreamEnabled !== false,
    autoMemoryDirectory: typeof settings.autoMemoryDirectory === 'string' ? settings.autoMemoryDirectory : '',
    cleanupPeriodDays: typeof settings.cleanupPeriodDays === 'number' ? settings.cleanupPeriodDays : '',
    apiKeyHelper: apiKeyHelperVal,
    skipDangerousModePermissionPrompt: settings.skipDangerousModePermissionPrompt === true,
    permDefaultMode: typeof defaultMode === 'string' ? defaultMode : '',
    permAllow: toStringArr(allow),
    permDeny: toStringArr(deny),
    permAsk: toStringArr(ask),
    permAdditionalDirs: toStringArr(additionalDirectories),
    permDisableBypass: disableBypassPermissionsMode === 'disable' || disableBypassPermissionsMode === true,
    _rawPermissions: restPerm,
    _rawProviderEnv,
    envFlags,
    envNumbers,
    envCustom,
    enabledPlugins: enabled,
    _rawEnabledPlugins: { ...enabledPluginsObj },
  };
}

function formToPartial(form: FormState): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (form.model) p.model = form.model;
  if (form.effortLevel) p.effortLevel = form.effortLevel;
  if (form.language) p.language = form.language;
  if (form.autoUpdatesChannel) p.autoUpdatesChannel = form.autoUpdatesChannel;
  if (form.alwaysThinkingEnabled) p.alwaysThinkingEnabled = true;
  if (form.showThinkingSummaries) p.showThinkingSummaries = true;
  if (form.verbose) p.verbose = true;
  if (form.viewMode) p.viewMode = form.viewMode;
  if (form.tui) p.tui = form.tui;
  if (form.prefersReducedMotion) p.prefersReducedMotion = true;
  if (!form.spinnerTipsEnabled) p.spinnerTipsEnabled = false;
  if (!form.awaySummaryEnabled) p.awaySummaryEnabled = false;
  if (!form.respectGitignore) p.respectGitignore = false;
  if (!form.includeGitInstructions) p.includeGitInstructions = false;
  if (form.enableAllProjectMcpServers) p.enableAllProjectMcpServers = true;
  if (!form.includeCoAuthoredBy) p.includeCoAuthoredBy = false;
  if (!form.autoMemoryEnabled) p.autoMemoryEnabled = false;
  if (!form.autoDreamEnabled) p.autoDreamEnabled = false;
  if (form.autoMemoryDirectory) p.autoMemoryDirectory = form.autoMemoryDirectory;
  if (typeof form.cleanupPeriodDays === 'number') p.cleanupPeriodDays = form.cleanupPeriodDays;
  if (form.apiKeyHelper) p.apiKeyHelper = form.apiKeyHelper;
  if (form.skipDangerousModePermissionPrompt) p.skipDangerousModePermissionPrompt = true;

  // permissions (preserve unknown nested keys)
  const permOut: Record<string, unknown> = { ...form._rawPermissions };
  if (form.permDefaultMode) permOut.defaultMode = form.permDefaultMode;
  if (form.permAllow.length) permOut.allow = form.permAllow;
  if (form.permDeny.length) permOut.deny = form.permDeny;
  if (form.permAsk.length) permOut.ask = form.permAsk;
  if (form.permAdditionalDirs.length) permOut.additionalDirectories = form.permAdditionalDirs;
  if (form.permDisableBypass) permOut.disableBypassPermissionsMode = 'disable';
  if (Object.keys(permOut).length) p.permissions = permOut;

  // env
  const envOut: Record<string, string> = {};
  for (const [k, v] of Object.entries(form.envFlags)) if (v) envOut[k] = '1';
  for (const [k, v] of Object.entries(form.envNumbers)) if (typeof v === 'number') envOut[k] = String(v);
  Object.assign(envOut, form._rawProviderEnv);
  for (const { key, value } of form.envCustom) if (key.trim()) envOut[key.trim()] = value;
  if (Object.keys(envOut).length) p.env = envOut;

  // enabledPlugins — preserve raw entries for plugins not in the managed list,
  // overlay explicit false overrides for managed plugins (true is the default, no need to store).
  const enabledPlugins: Record<string, boolean> = { ...form._rawEnabledPlugins };
  for (const [key, value] of Object.entries(form.enabledPlugins)) {
    if (value) delete enabledPlugins[key];
    else enabledPlugins[key] = false;
  }
  if (Object.keys(enabledPlugins).length > 0) p.enabledPlugins = enabledPlugins;

  return p;
}

// ==================== Render helpers ====================

function switchControl(id: string, checked: boolean, label: string, desc?: string): string {
  return `
    <label class="flex items-start gap-3 py-2 cursor-pointer">
      <span class="relative inline-block mt-0.5 shrink-0">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} class="peer sr-only" />
        <span class="block w-9 h-5 rounded-full bg-current/20 peer-checked:bg-blue-500 transition-colors"></span>
        <span class="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
      </span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm">${escapeHtml(label)}</span>
        ${desc ? `<span class="block text-xs opacity-60 mt-0.5">${escapeHtml(desc)}</span>` : ''}
      </span>
    </label>
  `;
}

function toggleGroup(id: string, options: { value: string; label: string }[], active: string): string {
  return `<div class="inline-flex flex-wrap gap-1" data-toggle="${id}">${options.map(o => `
    <button data-val="${escapeHtml(o.value)}" class="px-3 py-1 text-xs rounded-md border transition-colors ${active === o.value
      ? 'bg-current/15 border-current/40 font-medium'
      : 'bg-transparent border-current/20 opacity-70 hover:bg-current/5'}">${escapeHtml(o.label)}</button>
  `).join('')}</div>`;
}

export function mount(root: HTMLElement): void {
  const initialLayer = ((window as any).__layer as Layer) ?? 'user';
  const state: State = {
    layer: initialLayer, data: null, form: null, dirty: false, loading: false, saving: false,
    allowInput: '', denyInput: '', askInput: '', dirInput: '',
    showAdvancedEnv: false,
  };

  async function load() {
    state.loading = true; render();
    try {
      state.data = await call<SettingsData>('settings:read', { layer: state.layer });
      state.form = settingsToForm(state.data.settings, state.data.installedPlugins);
      state.dirty = false;
    } catch (err: any) {
      console.error('settings:read failed', err);
    } finally {
      state.loading = false; render();
    }
  }

  async function save() {
    if (!state.form) return;
    state.saving = true; render();
    try {
      const partial = formToPartial(state.form);
      await call('settings:write', {
        layer: state.layer,
        partial,
        knownKeys: [
          'model', 'effortLevel', 'language', 'autoUpdatesChannel',
          'alwaysThinkingEnabled', 'showThinkingSummaries', 'verbose',
          'viewMode', 'tui', 'prefersReducedMotion', 'spinnerTipsEnabled', 'awaySummaryEnabled',
          'respectGitignore', 'includeGitInstructions', 'enableAllProjectMcpServers', 'includeCoAuthoredBy',
          'autoMemoryEnabled', 'autoDreamEnabled', 'autoMemoryDirectory',
          'cleanupPeriodDays', 'apiKeyHelper', 'skipDangerousModePermissionPrompt',
          'permissions', 'permissionMode', 'env', 'enabledPlugins',
        ],
      });
      state.dirty = false;
      await load();
    } catch (err: any) {
      console.error('settings:write failed', err);
      alert(t('settings.saveFailed') + ': ' + (err?.message || err));
    } finally {
      state.saving = false; render();
    }
  }

  function reset() {
    if (!state.data) return;
    state.form = settingsToForm(state.data.settings, state.data.installedPlugins);
    state.dirty = false;
    state.allowInput = ''; state.denyInput = ''; state.askInput = ''; state.dirInput = '';
    render();
  }

  function openJson() { call('settings:openJson', { layer: state.layer }).catch(() => {}); }

  function switchLayer(next: Layer) {
    if (state.dirty && !confirm(t('settings.unsavedChanges'))) return;
    state.layer = next; state.data = null; state.form = null; load();
  }

  function markDirty() { state.dirty = true; }

  const LAYER_LABEL: Record<Layer, string> = {
    get user() { return t('tree.group.user'); },
    get project() { return t('tree.group.project'); },
    get local() { return t('tree.layer.local'); },
  };
  const LAYER_FILE: Record<Layer, string> = {
    user: '~/.claude/settings.json',
    project: '.claude/settings.json',
    local: '.claude/settings.local.json',
  };

  function renderLayerBadge(): string {
    return `
      <div class="flex items-center gap-2 text-sm">
        <span class="opacity-60">${escapeHtml(t('settings.editingLayer'))}</span>
        <span class="inline-flex items-center gap-2 rounded border border-current/25 bg-current/10 px-2.5 py-1 font-medium">
          ${escapeHtml(LAYER_LABEL[state.layer])}
          <span class="opacity-55 font-mono text-xs">${escapeHtml(LAYER_FILE[state.layer])}</span>
        </span>
      </div>`;
  }

  function renderTagList(kind: 'allow' | 'deny' | 'ask' | 'dir', items: string[], inputValue: string, placeholder: string): string {
    const tags = items.map((item, i) => `
      <span class="inline-flex items-center gap-1 text-xs rounded border border-current/25 bg-current/5 px-2 py-0.5 font-mono">
        <span>${escapeHtml(item)}</span>
        <button data-${kind}-remove="${i}" class="opacity-60 hover:opacity-100 hover:text-red-500 leading-none">×</button>
      </span>
    `).join('');
    return `
      <div class="space-y-2">
        <div class="flex flex-wrap gap-1.5 min-h-6">${tags || `<span class="text-xs opacity-50">${t('settings.permissions.empty')}</span>`}</div>
        <div class="flex gap-2">
          <input type="text" data-${kind}-input value="${escapeHtml(inputValue)}" placeholder="${escapeHtml(placeholder)}"
            class="flex-1 bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />
          <button data-${kind}-add class="text-xs px-3 py-1 border border-current/20 rounded hover:bg-current/5 whitespace-nowrap">+ ${t('settings.permissions.add')}</button>
        </div>
      </div>
    `;
  }

  function renderEnvCustom(): string {
    if (!state.form) return '';
    const rows = state.form.envCustom.map((e, i) => `
      <div class="flex gap-2 items-center">
        <input type="text" data-envc-key="${i}" value="${escapeHtml(e.key)}" placeholder="KEY"
          class="flex-1 bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />
        <span class="opacity-60">=</span>
        <input type="text" data-envc-value="${i}" value="${escapeHtml(e.value)}" placeholder="VALUE"
          class="flex-[2] bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />
        <button data-envc-remove="${i}" class="text-xs px-2 py-1 opacity-60 hover:opacity-100">×</button>
      </div>
    `).join('');
    return rows + `<button id="envc-add" class="text-xs px-3 py-1 border border-current/20 rounded hover:bg-current/5">+ ${t('settings.envAdd')}</button>`;
  }

  function renderPluginList(): string {
    if (!state.form || !state.data) return '';
    if (state.data.installedPlugins.length === 0) return `<div class="text-xs opacity-60">${t('settings.noPlugins')}</div>`;
    return state.data.installedPlugins.map(p => `
      <label class="flex items-center gap-2 text-sm py-0.5">
        <input type="checkbox" data-plugin="${escapeHtml(p.key)}" ${state.form!.enabledPlugins[p.key] ? 'checked' : ''} />
        <span>${escapeHtml(p.name)}</span>
        <span class="text-xs opacity-50">(${escapeHtml(p.marketplace)})</span>
      </label>
    `).join('');
  }

  function renderProviderSelect(): string {
    if (!state.data) return '';
    const cur = state.data.activeProfileId ?? '';
    const opts = [`<option value="" ${cur === '' ? 'selected' : ''}>${escapeHtml(t('settings.activeProvider.none'))}</option>`]
      .concat(state.data.profiles.map(p =>
        `<option value="${escapeHtml(p.id)}" ${cur === p.id ? 'selected' : ''}>${escapeHtml(p.name)}${p.baseUrl ? ' — ' + escapeHtml(p.baseUrl) : ''}</option>`));
    const projectHint = state.layer === 'project'
      ? `<div class="mt-2 text-[11px] opacity-75 border border-yellow-500/35 bg-yellow-500/10 rounded px-2 py-1.5">⚠ ${escapeHtml(t('settings.activeProvider.projectHint'))}</div>`
      : '';
    return `
      <div class="rounded-lg border border-current/15 p-4 space-y-1.5">
        <div class="text-sm font-medium">${escapeHtml(t('settings.activeProvider'))}</div>
        <div class="text-xs opacity-60">${escapeHtml(t('settings.activeProvider.desc'))}</div>
        <select id="layer-provider" class="w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm mt-1">${opts.join('')}</select>
        ${projectHint}
      </div>`;
  }

  function section(title: string, inner: string, desc?: string): string {
    return `
      <section class="rounded-lg border border-current/15 p-5 space-y-4">
        <div>
          <h2 class="text-sm font-semibold uppercase tracking-wider opacity-75">${escapeHtml(title)}</h2>
          ${desc ? `<p class="text-xs opacity-55 mt-1">${escapeHtml(desc)}</p>` : ''}
        </div>
        ${inner}
      </section>
    `;
  }

  function field(label: string, desc: string, inner: string): string {
    return `
      <div class="space-y-1.5">
        <div class="text-sm font-medium">${escapeHtml(label)}</div>
        ${desc ? `<div class="text-xs opacity-60">${escapeHtml(desc)}</div>` : ''}
        ${inner}
      </div>
    `;
  }

  function renderForm(): string {
    if (!state.form || !state.data) return '';
    const f = state.form;

    // ---- Permissions ----
    const permissionsSection = section(t('settings.section.permissions'), [
      field(t('settings.permissionMode'), t('settings.permissionMode.desc'),
        toggleGroup('permMode', [{ value: '', label: t('settings.modelDefault') }, ...PERMISSION_MODES.map(m => ({ value: m, label: m }))], f.permDefaultMode)),
      field(t('settings.permissions.allow'), t('settings.permissions.allow.desc'),
        renderTagList('allow', f.permAllow, state.allowInput, 'Bash(npm run *)')),
      field(t('settings.permissions.ask'), t('settings.permissions.ask.desc'),
        renderTagList('ask', f.permAsk, state.askInput, 'Bash(git push *)')),
      field(t('settings.permissions.deny'), t('settings.permissions.deny.desc'),
        renderTagList('deny', f.permDeny, state.denyInput, 'Bash(rm -rf *)')),
      field(t('settings.permissions.additionalDirs'), t('settings.permissions.additionalDirs.desc'),
        renderTagList('dir', f.permAdditionalDirs, state.dirInput, '/path/to/dir')),
      switchControl('s-skipDangerous', f.skipDangerousModePermissionPrompt, t('settings.skipDangerous'), t('settings.skipDangerous.desc')),
      switchControl('s-disableBypass', f.permDisableBypass, t('settings.disableBypass'), t('settings.disableBypass.desc')),
    ].join(''));

    // ---- Model & AI ----
    const aiSection = section(t('settings.section.ai'), [
      field(t('settings.defaultModel'), '',
        `<select id="f-model" class="w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm">
          ${MODELS.map(m => `<option value="${m}" ${f.model === m ? 'selected' : ''}>${m || t('settings.modelDefault')}</option>`).join('')}
        </select>`),
      field(t('settings.effort'), t('settings.effort.desc'),
        toggleGroup('effortLevel', [{ value: '', label: t('settings.modelDefault') }, ...EFFORT_LEVELS.map(e => ({ value: e, label: e }))], f.effortLevel)),
      switchControl('s-alwaysThinking', f.alwaysThinkingEnabled, t('settings.alwaysThinking'), t('settings.alwaysThinking.desc')),
      switchControl('s-showThinking', f.showThinkingSummaries, t('settings.showThinking'), t('settings.showThinking.desc')),
      switchControl('s-verbose', f.verbose, t('settings.verbose'), t('settings.verbose.desc')),
    ].join(''));

    // ---- Display ----
    const displaySection = section(t('settings.section.display'), [
      field(t('settings.language'), t('settings.language.desc'),
        `<select id="f-language" class="w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm">
          ${LANGUAGES.map(l => `<option value="${l.value}" ${f.language === l.value ? 'selected' : ''}>${t(l.labelKey)}</option>`).join('')}
        </select>`),
      field(t('settings.viewMode'), t('settings.viewMode.desc'),
        toggleGroup('viewMode', [{ value: '', label: t('settings.modelDefault') }, ...VIEW_MODES.map(v => ({ value: v, label: v }))], f.viewMode)),
      field(t('settings.tui'), t('settings.tui.desc'),
        toggleGroup('tui', [{ value: '', label: t('settings.modelDefault') }, ...TUI_MODES.map(v => ({ value: v, label: v }))], f.tui)),
      field(t('settings.autoUpdatesChannel'), t('settings.autoUpdatesChannel.desc'),
        toggleGroup('autoUpdatesChannel', [{ value: '', label: t('settings.modelDefault') }, ...AUTO_UPDATES_CHANNELS.map(c => ({ value: c, label: c }))], f.autoUpdatesChannel)),
      switchControl('s-reducedMotion', f.prefersReducedMotion, t('settings.reducedMotion'), t('settings.reducedMotion.desc')),
      switchControl('s-spinnerTips', f.spinnerTipsEnabled, t('settings.spinnerTips'), t('settings.spinnerTips.desc')),
      switchControl('s-awaySummary', f.awaySummaryEnabled, t('settings.awaySummary'), t('settings.awaySummary.desc')),
    ].join(''));

    // ---- Feature flags ----
    const flagsInner = ENV_FLAGS.map(fl =>
      switchControl('env-flag-' + fl.key, f.envFlags[fl.key] ?? false, t(fl.labelKey), fl.key)
    ).join('<div class="border-t border-current/10 my-1"></div>');
    const flagsSection = section(t('settings.section.flags'), flagsInner, t('settings.section.flags.desc'));

    // ---- Numeric limits ----
    const numbersInner = ENV_NUMBERS.map(n => field(t(n.labelKey), n.key,
      `<input type="number" data-envn="${n.key}" value="${f.envNumbers[n.key] === '' ? '' : f.envNumbers[n.key]}" min="0"
        class="w-40 bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />`
    )).join('');
    const numbersSection = section(t('settings.section.limits'), numbersInner);

    // ---- Memory / Dream ----
    const memorySection = section(t('settings.section.memory'), [
      switchControl('s-autoMemory', f.autoMemoryEnabled, t('settings.autoMemory'), t('settings.autoMemory.desc')),
      switchControl('s-autoDream', f.autoDreamEnabled, t('settings.autoDream'), t('settings.autoDream.desc')),
      field(t('settings.autoMemoryDir'), t('settings.autoMemoryDir.desc'),
        `<input type="text" id="f-autoMemoryDir" value="${escapeHtml(f.autoMemoryDirectory)}" placeholder="~/my-memory-dir"
          class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />`),
    ].join(''), t('settings.section.memory.desc'));

    // ---- Files & Git ----
    const filesSection = section(t('settings.section.filesGit'), [
      switchControl('s-respectGitignore', f.respectGitignore, t('settings.respectGitignore'), t('settings.respectGitignore.desc')),
      switchControl('s-gitInstructions', f.includeGitInstructions, t('settings.gitInstructions'), t('settings.gitInstructions.desc')),
      switchControl('s-coauthored', f.includeCoAuthoredBy, t('settings.includeCoAuthored'), t('settings.includeCoAuthored.desc')),
      switchControl('s-enableAllMcp', f.enableAllProjectMcpServers, t('settings.enableAllMcp'), t('settings.enableAllMcp.desc')),
      field(t('settings.cleanupDays'), t('settings.cleanupDays.desc'),
        `<input type="number" id="f-cleanup" value="${f.cleanupPeriodDays === '' ? '' : f.cleanupPeriodDays}" min="0"
          class="w-40 bg-transparent border border-current/20 rounded px-2 py-1 text-sm" />`),
    ].join(''));

    // ---- Plugins ----
    const pluginsSection = section(t('settings.section.plugins'),
      `<div class="space-y-1">${renderPluginList()}</div>
       <div class="text-[11px] opacity-50">${t('settings.pluginsHint')}</div>`);

    // ---- Advanced / custom env ----
    const advInner = state.showAdvancedEnv
      ? `<div class="space-y-2">${renderEnvCustom()}</div>`
      : `<button id="show-advanced" class="text-xs px-3 py-1 border border-current/20 rounded hover:bg-current/5">${t('settings.advanced.show')} (${f.envCustom.length})</button>`;
    const advancedSection = section(t('settings.section.advanced'), advInner, t('settings.advanced.desc'));

    return [permissionsSection, aiSection, flagsSection, numbersSection, displaySection, memorySection, filesSection, pluginsSection, advancedSection].join('');
  }

  function commitTag(kind: 'allow' | 'deny' | 'ask' | 'dir') {
    if (!state.form) return;
    const input = kind === 'allow' ? state.allowInput : kind === 'deny' ? state.denyInput : kind === 'ask' ? state.askInput : state.dirInput;
    const val = input.trim();
    if (!val) return;
    const list = kind === 'allow' ? state.form.permAllow : kind === 'deny' ? state.form.permDeny : kind === 'ask' ? state.form.permAsk : state.form.permAdditionalDirs;
    if (list.includes(val)) return;
    list.push(val);
    if (kind === 'allow') state.allowInput = '';
    else if (kind === 'deny') state.denyInput = '';
    else if (kind === 'ask') state.askInput = '';
    else state.dirInput = '';
    markDirty(); render();
  }

  function render() {
    if (!state.form || !state.data) {
      root.innerHTML = `<div class="p-6 text-sm opacity-70">${state.loading ? t('common.loading') : t('common.preparing')}</div>`;
      return;
    }
    root.innerHTML = `
      <div class="p-6 max-w-5xl mx-auto space-y-5">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-semibold flex items-center gap-2">⚙️ ${t('settings.title')}</h1>
          ${state.dirty ? `<span class="text-xs px-2 py-0.5 rounded border border-current/30 opacity-80">${t('settings.unsaved')}</span>` : ''}
        </div>

        ${renderLayerBadge()}

        ${renderProviderSelect()}

        <div class="rounded-md border border-current/15 bg-current/[0.03] p-3 text-xs space-y-1.5">
          <div class="flex gap-2"><span class="opacity-60 w-16 shrink-0">User</span><span class="opacity-80">${t('settings.scope.user')}</span></div>
          <div class="flex gap-2"><span class="opacity-60 w-16 shrink-0">Project</span><span class="opacity-80">${t('settings.scope.project')}</span></div>
          <div class="flex gap-2"><span class="opacity-60 w-16 shrink-0">Local</span><span class="opacity-80">${t('settings.scope.local')}</span></div>
          <div class="pt-1 opacity-55 text-[11px]">${t('settings.scope.priority')}</div>
        </div>

        <div class="space-y-5">${renderForm()}</div>

        <div class="flex gap-2 pt-3 border-t border-current/10 sticky bottom-0 bg-[var(--vscode-editor-background)] pb-2 -mx-6 px-6">
          <button id="save-btn" ${state.saving || !state.dirty ? 'disabled' : ''}
            class="px-4 py-1.5 rounded text-sm border border-current/40 bg-current/10 hover:bg-current/20 disabled:opacity-40">
            ${state.saving ? t('settings.saving') : t('settings.save')}
          </button>
          <button id="reset-btn" ${state.dirty ? '' : 'disabled'}
            class="px-4 py-1.5 rounded text-sm border border-current/20 hover:bg-current/5 disabled:opacity-40">
            ${t('settings.reset')}
          </button>
          <div class="flex-1"></div>
          <button id="json-btn" class="px-4 py-1.5 rounded text-sm opacity-70 hover:opacity-100">
            ${t('settings.editJson')}
          </button>
        </div>
      </div>
    `;
    bind();
  }

  function bind() {
    const f = state.form!;

    // toggle groups
    root.querySelectorAll<HTMLElement>('[data-toggle]').forEach(group => {
      const id = group.dataset.toggle!;
      group.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = btn.dataset.val!;
          if (id === 'permMode') f.permDefaultMode = v;
          else if (id === 'effortLevel') f.effortLevel = v;
          else if (id === 'viewMode') f.viewMode = v;
          else if (id === 'tui') f.tui = v;
          else if (id === 'autoUpdatesChannel') f.autoUpdatesChannel = v;
          markDirty(); render();
        });
      });
    });

    const sw = (id: string, cb: (c: boolean) => void) => {
      root.querySelector<HTMLInputElement>('#' + id)?.addEventListener('change', (e) => {
        cb((e.target as HTMLInputElement).checked); markDirty(); render();
      });
    };
    sw('s-alwaysThinking', c => f.alwaysThinkingEnabled = c);
    sw('s-showThinking', c => f.showThinkingSummaries = c);
    sw('s-verbose', c => f.verbose = c);
    sw('s-reducedMotion', c => f.prefersReducedMotion = c);
    sw('s-spinnerTips', c => f.spinnerTipsEnabled = c);
    sw('s-awaySummary', c => f.awaySummaryEnabled = c);
    sw('s-respectGitignore', c => f.respectGitignore = c);
    sw('s-gitInstructions', c => f.includeGitInstructions = c);
    sw('s-coauthored', c => f.includeCoAuthoredBy = c);
    sw('s-enableAllMcp', c => f.enableAllProjectMcpServers = c);
    sw('s-skipDangerous', c => f.skipDangerousModePermissionPrompt = c);
    sw('s-disableBypass', c => f.permDisableBypass = c);
    sw('s-autoMemory', c => f.autoMemoryEnabled = c);
    sw('s-autoDream', c => f.autoDreamEnabled = c);

    root.querySelector<HTMLInputElement>('#f-autoMemoryDir')?.addEventListener('input', (e) => {
      f.autoMemoryDirectory = (e.target as HTMLInputElement).value; markDirty();
    });

    for (const fl of ENV_FLAGS) sw('env-flag-' + fl.key, c => f.envFlags[fl.key] = c);

    root.querySelectorAll<HTMLInputElement>('input[data-envn]').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.envn!;
        const v = inp.value.trim();
        f.envNumbers[k] = v === '' ? '' : Number(v);
        markDirty();
      });
    });

    root.querySelector<HTMLSelectElement>('#f-model')?.addEventListener('change', (e) => { f.model = (e.target as HTMLSelectElement).value; markDirty(); render(); });
    root.querySelector<HTMLSelectElement>('#f-language')?.addEventListener('change', (e) => { f.language = (e.target as HTMLSelectElement).value; markDirty(); render(); });
    root.querySelector<HTMLInputElement>('#f-cleanup')?.addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).value.trim();
      f.cleanupPeriodDays = v === '' ? '' : Number(v);
      markDirty();
    });

    for (const kind of ['allow', 'deny', 'ask', 'dir'] as const) {
      const input = root.querySelector<HTMLInputElement>(`input[data-${kind}-input]`);
      input?.addEventListener('input', () => {
        if (kind === 'allow') state.allowInput = input.value;
        else if (kind === 'deny') state.denyInput = input.value;
        else if (kind === 'ask') state.askInput = input.value;
        else state.dirInput = input.value;
      });
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitTag(kind); }
      });
      root.querySelector<HTMLButtonElement>(`button[data-${kind}-add]`)?.addEventListener('click', () => commitTag(kind));
      root.querySelectorAll<HTMLButtonElement>(`button[data-${kind}-remove]`).forEach(btn => {
        btn.addEventListener('click', () => {
          const i = Number(btn.dataset[`${kind}Remove`]);
          const list = kind === 'allow' ? f.permAllow : kind === 'deny' ? f.permDeny : kind === 'ask' ? f.permAsk : f.permAdditionalDirs;
          list.splice(i, 1);
          markDirty(); render();
        });
      });
    }

    root.querySelectorAll<HTMLInputElement>('input[data-plugin]').forEach(cb => {
      cb.addEventListener('change', () => { f.enabledPlugins[cb.dataset.plugin!] = cb.checked; markDirty(); });
    });

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
    root.querySelector<HTMLButtonElement>('#envc-add')?.addEventListener('click', () => {
      f.envCustom.push({ key: '', value: '' }); markDirty(); render();
    });

    root.querySelector<HTMLButtonElement>('#save-btn')?.addEventListener('click', () => save());
    root.querySelector<HTMLButtonElement>('#reset-btn')?.addEventListener('click', () => reset());
    root.querySelector<HTMLButtonElement>('#json-btn')?.addEventListener('click', () => openJson());

    root.querySelector<HTMLSelectElement>('#layer-provider')?.addEventListener('change', async (e) => {
      const id = (e.target as HTMLSelectElement).value || null;
      await call('settings:setLayerProvider', { layer: state.layer, id });
      await load();
    });
  }

  window.addEventListener('message', (e) => {
    const msg = e.data as { push?: string; layer?: Layer };
    if (msg?.push === 'layer:set' && msg.layer && msg.layer !== state.layer) {
      switchLayer(msg.layer);
    }
  });

  load();
}
