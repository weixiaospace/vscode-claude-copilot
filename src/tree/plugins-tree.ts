import * as vscode from 'vscode';
import { listInstalledPlugins, listMarketplaces, type InstalledPlugin, type Marketplace } from '../core/plugins';
import { CLAUDE_HOME } from '../lib/paths';
import { t } from '../lib/l10n';

type GroupKind = 'marketplaces' | 'installed';

type Node =
  | { kind: 'group'; groupKind: GroupKind }
  | { kind: 'mp'; mp: Marketplace }
  | { kind: 'plugin'; plugin: InstalledPlugin };

const GROUP_META: Record<GroupKind, { labelKey: string; icon: string; contextSuffix: string }> = {
  marketplaces: { labelKey: 'tree.group.marketplaces', icon: 'library', contextSuffix: 'marketplaces' },
  installed: { labelKey: 'tree.group.installed', icon: 'package', contextSuffix: 'installed' },
};

export class PluginsTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  refresh(): void { this._onDidChange.fire(); }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const meta = GROUP_META[node.groupKind];
      const item = new vscode.TreeItem(t(meta.labelKey), vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon(meta.icon);
      item.contextValue = `group:${meta.contextSuffix}`;
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
    const item = new vscode.TreeItem(p.name, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(p.enabled ? 'pass-filled' : 'circle-outline');
    item.tooltip = `v${p.version} · ${p.marketplace || 'local'}`;
    item.description = p.version;
    item.contextValue = p.enabled ? 'plugin:enabled' : 'plugin:disabled';
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) return [{ kind: 'group', groupKind: 'marketplaces' }, { kind: 'group', groupKind: 'installed' }];
    if (node.kind !== 'group') return [];
    if (node.groupKind === 'marketplaces') {
      const mps = await listMarketplaces(CLAUDE_HOME);
      return mps.map(mp => ({ kind: 'mp', mp }) as Node);
    }
    const ps = await listInstalledPlugins(CLAUDE_HOME);
    return ps.map(p => ({ kind: 'plugin', plugin: p }) as Node);
  }
}
