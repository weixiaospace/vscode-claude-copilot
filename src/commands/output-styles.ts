import * as vscode from 'vscode';
import {
  outputStylesDescriptor,
  listOutputStyles,
  writeActiveOutputStyle,
  type OutputStyle,
} from '../core/output-styles';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';
import { registerFileResourceCommands } from './file-resource-commands';

export function registerOutputStyleCommands(refresh: () => void): vscode.Disposable[] {
  const base = registerFileResourceCommands(outputStylesDescriptor, refresh, {
    namePromptKey: 'prompt.outputStyleName',
    scopePromptKey: 'prompt.outputStyleScope',
    deleteConfirmKey: 'confirm.deleteOutputStyle',
    deleteConfirmBtnKey: 'confirm.deleteOutputStyleBtn',
  });

  const setActive = vscode.commands.registerCommand(
    'claudeCopilot.outputStyle.setActive',
    async (node?: { item?: OutputStyle }) => {
      const ws = currentWorkspace();
      if (!ws) { vscode.window.showWarningMessage(t('toast.noWorkspace')); return; }

      let name = node?.item?.name;
      if (!name) {
        const items = await listOutputStyles(CLAUDE_HOME, ws.fsPath);
        if (!items.length) {
          vscode.window.showInformationMessage(t('toast.outputStyleNoneAvailable'));
          return;
        }
        const picked = await vscode.window.showQuickPick(
          items.map(s => ({ label: s.name, description: s.scope, detail: s.description })),
          { placeHolder: t('prompt.outputStylePickActive') },
        );
        if (!picked) return;
        name = picked.label;
      }

      await writeActiveOutputStyle(ws.fsPath, name);
      vscode.window.showInformationMessage(t('toast.outputStyleActivated', name));
      refresh();
    },
  );

  return [...base, setActive];
}
