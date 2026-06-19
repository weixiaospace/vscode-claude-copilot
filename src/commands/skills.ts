import * as vscode from 'vscode';
import { skillsDescriptor } from '../core/skills';
import { registerFileResourceCommands } from './file-resource-commands';

export function registerSkillCommands(refresh: () => void): vscode.Disposable[] {
  return registerFileResourceCommands(skillsDescriptor, refresh, {
    namePromptKey: 'prompt.skillName',
    scopePromptKey: 'prompt.skillScope',
    deleteConfirmKey: 'confirm.deleteSkill',
    deleteConfirmBtnKey: 'confirm.deleteSkillBtn',
  });
}
