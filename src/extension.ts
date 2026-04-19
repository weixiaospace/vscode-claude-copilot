import * as vscode from 'vscode';
import { PluginsTreeProvider } from './tree/plugins-tree';
import { McpTreeProvider } from './tree/mcp-tree';

export function activate(context: vscode.ExtensionContext): void {
  const plugins = new PluginsTreeProvider();
  const mcp = new McpTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claudeCopilot.plugins', plugins),
    vscode.window.registerTreeDataProvider('claudeCopilot.mcp', mcp),
    vscode.commands.registerCommand('claudeCopilot.refresh', () => {
      plugins.refresh();
      mcp.refresh();
    }),
  );
}

export function deactivate(): void {}
