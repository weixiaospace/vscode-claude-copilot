import * as vscode from 'vscode';

export class HelloTreeProvider implements vscode.TreeDataProvider<string> {
  getTreeItem(element: string): vscode.TreeItem {
    return new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
  }
  getChildren(): string[] {
    return ['Hello from Claude Copilot'];
  }
}
