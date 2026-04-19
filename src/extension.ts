import * as vscode from 'vscode';
import { PluginsTreeProvider } from './tree/plugins-tree';
import { McpTreeProvider } from './tree/mcp-tree';
import { SkillsTreeProvider } from './tree/skills-tree';

export function activate(context: vscode.ExtensionContext): void {
  const plugins = new PluginsTreeProvider();
  const mcp = new McpTreeProvider();
  const skills = new SkillsTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claudeCopilot.plugins', plugins),
    vscode.window.registerTreeDataProvider('claudeCopilot.mcp', mcp),
    vscode.window.registerTreeDataProvider('claudeCopilot.skills', skills),
    vscode.commands.registerCommand('claudeCopilot.refresh', () => {
      plugins.refresh(); mcp.refresh(); skills.refresh();
    }),
    vscode.commands.registerCommand('claudeCopilot.openFile', async (filePath: string) => {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }),
  );
}

export function deactivate(): void {}
