import * as vscode from 'vscode';
import { createSkill, deleteSkill, type Skill, type SkillScope } from '../core/skills';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';

export function registerSkillCommands(refresh: () => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeCopilot.skill.create', async () => {
      const name = await vscode.window.showInputBox({ prompt: 'Skill 名称（kebab-case）' });
      if (!name) return;
      const scope = await vscode.window.showQuickPick(['user', 'project'], { placeHolder: '选择 scope' }) as SkillScope | undefined;
      if (!scope) return;
      let baseDir: string;
      if (scope === 'user') {
        baseDir = CLAUDE_HOME;
      } else {
        const ws = currentWorkspace();
        if (!ws) { vscode.window.showWarningMessage('未打开 workspace'); return; }
        baseDir = ws.fsPath;
      }
      const filePath = await createSkill(baseDir, scope, name);
      refresh();
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('claudeCopilot.skill.delete', async (node: { skill: Skill }) => {
      const s = node?.skill;
      if (!s) return;
      const confirm = await vscode.window.showWarningMessage(
        `删除 skill ${s.name}？这将移除整个目录。`, { modal: true }, '删除',
      );
      if (confirm !== '删除') return;
      await deleteSkill(s.path);
      refresh();
    }),
  ];
}
