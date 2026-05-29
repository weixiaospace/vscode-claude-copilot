import * as vscode from 'vscode';
import { userSettingsPath, projectSettingsPath, localSettingsPath, readUser, readProjectSettings, readLocalSettings } from '../core/settings';
import { readProviders, matchProfileIdByEnv } from '../core/providers';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

type Layer = 'user' | 'project' | 'local';
type Node =
  | { kind: 'layer'; layer: Layer; path: string; available: boolean; profileName: string }
  | { kind: 'profile-group' };

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
      const item = new vscode.TreeItem(t('tree.providers.label'), vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('rocket');
      item.tooltip = t('providers.openManager');
      item.contextValue = 'profile-group';
      item.command = { command: 'claudeCopilot.openProviderPanel', title: 'Manage providers' };
      return item;
    }

    const meta = LAYER_META[node.layer];
    const label = node.available ? `${t(meta.labelKey)} · ${node.profileName}` : t(meta.labelKey);
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(meta.icon);
    item.tooltip = node.path;
    item.description = node.available ? '' : t('tree.group.noWorkspace');
    if (node.available) {
      item.command = { command: 'claudeCopilot.openSettingsPanel', title: 'Open Settings', arguments: [node.layer] };
    }
    item.contextValue = 'settings:layer';
    return item;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (!element) {
      const ws = currentWorkspace();
      const doc = await readProviders(CLAUDE_HOME);
      const user = await readUser(CLAUDE_HOME);
      const proj = ws ? await readProjectSettings(ws.fsPath) : {};
      const local = ws ? await readLocalSettings(ws.fsPath) : {};

      function nameFor(settings: Record<string, unknown>): string {
        const id = matchProfileIdByEnv(settings, doc.profiles);
        if (id) {
          const p = doc.profiles.find(x => x.id === id);
          return p ? p.name : t('providers.statusBar.subscription');
        }
        return t('providers.statusBar.subscription');
      }

      return [
        { kind: 'profile-group' },
        { kind: 'layer', layer: 'user', path: userSettingsPath(CLAUDE_HOME), available: true, profileName: nameFor(user) },
        { kind: 'layer', layer: 'project', path: ws ? projectSettingsPath(ws.fsPath) : '', available: !!ws, profileName: ws ? nameFor(proj) : '—' },
        { kind: 'layer', layer: 'local', path: ws ? localSettingsPath(ws.fsPath) : '', available: !!ws, profileName: ws ? nameFor(local) : '—' },
      ];
    }
    return [];
  }
}
