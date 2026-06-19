import * as vscode from 'vscode';
import {
  createResource,
  deleteResource,
  type FileResourceDescriptor,
  type FileResourceItem,
  type Scope,
} from '../core/file-resource';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

export interface FileResourceCommandLabels {
  namePromptKey: string;
  scopePromptKey: string;
  deleteConfirmKey: string;
  deleteConfirmBtnKey: string;
}

export function registerFileResourceCommands<T extends FileResourceItem>(
  desc: FileResourceDescriptor<T>,
  refresh: () => void,
  labels: FileResourceCommandLabels,
): vscode.Disposable[] {
  const cmdCreate = `claudeCopilot.${desc.kind}.create`;
  const cmdDelete = `claudeCopilot.${desc.kind}.delete`;

  return [
    vscode.commands.registerCommand(cmdCreate, async () => {
      const name = await vscode.window.showInputBox({ prompt: t(labels.namePromptKey) });
      if (!name) return;
      const scope = await vscode.window.showQuickPick(['user', 'project'], {
        placeHolder: t(labels.scopePromptKey),
      }) as Scope | undefined;
      if (!scope) return;

      let baseDir: string;
      if (scope === 'user') {
        baseDir = CLAUDE_HOME;
      } else {
        const ws = currentWorkspace();
        if (!ws) { vscode.window.showWarningMessage(t('toast.noWorkspace')); return; }
        baseDir = ws.fsPath;
      }

      const filePath = await createResource(desc, baseDir, scope, name);
      refresh();
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand(cmdDelete, async (node: { item?: T }) => {
      const item = node?.item;
      if (!item) return;
      const btn = t(labels.deleteConfirmBtnKey);
      const confirm = await vscode.window.showWarningMessage(
        t(labels.deleteConfirmKey, item.name), { modal: true }, btn,
      );
      if (confirm !== btn) return;
      await deleteResource(desc, item.path);
      refresh();
    }),
  ];
}
