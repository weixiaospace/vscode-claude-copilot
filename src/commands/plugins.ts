import * as vscode from 'vscode';
import {
  installPlugin, uninstallPlugin, togglePlugin, listAvailablePlugins,
  addMarketplace, removeMarketplace,
  type InstalledPlugin, type Marketplace,
} from '../core/plugins';
import { CLAUDE_HOME } from '../lib/paths';

export function registerPluginCommands(refresh: () => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeCopilot.plugin.install', async () => {
      const available = await listAvailablePlugins(CLAUDE_HOME);
      if (available.length === 0) {
        vscode.window.showWarningMessage('未发现任何可安装的插件，先添加一个 marketplace。');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        available.map(p => ({ label: p.name, description: p.marketplace, detail: p.description, value: p })),
        { placeHolder: '选择要安装的插件' },
      );
      if (!picked) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `安装 ${picked.value.name}...` },
        async () => { await installPlugin(`${picked.value.name}@${picked.value.marketplace}`); },
      );
      vscode.window.showInformationMessage(`已安装 ${picked.value.name}`);
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.plugin.uninstall', async (node: { plugin: InstalledPlugin }) => {
      const p = node?.plugin;
      if (!p) return;
      const confirm = await vscode.window.showWarningMessage(
        `卸载插件 ${p.name}？`, { modal: true }, '卸载',
      );
      if (confirm !== '卸载') return;
      await uninstallPlugin(`${p.name}@${p.marketplace}`);
      vscode.window.showInformationMessage(`已卸载 ${p.name}`);
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
        prompt: '输入 marketplace git URL 或 owner/repo',
        placeHolder: 'https://github.com/anthropics/claude-plugins-official',
      });
      if (!source) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `添加 marketplace...` },
        async () => { await addMarketplace(source); },
      );
      vscode.window.showInformationMessage('Marketplace 已添加');
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.marketplace.remove', async (node: { mp: Marketplace }) => {
      const mp = node?.mp;
      if (!mp) return;
      const confirm = await vscode.window.showWarningMessage(
        `移除 marketplace ${mp.name}？`, { modal: true }, '移除',
      );
      if (confirm !== '移除') return;
      await removeMarketplace(mp.name);
      refresh();
    }),
  ];
}
