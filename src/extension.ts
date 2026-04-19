import * as vscode from 'vscode';
import { HelloTreeProvider } from './tree/hello-tree';

export function activate(context: vscode.ExtensionContext): void {
  const helloProvider = new HelloTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claudeCopilot.hello', helloProvider),
    vscode.commands.registerCommand('claudeCopilot.refresh', () => {
      vscode.window.showInformationMessage('Claude Copilot: refresh stub');
    }),
  );
}

export function deactivate(): void {}
