import * as vscode from 'vscode';
import * as path from 'path';
import { queryUsage } from '../core/usage';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { makeNonce, type RpcRequest, type RpcResponse } from './messaging';
import { t } from '../lib/l10n';

let current: vscode.WebviewPanel | null = null;

const USAGE_KEYS = [
  'common.loading',
  'common.noData',
  'common.refresh',
  'dashboard.title',
  'dashboard.inputTokens',
  'dashboard.outputTokens',
  'dashboard.estimatedCost',
  'dashboard.totalSessions',
  'dashboard.trend',
  'dashboard.dailyTrend',
  'dashboard.byDay',
  'dashboard.byWeek',
  'dashboard.byMonth',
  'dashboard.byModel',
  'dashboard.byProject',
  'dashboard.scopeAll',
  'dashboard.scopeProject',
  'chart.input',
  'chart.output',
  'chart.cacheRead',
  'chart.cacheCreate',
  'table.model',
  'table.project',
  'table.sessions',
  'table.calls',
  'table.input',
  'table.output',
  'table.estimatedCost',
];

export function openUsagePanel(context: vscode.ExtensionContext): void {
  if (current) { current.reveal(); return; }
  const panel = vscode.window.createWebviewPanel(
    'claudeCopilot.usage', t('dashboard.title'), vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'))],
    },
  );
  current = panel;

  const distRoot = vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'));
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'usage.js'));
  const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'src.css'));
  const nonce = makeNonce();
  const csp = `default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource} 'nonce-${nonce}' https://cdn.jsdelivr.net; connect-src https://cdn.jsdelivr.net;`;

  const strings: Record<string, string> = {};
  for (const key of USAGE_KEYS) {
    strings[key] = t(key);
  }

  panel.webview.html = /* html */`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <link rel="stylesheet" href="${cssUri}" />
        <title>${t('dashboard.title')}</title>
      </head>
      <body>
        <script nonce="${nonce}">window.__l10n = ${JSON.stringify(strings)};</script>
        <div id="root"></div>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
    </html>`;

  let disposed = false;
  panel.onDidDispose(() => { disposed = true; current = null; });

  panel.webview.onDidReceiveMessage(async (req: RpcRequest) => {
    let res: RpcResponse;
    try {
      if (req.method === 'usage:query') {
        const ws = currentWorkspace();
        const filter: string | null = req.params?.scope === 'project' && ws ? ws.fsPath : null;
        res = { id: req.id, result: await queryUsage(CLAUDE_HOME, filter) };
      } else {
        res = { id: req.id, error: `unknown method ${req.method}` };
      }
    } catch (e: any) {
      res = { id: req.id, error: e?.message || String(e) };
    }
    if (!disposed) panel.webview.postMessage(res);
  });
}
