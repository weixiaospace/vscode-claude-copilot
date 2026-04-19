import * as vscode from 'vscode';

export class UsageTreeProvider implements vscode.TreeDataProvider<string> {
  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Open Dashboard', vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('graph');
    item.command = { command: 'claudeCopilot.openUsage', title: 'Open' };
    return item;
  }
  getChildren(): string[] { return ['open']; }
}
