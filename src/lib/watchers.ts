import * as vscode from 'vscode';
import { CLAUDE_HOME } from './paths';
import { currentWorkspace } from './workspace';

export interface RefreshHandlers {
  plugins(): void;
  mcp(): void;
  skills(): void;
  memory(): void;
  settings(): void;
}

function watch(pattern: vscode.GlobPattern, cb: () => void): vscode.Disposable {
  const w = vscode.workspace.createFileSystemWatcher(pattern);
  w.onDidChange(cb); w.onDidCreate(cb); w.onDidDelete(cb);
  return w;
}

export function registerWatchers(handlers: RefreshHandlers): vscode.Disposable[] {
  const out: vscode.Disposable[] = [];

  // User-level (~/.claude/...)
  out.push(watch(new vscode.RelativePattern(CLAUDE_HOME, 'plugins/**'), handlers.plugins));
  out.push(watch(new vscode.RelativePattern(CLAUDE_HOME, 'settings.json'), () => { handlers.plugins(); handlers.settings(); }));
  out.push(watch(new vscode.RelativePattern(CLAUDE_HOME, 'skills/**/SKILL.md'), handlers.skills));
  out.push(watch(new vscode.RelativePattern(CLAUDE_HOME, 'projects/**/memory/*.md'), handlers.memory));

  // Project-level
  const ws = currentWorkspace();
  if (ws) {
    out.push(watch(new vscode.RelativePattern(ws.fsPath, '.claude/settings.json'), () => { handlers.settings(); handlers.mcp(); }));
    out.push(watch(new vscode.RelativePattern(ws.fsPath, '.claude/settings.local.json'), handlers.settings));
    out.push(watch(new vscode.RelativePattern(ws.fsPath, '.claude/skills/**/SKILL.md'), handlers.skills));
  }

  return out;
}
