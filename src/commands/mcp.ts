import * as vscode from 'vscode';
import {
  addUserMcp, removeUserMcp, addProjectMcp, removeProjectMcp,
  type McpServer,
} from '../core/mcp';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

async function promptMcpForm(): Promise<{ name: string; transport: string; urlOrCommand: string } | undefined> {
  const transport = await vscode.window.showQuickPick(['stdio', 'http', 'sse'], { placeHolder: t('prompt.mcpTransport') });
  if (!transport) return;
  const name = await vscode.window.showInputBox({ prompt: t('prompt.mcpServerName') });
  if (!name) return;
  const urlOrCommand = await vscode.window.showInputBox({
    prompt: transport === 'stdio' ? t('prompt.mcpStdioCommand') : t('prompt.mcpUrl'),
  });
  if (!urlOrCommand) return;
  return { name, transport, urlOrCommand };
}

export function registerMcpCommands(refresh: () => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeCopilot.mcp.addUser', async () => {
      const form = await promptMcpForm();
      if (!form) return;
      await addUserMcp(form.name, form.transport, form.urlOrCommand);
      vscode.window.showInformationMessage(t('toast.mcpUserAdded', form.name));
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.mcp.addProject', async () => {
      const ws = currentWorkspace();
      if (!ws) { vscode.window.showWarningMessage(t('toast.noWorkspace')); return; }
      const form = await promptMcpForm();
      if (!form) return;
      await addProjectMcp(ws.fsPath, form.name, form.transport, form.urlOrCommand);
      vscode.window.showInformationMessage(t('toast.mcpProjectAdded', form.name));
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.mcp.remove', async (node: { server: McpServer }) => {
      const s = node?.server;
      if (!s) return;
      const confirm = await vscode.window.showWarningMessage(
        t('confirm.removeMcp', s.name, s.scope), { modal: true }, t('confirm.removeMcpBtn'),
      );
      if (confirm !== t('confirm.removeMcpBtn')) return;
      if (s.scope === 'project') {
        const ws = currentWorkspace();
        if (!ws) return;
        await removeProjectMcp(ws.fsPath, s.name);
      } else {
        await removeUserMcp(s.name);
      }
      refresh();
    }),
  ];
}
