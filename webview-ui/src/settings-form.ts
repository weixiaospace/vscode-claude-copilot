import { call } from './rpc';
import { t } from './l10n';

type Layer = 'user' | 'project' | 'local';

interface LayerAvailability { user: boolean; project: boolean; local: boolean }
interface InstalledPluginSummary { key: string; name: string; marketplace: string }

interface SettingsData {
  layer: Layer;
  settings: Record<string, unknown>;
  availableLayers: LayerAvailability;
  installedPlugins: InstalledPluginSummary[];
}

// ==================== Constants (from docs.claude.com/en/docs/claude-code/settings) ====================

const MODELS = ['', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
const PERMISSION_MODES = ['default', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions'];
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const AUTO_UPDATES_CHANNELS = ['latest', 'stable'];
const VIEW_MODES = ['default', 'verbose', 'focus'];
const TUI_MODES = ['default', 'fullscreen'];
const PROVIDERS = ['anthropic', 'bedrock', 'vertex', 'foundry'] as const;
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
  // Provider / connection
  provider: typeof PROVIDERS[number];
  authMode: 'subscription' | 'apiKey' | 'authToken' | 'helper';
  envApiKey: string;
  envAuthToken: string;
  envBaseUrl: string;
  envSubagentModel: string;
  // Cloud provider credentials
  bedrockToken: string;
  bedrockBaseUrl: string;
  bedrockSkipAuth: boolean;
  vertexProjectId: string;
  vertexBaseUrl: string;
  vertexSkipAuth: boolean;
  foundryApiKey: string;
  foundryBaseUrl: string;
  foundryResource: string;
  foundrySkipAuth: boolean;
  // Env flags & numbers
  envFlags: Record<string, boolean>;
  envNumbers: Record<string, number | ''>;
  envCustom: Array<{ key: string; value: string }>;
  // Plugins
  enabledPlugins: Record<string, boolean>;
  _rawEnabledPlugins: Record<string, boolean>;
}

interface ProvidersData { active: string | null; profiles: Array<{ id: string; name: string; kind: string }> }

interface State {
  layer: Layer;
  data: SettingsData | null;
  form: FormState | null;
  providers: ProvidersData | null;
  providersExpanded: boolean;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  allowInput: string;
  denyInput: string;
  askInput: string;
  dirInput: string;
  showApiKey: boolean;
  showAuthToken: boolean;
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

  let provider: typeof PROVIDERS[number] = 'anthropic';
  if (envObj[PROVIDER_ENV.bedrock] === '1') provider = 'bedrock';
  else if (envObj[PROVIDER_ENV.vertex] === '1') provider = 'vertex';
  else if (envObj[PROVIDER_ENV.foundry] === '1') provider = 'foundry';

  const apiKeyHelperVal = typeof settings.apiKeyHelper === 'string' ? settings.apiKeyHelper : '';
  const authMode: FormState['authMode'] = apiKeyHelperVal
    ? 'helper'
    : envObj['ANTHROPIC_API_KEY']
      ? 'apiKey'
      : envObj['ANTHROPIC_AUTH_TOKEN']
        ? 'authToken'
        : 'subscription';

  const envCustom = Object.entries(envObj)
    .filter(([k]) => !KNOWN_ENV_KEYS.has(k))
    .map(([key, value]) => ({ key, value: String(value) }));

  const permObj = (settings.permissions ?? {}) as Record<string, unknown>;
  const { defaultMode, allow, deny, ask, additionalDirectories, disableBypassPermissionsMode, ...restPerm } = permObj;

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
    provider,
    authMode,
    envApiKey: envObj['ANTHROPIC_API_KEY'] ?? '',
    envAuthToken: envObj['ANTHROPIC_AUTH_TOKEN'] ?? '',
    envBaseUrl: envObj['ANTHROPIC_BASE_URL'] ?? '',
    envSubagentModel: envObj['CLAUDE_CODE_SUBAGENT_MODEL'] ?? '',
    bedrockToken: envObj['AWS_BEARER_TOKEN_BEDROCK'] ?? '',
    bedrockBaseUrl: envObj['ANTHROPIC_BEDROCK_BASE_URL'] ?? '',
    bedrockSkipAuth: envObj['CLAUDE_CODE_SKIP_BEDROCK_AUTH'] === '1',
    vertexProjectId: envObj['ANTHROPIC_VERTEX_PROJECT_ID'] ?? '',
    vertexBaseUrl: envObj['ANTHROPIC_VERTEX_BASE_URL'] ?? '',
    vertexSkipAuth: envObj['CLAUDE_CODE_SKIP_VERTEX_AUTH'] === '1',
    foundryApiKey: envObj['ANTHROPIC_FOUNDRY_API_KEY'] ?? '',
    foundryBaseUrl: envObj['ANTHROPIC_FOUNDRY_BASE_URL'] ?? '',
    foundryResource: envObj['ANTHROPIC_FOUNDRY_RESOURCE'] ?? '',
    foundrySkipAuth: envObj['CLAUDE_CODE_SKIP_FOUNDRY_AUTH'] === '1',
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
  if (form.authMode === 'helper' && form.apiKeyHelper) p.apiKeyHelper = form.apiKeyHelper;
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
  if (form.envSubagentModel) envOut['CLAUDE_CODE_SUBAGENT_MODEL'] = form.envSubagentModel;

  if (form.provider === 'anthropic') {
    if (form.authMode === 'apiKey' && form.envApiKey) envOut['ANTHROPIC_API_KEY'] = form.envApiKey;
    if (form.authMode === 'authToken' && form.envAuthToken) envOut['ANTHROPIC_AUTH_TOKEN'] = form.envAuthToken;
    if (form.envBaseUrl) envOut['ANTHROPIC_BASE_URL'] = form.envBaseUrl;
  } else if (form.provider === 'bedrock') {
    envOut[PROVIDER_ENV.bedrock] = '1';
    if (form.bedrockToken) envOut['AWS_BEARER_TOKEN_BEDROCK'] = form.bedrockToken;
    if (form.bedrockBaseUrl) envOut['ANTHROPIC_BEDROCK_BASE_URL'] = form.bedrockBaseUrl;
    if (form.bedrockSkipAuth) envOut['CLAUDE_CODE_SKIP_BEDROCK_AUTH'] = '1';
  } else if (form.provider === 'vertex') {
    envOut[PROVIDER_ENV.vertex] = '1';
    if (form.vertexProjectId) envOut['ANTHROPIC_VERTEX_PROJECT_ID'] = form.vertexProjectId;
    if (form.vertexBaseUrl) envOut['ANTHROPIC_VERTEX_BASE_URL'] = form.vertexBaseUrl;
    if (form.vertexSkipAuth) envOut['CLAUDE_CODE_SKIP_VERTEX_AUTH'] = '1';
  } else if (form.provider === 'foundry') {
    envOut[PROVIDER_ENV.foundry] = '1';
    if (form.foundryApiKey) envOut['ANTHROPIC_FOUNDRY_API_KEY'] = form.foundryApiKey;
    if (form.foundryBaseUrl) envOut['ANTHROPIC_FOUNDRY_BASE_URL'] = form.foundryBaseUrl;
    if (form.foundryResource) envOut['ANTHROPIC_FOUNDRY_RESOURCE'] = form.foundryResource;
    if (form.foundrySkipAuth) envOut['CLAUDE_CODE_SKIP_FOUNDRY_AUTH'] = '1';
  }

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
  const state: State = {
    layer: 'user', data: null, form: null, providers: null, providersExpanded: false, dirty: false, loading: false, saving: false,
    allowInput: '', denyInput: '', askInput: '', dirInput: '',
    showApiKey: false, showAuthToken: false, showAdvancedEnv: false,
  };

  async function load() {
    state.loading = true; render();
    try {
      state.data = await call<SettingsData>('settings:read', { layer: state.layer });
      state.form = settingsToForm(state.data.settings, state.data.installedPlugins);
      state.providers = await call<ProvidersData>('providers:list').catch(() => null);
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

  function renderTabs(): string {
    const layers: Array<{ key: Layer; label: string }> = [
      { key: 'user', label: t('tree.group.user') },
      { key: 'project', label: t('tree.group.project') },
      { key: 'local', label: t('tree.layer.local') },
    ];
    return layers.map(l => {
      const active = state.layer === l.key;
      const avail = state.data?.availableLayers[l.key] ?? true;
      const cls = active
        ? 'border-b-2 border-current px-4 py-2 text-sm font-medium'
        : `px-4 py-2 text-sm ${avail ? 'opacity-60 hover:opacity-100' : 'opacity-30 cursor-not-allowed'}`;
      return `<button data-layer="${l.key}" class="${cls}" ${avail ? '' : 'disabled'}>${l.label}${!avail ? ' ' + t('tree.group.noWorkspace') : ''}</button>`;
    }).join('');
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

  function providerStrip(p: ProvidersData): string {
    const active = p.profiles.find(x => x.id === p.active);
    const activeName = active ? active.name : t('providers.webview.none');
    const expanded = state.providersExpanded;
    const chevron = expanded ? '▼' : '▶';

    const profileRows = p.profiles.map(x => {
      const isActive = x.id === p.active;
      return `
        <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-current/5" data-profile-id="${escapeHtml(x.id)}">
          <span class="w-4 text-center text-sm ${isActive ? 'text-[var(--vscode-textLink-foreground)]' : 'opacity-40'}">${isActive ? '●' : '○'}</span>
          <span class="text-sm flex-1">${escapeHtml(x.name)}</span>
          <span class="text-xs opacity-50">${escapeHtml(x.kind)}</span>
          ${isActive ? '' : `<button class="provider-switch-btn text-[11px] px-1.5 py-0.5 border border-current/20 rounded opacity-70 hover:opacity-100 hover:bg-current/5" data-profile-id="${escapeHtml(x.id)}">${escapeHtml(t('providers.webview.switch'))}</button>`}
          <button class="provider-edit-btn text-[11px] px-1.5 py-0.5 border border-current/20 rounded opacity-70 hover:opacity-100 hover:bg-current/5" data-profile-id="${escapeHtml(x.id)}">Edit</button>
          <button class="provider-delete-btn text-[11px] px-1.5 py-0.5 border border-current/20 rounded opacity-70 hover:opacity-100 hover:bg-current/5" data-profile-id="${escapeHtml(x.id)}">Delete</button>
        </div>
      `;
    }).join('');

    const subscriptionRow = `
      <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-current/5 cursor-pointer" data-profile-id="">
        <span class="w-4 text-center text-sm ${p.active === null ? 'text-[var(--vscode-textLink-foreground)]' : 'opacity-40'}">${p.active === null ? '●' : '○'}</span>
        <span class="text-sm flex-1">${escapeHtml(t('providers.statusBar.subscription'))}</span>
        <span class="text-xs opacity-50">subscription</span>
      </div>
    `;

    return `
      <section class="rounded-lg border border-current/15 p-4 bg-current/[0.04]">
        <div id="providers-toggle" class="flex items-center justify-between cursor-pointer select-none">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold opacity-80">🚀 ${escapeHtml(t('providers.webview.header'))}</span>
            <span class="text-xs opacity-60">${escapeHtml(t('providers.webview.active'))}: ${escapeHtml(activeName)}</span>
          </div>
          <span class="text-xs opacity-60">${chevron}</span>
        </div>
        ${expanded ? `
        <div id="providers-list" class="mt-3 space-y-0.5">
          ${subscriptionRow}
          ${profileRows}
        </div>
        <div class="mt-3 pt-2 border-t border-current/10 flex gap-2">
          <button id="providers-new" class="text-xs px-2 py-1 border border-current/20 rounded hover:bg-current/5">${escapeHtml(t('providers.webview.create'))}</button>
          <button id="providers-manage" class="text-xs px-2 py-1 opacity-70 hover:opacity-100">${escapeHtml(t('providers.webview.manage'))}</button>
        </div>
        ` : ''}
      </section>
    `;
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

  function secretInput(id: string, value: string, placeholder: string, shown: boolean, toggleId: string): string {
    return `
      <div class="flex gap-2">
        <input type="${shown ? 'text' : 'password'}" id="${id}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"
          class="flex-1 bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />
        <button id="${toggleId}" class="text-xs px-2 py-1 border border-current/20 rounded hover:bg-current/5">${shown ? t('settings.env.apiKey.hide') : t('settings.env.apiKey.show')}</button>
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

    // ---- Provider + auth ----
    let providerBody = field(t('settings.provider'), t('settings.provider.desc'),
      toggleGroup('provider', PROVIDERS.map(p => ({ value: p, label: t('settings.provider.' + p) })), f.provider));

    if (f.provider === 'anthropic') {
      const authModeOptions = [
        { value: 'subscription', label: t('settings.authMode.subscription') },
        { value: 'apiKey', label: t('settings.authMode.apiKey') },
        { value: 'authToken', label: t('settings.authMode.authToken') },
        { value: 'helper', label: t('settings.authMode.helper') },
      ];
      let credentialField = '';
      if (f.authMode === 'subscription') {
        credentialField = `<div class="rounded-md border border-current/15 bg-current/[0.03] p-3 text-xs opacity-80">${t('settings.authMode.subscription.hint')}</div>`;
      } else if (f.authMode === 'apiKey') {
        credentialField = field(t('settings.env.apiKey'), t('settings.env.apiKey.desc'),
          secretInput('env-apiKey', f.envApiKey, 'sk-ant-...', state.showApiKey, 'toggle-apikey'));
      } else if (f.authMode === 'authToken') {
        credentialField = field(t('settings.env.authToken'), t('settings.env.authToken.desc'),
          secretInput('env-authToken', f.envAuthToken, 'Bearer ...', state.showAuthToken, 'toggle-authtoken'));
      } else {
        credentialField = field(t('settings.env.apiKeyHelper'), t('settings.env.apiKeyHelper.desc'),
          `<input type="text" id="f-apiKeyHelper" value="${escapeHtml(f.apiKeyHelper)}" placeholder="/path/to/helper.sh"
            class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />`);
      }
      providerBody += field(t('settings.authMode'), t('settings.authMode.desc'),
        toggleGroup('authMode', authModeOptions, f.authMode))
        + credentialField
        + field(t('settings.env.baseUrl'), t('settings.env.baseUrl.desc'),
          `<input type="url" id="env-baseUrl" value="${escapeHtml(f.envBaseUrl)}" placeholder="https://api.anthropic.com"
            class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />`);
    } else if (f.provider === 'bedrock') {
      providerBody += `<div class="rounded-md border border-current/15 bg-current/[0.03] p-3 text-xs opacity-80">${t('settings.provider.bedrock.hint')}</div>`
        + field(t('settings.env.bedrockToken'), t('settings.env.bedrockToken.desc'),
          secretInput('env-bedrockToken', f.bedrockToken, 'bedrock token...', state.showApiKey, 'toggle-apikey'))
        + field(t('settings.env.bedrockBaseUrl'), t('settings.env.bedrockBaseUrl.desc'),
          `<input type="url" id="env-bedrockBaseUrl" value="${escapeHtml(f.bedrockBaseUrl)}" placeholder="https://bedrock-runtime..."
            class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />`)
        + switchControl('s-bedrockSkipAuth', f.bedrockSkipAuth, t('settings.env.skipAuth'), t('settings.env.skipAuth.bedrock.desc'));
    } else if (f.provider === 'vertex') {
      providerBody += `<div class="rounded-md border border-current/15 bg-current/[0.03] p-3 text-xs opacity-80">${t('settings.provider.vertex.hint')}</div>`
        + field(t('settings.env.vertexProjectId'), t('settings.env.vertexProjectId.desc'),
          `<input type="text" id="env-vertexProjectId" value="${escapeHtml(f.vertexProjectId)}" placeholder="my-gcp-project"
            class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />`)
        + field(t('settings.env.vertexBaseUrl'), t('settings.env.vertexBaseUrl.desc'),
          `<input type="url" id="env-vertexBaseUrl" value="${escapeHtml(f.vertexBaseUrl)}" placeholder="https://<region>-aiplatform.googleapis.com"
            class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />`)
        + switchControl('s-vertexSkipAuth', f.vertexSkipAuth, t('settings.env.skipAuth'), t('settings.env.skipAuth.vertex.desc'));
    } else if (f.provider === 'foundry') {
      providerBody += `<div class="rounded-md border border-current/15 bg-current/[0.03] p-3 text-xs opacity-80">${t('settings.provider.foundry.hint')}</div>`
        + field(t('settings.env.foundryApiKey'), t('settings.env.foundryApiKey.desc'),
          secretInput('env-foundryApiKey', f.foundryApiKey, 'foundry api key...', state.showApiKey, 'toggle-apikey'))
        + field(t('settings.env.foundryResource'), t('settings.env.foundryResource.desc'),
          `<input type="text" id="env-foundryResource" value="${escapeHtml(f.foundryResource)}" placeholder="my-resource"
            class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />`)
        + field(t('settings.env.foundryBaseUrl'), t('settings.env.foundryBaseUrl.desc'),
          `<input type="url" id="env-foundryBaseUrl" value="${escapeHtml(f.foundryBaseUrl)}" placeholder="https://<resource>.inference.ml.azure.com"
            class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />`)
        + switchControl('s-foundrySkipAuth', f.foundrySkipAuth, t('settings.env.skipAuth'), t('settings.env.skipAuth.foundry.desc'));
    }

    providerBody += field(t('settings.env.subagentModel'), 'CLAUDE_CODE_SUBAGENT_MODEL',
      `<select id="env-subagentModel" class="w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm">
        ${MODELS.map(m => `<option value="${m}" ${f.envSubagentModel === m ? 'selected' : ''}>${m || t('settings.modelDefault')}</option>`).join('')}
      </select>`);

    const providerSection = section(t('settings.section.provider'), providerBody);

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

    return [permissionsSection, aiSection, providerSection, flagsSection, numbersSection, displaySection, memorySection, filesSection, pluginsSection, advancedSection].join('');
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

        ${state.providers ? providerStrip(state.providers) : ''}

        <div class="flex border-b border-current/15">${renderTabs()}</div>

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

    root.querySelectorAll<HTMLButtonElement>('button[data-layer]').forEach(b =>
      b.addEventListener('click', () => switchLayer(b.dataset.layer as Layer)));

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
          else if (id === 'provider') f.provider = v as any;
          else if (id === 'authMode') f.authMode = v as any;
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

    root.querySelector<HTMLInputElement>('#env-apiKey')?.addEventListener('input', (e) => { f.envApiKey = (e.target as HTMLInputElement).value; markDirty(); });
    root.querySelector<HTMLInputElement>('#env-authToken')?.addEventListener('input', (e) => { f.envAuthToken = (e.target as HTMLInputElement).value; markDirty(); });
    root.querySelector<HTMLInputElement>('#env-baseUrl')?.addEventListener('input', (e) => { f.envBaseUrl = (e.target as HTMLInputElement).value; markDirty(); });
    root.querySelector<HTMLSelectElement>('#env-subagentModel')?.addEventListener('change', (e) => { f.envSubagentModel = (e.target as HTMLSelectElement).value; markDirty(); render(); });
    root.querySelector<HTMLButtonElement>('#toggle-apikey')?.addEventListener('click', () => { state.showApiKey = !state.showApiKey; render(); });
    root.querySelector<HTMLButtonElement>('#toggle-authtoken')?.addEventListener('click', () => { state.showAuthToken = !state.showAuthToken; render(); });

    // Bedrock/Vertex/Foundry fields
    const input = (id: string, cb: (v: string) => void) => {
      root.querySelector<HTMLInputElement>('#' + id)?.addEventListener('input', (e) => { cb((e.target as HTMLInputElement).value); markDirty(); });
    };
    input('env-bedrockToken', v => f.bedrockToken = v);
    input('env-bedrockBaseUrl', v => f.bedrockBaseUrl = v);
    input('env-vertexProjectId', v => f.vertexProjectId = v);
    input('env-vertexBaseUrl', v => f.vertexBaseUrl = v);
    input('env-foundryApiKey', v => f.foundryApiKey = v);
    input('env-foundryBaseUrl', v => f.foundryBaseUrl = v);
    input('env-foundryResource', v => f.foundryResource = v);
    sw('s-bedrockSkipAuth', c => f.bedrockSkipAuth = c);
    sw('s-vertexSkipAuth', c => f.vertexSkipAuth = c);
    sw('s-foundrySkipAuth', c => f.foundrySkipAuth = c);

    root.querySelector<HTMLSelectElement>('#f-model')?.addEventListener('change', (e) => { f.model = (e.target as HTMLSelectElement).value; markDirty(); render(); });
    root.querySelector<HTMLSelectElement>('#f-language')?.addEventListener('change', (e) => { f.language = (e.target as HTMLSelectElement).value; markDirty(); render(); });
    root.querySelector<HTMLInputElement>('#f-apiKeyHelper')?.addEventListener('input', (e) => { f.apiKeyHelper = (e.target as HTMLInputElement).value; markDirty(); });
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

    // provider strip: expand/collapse
    root.querySelector<HTMLElement>('#providers-toggle')?.addEventListener('click', () => {
      state.providersExpanded = !state.providersExpanded;
      render();
    });

    // provider list: click row to switch
    root.querySelectorAll<HTMLElement>('#providers-list > div[data-profile-id]').forEach(row => {
      row.addEventListener('click', async (e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;
        const id = row.dataset.profileId || null;
        if (id === (state.providers?.active ?? null)) return;
        try {
          await call('providers:activate', { id });
          state.providers = await call('providers:list');
          load();
        } catch (err: any) {
          alert('Switch failed: ' + (err?.message ?? err));
        }
      });
    });

    // provider switch button (for inactive profiles)
    root.querySelectorAll<HTMLButtonElement>('.provider-switch-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.profileId || null;
        try {
          await call('providers:activate', { id });
          state.providers = await call('providers:list');
          load();
        } catch (err: any) {
          alert('Switch failed: ' + (err?.message ?? err));
        }
      });
    });

    // provider edit button
    root.querySelectorAll<HTMLButtonElement>('.provider-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        call('commands:execute', { command: 'claudeCopilot.providers.edit' }).catch(() => {});
      });
    });

    // provider delete button
    root.querySelectorAll<HTMLButtonElement>('.provider-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.profileId;
        if (!id) return;
        const profile = state.providers?.profiles.find(p => p.id === id);
        if (!profile) return;
        if (!confirm(t('providers.delete.confirm', profile.name))) return;
        try {
          await call('providers:delete', { id });
          state.providers = await call('providers:list');
          load();
        } catch (err: any) {
          alert('Delete failed: ' + (err?.message ?? err));
        }
      });
    });

    root.querySelector<HTMLButtonElement>('#providers-new')?.addEventListener('click', () => {
      call('commands:execute', { command: 'claudeCopilot.providers.create' }).catch(() => {});
    });
    root.querySelector<HTMLButtonElement>('#providers-manage')?.addEventListener('click', () => {
      call('commands:execute', { command: 'claudeCopilot.providers.edit' }).catch(() => {});
    });
  }

  load();
}
