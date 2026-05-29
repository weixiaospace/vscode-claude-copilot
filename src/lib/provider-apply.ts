import * as fs from 'fs/promises';
import * as path from 'path';
import {
  readProviders, writeProviders, secretKey,
  applyProfileToSettings, deactivateFromSettings, matchProfileIdByEnv,
  type SecretsGateway,
} from '../core/providers';
import {
  readUser, readProjectSettings, readLocalSettings,
  userSettingsPath, projectSettingsPath, localSettingsPath,
} from '../core/settings';
import { CLAUDE_HOME } from './paths';
import { currentWorkspace } from './workspace';

export type Layer = 'user' | 'project' | 'local';

async function writeFileJson(p: string, next: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(next, null, 2) + '\n', 'utf-8');
}

function layerPath(layer: Layer): string | null {
  if (layer === 'user') return userSettingsPath(CLAUDE_HOME);
  const ws = currentWorkspace();
  if (!ws) return null;
  return layer === 'project' ? projectSettingsPath(ws.fsPath) : localSettingsPath(ws.fsPath);
}

async function readLayer(layer: Layer): Promise<Record<string, unknown>> {
  if (layer === 'user') return (await readUser(CLAUDE_HOME)) as Record<string, unknown>;
  const ws = currentWorkspace();
  if (!ws) return {};
  return (layer === 'project'
    ? await readProjectSettings(ws.fsPath)
    : await readLocalSettings(ws.fsPath)) as Record<string, unknown>;
}

/** Materialize a profile's env into the given layer's settings file; null strips managed env. */
export async function applyToLayer(layer: Layer, profileId: string | null, secrets: SecretsGateway): Promise<void> {
  const p = layerPath(layer);
  if (!p) return;
  const existing = await readLayer(layer);
  const doc = await readProviders(CLAUDE_HOME);
  const profile = profileId ? doc.profiles.find(x => x.id === profileId) : undefined;
  const next = profile
    ? await applyProfileToSettings(existing, profile, secrets)
    : deactivateFromSettings(existing);
  await writeFileJson(p, next as Record<string, unknown>);
}

/** Activate (baseline): write the user layer + update providers.json.active. */
export async function activateProfile(profileId: string | null, secrets: SecretsGateway): Promise<void> {
  await applyToLayer('user', profileId, secrets);
  const doc = await readProviders(CLAUDE_HOME);
  doc.active = profileId;
  await writeProviders(CLAUDE_HOME, doc);
}

/** Delete a profile: clear its secrets + remove from library; if it was active, null it out and strip the user layer. Returns whether it was the active profile. */
export async function deleteProfile(id: string, secrets: SecretsGateway): Promise<boolean> {
  const doc = await readProviders(CLAUDE_HOME);
  if (!doc.profiles.some(p => p.id === id)) return false;
  for (const field of ['apiKey', 'authToken', 'bedrockToken', 'foundryApiKey']) {
    await secrets.delete(secretKey(id, field));
  }
  doc.profiles = doc.profiles.filter(p => p.id !== id);
  const wasActive = doc.active === id;
  if (wasActive) doc.active = null;
  await writeProviders(CLAUDE_HOME, doc);
  if (wasActive) await applyToLayer('user', null, secrets);
  return wasActive;
}

/** Status bar / sidebar: merge managed env across the three layers and reverse-lookup the effective profile id (falls back to active). */
export async function effectiveProfileId(): Promise<string | null> {
  const doc = await readProviders(CLAUDE_HOME);
  const user = await readLayer('user');
  let env: Record<string, string> = { ...((user.env ?? {}) as Record<string, string>) };
  let helper = (user as any).apiKeyHelper as string | undefined;
  if (currentWorkspace()) {
    const proj = await readLayer('project');
    const local = await readLayer('local');
    env = { ...env, ...((proj.env ?? {}) as Record<string, string>), ...((local.env ?? {}) as Record<string, string>) };
    helper = (local as any).apiKeyHelper ?? (proj as any).apiKeyHelper ?? helper;
  }
  const matched = matchProfileIdByEnv({ env, apiKeyHelper: helper }, doc.profiles);
  return matched ?? doc.active;
}
