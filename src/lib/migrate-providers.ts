import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import {
  readProviders, writeProviders, providersFilePath,
  detectLegacyProfile, secretKey,
  type SecretsGateway, type Profile,
} from '../core/providers';
import { readUser } from '../core/settings';
import { CLAUDE_HOME } from './paths';
import { t } from './l10n';

export async function migrateProvidersOnce(secrets: SecretsGateway): Promise<boolean> {
  try { await fs.access(providersFilePath(CLAUDE_HOME)); return false; } catch { /* not found → proceed */ }

  const user = await readUser(CLAUDE_HOME);
  const legacy = detectLegacyProfile(user);

  if (!legacy) {
    await writeProviders(CLAUDE_HOME, { version: 1, active: null, profiles: [] });
    return false;
  }

  const env = (user.env ?? {}) as Record<string, string>;
  if (legacy.kind === 'anthropic') {
    if (legacy.authMode === 'apiKey' && env.ANTHROPIC_API_KEY) {
      await secrets.set(secretKey(legacy.id, 'apiKey'), env.ANTHROPIC_API_KEY);
    } else if (legacy.authMode === 'authToken' && env.ANTHROPIC_AUTH_TOKEN) {
      await secrets.set(secretKey(legacy.id, 'authToken'), env.ANTHROPIC_AUTH_TOKEN);
    }
  } else if (legacy.kind === 'bedrock' && env.AWS_BEARER_TOKEN_BEDROCK) {
    await secrets.set(secretKey(legacy.id, 'bedrockToken'), env.AWS_BEARER_TOKEN_BEDROCK);
  } else if (legacy.kind === 'foundry' && env.ANTHROPIC_FOUNDRY_API_KEY) {
    await secrets.set(secretKey(legacy.id, 'foundryApiKey'), env.ANTHROPIC_FOUNDRY_API_KEY);
  }

  await writeProviders(CLAUDE_HOME, { version: 1, active: legacy.id, profiles: [legacy as Profile] });
  vscode.window.showInformationMessage(t('providers.migrated'));
  return true;
}
