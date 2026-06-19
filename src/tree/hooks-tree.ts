import * as vscode from 'vscode';
import { listHooks, type HookEntry, type HookSource } from '../core/hooks';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

type Node =
  | { kind: 'event'; event: string; entries: HookEntry[] }
  | { kind: 'entry'; entry: HookEntry };

function sourceLabel(source: HookSource): string {
  switch (source.kind) {
    case 'user': return t('hooks.source.user');
    case 'project': return t('hooks.source.project');
    case 'local': return t('hooks.source.local');
    case 'plugin': return t('hooks.source.plugin', source.pluginKey);
  }
}

export class HooksTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private cache: HookEntry[] | null = null;
  private inflight: Promise<HookEntry[]> | null = null;

  refresh(): void {
    this.cache = null;
    this.inflight = null;
    this._onDidChange.fire();
  }

  private async loadAll(): Promise<HookEntry[]> {
    if (this.cache) return this.cache;
    if (this.inflight) return this.inflight;
    const ws = currentWorkspace();
    this.inflight = listHooks(CLAUDE_HOME, ws ? ws.fsPath : null).then(entries => {
      this.cache = entries;
      this.inflight = null;
      return entries;
    });
    return this.inflight;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'event') {
      const item = new vscode.TreeItem(node.event, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon('zap');
      item.description = t('tree.hooks.entryCount', node.entries.length);
      item.contextValue = 'group:hooks:event';
      return item;
    }
    const e = node.entry;
    // Label: matcher + handler type (most informative pair).
    const label = e.matcher === '*' ? e.handler.type : `${e.matcher} → ${e.handler.type}`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(handlerIcon(e.handler.type));
    item.description = `${sourceLabel(e.source)} · ${truncate(e.handler.summary, 60)}`;
    item.tooltip = [
      `Event: ${e.event}`,
      `Matcher: ${e.matcher}`,
      `Type: ${e.handler.type}`,
      e.handler.summary ? `${capitalize(handlerSummaryLabel(e.handler.type))}: ${e.handler.summary}` : '',
      `Source: ${sourceLabel(e.source)}`,
      e.sourceFile,
    ].filter(Boolean).join('\n');
    item.resourceUri = vscode.Uri.file(e.sourceFile);
    item.command = { command: 'claudeCopilot.openFile', title: 'Open source', arguments: [e.sourceFile] };
    item.contextValue = `hook:${e.handler.type}`;
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      const entries = await this.loadAll();
      if (!entries.length) return [];
      // Group by event, sort events alphabetically.
      const byEvent = new Map<string, HookEntry[]>();
      for (const e of entries) {
        const bucket = byEvent.get(e.event) ?? [];
        bucket.push(e);
        byEvent.set(e.event, bucket);
      }
      return [...byEvent.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([event, es]) => ({ kind: 'event', event, entries: es }) as Node);
    }
    if (node.kind === 'event') {
      // Within an event, sort by source priority then matcher then summary.
      const order: Record<HookSource['kind'], number> = { user: 0, project: 1, local: 2, plugin: 3 };
      return [...node.entries]
        .sort((a, b) => {
          const sa = order[a.source.kind];
          const sb = order[b.source.kind];
          if (sa !== sb) return sa - sb;
          if (a.matcher !== b.matcher) return a.matcher.localeCompare(b.matcher);
          return a.handler.summary.localeCompare(b.handler.summary);
        })
        .map(entry => ({ kind: 'entry', entry }) as Node);
    }
    return [];
  }
}

function handlerIcon(type: string): string {
  switch (type) {
    case 'command': return 'terminal';
    case 'http': return 'globe';
    case 'mcp_tool': return 'plug';
    case 'prompt': return 'comment';
    case 'agent': return 'person';
    default: return 'circle-outline';
  }
}

function handlerSummaryLabel(type: string): string {
  switch (type) {
    case 'command': return 'command';
    case 'http': return 'url';
    case 'mcp_tool': return 'tool';
    case 'prompt': return 'prompt';
    case 'agent': return 'agent';
    default: return 'detail';
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
