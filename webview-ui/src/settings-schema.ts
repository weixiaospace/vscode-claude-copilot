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

export interface SettingsSection { id: string; labelKey: string; descKey?: string; icon: string; fields: Field[] }

// helper to build {value,label} option lists with a leading default option
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
  { id: 'flags', labelKey: 'settings.section.flags', descKey: 'settings.section.flags.desc', icon: 'settings-gear', fields: flagFields },
  { id: 'limits', labelKey: 'settings.section.limits', icon: 'symbol-number', fields: numberFields },
  {
    id: 'memory', labelKey: 'settings.section.memory', descKey: 'settings.section.memory.desc', icon: 'database',
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
  { id: 'advanced', labelKey: 'settings.section.advanced', descKey: 'settings.advanced.desc', icon: 'tools', fields: [{ kind: 'custom', id: 'advanced' }] },
];
