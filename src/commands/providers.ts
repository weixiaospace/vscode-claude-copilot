import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import {
  readProviders, writeProviders, providersFilePath,
  type SecretsGateway,
} from '../core/providers';
import { activateProfile, deleteProfile } from '../lib/provider-apply';
import { CLAUDE_HOME } from '../lib/paths';
import { t } from '../lib/l10n';

export function registerProviderCommands(secrets: SecretsGateway, onChange: () => void): vscode.Disposable[] {
  const fire = async () => { onChange(); };

  return [
    vscode.commands.registerCommand('claudeCopilot.providers.quickSwitch', async () => {
      const doc = await readProviders(CLAUDE_HOME);
      type Item = vscode.QuickPickItem & { action: 'activate' | 'manage'; id?: string };
      const items: Item[] = [];
      for (const p of doc.profiles) {
        const active = p.id === doc.active;
        items.push({
          label: `${active ? '$(check) ' : '    '}${p.name}`,
          description: active ? t('providers.quickPick.active') : undefined,
          detail: p.kind + (p.kind === 'anthropic' ? ` · ${p.authMode}` : ''),
          action: 'activate', id: p.id,
        });
      }
      const isSubscription = doc.active === null;
      items.push({
        label: `${isSubscription ? '$(check) ' : '    '}${t('providers.statusBar.subscription')}`,
        description: isSubscription ? t('providers.quickPick.active') : undefined,
        detail: t('settings.authMode.subscription'),
        action: 'activate',
      });
      if (doc.profiles.length) items.push({ label: t('providers.quickPick.manage'), action: 'manage' });

      const pick = await vscode.window.showQuickPick(items, {
        title: t('providers.quickPick.title'),
        placeHolder: t('providers.quickPick.placeholder'),
      });
      if (!pick) return;

      if (pick.action === 'activate') {
        if (pick.id) {
          await activateProfile(pick.id, secrets);
          const name = doc.profiles.find(p => p.id === pick.id)?.name ?? '';
          vscode.window.showInformationMessage(t('providers.activated', name));
        } else {
          await activateProfile(null, secrets);
          vscode.window.showInformationMessage(t('providers.deactivated'));
        }
        await fire();
      } else if (pick.action === 'manage') {
        await vscode.commands.executeCommand('claudeCopilot.openProviderPanel');
      }
    }),

    vscode.commands.registerCommand('claudeCopilot.providers.create', async () => {
      await vscode.commands.executeCommand('claudeCopilot.openProviderPanel');
    }),

    vscode.commands.registerCommand('claudeCopilot.providers.delete', async (arg?: { id?: string }) => {
      let id: string | undefined = arg?.id;
      if (!id) {
        const doc = await readProviders(CLAUDE_HOME);
        if (!doc.profiles.length) return;
        const pick = await vscode.window.showQuickPick(
          doc.profiles.map(p => ({ label: p.name, description: p.kind, id: p.id })),
          { title: t('providers.delete.pickTarget') },
        );
        if (!pick) return;
        id = pick.id;
      }
      const doc = await readProviders(CLAUDE_HOME);
      const target = doc.profiles.find(p => p.id === id);
      if (!target) return;
      const confirm = await vscode.window.showWarningMessage(
        t('providers.delete.confirm', target.name),
        { modal: true },
        t('providers.delete.confirmBtn'),
      );
      if (confirm !== t('providers.delete.confirmBtn')) return;
      await deleteProfile(target.id, secrets);
      await fire();
    }),

    vscode.commands.registerCommand('claudeCopilot.providers.edit', async (arg?: { id?: string }) => {
      const p = providersFilePath(CLAUDE_HOME);
      try { await fs.access(p); }
      catch { await writeProviders(CLAUDE_HOME, { version: 1, active: null, profiles: [] }); }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('claudeCopilot.providers.activateById', async (arg?: { id?: string | null }) => {
      let id: string | null = null;
      if (arg && typeof arg === 'object') {
        if (arg.id === '__subscription__') id = null;
        else if (typeof arg.id === 'string') id = arg.id;
        else if (arg.id === null) id = null;
      }
      await activateProfile(id, secrets);
      await fire();
    }),
  ];
}
