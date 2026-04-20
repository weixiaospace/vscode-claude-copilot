import * as vscode from 'vscode';
import {
  installPlugin, uninstallPlugin, togglePlugin, listAvailablePlugins,
  addMarketplace, removeMarketplace, updateMarketplace,
  type InstalledPlugin, type Marketplace,
} from '../core/plugins';
import { CLAUDE_HOME } from '../lib/paths';
import { t } from '../lib/l10n';

export function registerPluginCommands(refresh: () => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeCopilot.plugin.install', async () => {
      const available = await listAvailablePlugins(CLAUDE_HOME);
      if (available.length === 0) {
        vscode.window.showWarningMessage(t('warn.noPluginsAvailable'));
        return;
      }
      const picked = await vscode.window.showQuickPick(
        available.map(p => ({ label: p.name, description: p.marketplace, detail: p.description, value: p })),
        { placeHolder: t('quickpick.selectPlugin') },
      );
      if (!picked) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t('progress.installPlugin', picked.value.name) },
        async () => { await installPlugin(`${picked.value.name}@${picked.value.marketplace}`); },
      );
      vscode.window.showInformationMessage(t('toast.pluginInstalled', picked.value.name));
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.plugin.uninstall', async (node: { plugin: InstalledPlugin }) => {
      const p = node?.plugin;
      if (!p) return;
      const confirm = await vscode.window.showWarningMessage(
        t('confirm.uninstallPlugin', p.name), { modal: true }, t('confirm.uninstallPluginBtn'),
      );
      if (confirm !== t('confirm.uninstallPluginBtn')) return;
      await uninstallPlugin(`${p.name}@${p.marketplace}`);
      vscode.window.showInformationMessage(t('toast.pluginUninstalled', p.name));
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.plugin.toggle', async (node: { plugin: InstalledPlugin }) => {
      const p = node?.plugin;
      if (!p) return;
      await togglePlugin(`${p.name}@${p.marketplace}`, !p.enabled);
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.marketplace.add', async () => {
      const source = await vscode.window.showInputBox({
        prompt: t('prompt.marketplaceSource'),
        placeHolder: 'https://github.com/anthropics/claude-plugins-official',
      });
      if (!source) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t('progress.addMarketplace') },
        async () => { await addMarketplace(source); },
      );
      vscode.window.showInformationMessage(t('toast.marketplaceAdded'));
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.marketplace.remove', async (node: { mp: Marketplace }) => {
      const mp = node?.mp;
      if (!mp) return;
      const confirm = await vscode.window.showWarningMessage(
        t('confirm.removeMarketplace', mp.name), { modal: true }, t('confirm.removeMarketplaceBtn'),
      );
      if (confirm !== t('confirm.removeMarketplaceBtn')) return;
      await removeMarketplace(mp.name);
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.marketplace.update', async (node: { mp: Marketplace }) => {
      const mp = node?.mp;
      if (!mp) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t('progress.updateMarketplace', mp.name) },
        async () => { await updateMarketplace(mp.name); },
      );
      vscode.window.showInformationMessage(t('toast.marketplaceUpdated', mp.name));
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.marketplace.updateAll', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t('progress.updateAllMarketplaces') },
        async () => { await updateMarketplace(); },
      );
      vscode.window.showInformationMessage(t('toast.marketplacesUpdated'));
      refresh();
    }),
  ];
}
