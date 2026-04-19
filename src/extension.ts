import * as vscode from 'vscode';
import { PluginsTreeProvider } from './tree/plugins-tree';
import { McpTreeProvider } from './tree/mcp-tree';
import { SkillsTreeProvider } from './tree/skills-tree';
import { MemoryTreeProvider } from './tree/memory-tree';
import { SettingsTreeProvider, openSettingsFile } from './tree/settings-tree';

export function activate(context: vscode.ExtensionContext): void {
  const plugins = new PluginsTreeProvider();
  const mcp = new McpTreeProvider();
  const skills = new SkillsTreeProvider();
  const memory = new MemoryTreeProvider();
  const settings = new SettingsTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claudeCopilot.plugins', plugins),
    vscode.window.registerTreeDataProvider('claudeCopilot.mcp', mcp),
    vscode.window.registerTreeDataProvider('claudeCopilot.skills', skills),
    vscode.window.registerTreeDataProvider('claudeCopilot.memory', memory),
    vscode.window.registerTreeDataProvider('claudeCopilot.settings', settings),
    vscode.commands.registerCommand('claudeCopilot.refresh', () => {
      plugins.refresh(); mcp.refresh(); skills.refresh(); memory.refresh(); settings.refresh();
    }),
    vscode.commands.registerCommand('claudeCopilot.openFile', async (filePath: string) => {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }),
    vscode.commands.registerCommand('claudeCopilot.openSettings', openSettingsFile),
  );
}

export function deactivate(): void {}
