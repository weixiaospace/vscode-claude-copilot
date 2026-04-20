import * as vscode from 'vscode';
import { userSettingsPath, projectSettingsPath, localSettingsPath } from '../core/settings';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';

type Layer = 'user' | 'project' | 'local';
type Node = { kind: 'layer'; layer: Layer; path: string; available: boolean };

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
    const meta = LAYER_META[node.layer];
    const item = new vscode.TreeItem(vscode.l10n.t(meta.labelKey), vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(meta.icon);
    item.tooltip = node.path;
    item.description = node.available ? '' : vscode.l10n.t('tree.group.noWorkspace');
    if (node.available) {
      item.command = { command: 'claudeCopilot.openSettingsPanel', title: 'Open Settings' };
    }
    item.contextValue = 'settings:layer';
    return item;
  }

  async getChildren(): Promise<Node[]> {
    const ws = currentWorkspace();
    return [
      { kind: 'layer', layer: 'user', path: userSettingsPath(CLAUDE_HOME), available: true },
      { kind: 'layer', layer: 'project', path: ws ? projectSettingsPath(ws.fsPath) : '', available: !!ws },
      { kind: 'layer', layer: 'local', path: ws ? localSettingsPath(ws.fsPath) : '', available: !!ws },
    ];
  }
}
