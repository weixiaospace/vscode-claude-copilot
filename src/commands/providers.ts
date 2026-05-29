import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import {
  readProviders, writeProviders, providersFilePath,
  type SecretsGateway,
} from '../core/providers';
import { deleteProfile, effectiveProviderInfo } from '../lib/provider-apply';
import { CLAUDE_HOME } from '../lib/paths';
import { t } from '../lib/l10n';

export function registerProviderCommands(secrets: SecretsGateway, onChange: () => void): vscode.Disposable[] {
  const fire = async () => { onChange(); };

  return [
    // Status-bar click: read-only status details (no inline switching — switching
    // lives in the provider manager, since switching only affects the user layer
    // while this shows the effective, possibly project/local-overridden, provider).
    vscode.commands.registerCommand('claudeCopilot.providers.quickSwitch', async () => {
      const doc = await readProviders(CLAUDE_HOME);
      const { id, sourceLayer } = await effectiveProviderInfo();
      const profile = id ? doc.profiles.find(p => p.id === id) : undefined;
      const name = profile ? profile.name : t('providers.statusBar.subscription');
      const detail = profile
        ? profile.kind + (profile.kind === 'anthropic' ? ` · ${profile.authMode}` : '')
        : t('settings.authMode.subscription');
      const sourceText = sourceLayer === 'local' ? t('providers.status.source.local')
        : sourceLayer === 'project' ? t('providers.status.source.project')
        : t('providers.status.source.user');

      type Item = vscode.QuickPickItem & { action?: 'manage' };
      const items: Item[] = [
        { label: `$(rocket) ${name}`, detail },
        { label: `$(layers) ${sourceText}` },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        { label: `$(gear) ${t('providers.openManager')}`, action: 'manage' },
      ];
      const pick = await vscode.window.showQuickPick(items, { title: t('providers.status.title') });
      if (pick?.action === 'manage') {
        await vscode.commands.executeCommand('claudeCopilot.openProviderPanel');
      }
    }),

    vscode.commands.registerCommand('claudeCopilot.providers.delete', async (arg?: { id?: string }) => {
      const doc = await readProviders(CLAUDE_HOME);
      if (!doc.profiles.length) return;
      let id: string | undefined = arg?.id;
      if (!id) {
        const pick = await vscode.window.showQuickPick(
          doc.profiles.map(p => ({ label: p.name, description: p.kind, id: p.id })),
          { title: t('providers.delete.pickTarget') },
        );
        if (!pick) return;
        id = pick.id;
      }
      const target = doc.profiles.find(p => p.id === id);
      if (!target) return;
      const isActive = doc.active === target.id;
      const message = isActive
        ? t('providers.delete.confirmActive', target.name)
        : t('providers.delete.confirm', target.name);
      const confirm = await vscode.window.showWarningMessage(message, { modal: true }, t('providers.delete.confirmBtn'));
      if (confirm !== t('providers.delete.confirmBtn')) return;
      const wasActive = await deleteProfile(target.id, secrets);
      if (wasActive) vscode.window.showInformationMessage(t('providers.deactivatedAfterDelete', target.name));
      await fire();
    }),

    vscode.commands.registerCommand('claudeCopilot.providers.edit', async () => {
      const p = providersFilePath(CLAUDE_HOME);
      try { await fs.access(p); }
      catch { await writeProviders(CLAUDE_HOME, { version: 1, active: null, profiles: [] }); }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
      await vscode.window.showTextDocument(doc);
    }),

  ];
}
