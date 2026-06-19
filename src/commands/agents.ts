import * as vscode from 'vscode';
import { createAgent, deleteAgent, type Agent, type AgentScope } from '../core/agents';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

export function registerAgentCommands(refresh: () => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeCopilot.agent.create', async () => {
      const name = await vscode.window.showInputBox({ prompt: t('prompt.agentName') });
      if (!name) return;
      const scope = await vscode.window.showQuickPick(['user', 'project'], { placeHolder: t('prompt.agentScope') }) as AgentScope | undefined;
      if (!scope) return;
      let baseDir: string;
      if (scope === 'user') {
        baseDir = CLAUDE_HOME;
      } else {
        const ws = currentWorkspace();
        if (!ws) { vscode.window.showWarningMessage(t('toast.noWorkspace')); return; }
        baseDir = ws.fsPath;
      }
      const filePath = await createAgent(baseDir, scope, name);
      refresh();
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('claudeCopilot.agent.delete', async (node: { agent: Agent }) => {
      const a = node?.agent;
      if (!a) return;
      const confirm = await vscode.window.showWarningMessage(
        t('confirm.deleteAgent', a.name), { modal: true }, t('confirm.deleteAgentBtn'),
      );
      if (confirm !== t('confirm.deleteAgentBtn')) return;
      await deleteAgent(a.path);
      refresh();
    }),
  ];
}
