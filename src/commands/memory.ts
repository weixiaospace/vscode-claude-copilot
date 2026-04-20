import * as vscode from 'vscode';
import { createMemory, deleteMemory, type Memory } from '../core/memory';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';

export function registerMemoryCommands(refresh: () => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeCopilot.memory.create', async () => {
      const ws = currentWorkspace();
      if (!ws) { vscode.window.showWarningMessage(vscode.l10n.t('toast.noWorkspace')); return; }
      const fileName = await vscode.window.showInputBox({ prompt: vscode.l10n.t('prompt.memoryFileName') });
      if (!fileName) return;
      const filePath = await createMemory(CLAUDE_HOME, ws.fsPath, fileName);
      refresh();
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('claudeCopilot.memory.delete', async (node: { memory: Memory }) => {
      const ws = currentWorkspace();
      const m = node?.memory;
      if (!ws || !m) return;
      const confirm = await vscode.window.showWarningMessage(
        vscode.l10n.t('confirm.deleteMemory', m.fileName), { modal: true }, vscode.l10n.t('confirm.deleteMemoryBtn'),
      );
      if (confirm !== vscode.l10n.t('confirm.deleteMemoryBtn')) return;
      await deleteMemory(CLAUDE_HOME, ws.fsPath, m.path);
      refresh();
    }),
  ];
}
