import * as vscode from 'vscode';
import { createMemory, deleteMemory, type Memory } from '../core/memory';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';

export function registerMemoryCommands(refresh: () => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeCopilot.memory.create', async () => {
      const ws = currentWorkspace();
      if (!ws) { vscode.window.showWarningMessage('未打开 workspace'); return; }
      const fileName = await vscode.window.showInputBox({ prompt: '文件名（如 user_role.md）' });
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
        `删除记忆 ${m.fileName}？`, { modal: true }, '删除',
      );
      if (confirm !== '删除') return;
      await deleteMemory(CLAUDE_HOME, ws.fsPath, m.path);
      refresh();
    }),
  ];
}
