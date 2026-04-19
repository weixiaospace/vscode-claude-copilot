import * as vscode from 'vscode';
import { listInstalledPlugins, listMarketplaces, type InstalledPlugin, type Marketplace } from '../core/plugins';
import { CLAUDE_HOME } from '../lib/paths';

type Node =
  | { kind: 'group'; label: 'Marketplaces' | 'Installed' }
  | { kind: 'mp'; mp: Marketplace }
  | { kind: 'plugin'; plugin: InstalledPlugin };

export class PluginsTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  refresh(): void { this._onDidChange.fire(); }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = `group:${node.label.toLowerCase()}`;
      return item;
    }
    if (node.kind === 'mp') {
      const item = new vscode.TreeItem(node.mp.name, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('repo');
      item.tooltip = node.mp.installLocation;
      item.contextValue = 'marketplace';
      return item;
    }
    const p = node.plugin;
    const item = new vscode.TreeItem(`${p.name} (${p.enabled ? 'enabled' : 'disabled'})`, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(p.enabled ? 'pass-filled' : 'circle-outline');
    item.tooltip = `v${p.version} · ${p.marketplace || 'local'}`;
    item.description = p.version;
    item.contextValue = p.enabled ? 'plugin:enabled' : 'plugin:disabled';
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) return [{ kind: 'group', label: 'Marketplaces' }, { kind: 'group', label: 'Installed' }];
    if (node.kind === 'group' && node.label === 'Marketplaces') {
      const mps = await listMarketplaces(CLAUDE_HOME);
      return mps.map(mp => ({ kind: 'mp', mp }) as Node);
    }
    if (node.kind === 'group' && node.label === 'Installed') {
      const ps = await listInstalledPlugins(CLAUDE_HOME);
      return ps.map(p => ({ kind: 'plugin', plugin: p }) as Node);
    }
    return [];
  }
}
