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
import type { RpcRequest, RpcResponse } from './messaging';
import { t } from '../lib/l10n';

type Layer = 'user' | 'project' | 'local';

let current: vscode.WebviewPanel | null = null;

const SETTINGS_KEYS = [
  'common.loading',
  'common.preparing',
  'settings.title',
  'settings.unsaved',
  'settings.defaultModel',
  'settings.modelDefault',
  'settings.permissionMode',
  'settings.permissionModeDefault',
  'settings.enabledPlugins',
  'settings.pluginsHint',
  'settings.noPlugins',
  'settings.envVars',
  'settings.envAdd',
  'settings.other',
  'settings.includeCoAuthored',
  'settings.cleanupDays',
  'settings.save',
  'settings.saving',
  'settings.reset',
  'settings.editJson',
  'settings.saveFailed',
  'settings.unsavedChanges',
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
  const csp = `default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource};`;

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
        <script>window.__l10n = ${JSON.stringify(strings)};</script>
        <div id="root"></div>
        <script type="module" src="${scriptUri}"></script>
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
