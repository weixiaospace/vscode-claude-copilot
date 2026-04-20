import * as vscode from 'vscode';
import { createSkill, deleteSkill, type Skill, type SkillScope } from '../core/skills';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';

export function registerSkillCommands(refresh: () => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('claudeCopilot.skill.create', async () => {
      const name = await vscode.window.showInputBox({ prompt: vscode.l10n.t('prompt.skillName') });
      if (!name) return;
      const scope = await vscode.window.showQuickPick(['user', 'project'], { placeHolder: vscode.l10n.t('prompt.skillScope') }) as SkillScope | undefined;
      if (!scope) return;
      let baseDir: string;
      if (scope === 'user') {
        baseDir = CLAUDE_HOME;
      } else {
        const ws = currentWorkspace();
        if (!ws) { vscode.window.showWarningMessage(vscode.l10n.t('toast.noWorkspace')); return; }
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
        vscode.l10n.t('confirm.deleteSkill', s.name), { modal: true }, vscode.l10n.t('confirm.deleteSkillBtn'),
      );
      if (confirm !== vscode.l10n.t('confirm.deleteSkillBtn')) return;
      await deleteSkill(s.path);
      refresh();
    }),
  ];
}
