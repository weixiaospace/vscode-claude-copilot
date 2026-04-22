import * as vscode from 'vscode';
import { userSettingsPath, projectSettingsPath, localSettingsPath } from '../core/settings';
import { readProviders } from '../core/providers';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

type Layer = 'user' | 'project' | 'local';
type Node =
  | { kind: 'layer'; layer: Layer; path: string; available: boolean }
  | { kind: 'profile-group'; activeName: string }
  | { kind: 'profile-subscription'; active: boolean }
  | { kind: 'profile-item'; id: string; name: string; profileKind: string; active: boolean };

const LAYER_META: Record<Layer, { labelKey: string; icon: string }> = {
  user: { labelKey: 'tree.group.user', icon: 'account' },
  project: { labelKey: 'tree.group.project', icon: 'folder-opened' },
  local: { labelKey: 'tree.layer.local', icon: 'device-desktop' },
};

export class SettingsTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  refresh(): void { this._onDidChange.fire(); }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'profile-group') {
      const label = `${t('tree.providers.label')} · ${node.activeName}`;
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon('rocket');
      item.tooltip = t('providers.statusBar.tooltip');
      item.contextValue = 'profile-group';
      return item;
    }

    if (node.kind === 'profile-subscription') {
      const item = new vscode.TreeItem(
        t('providers.statusBar.subscription'),
        vscode.TreeItemCollapsibleState.None,
      );
      item.id = '__subscription__';
      item.iconPath = new vscode.ThemeIcon(node.active ? 'check' : 'circle-outline');
      item.contextValue = node.active ? 'profile-subscription:active' : 'profile-subscription:inactive';
      return item;
    }

    if (node.kind === 'profile-item') {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
      item.id = node.id;
      item.description = node.profileKind;
      item.iconPath = new vscode.ThemeIcon(node.active ? 'check' : 'circle-outline');
      item.contextValue = node.active ? 'profile:active' : 'profile:inactive';
      return item;
    }

    const meta = LAYER_META[node.layer];
    const item = new vscode.TreeItem(t(meta.labelKey), vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(meta.icon);
    item.tooltip = node.path;
    item.description = node.available ? '' : t('tree.group.noWorkspace');
    if (node.available) {
      item.command = { command: 'claudeCopilot.openSettingsPanel', title: 'Open Settings' };
    }
    item.contextValue = 'settings:layer';
    return item;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (!element) {
      const doc = await readProviders(CLAUDE_HOME);
      const active = doc.profiles.find(p => p.id === doc.active);
      const profileName = active ? active.name : t('providers.statusBar.subscription');
      const ws = currentWorkspace();
      return [
        { kind: 'profile-group', activeName: profileName },
        { kind: 'layer', layer: 'user', path: userSettingsPath(CLAUDE_HOME), available: true },
        { kind: 'layer', layer: 'project', path: ws ? projectSettingsPath(ws.fsPath) : '', available: !!ws },
        { kind: 'layer', layer: 'local', path: ws ? localSettingsPath(ws.fsPath) : '', available: !!ws },
      ];
    }

    if (element.kind === 'profile-group') {
      const doc = await readProviders(CLAUDE_HOME);
      const children: Node[] = [];
      children.push({ kind: 'profile-subscription', active: doc.active === null });
      for (const p of doc.profiles) {
        children.push({ kind: 'profile-item', id: p.id, name: p.name, profileKind: p.kind, active: p.id === doc.active });
      }
      return children;
    }

    return [];
  }
}
