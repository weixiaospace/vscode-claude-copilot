import * as vscode from 'vscode';
import { listUserMcp, listProjectMcp, type McpServer } from '../core/mcp';
import { currentWorkspace } from '../lib/workspace';

type Node =
  | { kind: 'group'; scope: 'user' | 'project'; label: string; available: boolean }
  | { kind: 'server'; server: McpServer };

export class McpTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  refresh(): void { this._onDidChange.fire(); }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.label,
        node.available ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      item.contextValue = `group:mcp:${node.scope}`;
      if (!node.available) item.description = '(no workspace)';
      return item;
    }
    const s = node.server;
    const item = new vscode.TreeItem(s.name, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('plug');
    item.description = s.transport;
    item.tooltip = s.url || s.command || '';
    item.contextValue = `mcp:${s.scope}`;
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      const ws = currentWorkspace();
      return [
        { kind: 'group', scope: 'user', label: 'User', available: true },
        { kind: 'group', scope: 'project', label: ws ? `Project (${ws.name})` : 'Project', available: !!ws },
      ];
    }
    if (node.kind === 'group' && node.scope === 'user') {
      const servers = await listUserMcp();
      return servers.map(s => ({ kind: 'server', server: s }) as Node);
    }
    if (node.kind === 'group' && node.scope === 'project') {
      const ws = currentWorkspace();
      if (!ws) return [];
      const servers = await listProjectMcp(ws.fsPath);
      return servers.map(s => ({ kind: 'server', server: s }) as Node);
    }
    return [];
  }
}
