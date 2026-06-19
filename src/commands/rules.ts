import * as vscode from 'vscode';
import { rulesDescriptor } from '../core/rules';
import { registerFileResourceCommands } from './file-resource-commands';

export function registerRuleCommands(refresh: () => void): vscode.Disposable[] {
  return registerFileResourceCommands(rulesDescriptor, refresh, {
    namePromptKey: 'prompt.ruleName',
    scopePromptKey: 'prompt.ruleScope',
    deleteConfirmKey: 'confirm.deleteRule',
    deleteConfirmBtnKey: 'confirm.deleteRuleBtn',
  });
}
