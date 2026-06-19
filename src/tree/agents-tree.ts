import * as vscode from 'vscode';
import { listAgents, type Agent } from '../core/agents';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

type Node =
  | { kind: 'group'; scope: 'user' | 'project'; available: boolean }
  | { kind: 'agent'; agent: Agent };

export class AgentsTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private cache: Agent[] | null = null;
  private inflight: Promise<Agent[]> | null = null;

  refresh(): void {
    this.cache = null;
    this.inflight = null;
    this._onDidChange.fire();
  }

  private async loadAll(): Promise<Agent[]> {
    if (this.cache) return this.cache;
    if (this.inflight) return this.inflight;
    const ws = currentWorkspace();
    this.inflight = listAgents(CLAUDE_HOME, ws ? ws.fsPath : null).then(agents => {
      this.cache = agents;
      this.inflight = null;
      return agents;
    });
    return this.inflight;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const label = t(node.scope === 'user' ? 'tree.group.user' : 'tree.group.project');
      const item = new vscode.TreeItem(label,
        node.available ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(node.scope === 'user' ? 'account' : 'folder-opened');
      item.contextValue = `group:agents:${node.scope}`;
      if (!node.available) item.description = t('tree.group.noWorkspace');
      else item.description = node.scope === 'user' ? '~/.claude/agents' : '.claude/agents';
      return item;
    }
    const a = node.agent;
    const item = new vscode.TreeItem(a.name, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('person');
    const descParts: string[] = [];
    if (a.model) descParts.push(a.model);
    if (a.tools && a.tools.length) descParts.push(t('tree.agent.toolsCount', a.tools.length));
    if (a.color) descParts.push(a.color);
    item.description = descParts.join(' · ');
    const tipLines = [a.description || a.name];
    if (a.model) tipLines.push(`model: ${a.model}`);
    if (a.tools && a.tools.length) tipLines.push(`tools: ${a.tools.join(', ')}`);
    if (a.color) tipLines.push(`color: ${a.color}`);
    tipLines.push(a.path);
    item.tooltip = tipLines.join('\n');
    item.resourceUri = vscode.Uri.file(a.path);
    item.command = { command: 'claudeCopilot.openFile', title: 'Open', arguments: [a.path] };
    item.contextValue = `agent:${a.scope}`;
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      const ws = currentWorkspace();
      this.loadAll().catch(() => {});
      return [
        { kind: 'group', scope: 'user', available: true },
        { kind: 'group', scope: 'project', available: !!ws },
      ];
    }
    if (node.kind !== 'group') return [];
    const ws = currentWorkspace();
    if (node.scope === 'project' && !ws) return [];
    const agents = await this.loadAll();
    return agents.filter(a => a.scope === node.scope).map(a => ({ kind: 'agent', agent: a }) as Node);
  }
}
