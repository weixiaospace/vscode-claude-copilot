import * as vscode from 'vscode';
import * as path from 'path';
import { listAvailablePlugins, listInstalledPlugins, listMarketplaces, installPlugin, uninstallPlugin } from '../core/plugins';
import { CLAUDE_HOME } from '../lib/paths';
import type { RpcRequest, RpcResponse } from './messaging';

let current: vscode.WebviewPanel | null = null;
const refreshers: (() => void)[] = [];

export function registerMarketplaceRefresh(cb: () => void): void {
  refreshers.push(cb);
}

export function openMarketplacePanel(context: vscode.ExtensionContext): void {
  if (current) { current.reveal(); return; }
  const panel = vscode.window.createWebviewPanel(
    'claudeCopilot.marketplace', 'Claude Marketplace', vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'))],
    },
  );
  current = panel;

  const distRoot = vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'));
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'marketplace.js'));
  const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'src.css'));
  const csp = `default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource};`;

  panel.webview.html = /* html */`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <link rel="stylesheet" href="${cssUri}" />
        <title>Claude Marketplace</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="${scriptUri}"></script>
      </body>
    </html>`;

  let disposed = false;
  panel.onDidDispose(() => { disposed = true; current = null; });

  panel.webview.onDidReceiveMessage(async (req: RpcRequest) => {
    let res: RpcResponse;
    try {
      if (req.method === 'marketplace:list') {
        const [available, installed, marketplaces] = await Promise.all([
          listAvailablePlugins(CLAUDE_HOME),
          listInstalledPlugins(CLAUDE_HOME),
          listMarketplaces(CLAUDE_HOME),
        ]);
        res = {
          id: req.id,
          result: {
            available,
            installed: installed.map(p => ({ name: p.name, marketplace: p.marketplace, version: p.version, enabled: p.enabled })),
            marketplaces: marketplaces.map(m => m.name),
          },
        };
      } else if (req.method === 'marketplace:install') {
        const { name, marketplace } = req.params;
        await installPlugin(`${name}@${marketplace}`);
        refreshers.forEach(r => r());
        res = { id: req.id, result: 'ok' };
      } else if (req.method === 'marketplace:uninstall') {
        const { name, marketplace } = req.params;
        await uninstallPlugin(`${name}@${marketplace}`);
        refreshers.forEach(r => r());
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
