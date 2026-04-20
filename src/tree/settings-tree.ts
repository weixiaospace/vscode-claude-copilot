import * as vscode from 'vscode';
import { userSettingsPath, projectSettingsPath, localSettingsPath } from '../core/settings';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';

type Node = { kind: 'layer'; label: string; path: string; available: boolean };

export class SettingsTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  refresh(): void { this._onDidChange.fire(); }

  getTreeItem(node: Node): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('gear');
    item.tooltip = node.path;
    item.description = node.available ? '' : '(no workspace)';
    if (node.available) {
      item.command = { command: 'claudeCopilot.openSettingsPanel', title: 'Open Settings' };
    }
    item.contextValue = 'settings:layer';
    return item;
  }

  async getChildren(): Promise<Node[]> {
    const ws = currentWorkspace();
    return [
      { kind: 'layer', label: 'User', path: userSettingsPath(CLAUDE_HOME), available: true },
      { kind: 'layer', label: 'Project', path: ws ? projectSettingsPath(ws.fsPath) : '', available: !!ws },
      { kind: 'layer', label: 'Local', path: ws ? localSettingsPath(ws.fsPath) : '', available: !!ws },
    ];
  }
}
