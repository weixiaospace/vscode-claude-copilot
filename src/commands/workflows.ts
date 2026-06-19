import * as vscode from 'vscode';
import { workflowsDescriptor } from '../core/workflows';
import { registerFileResourceCommands } from './file-resource-commands';

export function registerWorkflowCommands(refresh: () => void): vscode.Disposable[] {
  return registerFileResourceCommands(workflowsDescriptor, refresh, {
    namePromptKey: 'prompt.workflowName',
    scopePromptKey: 'prompt.workflowScope',
    deleteConfirmKey: 'confirm.deleteWorkflow',
    deleteConfirmBtnKey: 'confirm.deleteWorkflowBtn',
  });
}
