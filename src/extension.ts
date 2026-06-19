import * as vscode from 'vscode';
import { PluginsTreeProvider } from './tree/plugins-tree';
import { McpTreeProvider } from './tree/mcp-tree';
import { SkillsTreeProvider } from './tree/skills-tree';
import { AgentsTreeProvider } from './tree/agents-tree';
import { WorkflowsTreeProvider } from './tree/workflows-tree';
import { OutputStylesTreeProvider } from './tree/output-styles-tree';
import { RulesTreeProvider } from './tree/rules-tree';
import { MemoryTreeProvider } from './tree/memory-tree';
import { SettingsTreeProvider } from './tree/settings-tree';
import { UsageTreeProvider } from './tree/usage-tree';
import { registerPluginCommands } from './commands/plugins';
import { registerMcpCommands } from './commands/mcp';
import { registerSkillCommands } from './commands/skills';
import { registerAgentCommands } from './commands/agents';
import { registerWorkflowCommands } from './commands/workflows';
import { registerOutputStyleCommands } from './commands/output-styles';
import { registerRuleCommands } from './commands/rules';
import { registerMemoryCommands } from './commands/memory';
import { registerProviderCommands } from './commands/providers';
import { registerWatchers } from './lib/watchers';
import { makeSecretsGateway } from './lib/secrets';
import { createProviderStatusBar } from './lib/status-bar';
import { migrateProvidersOnce } from './lib/migrate-providers';
import { openUsagePanel } from './webview/usage-panel';
import { openMarketplacePanel, registerMarketplaceRefresh } from './webview/marketplace-panel';
import { openSettingsPanel } from './webview/settings-panel';
import { openProviderPanel, registerProviderPanelRefresh, refreshProviderPanel } from './webview/provider-panel';
import { runClaude } from './core/claude-cli';
import { t } from './lib/l10n';

export function activate(context: vscode.ExtensionContext): void {
  const plugins = new PluginsTreeProvider();
  const mcp = new McpTreeProvider();
  const skills = new SkillsTreeProvider();
  const agents = new AgentsTreeProvider();
  const workflows = new WorkflowsTreeProvider();
  const outputStyles = new OutputStylesTreeProvider();
  const rules = new RulesTreeProvider();
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
    vscode.window.registerTreeDataProvider('claudeCopilot.agents', agents),
    vscode.window.registerTreeDataProvider('claudeCopilot.workflows', workflows),
    vscode.window.registerTreeDataProvider('claudeCopilot.outputStyles', outputStyles),
    vscode.window.registerTreeDataProvider('claudeCopilot.rules', rules),
    vscode.window.registerTreeDataProvider('claudeCopilot.memory', memory),
    vscode.window.registerTreeDataProvider('claudeCopilot.settings', settings),
    vscode.window.registerTreeDataProvider('claudeCopilot.usage', usage),
    vscode.commands.registerCommand('claudeCopilot.refresh', () => {
      plugins.refresh(); mcp.refresh(); skills.refresh(); agents.refresh();
      workflows.refresh(); outputStyles.refresh(); rules.refresh();
      memory.refresh(); settings.refresh();
    }),
    vscode.commands.registerCommand('claudeCopilot.openFile', async (filePath: string) => {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }),
    vscode.commands.registerCommand('claudeCopilot.openSettingsPanel', (layer?: 'user' | 'project' | 'local') => openSettingsPanel(context, layer)),
    vscode.commands.registerCommand('claudeCopilot.openUsage', () => openUsagePanel(context)),
    vscode.commands.registerCommand('claudeCopilot.openMarketplace', () => openMarketplacePanel(context)),
    vscode.commands.registerCommand('claudeCopilot.openProviderPanel', () => openProviderPanel(context)),
    ...registerPluginCommands(() => plugins.refresh()),
    ...registerMcpCommands(() => mcp.refresh()),
    ...registerSkillCommands(() => skills.refresh()),
    ...registerAgentCommands(() => agents.refresh()),
    ...registerWorkflowCommands(() => workflows.refresh()),
    ...registerOutputStyleCommands(() => outputStyles.refresh()),
    ...registerRuleCommands(() => rules.refresh()),
    ...registerMemoryCommands(() => memory.refresh()),
    ...registerProviderCommands(secrets, () => {
      void statusBar.update();
      settings.refresh();
      refreshProviderPanel();
    }),
    ...registerWatchers({
      plugins: () => plugins.refresh(),
      mcp: () => mcp.refresh(),
      skills: () => skills.refresh(),
      agents: () => agents.refresh(),
      workflows: () => workflows.refresh(),
      outputStyles: () => outputStyles.refresh(),
      rules: () => rules.refresh(),
      memory: () => memory.refresh(),
      settings: () => { settings.refresh(); outputStyles.refresh(); },
      providers: () => { void statusBar.update(); settings.refresh(); },
    }),
  );

  registerMarketplaceRefresh(() => plugins.refresh());
  registerProviderPanelRefresh(() => { void statusBar.update(); settings.refresh(); });

  runClaude(['--version'], 5000).catch(() => {
    vscode.window.showWarningMessage(t('toast.cliMissing'));
  });
}

export function deactivate(): void {}
