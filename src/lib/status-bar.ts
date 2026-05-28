import * as vscode from 'vscode';
import { readProviders } from '../core/providers';
import { effectiveProfileId } from './provider-apply';
import { CLAUDE_HOME } from './paths';
import { t } from './l10n';

export interface ProviderStatusBar {
  update(): Promise<void>;
  dispose(): void;
}

export function createProviderStatusBar(): ProviderStatusBar {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  item.command = 'claudeCopilot.providers.quickSwitch';
  item.show();

  async function update() {
    try {
      const id = await effectiveProfileId();
      const doc = await readProviders(CLAUDE_HOME);
      const active = doc.profiles.find(p => p.id === id);
      const label = active ? active.name : t('providers.statusBar.subscription');
      item.text = `$(rocket) ${label}`;
      item.tooltip = t('providers.statusBar.tooltip');
    } catch {
      item.text = '$(rocket) —';
    }
  }

  return { update, dispose: () => item.dispose() };
}
