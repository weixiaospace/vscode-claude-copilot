import * as vscode from 'vscode';
import {
  listResource,
  type FileResourceDescriptor,
  type FileResourceItem,
  type Scope,
} from '../core/file-resource';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

type TFn = (key: string, ...args: (string | number)[]) => string;

export interface FileResourceTreeAdornment<T extends FileResourceItem> {
  icon: string;
  userDirLabel: string;
  projectDirLabel: string;
  display?(item: T, t: TFn): string[];
  tooltip?(item: T, t: TFn): string[];
}

export type FileResourceNode<T extends FileResourceItem> =
  | { kind: 'group'; scope: Scope; available: boolean }
  | { kind: 'item'; item: T };

export class FileResourceTreeProvider<T extends FileResourceItem>
  implements vscode.TreeDataProvider<FileResourceNode<T>> {
  protected _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  protected cache: T[] | null = null;
  protected inflight: Promise<T[]> | null = null;

  constructor(
    protected readonly desc: FileResourceDescriptor<T>,
    protected readonly adornment: FileResourceTreeAdornment<T>,
  ) {}

  refresh(): void {
    this.cache = null;
    this.inflight = null;
    this._onDidChange.fire();
  }

  protected async loadAll(): Promise<T[]> {
    if (this.cache) return this.cache;
    if (this.inflight) return this.inflight;
    const ws = currentWorkspace();
    this.inflight = listResource(this.desc, CLAUDE_HOME, ws ? ws.fsPath : null).then(items => {
      this.cache = items;
      this.inflight = null;
      return items;
    });
    return this.inflight;
  }

  getTreeItem(node: FileResourceNode<T>): vscode.TreeItem {
    if (node.kind === 'group') {
      const label = t(node.scope === 'user' ? 'tree.group.user' : 'tree.group.project');
      const item = new vscode.TreeItem(label,
        node.available
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(node.scope === 'user' ? 'account' : 'folder-opened');
      item.contextValue = `group:${this.desc.kind}s:${node.scope}`;
      if (!node.available) item.description = t('tree.group.noWorkspace');
      else item.description = node.scope === 'user' ? this.adornment.userDirLabel : this.adornment.projectDirLabel;
      return item;
    }
    const it = node.item;
    const item = new vscode.TreeItem(it.name, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(this.adornment.icon);
    const parts = this.adornment.display?.(it, t) ?? [];
    if (parts.length) item.description = parts.join(' · ');
    const tipLines = this.adornment.tooltip?.(it, t) ?? [it.description || it.path];
    item.tooltip = tipLines.join('\n');
    item.resourceUri = vscode.Uri.file(it.path);
    item.command = { command: 'claudeCopilot.openFile', title: 'Open', arguments: [it.path] };
    item.contextValue = `${this.desc.kind}:${it.scope}`;
    return item;
  }

  async getChildren(node?: FileResourceNode<T>): Promise<FileResourceNode<T>[]> {
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
    const items = await this.loadAll();
    return items.filter(it => it.scope === node.scope).map(it => ({ kind: 'item', item: it }));
  }
}
