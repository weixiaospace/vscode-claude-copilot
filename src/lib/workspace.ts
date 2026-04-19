import * as vscode from 'vscode';

export function currentWorkspace(): { fsPath: string; name: string } | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  const f = folders[0]!;
  return { fsPath: f.uri.fsPath, name: f.name };
}
