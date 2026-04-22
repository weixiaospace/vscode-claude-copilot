import * as fs from 'fs/promises';
import * as path from 'path';

export type ProviderKind = 'anthropic' | 'bedrock' | 'vertex' | 'foundry';
export type AuthMode = 'subscription' | 'apiKey' | 'authToken' | 'helper';

export interface BaseProfile { id: string; name: string; kind: ProviderKind }
export interface AnthropicProfile extends BaseProfile {
  kind: 'anthropic';
  authMode: AuthMode;
  baseUrl?: string;
  hasApiKey?: boolean;
  hasAuthToken?: boolean;
  apiKeyHelper?: string;
}
export interface BedrockProfile extends BaseProfile {
  kind: 'bedrock';
  baseUrl?: string;
  hasBearerToken?: boolean;
  skipAuth?: boolean;
}
export interface VertexProfile extends BaseProfile {
  kind: 'vertex';
  projectId?: string;
  baseUrl?: string;
  skipAuth?: boolean;
}
export interface FoundryProfile extends BaseProfile {
  kind: 'foundry';
  hasApiKey?: boolean;
  resource?: string;
  baseUrl?: string;
  skipAuth?: boolean;
}
export type Profile = AnthropicProfile | BedrockProfile | VertexProfile | FoundryProfile;

export interface ProvidersFile {
  version: 1;
  active: string | null;
  profiles: Profile[];
}

export interface SecretsGateway {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const PROVIDER_MANAGED_ENV_KEYS = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK', 'AWS_BEARER_TOKEN_BEDROCK', 'ANTHROPIC_BEDROCK_BASE_URL', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
  'CLAUDE_CODE_USE_VERTEX', 'ANTHROPIC_VERTEX_PROJECT_ID', 'ANTHROPIC_VERTEX_BASE_URL', 'CLAUDE_CODE_SKIP_VERTEX_AUTH',
  'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_FOUNDRY_RESOURCE', 'ANTHROPIC_FOUNDRY_BASE_URL', 'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
] as const;

export const PROVIDER_MANAGED_SETTINGS_KEYS = ['apiKeyHelper'] as const;

const EMPTY: ProvidersFile = { version: 1, active: null, profiles: [] };

export function providersFilePath(home: string): string {
  return path.join(home, 'claude-copilot', 'providers.json');
}

export async function readProviders(home: string): Promise<ProvidersFile> {
  const p = providersFilePath(home);
  try {
    const raw = JSON.parse(await fs.readFile(p, 'utf-8'));
    return {
      version: 1,
      active: typeof raw.active === 'string' ? raw.active : null,
      profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
    };
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { ...EMPTY };
    throw err;
  }
}

export async function writeProviders(home: string, doc: ProvidersFile): Promise<void> {
  const p = providersFilePath(home);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}

export function secretKey(profileId: string, field: string): string {
  return `claude-copilot.provider.${profileId}.${field}`;
}

export interface ProfilePartial {
  env: Record<string, string>;
  apiKeyHelper?: string;
}

export async function profileToPartial(profile: Profile, secrets: SecretsGateway): Promise<ProfilePartial> {
  const env: Record<string, string> = {};
  let apiKeyHelper: string | undefined;

  if (profile.kind === 'anthropic') {
    if (profile.baseUrl) env.ANTHROPIC_BASE_URL = profile.baseUrl;
    if (profile.authMode === 'apiKey' && profile.hasApiKey) {
      const v = await secrets.get(secretKey(profile.id, 'apiKey'));
      if (v) env.ANTHROPIC_API_KEY = v;
    } else if (profile.authMode === 'authToken' && profile.hasAuthToken) {
      const v = await secrets.get(secretKey(profile.id, 'authToken'));
      if (v) env.ANTHROPIC_AUTH_TOKEN = v;
    } else if (profile.authMode === 'helper' && profile.apiKeyHelper) {
      apiKeyHelper = profile.apiKeyHelper;
    }
  } else if (profile.kind === 'bedrock') {
    env.CLAUDE_CODE_USE_BEDROCK = '1';
    if (profile.baseUrl) env.ANTHROPIC_BEDROCK_BASE_URL = profile.baseUrl;
    if (profile.skipAuth) env.CLAUDE_CODE_SKIP_BEDROCK_AUTH = '1';
    if (profile.hasBearerToken) {
      const v = await secrets.get(secretKey(profile.id, 'bedrockToken'));
      if (v) env.AWS_BEARER_TOKEN_BEDROCK = v;
    }
  } else if (profile.kind === 'vertex') {
    env.CLAUDE_CODE_USE_VERTEX = '1';
    if (profile.projectId) env.ANTHROPIC_VERTEX_PROJECT_ID = profile.projectId;
    if (profile.baseUrl) env.ANTHROPIC_VERTEX_BASE_URL = profile.baseUrl;
    if (profile.skipAuth) env.CLAUDE_CODE_SKIP_VERTEX_AUTH = '1';
  } else if (profile.kind === 'foundry') {
    env.CLAUDE_CODE_USE_FOUNDRY = '1';
    if (profile.resource) env.ANTHROPIC_FOUNDRY_RESOURCE = profile.resource;
    if (profile.baseUrl) env.ANTHROPIC_FOUNDRY_BASE_URL = profile.baseUrl;
    if (profile.skipAuth) env.CLAUDE_CODE_SKIP_FOUNDRY_AUTH = '1';
    if (profile.hasApiKey) {
      const v = await secrets.get(secretKey(profile.id, 'foundryApiKey'));
      if (v) env.ANTHROPIC_FOUNDRY_API_KEY = v;
    }
  }

  return { env, apiKeyHelper };
}
