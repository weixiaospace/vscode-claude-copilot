import * as vscode from 'vscode';
import { listSkills, type Skill } from '../core/skills';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

type Node =
  | { kind: 'group'; scope: 'user' | 'project'; available: boolean }
  | { kind: 'skill'; skill: Skill };

export class SkillsTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private cache: Skill[] | null = null;
  private inflight: Promise<Skill[]> | null = null;

  refresh(): void {
    this.cache = null;
    this.inflight = null;
    this._onDidChange.fire();
  }

  private async loadAll(): Promise<Skill[]> {
    if (this.cache) return this.cache;
    if (this.inflight) return this.inflight;
    const ws = currentWorkspace();
    this.inflight = listSkills(CLAUDE_HOME, ws ? ws.fsPath : null).then(skills => {
      this.cache = skills;
      this.inflight = null;
      return skills;
    });
    return this.inflight;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const label = t(node.scope === 'user' ? 'tree.group.user' : 'tree.group.project');
      const item = new vscode.TreeItem(label,
        node.available ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(node.scope === 'user' ? 'account' : 'folder-opened');
      item.contextValue = `group:skills:${node.scope}`;
      if (!node.available) item.description = t('tree.group.noWorkspace');
      else item.description = node.scope === 'user' ? '~/.claude/skills' : '.claude/skills';
      return item;
    }
    const s = node.skill;
    const item = new vscode.TreeItem(s.name, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('symbol-event');
    item.tooltip = s.description || s.path;
    item.resourceUri = vscode.Uri.file(s.path);
    item.command = { command: 'claudeCopilot.openFile', title: 'Open', arguments: [s.path] };
    item.contextValue = `skill:${s.scope}`;
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      const ws = currentWorkspace();
      // Prime cache in background so children are instant when group is expanded
      this.loadAll().catch(() => {});
      return [
        { kind: 'group', scope: 'user', available: true },
        { kind: 'group', scope: 'project', available: !!ws },
      ];
    }
    if (node.kind !== 'group') return [];
    const ws = currentWorkspace();
    if (node.scope === 'project' && !ws) return [];
    const skills = await this.loadAll();
    return skills.filter(s => s.scope === node.scope).map(s => ({ kind: 'skill', skill: s }) as Node);
  }
}
