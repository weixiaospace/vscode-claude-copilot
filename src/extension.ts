import * as vscode from 'vscode';
import { PluginsTreeProvider } from './tree/plugins-tree';
import { McpTreeProvider } from './tree/mcp-tree';
import { SkillsTreeProvider } from './tree/skills-tree';
import { MemoryTreeProvider } from './tree/memory-tree';
import { SettingsTreeProvider } from './tree/settings-tree';
import { UsageTreeProvider } from './tree/usage-tree';
import { registerPluginCommands } from './commands/plugins';
import { registerMcpCommands } from './commands/mcp';
import { registerSkillCommands } from './commands/skills';
import { registerMemoryCommands } from './commands/memory';
import { registerProviderCommands } from './commands/providers';
import { registerWatchers } from './lib/watchers';
import { makeSecretsGateway } from './lib/secrets';
import { createProviderStatusBar } from './lib/status-bar';
import { migrateProvidersOnce } from './lib/migrate-providers';
import { openUsagePanel } from './webview/usage-panel';
import { openMarketplacePanel, registerMarketplaceRefresh } from './webview/marketplace-panel';
import { openSettingsPanel } from './webview/settings-panel';
import { runClaude } from './core/claude-cli';
import { t } from './lib/l10n';

export function activate(context: vscode.ExtensionContext): void {
  const plugins = new PluginsTreeProvider();
  const mcp = new McpTreeProvider();
  const skills = new SkillsTreeProvider();
  const memory = new MemoryTreeProvider();
  const settings = new SettingsTreeProvider();
  const usage = new UsageTreeProvider();

  const secrets = makeSecretsGateway(context);
  const statusBar = createProviderStatusBar();
  void (async () => {
    try { await migrateProvidersOnce(secrets); }
    catch (err) { console.error('providers migration failed', err); }
    await statusBar.update();
  })();

  context.subscriptions.push(
    { dispose: () => statusBar.dispose() },
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
    vscode.commands.registerCommand('claudeCopilot.openSettingsPanel', () => openSettingsPanel(context)),
    vscode.commands.registerCommand('claudeCopilot.openUsage', () => openUsagePanel(context)),
    vscode.commands.registerCommand('claudeCopilot.openMarketplace', () => openMarketplacePanel(context)),
    ...registerPluginCommands(() => plugins.refresh()),
    ...registerMcpCommands(() => mcp.refresh()),
    ...registerSkillCommands(() => skills.refresh()),
    ...registerMemoryCommands(() => memory.refresh()),
    ...registerProviderCommands(secrets, () => {
      void statusBar.update();
      settings.refresh();
    }),
    ...registerWatchers({
      plugins: () => plugins.refresh(),
      mcp: () => mcp.refresh(),
      skills: () => skills.refresh(),
      memory: () => memory.refresh(),
      settings: () => settings.refresh(),
      providers: () => { void statusBar.update(); settings.refresh(); },
    }),
  );

  registerMarketplaceRefresh(() => plugins.refresh());

  runClaude(['--version'], 5000).catch(() => {
    vscode.window.showWarningMessage(t('toast.cliMissing'));
  });
}

export function deactivate(): void {}
