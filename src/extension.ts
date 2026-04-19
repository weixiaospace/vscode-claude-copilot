import * as vscode from 'vscode';
import { PluginsTreeProvider } from './tree/plugins-tree';

export function activate(context: vscode.ExtensionContext): void {
  const plugins = new PluginsTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claudeCopilot.plugins', plugins),
    vscode.commands.registerCommand('claudeCopilot.refresh', () => plugins.refresh()),
  );
}

export function deactivate(): void {}
