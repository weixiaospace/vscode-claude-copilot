import * as vscode from 'vscode';
import { agentsDescriptor } from '../core/agents';
import { registerFileResourceCommands } from './file-resource-commands';

export function registerAgentCommands(refresh: () => void): vscode.Disposable[] {
  return registerFileResourceCommands(agentsDescriptor, refresh, {
    namePromptKey: 'prompt.agentName',
    scopePromptKey: 'prompt.agentScope',
    deleteConfirmKey: 'confirm.deleteAgent',
    deleteConfirmBtnKey: 'confirm.deleteAgentBtn',
  });
}
