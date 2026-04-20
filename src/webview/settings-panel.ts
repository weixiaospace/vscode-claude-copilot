import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  readUser, readProjectSettings, readLocalSettings,
  userSettingsPath, projectSettingsPath, localSettingsPath,
  type Settings,
} from '../core/settings';
import { listInstalledPlugins } from '../core/plugins';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { makeNonce, type RpcRequest, type RpcResponse } from './messaging';
import { t } from '../lib/l10n';

type Layer = 'user' | 'project' | 'local';

let current: vscode.WebviewPanel | null = null;

const SETTINGS_KEYS = [
  'common.loading',
  'common.preparing',
  'settings.title',
  'settings.unsaved',
  'settings.scope.user',
  'settings.scope.project',
  'settings.scope.local',
  'settings.scope.priority',
  'settings.section.memory',
  'settings.section.memory.desc',
  'settings.autoMemory',
  'settings.autoMemory.desc',
  'settings.autoDream',
  'settings.autoDream.desc',
  'settings.autoMemoryDir',
  'settings.autoMemoryDir.desc',
  'settings.section.permissions',
  'settings.section.ai',
  'settings.section.display',
  'settings.section.provider',
  'settings.section.flags',
  'settings.section.flags.desc',
  'settings.section.limits',
  'settings.section.filesGit',
  'settings.section.plugins',
  'settings.section.advanced',
  'settings.defaultModel',
  'settings.modelDefault',
  'settings.permissionMode',
  'settings.permissionMode.desc',
  'settings.permissionModeDefault',
  'settings.permissions.allow',
  'settings.permissions.allow.desc',
  'settings.permissions.ask',
  'settings.permissions.ask.desc',
  'settings.permissions.deny',
  'settings.permissions.deny.desc',
  'settings.permissions.additionalDirs',
  'settings.permissions.additionalDirs.desc',
  'settings.permissions.empty',
  'settings.permissions.add',
  'settings.skipDangerous',
  'settings.skipDangerous.desc',
  'settings.disableBypass',
  'settings.disableBypass.desc',
  'settings.effort',
  'settings.effort.desc',
  'settings.alwaysThinking',
  'settings.alwaysThinking.desc',
  'settings.showThinking',
  'settings.showThinking.desc',
  'settings.verbose',
  'settings.verbose.desc',
  'settings.language',
  'settings.language.desc',
  'settings.lang.default',
  'settings.lang.en',
  'settings.lang.zh',
  'settings.lang.ja',
  'settings.lang.es',
  'settings.lang.fr',
  'settings.lang.de',
  'settings.viewMode',
  'settings.viewMode.desc',
  'settings.tui',
  'settings.tui.desc',
  'settings.autoUpdatesChannel',
  'settings.autoUpdatesChannel.desc',
  'settings.reducedMotion',
  'settings.reducedMotion.desc',
  'settings.spinnerTips',
  'settings.spinnerTips.desc',
  'settings.awaySummary',
  'settings.awaySummary.desc',
  'settings.provider',
  'settings.provider.desc',
  'settings.provider.anthropic',
  'settings.provider.bedrock',
  'settings.provider.vertex',
  'settings.provider.foundry',
  'settings.authMode',
  'settings.authMode.desc',
  'settings.authMode.subscription',
  'settings.authMode.apiKey',
  'settings.authMode.authToken',
  'settings.authMode.helper',
  'settings.authMode.subscription.hint',
  'settings.provider.bedrock.hint',
  'settings.provider.vertex.hint',
  'settings.provider.foundry.hint',
  'settings.env.bedrockToken',
  'settings.env.bedrockToken.desc',
  'settings.env.bedrockBaseUrl',
  'settings.env.bedrockBaseUrl.desc',
  'settings.env.vertexProjectId',
  'settings.env.vertexProjectId.desc',
  'settings.env.vertexBaseUrl',
  'settings.env.vertexBaseUrl.desc',
  'settings.env.foundryApiKey',
  'settings.env.foundryApiKey.desc',
  'settings.env.foundryResource',
  'settings.env.foundryResource.desc',
  'settings.env.foundryBaseUrl',
  'settings.env.foundryBaseUrl.desc',
  'settings.env.skipAuth',
  'settings.env.skipAuth.bedrock.desc',
  'settings.env.skipAuth.vertex.desc',
  'settings.env.skipAuth.foundry.desc',
  'settings.env.agentTeams',
  'settings.env.disableTelemetry',
  'settings.env.disableErrorReporting',
  'settings.env.disableAutoUpdater',
  'settings.env.disableFeedback',
  'settings.env.disableBugCommand',
  'settings.env.disableNonEssentialTraffic',
  'settings.env.disableAutoMemory',
  'settings.env.disableGitInstructions',
  'settings.env.disableThinking',
  'settings.env.disable1mContext',
  'settings.env.disableFastMode',
  'settings.env.disableBgTasks',
  'settings.env.disableTerminalTitle',
  'settings.env.skipBashEnv',
  'settings.env.maxOutputTokens',
  'settings.env.maxThinkingTokens',
  'settings.env.maxRetries',
  'settings.env.apiTimeoutMs',
  'settings.env.bashDefaultTimeoutMs',
  'settings.env.bashMaxOutputLength',
  'settings.env.apiKey',
  'settings.env.apiKey.desc',
  'settings.env.apiKey.show',
  'settings.env.apiKey.hide',
  'settings.env.authToken',
  'settings.env.authToken.desc',
  'settings.env.apiKeyHelper',
  'settings.env.apiKeyHelper.desc',
  'settings.env.baseUrl',
  'settings.env.baseUrl.desc',
  'settings.env.subagentModel',
  'settings.respectGitignore',
  'settings.respectGitignore.desc',
  'settings.gitInstructions',
  'settings.gitInstructions.desc',
  'settings.enableAllMcp',
  'settings.enableAllMcp.desc',
  'settings.enabledPlugins',
  'settings.pluginsHint',
  'settings.noPlugins',
  'settings.envVars',
  'settings.envAdd',
  'settings.advanced.show',
  'settings.advanced.desc',
  'settings.includeCoAuthored',
  'settings.includeCoAuthored.desc',
  'settings.cleanupDays',
  'settings.cleanupDays.desc',
  'settings.save',
  'settings.saving',
  'settings.reset',
  'settings.editJson',
  'settings.saveFailed',
  'settings.unsavedChanges',
  'tree.group.user',
  'tree.group.project',
  'tree.layer.local',
  'tree.group.noWorkspace',
];

async function readLayer(layer: Layer): Promise<{ settings: Settings; filePath: string } | null> {
  if (layer === 'user') {
    return { settings: await readUser(CLAUDE_HOME), filePath: userSettingsPath(CLAUDE_HOME) };
  }
  const ws = currentWorkspace();
  if (!ws) return null;
  if (layer === 'project') {
    return { settings: await readProjectSettings(ws.fsPath), filePath: projectSettingsPath(ws.fsPath) };
  }
  return { settings: await readLocalSettings(ws.fsPath), filePath: localSettingsPath(ws.fsPath) };
}

function availability() {
  const ws = currentWorkspace();
  return { user: true, project: !!ws, local: !!ws };
}

async function writeLayer(layer: Layer, partial: Record<string, unknown>, knownKeys: string[]): Promise<void> {
  const existing = await readLayer(layer);
  if (!existing) throw new Error('Layer not available');
  const next: Settings = { ...existing.settings };
  for (const k of knownKeys) delete next[k];
  Object.assign(next, partial);
  await fs.mkdir(path.dirname(existing.filePath), { recursive: true });
  await fs.writeFile(existing.filePath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
}

export function openSettingsPanel(context: vscode.ExtensionContext): void {
  if (current) { current.reveal(); return; }
  const panel = vscode.window.createWebviewPanel(
    'claudeCopilot.settings', t('settings.title'), vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'))],
    },
  );
  current = panel;

  const distRoot = vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'));
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'settings.js'));
  const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'src.css'));
  const nonce = makeNonce();
  const csp = `default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource} 'nonce-${nonce}';`;

  const strings: Record<string, string> = {};
  for (const key of SETTINGS_KEYS) {
    strings[key] = t(key);
  }

  panel.webview.html = /* html */`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <link rel="stylesheet" href="${cssUri}" />
        <title>${t('settings.title')}</title>
      </head>
      <body>
        <script nonce="${nonce}">window.__l10n = ${JSON.stringify(strings)};</script>
        <div id="root"></div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
    </html>`;

  let disposed = false;
  panel.onDidDispose(() => { disposed = true; current = null; });

  panel.webview.onDidReceiveMessage(async (req: RpcRequest) => {
    let res: RpcResponse;
    try {
      if (req.method === 'settings:read') {
        const layer = req.params?.layer as Layer;
        const existing = await readLayer(layer);
        const installed = await listInstalledPlugins(CLAUDE_HOME);
        res = {
          id: req.id,
          result: {
            layer,
            settings: existing?.settings ?? {},
            availableLayers: availability(),
            installedPlugins: installed.map(p => ({ key: `${p.name}@${p.marketplace}`, name: p.name, marketplace: p.marketplace })),
          },
        };
      } else if (req.method === 'settings:write') {
        const { layer, partial, knownKeys } = req.params;
        await writeLayer(layer, partial, knownKeys);
        res = { id: req.id, result: 'ok' };
      } else if (req.method === 'settings:openJson') {
        const layer = req.params?.layer as Layer;
        const existing = await readLayer(layer);
        if (existing) {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(existing.filePath));
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
        res = { id: req.id, result: 'ok' };
      } else {
        res = { id: req.id, error: `unknown method ${req.method}` };
      }
    } catch (e: any) {
      res = { id: req.id, error: e?.message || String(e) };
    }
    if (!disposed) panel.webview.postMessage(res);
  });
}
