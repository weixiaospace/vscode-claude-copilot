import * as vscode from 'vscode';
import { listInstalledPlugins, listMarketplaces, listAvailablePlugins, type InstalledPlugin, type Marketplace, type PluginChild } from '../core/plugins';
import { CLAUDE_HOME } from '../lib/paths';
import { t } from '../lib/l10n';

type GroupKind = 'marketplaces' | 'installed';

type Node =
  | { kind: 'group'; groupKind: GroupKind }
  | { kind: 'mp'; mp: Marketplace; installedCount: number; availableCount: number }
  | { kind: 'plugin'; plugin: InstalledPlugin }
  | { kind: 'pluginChild'; icon: string; label: string; filePath: string; tooltip?: string };

const GROUP_META: Record<GroupKind, { labelKey: string; icon: string; contextSuffix: string }> = {
  marketplaces: { labelKey: 'tree.group.marketplaces', icon: 'library', contextSuffix: 'marketplaces' },
  installed: { labelKey: 'tree.group.installed', icon: 'package', contextSuffix: 'installed' },
};

function shortSource(source: any): string {
  if (!source || typeof source !== 'object') return '';
  if (typeof source.repo === 'string') return source.repo;
  if (typeof source.url === 'string') return source.url;
  if (typeof source.source === 'string') return source.source;
  return '';
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return '';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.minutesAgo', mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('time.hoursAgo', hours);
  const days = Math.floor(hours / 24);
  if (days < 30) return t('time.daysAgo', days);
  const months = Math.floor(days / 30);
  if (months < 12) return t('time.monthsAgo', months);
  return t('time.yearsAgo', Math.floor(months / 12));
}

function pluginHasChildren(p: InstalledPlugin): boolean {
  return p.skills.length > 0 || p.agents.length > 0 || p.commands.length > 0 || !!p.hooksPath || !!p.mcpPath;
}

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
      const source = shortSource(node.mp.source);
      const ago = timeAgo(node.mp.lastUpdated);
      const descParts: string[] = [];
      if (ago) descParts.push(t('tree.mp.updatedAt', ago));
      if (source) descParts.push(source);
      item.description = descParts.join(' · ');
      const lines: string[] = [];
      if (ago) lines.push(t('tree.mp.updatedAt', ago));
      if (source) lines.push(source);
      if (node.availableCount > 0) lines.push(t('tree.mp.installedCount', node.installedCount, node.availableCount));
      item.tooltip = lines.join('\n');
      item.contextValue = 'marketplace';
      return item;
    }
    if (node.kind === 'plugin') {
      const p = node.plugin;
      const collapsible = pluginHasChildren(p)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
      const item = new vscode.TreeItem(p.name, collapsible);
      item.iconPath = new vscode.ThemeIcon(p.enabled ? 'pass-filled' : 'circle-outline');
      const typeLabels = p.types.map(tp => t('plugin.type.' + tp));
      const descParts = [`v${p.version}`, ...typeLabels];
      item.description = descParts.join(' · ');
      const tooltipLines = [`${p.name} · v${p.version}`, p.marketplace || 'local'];
      if (p.types.length > 0) tooltipLines.push(typeLabels.join(' · '));
      item.tooltip = tooltipLines.join('\n');
      item.contextValue = p.enabled ? 'plugin:enabled' : 'plugin:disabled';
      return item;
    }
    // pluginChild
    const c = node;
    const item = new vscode.TreeItem(c.label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(c.icon);
    item.resourceUri = vscode.Uri.file(c.filePath);
    item.tooltip = c.tooltip || c.filePath;
    item.command = { command: 'claudeCopilot.openFile', title: 'Open', arguments: [c.filePath] };
    item.contextValue = 'pluginChild';
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) return [{ kind: 'group', groupKind: 'marketplaces' }, { kind: 'group', groupKind: 'installed' }];

    if (node.kind === 'group' && node.groupKind === 'marketplaces') {
      const [mps, installed, available] = await Promise.all([
        listMarketplaces(CLAUDE_HOME),
        listInstalledPlugins(CLAUDE_HOME),
        listAvailablePlugins(CLAUDE_HOME),
      ]);
      return mps.map(mp => ({
        kind: 'mp',
        mp,
        installedCount: installed.filter(p => p.marketplace === mp.name).length,
        availableCount: available.filter(p => p.marketplace === mp.name).length,
      }) as Node);
    }

    if (node.kind === 'group' && node.groupKind === 'installed') {
      const ps = await listInstalledPlugins(CLAUDE_HOME);
      return ps.map(p => ({ kind: 'plugin', plugin: p }) as Node);
    }

    if (node.kind === 'plugin') {
      const p = node.plugin;
      const children: Node[] = [];
      for (const s of p.skills) children.push({ kind: 'pluginChild', icon: 'symbol-event', label: s.name, filePath: s.path, tooltip: t('plugin.type.skills') + ' · ' + s.name });
      for (const a of p.agents) children.push({ kind: 'pluginChild', icon: 'person', label: a.name, filePath: a.path, tooltip: t('plugin.type.agents') + ' · ' + a.name });
      for (const c of p.commands) children.push({ kind: 'pluginChild', icon: 'terminal', label: c.name, filePath: c.path, tooltip: t('plugin.type.commands') + ' · ' + c.name });
      if (p.hooksPath) children.push({ kind: 'pluginChild', icon: 'symbol-event', label: t('plugin.type.hooks'), filePath: p.hooksPath, tooltip: p.hooksPath });
      if (p.mcpPath) children.push({ kind: 'pluginChild', icon: 'plug', label: t('plugin.type.mcp'), filePath: p.mcpPath, tooltip: p.mcpPath });
      return children;
    }

    return [];
  }
}
