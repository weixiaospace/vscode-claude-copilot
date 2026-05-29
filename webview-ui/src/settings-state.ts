export type Layer = 'user' | 'project' | 'local';

export interface LayerAvailability { user: boolean; project: boolean; local: boolean }
export interface InstalledPluginSummary { key: string; name: string; marketplace: string }

export interface ProfileSummary { id: string; name: string; kind: string; baseUrl: string }

export interface SettingsData {
  layer: Layer;
  settings: Record<string, unknown>;
  availableLayers: LayerAvailability;
  installedPlugins: InstalledPluginSummary[];
  profiles: ProfileSummary[];
  activeProfileId: string | null;
}

// ==================== Constants (from docs.claude.com/en/docs/claude-code/settings) ====================

export const MODELS = ['', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
export const PERMISSION_MODES = ['default', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions'];
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const AUTO_UPDATES_CHANNELS = ['latest', 'stable'];
export const VIEW_MODES = ['default', 'verbose', 'focus'];
export const TUI_MODES = ['default', 'fullscreen'];
export const LANGUAGES = [
  { value: '', labelKey: 'settings.lang.default' },
  { value: 'english', labelKey: 'settings.lang.en' },
  { value: 'chinese', labelKey: 'settings.lang.zh' },
  { value: 'japanese', labelKey: 'settings.lang.ja' },
  { value: 'spanish', labelKey: 'settings.lang.es' },
  { value: 'french', labelKey: 'settings.lang.fr' },
  { value: 'german', labelKey: 'settings.lang.de' },
];

export interface EnvDef { key: string; labelKey: string }
export const ENV_FLAGS: EnvDef[] = [
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

export const ENV_NUMBERS: EnvDef[] = [
  { key: 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', labelKey: 'settings.env.maxOutputTokens' },
  { key: 'MAX_THINKING_TOKENS', labelKey: 'settings.env.maxThinkingTokens' },
  { key: 'CLAUDE_CODE_MAX_RETRIES', labelKey: 'settings.env.maxRetries' },
  { key: 'API_TIMEOUT_MS', labelKey: 'settings.env.apiTimeoutMs' },
  { key: 'BASH_DEFAULT_TIMEOUT_MS', labelKey: 'settings.env.bashDefaultTimeoutMs' },
  { key: 'BASH_MAX_OUTPUT_LENGTH', labelKey: 'settings.env.bashMaxOutputLength' },
];

export const PROVIDER_ENV = {
  bedrock: 'CLAUDE_CODE_USE_BEDROCK',
  vertex: 'CLAUDE_CODE_USE_VERTEX',
  foundry: 'CLAUDE_CODE_USE_FOUNDRY',
};

export const KNOWN_ENV_KEYS = new Set<string>([
  ...ENV_FLAGS.map(f => f.key),
  ...ENV_NUMBERS.map(n => n.key),
  'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_SUBAGENT_MODEL',
  PROVIDER_ENV.bedrock, PROVIDER_ENV.vertex, PROVIDER_ENV.foundry,
  'AWS_BEARER_TOKEN_BEDROCK', 'ANTHROPIC_BEDROCK_BASE_URL', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
  'ANTHROPIC_VERTEX_PROJECT_ID', 'ANTHROPIC_VERTEX_BASE_URL', 'CLAUDE_CODE_SKIP_VERTEX_AUTH',
  'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_FOUNDRY_BASE_URL', 'ANTHROPIC_FOUNDRY_RESOURCE', 'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
]);

export const FLAG_KEYS = new Set(ENV_FLAGS.map(f => f.key));
export const NUMBER_KEYS = new Set(ENV_NUMBERS.map(n => n.key));

// ==================== Form state ====================

export interface FormState {
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

export const KNOWN_KEYS: string[] = [
  'model', 'effortLevel', 'language', 'autoUpdatesChannel',
  'alwaysThinkingEnabled', 'showThinkingSummaries', 'verbose',
  'viewMode', 'tui', 'prefersReducedMotion', 'spinnerTipsEnabled', 'awaySummaryEnabled',
  'respectGitignore', 'includeGitInstructions', 'enableAllProjectMcpServers', 'includeCoAuthoredBy',
  'autoMemoryEnabled', 'autoDreamEnabled', 'autoMemoryDirectory',
  'cleanupPeriodDays', 'apiKeyHelper', 'skipDangerousModePermissionPrompt',
  'permissions', 'permissionMode', 'env', 'enabledPlugins',
];

export function toStringArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map(String) : [];
}

export function settingsToForm(settings: Record<string, unknown>, installedPlugins: InstalledPluginSummary[]): FormState {
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

export function formToPartial(form: FormState): Record<string, unknown> {
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
