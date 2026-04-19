import * as vscode from 'vscode';
import {
  addUserMcp, removeUserMcp, addProjectMcp, removeProjectMcp,
  type McpServer,
} from '../core/mcp';
import { currentWorkspace } from '../lib/workspace';

async function promptMcpForm(): Promise<{ name: string; transport: string; urlOrCommand: string } | undefined> {
  const transport = await vscode.window.showQuickPick(['stdio', 'http', 'sse'], { placeHolder: '选择 transport' });
  if (!transport) return;
  const name = await vscode.window.showInputBox({ prompt: 'Server 名称' });
  if (!name) return;
  const urlOrCommand = await vscode.window.showInputBox({
    prompt: transport === 'stdio' ? '执行命令（如 node /path/server.js）' : 'URL',
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
      vscode.window.showInformationMessage(`已添加 user MCP server: ${form.name}`);
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.mcp.addProject', async () => {
      const ws = currentWorkspace();
      if (!ws) { vscode.window.showWarningMessage('未打开 workspace'); return; }
      const form = await promptMcpForm();
      if (!form) return;
      await addProjectMcp(ws.fsPath, form.name, form.transport, form.urlOrCommand);
      vscode.window.showInformationMessage(`已添加 project MCP server: ${form.name}`);
      refresh();
    }),

    vscode.commands.registerCommand('claudeCopilot.mcp.remove', async (node: { server: McpServer }) => {
      const s = node?.server;
      if (!s) return;
      const confirm = await vscode.window.showWarningMessage(
        `移除 MCP server ${s.name} (${s.scope})？`, { modal: true }, '移除',
      );
      if (confirm !== '移除') return;
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
