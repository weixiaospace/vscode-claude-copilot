import * as vscode from 'vscode';
import {
  outputStylesDescriptor,
  readActiveOutputStyle,
  type OutputStyle,
} from '../core/output-styles';
import { listResource } from '../core/file-resource';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';
import { FileResourceTreeProvider, type FileResourceNode } from './file-resource-tree';

export class OutputStylesTreeProvider extends FileResourceTreeProvider<OutputStyle> {
  private activeName: string | null = null;

  constructor() {
    super(outputStylesDescriptor, {
      icon: 'paintcan',
      userDirLabel: '~/.claude/output-styles',
      projectDirLabel: '.claude/output-styles',
      tooltip: s => [s.description || s.name, s.path],
    });
  }

  // Override to load items + active selection in one tick. Calling super.loadAll()
  // would deadlock because it would re-enter via the shared `inflight` field.
  protected async loadAll(): Promise<OutputStyle[]> {
    if (this.cache) return this.cache;
    if (this.inflight) return this.inflight;
    const ws = currentWorkspace();
    this.inflight = (async () => {
      const [items, active] = await Promise.all([
        listResource(outputStylesDescriptor, CLAUDE_HOME, ws ? ws.fsPath : null),
        ws ? readActiveOutputStyle(ws.fsPath) : Promise.resolve(null),
      ]);
      this.cache = items;
      this.inflight = null;
      this.activeName = active;
      return items;
    })();
    return this.inflight;
  }

  getTreeItem(node: FileResourceNode<OutputStyle>): vscode.TreeItem {
    const item = super.getTreeItem(node);
    if (node.kind === 'item' && this.activeName && node.item.name === this.activeName) {
      const activeChip = t('tree.outputStyle.active');
      item.description = item.description ? `${activeChip} · ${item.description}` : activeChip;
      item.iconPath = new vscode.ThemeIcon('star-full');
    }
    return item;
  }
}
