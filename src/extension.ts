import * as vscode from 'vscode';
import { PluginsTreeProvider } from './tree/plugins-tree';
import { McpTreeProvider } from './tree/mcp-tree';
import { SkillsTreeProvider } from './tree/skills-tree';
import { MemoryTreeProvider } from './tree/memory-tree';
import { SettingsTreeProvider, openSettingsFile } from './tree/settings-tree';
import { UsageTreeProvider } from './tree/usage-tree';
import { registerPluginCommands } from './commands/plugins';

export function activate(context: vscode.ExtensionContext): void {
  const plugins = new PluginsTreeProvider();
  const mcp = new McpTreeProvider();
  const skills = new SkillsTreeProvider();
  const memory = new MemoryTreeProvider();
  const settings = new SettingsTreeProvider();
  const usage = new UsageTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claudeCopilot.plugins', plugins),
    vscode.window.registerTreeDataProvider('claudeCopilot.mcp', mcp),
    vscode.window.registerTreeDataProvider('claudeCopilot.skills', skills),
    vscode.window.registerTreeDataProvider('claudeCopilot.memory', memory),
    vscode.window.registerTreeDataProvider('claudeCopilot.settings', settings),
    vscode.window.registerTreeDataProvider('claudeCopilot.usage', usage),
    vscode.commands.registerCommand('claudeCopilot.refresh', () => {
      plugins.refresh(); mcp.refresh(); skills.refresh(); memory.refresh(); settings.refresh();
    }),
    vscode.commands.registerCommand('claudeCopilot.openFile', async (filePath: string) => {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }),
    vscode.commands.registerCommand('claudeCopilot.openSettings', openSettingsFile),
    vscode.commands.registerCommand('claudeCopilot.openUsage', () => {
      vscode.window.showInformationMessage('Usage dashboard — coming in M5');
    }),
    ...registerPluginCommands(() => plugins.refresh()),
  );
}

export function deactivate(): void {}
