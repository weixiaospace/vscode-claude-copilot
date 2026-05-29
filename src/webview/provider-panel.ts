import * as vscode from 'vscode';
import * as path from 'path';
import {
  readProviders, writeProviders, newId, secretKey, providersFilePath,
  PROVIDER_PRESETS,
  type Profile, type SecretsGateway,
} from '../core/providers';
import { activateProfile, deleteProfile, effectiveProfileId } from '../lib/provider-apply';
import { makeSecretsGateway } from '../lib/secrets';
import { CLAUDE_HOME } from '../lib/paths';
import { makeNonce, type RpcRequest, type RpcResponse } from './messaging';
import { t } from '../lib/l10n';

let current: vscode.WebviewPanel | null = null;
const refreshers: (() => void)[] = [];

const PROVIDER_KEYS = [
  'common.loading', 'common.preparing',
  'providers.manage.title', 'providers.manage.subtitle', 'providers.manage.quickAdd',
  'providers.manage.library', 'providers.manage.activate', 'providers.manage.active',
  'providers.manage.effectiveNow', 'providers.manage.edit', 'providers.manage.delete', 'providers.manage.newAdvanced',
  'providers.manage.openJson', 'providers.manage.empty', 'providers.manage.name',
  'providers.manage.save', 'providers.manage.cancel', 'providers.manage.addToLibrary',
  'providers.manage.presetHint', 'providers.manage.deleteConfirm', 'providers.manage.secretUnchanged',
  'providers.statusBar.subscription',
  'settings.provider.anthropic', 'settings.provider.bedrock', 'settings.provider.vertex', 'settings.provider.foundry',
  'settings.authMode.apiKey', 'settings.authMode.authToken', 'settings.authMode.helper', 'settings.authMode.subscription',
  'settings.env.apiKey', 'settings.env.authToken', 'settings.env.apiKeyHelper', 'settings.env.baseUrl',
  'settings.env.bedrockToken', 'settings.env.vertexProjectId', 'settings.env.foundryApiKey',
  'settings.env.foundryResource', 'settings.env.skipAuth',
];

export function registerProviderPanelRefresh(cb: () => void): void { refreshers.push(cb); }
export function refreshProviderPanel(): void { refreshers.forEach(r => r()); }

interface ProviderFormPayload {
  id?: string;
  name: string;
  kind: Profile['kind'];
  authMode?: 'subscription' | 'apiKey' | 'authToken' | 'helper';
  baseUrl?: string;
  apiKeyHelper?: string;
  projectId?: string;
  resource?: string;
  skipAuth?: boolean;
  secret?: string;
}

function secretFieldFor(payload: ProviderFormPayload): string | null {
  if (payload.kind === 'anthropic') {
    return payload.authMode === 'apiKey' ? 'apiKey' : payload.authMode === 'authToken' ? 'authToken' : null;
  }
  if (payload.kind === 'bedrock') return 'bedrockToken';
  if (payload.kind === 'foundry') return 'foundryApiKey';
  return null;
}

function setHasFlag(target: any, field: string, has: boolean): void {
  if (field === 'apiKey') target.hasApiKey = has;
  else if (field === 'authToken') target.hasAuthToken = has;
  else if (field === 'bedrockToken') target.hasBearerToken = has;
  else if (field === 'foundryApiKey') target.hasApiKey = has;
}

function existingHasFlag(p: Profile | undefined, field: string): boolean {
  if (!p) return false;
  if (field === 'apiKey') return !!(p as any).hasApiKey;
  if (field === 'authToken') return !!(p as any).hasAuthToken;
  if (field === 'bedrockToken') return !!(p as any).hasBearerToken;
  if (field === 'foundryApiKey') return !!(p as any).hasApiKey;
  return false;
}

async function saveProfile(payload: ProviderFormPayload, secrets: SecretsGateway): Promise<void> {
  const doc = await readProviders(CLAUDE_HOME);
  const id = payload.id ?? newId();
  const existing = doc.profiles.find(p => p.id === id);
  const base: any = { id, name: payload.name, kind: payload.kind };

  if (payload.kind === 'anthropic') {
    base.authMode = payload.authMode ?? 'subscription';
    if (payload.baseUrl) base.baseUrl = payload.baseUrl;
    if (payload.authMode === 'helper' && payload.apiKeyHelper) base.apiKeyHelper = payload.apiKeyHelper;
  } else if (payload.kind === 'bedrock') {
    if (payload.baseUrl) base.baseUrl = payload.baseUrl;
    if (payload.skipAuth) base.skipAuth = true;
  } else if (payload.kind === 'vertex') {
    if (payload.projectId) base.projectId = payload.projectId;
    if (payload.baseUrl) base.baseUrl = payload.baseUrl;
    if (payload.skipAuth) base.skipAuth = true;
  } else if (payload.kind === 'foundry') {
    if (payload.resource) base.resource = payload.resource;
    if (payload.baseUrl) base.baseUrl = payload.baseUrl;
    if (payload.skipAuth) base.skipAuth = true;
  }

  const field = secretFieldFor(payload);
  if (field) {
    if (payload.secret) await secrets.set(secretKey(id, field), payload.secret);
    setHasFlag(base, field, payload.secret ? true : existingHasFlag(existing, field));
  }

  const idx = doc.profiles.findIndex(p => p.id === id);
  if (idx >= 0) doc.profiles[idx] = base as Profile; else doc.profiles.push(base as Profile);
  await writeProviders(CLAUDE_HOME, doc);
}

export function openProviderPanel(context: vscode.ExtensionContext): void {
  if (current) { current.reveal(); return; }
  const panel = vscode.window.createWebviewPanel(
    'claudeCopilot.providerManager', t('providers.manage.title'), vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'))],
    },
  );
  current = panel;

  const distRoot = vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'));
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'provider.js'));
  const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'src.css'));
  const nonce = makeNonce();
  const csp = `default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource} 'nonce-${nonce}';`;

  const strings: Record<string, string> = {};
  for (const key of PROVIDER_KEYS) strings[key] = t(key);

  panel.webview.html = /* html */`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <link rel="stylesheet" href="${cssUri}" />
        <title>${t('providers.manage.title')}</title>
      </head>
      <body>
        <script nonce="${nonce}">window.__l10n = ${JSON.stringify(strings)};</script>
        <div id="root"></div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
    </html>`;

  let disposed = false;
  panel.onDidDispose(() => { disposed = true; current = null; });

  const fireRefresh = () => refreshers.forEach(r => r());

  panel.webview.onDidReceiveMessage(async (req: RpcRequest) => {
    let res: RpcResponse;
    const secrets = makeSecretsGateway(context);
    try {
      if (req.method === 'providers:list') {
        const doc = await readProviders(CLAUDE_HOME);
        const effectiveId = await effectiveProfileId();
        res = { id: req.id, result: { active: doc.active, effectiveId, profiles: doc.profiles, presets: PROVIDER_PRESETS } };
      } else if (req.method === 'providers:save') {
        await saveProfile(req.params as ProviderFormPayload, secrets);
        fireRefresh();
        res = { id: req.id, result: 'ok' };
      } else if (req.method === 'providers:delete') {
        await deleteProfile((req.params as { id: string }).id, secrets);
        fireRefresh();
        res = { id: req.id, result: 'ok' };
      } else if (req.method === 'providers:activate') {
        await activateProfile((req.params as { id: string | null }).id, secrets);
        fireRefresh();
        res = { id: req.id, result: 'ok' };
      } else if (req.method === 'providers:openJson') {
        const p = providersFilePath(CLAUDE_HOME);
        try { await vscode.workspace.fs.stat(vscode.Uri.file(p)); }
        catch { await writeProviders(CLAUDE_HOME, await readProviders(CLAUDE_HOME)); }
        const docu = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
        await vscode.window.showTextDocument(docu, vscode.ViewColumn.Beside);
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
