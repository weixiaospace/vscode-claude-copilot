import * as vscode from 'vscode';
import * as path from 'path';
import { listMemories, memoryDir, type Memory } from '../core/memory';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

type Node =
  | { kind: 'group'; available: boolean; workspaceName?: string }
  | { kind: 'index' }
  | { kind: 'memory'; memory: Memory };

export class MemoryTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private cache: Memory[] | null = null;
  private inflight: Promise<Memory[]> | null = null;

  refresh(): void {
    this.cache = null;
    this.inflight = null;
    this._onDidChange.fire();
  }

  private async loadAll(): Promise<Memory[]> {
    if (this.cache) return this.cache;
    if (this.inflight) return this.inflight;
    const ws = currentWorkspace();
    if (!ws) return [];
    this.inflight = listMemories(CLAUDE_HOME, ws.fsPath).then(items => {
      this.cache = items;
      this.inflight = null;
      return items;
    });
    return this.inflight;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(t('tree.group.memory'),
        node.available ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('folder-opened');
      item.contextValue = 'group:memory';
      if (!node.available) item.description = t('tree.group.noWorkspace');
      else if (node.workspaceName) item.description = node.workspaceName;
      return item;
    }
    if (node.kind === 'index') {
      const ws = currentWorkspace()!;
      const indexPath = path.join(memoryDir(CLAUDE_HOME, ws.fsPath), 'MEMORY.md');
      const item = new vscode.TreeItem('MEMORY.md', vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('list-tree');
      item.command = { command: 'claudeCopilot.openFile', title: 'Open', arguments: [indexPath] };
      item.contextValue = 'memory:index';
      return item;
    }
    const m = node.memory;
    const item = new vscode.TreeItem(m.fileName, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('note');
    item.resourceUri = vscode.Uri.file(m.path);
    item.command = { command: 'claudeCopilot.openFile', title: 'Open', arguments: [m.path] };
    item.contextValue = 'memory:item';
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    const ws = currentWorkspace();
    if (!node) {
      if (ws) this.loadAll().catch(() => {});
      return [{ kind: 'group', available: !!ws, workspaceName: ws?.name }];
    }
    if (node.kind !== 'group' || !ws) return [];
    const memories = await this.loadAll();
    return [{ kind: 'index' }, ...memories.map(m => ({ kind: 'memory', memory: m }) as Node)];
  }
}
