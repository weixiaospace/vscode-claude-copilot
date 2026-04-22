import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  readProviders, writeProviders, newId, secretKey, providersFilePath,
  applyProfileToSettings, deactivateFromSettings,
  type Profile, type ProviderKind, type AuthMode, type SecretsGateway,
} from '../core/providers';
import { readUser, userSettingsPath } from '../core/settings';
import { CLAUDE_HOME } from '../lib/paths';
import { t } from '../lib/l10n';

async function writeUserSettings(next: Record<string, unknown>): Promise<void> {
  const p = userSettingsPath(CLAUDE_HOME);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(next, null, 2) + '\n', 'utf-8');
}

async function setActive(id: string | null, secrets: SecretsGateway): Promise<void> {
  const doc = await readProviders(CLAUDE_HOME);
  doc.active = id;
  const user = await readUser(CLAUDE_HOME);
  const next = id
    ? await applyProfileToSettings(user, doc.profiles.find(p => p.id === id)!, secrets)
    : deactivateFromSettings(user);
  await writeUserSettings(next as Record<string, unknown>);
  await writeProviders(CLAUDE_HOME, doc);
}

async function deleteProfile(id: string, secrets: SecretsGateway): Promise<void> {
  const doc = await readProviders(CLAUDE_HOME);
  const target = doc.profiles.find(p => p.id === id);
  if (!target) return;

  for (const field of ['apiKey', 'authToken', 'bedrockToken', 'foundryApiKey']) {
    await secrets.delete(secretKey(id, field));
  }

  doc.profiles = doc.profiles.filter(p => p.id !== id);
  const wasActive = doc.active === id;
  if (wasActive) doc.active = null;
  await writeProviders(CLAUDE_HOME, doc);

  if (wasActive) {
    const user = await readUser(CLAUDE_HOME);
    await writeUserSettings(deactivateFromSettings(user) as Record<string, unknown>);
  }
}

async function promptCreateProfile(secrets: SecretsGateway): Promise<Profile | null> {
  const kindPick = await vscode.window.showQuickPick(
    [
      { label: t('providers.create.kind.anthropic'), value: 'anthropic' as ProviderKind },
      { label: t('providers.create.kind.bedrock'), value: 'bedrock' as ProviderKind },
      { label: t('providers.create.kind.vertex'), value: 'vertex' as ProviderKind },
      { label: t('providers.create.kind.foundry'), value: 'foundry' as ProviderKind },
    ],
    { title: t('providers.create.chooseKind') },
  );
  if (!kindPick) return null;

  const name = await vscode.window.showInputBox({ prompt: t('providers.create.name') });
  if (!name) return null;

  const id = newId();
  const baseUrl = await vscode.window.showInputBox({ prompt: t('providers.create.baseUrl'), value: '' }) ?? '';

  if (kindPick.value === 'anthropic') {
    const modePick = await vscode.window.showQuickPick(
      [
        { label: t('settings.authMode.apiKey'), value: 'apiKey' as AuthMode },
        { label: t('settings.authMode.authToken'), value: 'authToken' as AuthMode },
        { label: t('settings.authMode.helper'), value: 'helper' as AuthMode },
      ],
      { title: t('providers.create.authMode') },
    );
    if (!modePick) return null;

    const p: Profile = { id, name, kind: 'anthropic', authMode: modePick.value, baseUrl: baseUrl || undefined };
    if (modePick.value === 'apiKey') {
      const k = await vscode.window.showInputBox({ prompt: t('providers.create.apiKey'), password: true });
      if (k) { await secrets.set(secretKey(id, 'apiKey'), k); (p as any).hasApiKey = true; }
    } else if (modePick.value === 'authToken') {
      const tok = await vscode.window.showInputBox({ prompt: t('providers.create.authToken'), password: true });
      if (tok) { await secrets.set(secretKey(id, 'authToken'), tok); (p as any).hasAuthToken = true; }
    } else if (modePick.value === 'helper') {
      const h = await vscode.window.showInputBox({ prompt: t('providers.create.apiKeyHelper') });
      if (h) (p as any).apiKeyHelper = h;
    }
    return p;
  }

  if (kindPick.value === 'bedrock') {
    const tok = await vscode.window.showInputBox({ prompt: t('providers.create.bedrockToken'), password: true, value: '' }) ?? '';
    const skipStr = await vscode.window.showInputBox({ prompt: t('providers.create.skipAuth'), value: 'no' }) ?? 'no';
    const p: Profile = { id, name, kind: 'bedrock', baseUrl: baseUrl || undefined, skipAuth: skipStr.toLowerCase().startsWith('y') || undefined };
    if (tok) { await secrets.set(secretKey(id, 'bedrockToken'), tok); p.hasBearerToken = true; }
    return p;
  }

  if (kindPick.value === 'vertex') {
    const project = await vscode.window.showInputBox({ prompt: t('providers.create.vertexProjectId'), value: '' }) ?? '';
    const skipStr = await vscode.window.showInputBox({ prompt: t('providers.create.skipAuth'), value: 'no' }) ?? 'no';
    return { id, name, kind: 'vertex', projectId: project || undefined, baseUrl: baseUrl || undefined, skipAuth: skipStr.toLowerCase().startsWith('y') || undefined };
  }

  // foundry
  const resource = await vscode.window.showInputBox({ prompt: t('providers.create.foundryResource'), value: '' }) ?? '';
  const key = await vscode.window.showInputBox({ prompt: t('providers.create.foundryApiKey'), password: true, value: '' }) ?? '';
  const skipStr = await vscode.window.showInputBox({ prompt: t('providers.create.skipAuth'), value: 'no' }) ?? 'no';
  const p: Profile = { id, name, kind: 'foundry', resource: resource || undefined, baseUrl: baseUrl || undefined, skipAuth: skipStr.toLowerCase().startsWith('y') || undefined };
  if (key) { await secrets.set(secretKey(id, 'foundryApiKey'), key); p.hasApiKey = true; }
  return p;
}

export function registerProviderCommands(secrets: SecretsGateway, onChange: () => void): vscode.Disposable[] {
  const fire = async () => { onChange(); };

  return [
    vscode.commands.registerCommand('claudeCopilot.providers.quickSwitch', async () => {
      const doc = await readProviders(CLAUDE_HOME);
      type Item = vscode.QuickPickItem & { action: 'activate' | 'create' | 'manage'; id?: string };
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
      items.push({ label: t('providers.quickPick.createNew'), action: 'create' });
      if (doc.profiles.length) items.push({ label: t('providers.quickPick.manage'), action: 'manage' });

      const pick = await vscode.window.showQuickPick(items, {
        title: t('providers.quickPick.title'),
        placeHolder: t('providers.quickPick.placeholder'),
      });
      if (!pick) return;

      if (pick.action === 'activate') {
        if (pick.id) {
          await setActive(pick.id, secrets);
          const name = doc.profiles.find(p => p.id === pick.id)?.name ?? '';
          vscode.window.showInformationMessage(t('providers.activated', name));
        } else {
          await setActive(null, secrets);
          vscode.window.showInformationMessage(t('providers.deactivated'));
        }
        await fire();
      } else if (pick.action === 'create') {
        await vscode.commands.executeCommand('claudeCopilot.providers.create');
      } else if (pick.action === 'manage') {
        await vscode.commands.executeCommand('claudeCopilot.providers.edit');
      }
    }),

    vscode.commands.registerCommand('claudeCopilot.providers.create', async () => {
      const profile = await promptCreateProfile(secrets);
      if (!profile) return;
      const doc = await readProviders(CLAUDE_HOME);
      doc.profiles.push(profile);
      if (!doc.active) doc.active = profile.id;
      await writeProviders(CLAUDE_HOME, doc);
      if (doc.active === profile.id) await setActive(profile.id, secrets);
      await fire();
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
      await setActive(id, secrets);
      await fire();
    }),
  ];
}
