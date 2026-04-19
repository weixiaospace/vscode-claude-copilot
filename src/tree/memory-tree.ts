import * as vscode from 'vscode';
import * as path from 'path';
import { listMemories, memoryDir, type Memory } from '../core/memory';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';

type Node =
  | { kind: 'group'; label: string; available: boolean }
  | { kind: 'index' }
  | { kind: 'memory'; memory: Memory };

export class MemoryTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  refresh(): void { this._onDidChange.fire(); }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.label,
        node.available ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'group:memory';
      if (!node.available) item.description = '(no workspace)';
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
      return [{ kind: 'group', label: ws ? ws.name : 'Memory', available: !!ws }];
    }
    if (node.kind !== 'group' || !ws) return [];
    const memories = await listMemories(CLAUDE_HOME, ws.fsPath);
    return [{ kind: 'index' }, ...memories.map(m => ({ kind: 'memory', memory: m }) as Node)];
  }
}
