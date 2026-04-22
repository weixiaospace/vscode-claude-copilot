# Provider Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save multiple Anthropic-compatible (and Bedrock/Vertex/Foundry) provider configs as named profiles, switch between them with one click from three entry points (status bar, Settings TreeView, Settings WebView top), and keep credentials in VSCode SecretStorage instead of plain `settings.json`.

**Architecture:** A new `core/providers.ts` layer owns a single `~/.claude/claude-copilot/providers.json` file (profile list + active id; no secrets). Credentials live in VSCode SecretStorage referenced by stable UUID keys. Activating a profile computes a partial `{ env, apiKeyHelper }` and uses the existing `mergeForSave` with a fixed `PROVIDER_MANAGED_ENV_KEYS` list to cleanly replace only provider env keys in user `settings.json`. Deactivation/deletion applies an empty partial → those keys are wiped → falls back to subscription mode. A first-run migration converts existing provider env in `settings.json` into a "Default" profile so upgrading users are not left in an ambiguous state.

**Tech Stack:** TypeScript 5 · Node 18 CJS · VSCode API `^1.90.0` (`createStatusBarItem`, `ExtensionContext.secrets`, `QuickPick`) · Mocha + `assert` (real fs via `mkdtemp`, no mocks) · vanilla TS WebView extensions on existing settings form.

---

## File Structure

**New files:**
- `src/core/providers.ts` — pure logic: types, read/write `providers.json`, `profileToPartial`, `detectLegacyProfile`, constants `PROVIDER_MANAGED_ENV_KEYS` / `PROVIDER_MANAGED_SETTINGS_KEYS`. Takes a `SecretsGateway` interface for DI. Zero `vscode` import.
- `src/core/providers.test.ts` — mocha tests with real fs + in-memory secrets fake.
- `src/lib/secrets.ts` — 10-line wrapper that adapts `ExtensionContext.secrets` to the `SecretsGateway` interface.
- `src/lib/status-bar.ts` — constructs the status bar item, subscribes to provider changes, exposes `update()`.
- `src/commands/providers.ts` — registers `claudeCopilot.providers.*` commands (quickSwitch, create, edit, delete). Uses `vscode.window.showQuickPick` / `showInputBox`.

**Modified files:**
- `src/extension.ts` — activate secrets gateway, providers core, status bar, commands, register provider-file watcher, run migration once.
- `src/lib/watchers.ts` — watch `~/.claude/claude-copilot/providers.json` → refresh settings tree + status bar.
- `src/tree/settings-tree.ts` — prepend a "Provider Profile" header row showing the active profile name, clicking runs the quick-switch command.
- `src/webview/settings-panel.ts` — new RPC methods `providers:list`, `providers:activate`, `providers:create`, `providers:update`, `providers:delete`. Extend `SETTINGS_KEYS` with new i18n keys.
- `webview-ui/src/settings-form.ts` — top "Provider profile" strip above the tabs: active name + dropdown switcher + manage button.
- `l10n/bundle.l10n.json` + `l10n/bundle.l10n.zh-cn.json` — new keys for status bar, QuickPick, tree label, form strip, migration toast.
- `package.json` — declare new commands + `package.nls.json` entries + `package.nls.zh-cn.json` entries.
- `CHANGELOG.md` + `CHANGELOG.zh-CN.md` — one entry per bundle.

---

## Data Model (Reference — Types Defined in Task 1)

```ts
// Secret key naming: `claude-copilot.provider.<profile.id>.<field>`
// e.g. `claude-copilot.provider.0f4d...a7.apiKey`

type ProviderKind = 'anthropic' | 'bedrock' | 'vertex' | 'foundry';
type AuthMode = 'subscription' | 'apiKey' | 'authToken' | 'helper';

interface BaseProfile { id: string; name: string; kind: ProviderKind }

interface AnthropicProfile extends BaseProfile {
  kind: 'anthropic';
  authMode: AuthMode;
  baseUrl?: string;            // ANTHROPIC_BASE_URL
  hasApiKey?: boolean;         // presence flag; actual key in SecretStorage under `<id>.apiKey`
  hasAuthToken?: boolean;      // same, under `<id>.authToken`
  apiKeyHelper?: string;       // plain path, no secret
}

interface BedrockProfile extends BaseProfile {
  kind: 'bedrock';
  baseUrl?: string;            // ANTHROPIC_BEDROCK_BASE_URL
  hasBearerToken?: boolean;    // SecretStorage `<id>.bedrockToken`
  skipAuth?: boolean;          // CLAUDE_CODE_SKIP_BEDROCK_AUTH
}

interface VertexProfile extends BaseProfile {
  kind: 'vertex';
  projectId?: string;          // ANTHROPIC_VERTEX_PROJECT_ID (not a secret)
  baseUrl?: string;            // ANTHROPIC_VERTEX_BASE_URL
  skipAuth?: boolean;          // CLAUDE_CODE_SKIP_VERTEX_AUTH
}

interface FoundryProfile extends BaseProfile {
  kind: 'foundry';
  hasApiKey?: boolean;         // SecretStorage `<id>.foundryApiKey`
  resource?: string;           // ANTHROPIC_FOUNDRY_RESOURCE (not a secret)
  baseUrl?: string;            // ANTHROPIC_FOUNDRY_BASE_URL
  skipAuth?: boolean;          // CLAUDE_CODE_SKIP_FOUNDRY_AUTH
}

type Profile = AnthropicProfile | BedrockProfile | VertexProfile | FoundryProfile;

interface ProvidersFile {
  version: 1;
  active: string | null;       // profile.id or null (= subscription fallback)
  profiles: Profile[];
}

interface SecretsGateway {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

`PROVIDER_MANAGED_ENV_KEYS` is the exact set of env keys activation/deactivation overwrites:

```ts
export const PROVIDER_MANAGED_ENV_KEYS = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK', 'AWS_BEARER_TOKEN_BEDROCK', 'ANTHROPIC_BEDROCK_BASE_URL', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
  'CLAUDE_CODE_USE_VERTEX', 'ANTHROPIC_VERTEX_PROJECT_ID', 'ANTHROPIC_VERTEX_BASE_URL', 'CLAUDE_CODE_SKIP_VERTEX_AUTH',
  'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_FOUNDRY_RESOURCE', 'ANTHROPIC_FOUNDRY_BASE_URL', 'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
] as const;

export const PROVIDER_MANAGED_SETTINGS_KEYS = ['apiKeyHelper'] as const;
```

---

### Task 1: Providers core types + constants + empty-file behavior

**Files:**
- Create: `src/core/providers.ts`
- Create: `src/core/providers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/providers.test.ts
import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  providersFilePath, readProviders, writeProviders,
  PROVIDER_MANAGED_ENV_KEYS, PROVIDER_MANAGED_SETTINGS_KEYS,
  type ProvidersFile,
} from './providers';

describe('providers core', () => {
  let tmp: string;
  before(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-providers-')); });
  after(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

  it('providersFilePath joins home + claude-copilot/providers.json', () => {
    assert.equal(providersFilePath('/h'), path.join('/h', 'claude-copilot', 'providers.json'));
  });

  it('readProviders returns empty doc when file missing', async () => {
    const doc = await readProviders(tmp);
    assert.deepEqual(doc, { version: 1, active: null, profiles: [] });
  });

  it('writeProviders then readProviders round-trips', async () => {
    const doc: ProvidersFile = {
      version: 1,
      active: 'abc',
      profiles: [{ id: 'abc', name: 'Test', kind: 'anthropic', authMode: 'subscription' }],
    };
    await writeProviders(tmp, doc);
    assert.deepEqual(await readProviders(tmp), doc);
  });

  it('PROVIDER_MANAGED_ENV_KEYS covers anthropic + 3 cloud providers', () => {
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
      'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) {
      assert.ok(PROVIDER_MANAGED_ENV_KEYS.includes(k as any), `missing ${k}`);
    }
  });

  it('PROVIDER_MANAGED_SETTINGS_KEYS includes apiKeyHelper', () => {
    assert.ok(PROVIDER_MANAGED_SETTINGS_KEYS.includes('apiKeyHelper' as any));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './providers'`

- [ ] **Step 3: Implement minimal providers.ts**

```ts
// src/core/providers.ts
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
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm test`
Expected: PASS — 5 new tests, 35 existing tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/providers.ts src/core/providers.test.ts
git commit -m "feat(providers): core types, read/write, managed env key constants"
```

---

### Task 2: profileToPartial — convert profile + secrets to settings partial

**Files:**
- Modify: `src/core/providers.ts` (append)
- Modify: `src/core/providers.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/core/providers.test.ts`:

```ts
import { profileToPartial, type Profile } from './providers';

describe('profileToPartial', () => {
  it('subscription anthropic returns empty env + no apiKeyHelper', async () => {
    const p: Profile = { id: 'a', name: 'Sub', kind: 'anthropic', authMode: 'subscription' };
    const out = await profileToPartial(p, makeSecrets({}));
    assert.deepEqual(out.env, {});
    assert.equal(out.apiKeyHelper, undefined);
  });

  it('apiKey anthropic pulls key from secrets and writes ANTHROPIC_API_KEY + baseUrl', async () => {
    const p: Profile = { id: 'a', name: 'Key', kind: 'anthropic', authMode: 'apiKey',
      hasApiKey: true, baseUrl: 'https://proxy.example.com' };
    const out = await profileToPartial(p, makeSecrets({ 'claude-copilot.provider.a.apiKey': 'sk-1' }));
    assert.equal(out.env.ANTHROPIC_API_KEY, 'sk-1');
    assert.equal(out.env.ANTHROPIC_BASE_URL, 'https://proxy.example.com');
  });

  it('authToken anthropic pulls token and writes ANTHROPIC_AUTH_TOKEN', async () => {
    const p: Profile = { id: 'b', name: 'Tok', kind: 'anthropic', authMode: 'authToken', hasAuthToken: true };
    const out = await profileToPartial(p, makeSecrets({ 'claude-copilot.provider.b.authToken': 'tk-1' }));
    assert.equal(out.env.ANTHROPIC_AUTH_TOKEN, 'tk-1');
  });

  it('helper anthropic emits apiKeyHelper field, no ANTHROPIC_API_KEY', async () => {
    const p: Profile = { id: 'h', name: 'H', kind: 'anthropic', authMode: 'helper', apiKeyHelper: '/tmp/h.sh' };
    const out = await profileToPartial(p, makeSecrets({}));
    assert.equal(out.apiKeyHelper, '/tmp/h.sh');
    assert.ok(!('ANTHROPIC_API_KEY' in out.env));
  });

  it('bedrock sets use-flag, optional bearer, baseUrl, skipAuth', async () => {
    const p: Profile = { id: 'b', name: 'B', kind: 'bedrock', baseUrl: 'https://br.example', hasBearerToken: true, skipAuth: true };
    const out = await profileToPartial(p, makeSecrets({ 'claude-copilot.provider.b.bedrockToken': 'brT' }));
    assert.equal(out.env.CLAUDE_CODE_USE_BEDROCK, '1');
    assert.equal(out.env.AWS_BEARER_TOKEN_BEDROCK, 'brT');
    assert.equal(out.env.ANTHROPIC_BEDROCK_BASE_URL, 'https://br.example');
    assert.equal(out.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH, '1');
  });

  it('vertex sets use-flag + projectId + baseUrl', async () => {
    const p: Profile = { id: 'v', name: 'V', kind: 'vertex', projectId: 'my-proj', baseUrl: 'https://vx' };
    const out = await profileToPartial(p, makeSecrets({}));
    assert.equal(out.env.CLAUDE_CODE_USE_VERTEX, '1');
    assert.equal(out.env.ANTHROPIC_VERTEX_PROJECT_ID, 'my-proj');
    assert.equal(out.env.ANTHROPIC_VERTEX_BASE_URL, 'https://vx');
  });

  it('foundry pulls apiKey from secrets', async () => {
    const p: Profile = { id: 'f', name: 'F', kind: 'foundry', hasApiKey: true, resource: 'res1' };
    const out = await profileToPartial(p, makeSecrets({ 'claude-copilot.provider.f.foundryApiKey': 'fk' }));
    assert.equal(out.env.CLAUDE_CODE_USE_FOUNDRY, '1');
    assert.equal(out.env.ANTHROPIC_FOUNDRY_API_KEY, 'fk');
    assert.equal(out.env.ANTHROPIC_FOUNDRY_RESOURCE, 'res1');
  });

  it('omits secrets fields when hasApiKey/hasBearerToken false', async () => {
    const p: Profile = { id: 'x', name: 'X', kind: 'anthropic', authMode: 'apiKey', hasApiKey: false };
    const out = await profileToPartial(p, makeSecrets({}));
    assert.ok(!('ANTHROPIC_API_KEY' in out.env));
  });
});

function makeSecrets(init: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(init));
  return {
    async get(k: string) { return store.get(k); },
    async set(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
  };
}
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test`
Expected: FAIL — `profileToPartial is not exported`.

- [ ] **Step 3: Implement profileToPartial**

Append to `src/core/providers.ts`:

```ts
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
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `pnpm test`
Expected: PASS — 8 new tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/providers.ts src/core/providers.test.ts
git commit -m "feat(providers): profileToPartial converts profile + secrets to env partial"
```

---

### Task 3: detectLegacyProfile — migrate existing env into a Default profile

**Files:**
- Modify: `src/core/providers.ts` (append)
- Modify: `src/core/providers.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/core/providers.test.ts`:

```ts
import { detectLegacyProfile } from './providers';

describe('detectLegacyProfile', () => {
  it('returns null when no provider env present', () => {
    assert.equal(detectLegacyProfile({ env: { HTTPS_PROXY: 'http://p' } }), null);
    assert.equal(detectLegacyProfile({}), null);
    assert.equal(detectLegacyProfile({ env: {} }), null);
  });

  it('detects ANTHROPIC_API_KEY → anthropic apiKey profile', () => {
    const p = detectLegacyProfile({ env: { ANTHROPIC_API_KEY: 'sk-1', ANTHROPIC_BASE_URL: 'https://x' } });
    assert.ok(p);
    assert.equal(p.kind, 'anthropic');
    if (p.kind === 'anthropic') {
      assert.equal(p.authMode, 'apiKey');
      assert.equal(p.hasApiKey, true);
      assert.equal(p.baseUrl, 'https://x');
    }
  });

  it('detects ANTHROPIC_AUTH_TOKEN → anthropic authToken profile', () => {
    const p = detectLegacyProfile({ env: { ANTHROPIC_AUTH_TOKEN: 'tk-1' } });
    assert.ok(p && p.kind === 'anthropic');
    if (p?.kind === 'anthropic') assert.equal(p.authMode, 'authToken');
  });

  it('detects top-level apiKeyHelper → anthropic helper profile', () => {
    const p = detectLegacyProfile({ apiKeyHelper: '/tmp/k.sh' });
    assert.ok(p && p.kind === 'anthropic');
    if (p?.kind === 'anthropic') {
      assert.equal(p.authMode, 'helper');
      assert.equal(p.apiKeyHelper, '/tmp/k.sh');
    }
  });

  it('detects CLAUDE_CODE_USE_BEDROCK=1 → bedrock profile', () => {
    const p = detectLegacyProfile({ env: { CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_SKIP_BEDROCK_AUTH: '1' } });
    assert.ok(p && p.kind === 'bedrock');
    if (p?.kind === 'bedrock') assert.equal(p.skipAuth, true);
  });

  it('detects CLAUDE_CODE_USE_VERTEX=1 → vertex profile', () => {
    const p = detectLegacyProfile({ env: { CLAUDE_CODE_USE_VERTEX: '1', ANTHROPIC_VERTEX_PROJECT_ID: 'gcp-1' } });
    assert.ok(p && p.kind === 'vertex');
    if (p?.kind === 'vertex') assert.equal(p.projectId, 'gcp-1');
  });

  it('detects CLAUDE_CODE_USE_FOUNDRY=1 → foundry profile with hasApiKey flag when key present', () => {
    const p = detectLegacyProfile({ env: { CLAUDE_CODE_USE_FOUNDRY: '1', ANTHROPIC_FOUNDRY_API_KEY: 'fk', ANTHROPIC_FOUNDRY_RESOURCE: 'r' } });
    assert.ok(p && p.kind === 'foundry');
    if (p?.kind === 'foundry') {
      assert.equal(p.hasApiKey, true);
      assert.equal(p.resource, 'r');
    }
  });

  it('assigns a non-empty id and the name "Default"', () => {
    const p = detectLegacyProfile({ env: { ANTHROPIC_API_KEY: 'sk' } });
    assert.ok(p && p.id.length >= 8 && p.name === 'Default');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test`
Expected: FAIL — `detectLegacyProfile is not exported`.

- [ ] **Step 3: Implement detectLegacyProfile + id generator**

Append to `src/core/providers.ts`:

```ts
import { randomUUID } from 'crypto';

export function newId(): string {
  return randomUUID();
}

/**
 * Detect a legacy provider config embedded in user settings.json, so we can
 * migrate upgraders to the new profile system without losing their setup.
 * Returns a Profile matching the current env, or null if no provider env present.
 * Secret material (api keys, tokens) is NOT captured here — the migration caller
 * is responsible for moving those values into SecretStorage under secretKey(id, ...).
 */
export function detectLegacyProfile(settings: Record<string, unknown>): Profile | null {
  const env = (settings.env ?? {}) as Record<string, string>;
  const helper = typeof settings.apiKeyHelper === 'string' ? settings.apiKeyHelper : '';
  const id = newId();
  const name = 'Default';

  if (env.CLAUDE_CODE_USE_BEDROCK === '1') {
    return {
      id, name, kind: 'bedrock',
      baseUrl: env.ANTHROPIC_BEDROCK_BASE_URL || undefined,
      hasBearerToken: !!env.AWS_BEARER_TOKEN_BEDROCK,
      skipAuth: env.CLAUDE_CODE_SKIP_BEDROCK_AUTH === '1' || undefined,
    };
  }
  if (env.CLAUDE_CODE_USE_VERTEX === '1') {
    return {
      id, name, kind: 'vertex',
      projectId: env.ANTHROPIC_VERTEX_PROJECT_ID || undefined,
      baseUrl: env.ANTHROPIC_VERTEX_BASE_URL || undefined,
      skipAuth: env.CLAUDE_CODE_SKIP_VERTEX_AUTH === '1' || undefined,
    };
  }
  if (env.CLAUDE_CODE_USE_FOUNDRY === '1') {
    return {
      id, name, kind: 'foundry',
      hasApiKey: !!env.ANTHROPIC_FOUNDRY_API_KEY,
      resource: env.ANTHROPIC_FOUNDRY_RESOURCE || undefined,
      baseUrl: env.ANTHROPIC_FOUNDRY_BASE_URL || undefined,
      skipAuth: env.CLAUDE_CODE_SKIP_FOUNDRY_AUTH === '1' || undefined,
    };
  }
  if (helper) {
    return { id, name, kind: 'anthropic', authMode: 'helper', apiKeyHelper: helper, baseUrl: env.ANTHROPIC_BASE_URL || undefined };
  }
  if (env.ANTHROPIC_API_KEY) {
    return { id, name, kind: 'anthropic', authMode: 'apiKey', hasApiKey: true, baseUrl: env.ANTHROPIC_BASE_URL || undefined };
  }
  if (env.ANTHROPIC_AUTH_TOKEN) {
    return { id, name, kind: 'anthropic', authMode: 'authToken', hasAuthToken: true, baseUrl: env.ANTHROPIC_BASE_URL || undefined };
  }
  return null;
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `pnpm test`
Expected: PASS — 8 new detection tests + all previous green.

- [ ] **Step 5: Commit**

```bash
git add src/core/providers.ts src/core/providers.test.ts
git commit -m "feat(providers): detectLegacyProfile for migration from bare env config"
```

---

### Task 4: applyProfile / deactivate — integrate with settings.ts mergeForSave

**Files:**
- Modify: `src/core/providers.ts` (append)
- Modify: `src/core/providers.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/core/providers.test.ts`:

```ts
import { applyProfileToSettings, deactivateFromSettings } from './providers';

describe('applyProfileToSettings', () => {
  it('merges profile env with existing non-managed env and drops other-provider env', async () => {
    const existing = { env: { HTTPS_PROXY: 'http://p', CLAUDE_CODE_USE_BEDROCK: '1', AWS_BEARER_TOKEN_BEDROCK: 'old' } };
    const profile: Profile = { id: 'a', name: 'Z', kind: 'anthropic', authMode: 'apiKey', hasApiKey: true };
    const next = await applyProfileToSettings(existing, profile, makeSecrets({ 'claude-copilot.provider.a.apiKey': 'sk-new' })) as any;
    assert.equal(next.env.HTTPS_PROXY, 'http://p');
    assert.equal(next.env.ANTHROPIC_API_KEY, 'sk-new');
    assert.ok(!('CLAUDE_CODE_USE_BEDROCK' in next.env));
    assert.ok(!('AWS_BEARER_TOKEN_BEDROCK' in next.env));
  });

  it('removes legacy top-level apiKeyHelper when new profile is not helper', async () => {
    const existing = { apiKeyHelper: '/old/k.sh' };
    const profile: Profile = { id: 'a', name: 'Z', kind: 'anthropic', authMode: 'apiKey', hasApiKey: true };
    const next = await applyProfileToSettings(existing, profile, makeSecrets({ 'claude-copilot.provider.a.apiKey': 'sk' })) as any;
    assert.ok(!('apiKeyHelper' in next));
  });

  it('writes apiKeyHelper when profile is helper mode', async () => {
    const profile: Profile = { id: 'h', name: 'H', kind: 'anthropic', authMode: 'helper', apiKeyHelper: '/k.sh' };
    const next = await applyProfileToSettings({}, profile, makeSecrets({})) as any;
    assert.equal(next.apiKeyHelper, '/k.sh');
  });

  it('drops the env object entirely when nothing is left after the merge', async () => {
    const existing = { env: { ANTHROPIC_API_KEY: 'sk-old' } };
    const profile: Profile = { id: 's', name: 'Sub', kind: 'anthropic', authMode: 'subscription' };
    const next = await applyProfileToSettings(existing, profile, makeSecrets({})) as any;
    assert.ok(!('env' in next));
  });
});

describe('deactivateFromSettings', () => {
  it('strips all managed env keys and apiKeyHelper, preserves unrelated settings', () => {
    const existing = {
      hooks: { PreToolUse: [] },
      apiKeyHelper: '/tmp/k.sh',
      env: { HTTPS_PROXY: 'http://p', ANTHROPIC_API_KEY: 'sk', CLAUDE_CODE_USE_BEDROCK: '1' },
    };
    const next = deactivateFromSettings(existing) as any;
    assert.deepEqual(next.hooks, { PreToolUse: [] });
    assert.equal(next.env.HTTPS_PROXY, 'http://p');
    assert.ok(!('ANTHROPIC_API_KEY' in next.env));
    assert.ok(!('CLAUDE_CODE_USE_BEDROCK' in next.env));
    assert.ok(!('apiKeyHelper' in next));
  });

  it('drops env entirely when the managed keys were the only env entries', () => {
    const existing = { env: { ANTHROPIC_API_KEY: 'sk' } };
    const next = deactivateFromSettings(existing) as any;
    assert.ok(!('env' in next));
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement activation/deactivation helpers**

Append to `src/core/providers.ts`:

```ts
import { mergeForSave, type Settings } from './settings';

function stripManagedEnv(existing: Settings): Record<string, string> {
  const env = { ...(existing.env as Record<string, string> ?? {}) };
  for (const k of PROVIDER_MANAGED_ENV_KEYS) delete env[k];
  return env;
}

/**
 * Produce the next user settings object for activating `profile`.
 * - Existing non-provider env keys (e.g. HTTPS_PROXY) are kept.
 * - All provider-managed env keys are replaced with the profile's envset.
 * - `apiKeyHelper` is written iff the profile is helper mode; stale values are wiped.
 */
export async function applyProfileToSettings(
  existing: Settings,
  profile: Profile,
  secrets: SecretsGateway,
): Promise<Settings> {
  const partial = await profileToPartial(profile, secrets);
  const mergedEnv = { ...stripManagedEnv(existing), ...partial.env };

  const next: Record<string, unknown> = {};
  if (Object.keys(mergedEnv).length) next.env = mergedEnv;
  if (partial.apiKeyHelper) next.apiKeyHelper = partial.apiKeyHelper;

  return mergeForSave(existing, next, ['env', ...PROVIDER_MANAGED_SETTINGS_KEYS]);
}

/**
 * Produce the next user settings object for no-active-profile state: strip every
 * managed env key and the apiKeyHelper, preserving everything else (hooks, other env,
 * permissions, …). Effectively returns the user to subscription mode.
 */
export function deactivateFromSettings(existing: Settings): Settings {
  const env = stripManagedEnv(existing);
  const next: Record<string, unknown> = {};
  if (Object.keys(env).length) next.env = env;
  return mergeForSave(existing, next, ['env', ...PROVIDER_MANAGED_SETTINGS_KEYS]);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm test`
Expected: PASS — 6 new tests green. Total core tests: 35 + ~22 new = 57.

- [ ] **Step 5: Commit**

```bash
git add src/core/providers.ts src/core/providers.test.ts
git commit -m "feat(providers): applyProfileToSettings + deactivateFromSettings wire into mergeForSave"
```

---

### Task 5: SecretsGateway adapter for ExtensionContext

**Files:**
- Create: `src/lib/secrets.ts`

- [ ] **Step 1: Create the adapter (no test — it is 8 lines of pure delegation, and VSCode secrets cannot be exercised outside the host)**

```ts
// src/lib/secrets.ts
import * as vscode from 'vscode';
import type { SecretsGateway } from '../core/providers';

export function secretsGateway(context: vscode.ExtensionContext): SecretsGateway {
  return {
    get: (k) => Promise.resolve(context.secrets.get(k)),
    set: (k, v) => Promise.resolve(context.secrets.store(k, v)),
    delete: (k) => Promise.resolve(context.secrets.delete(k)),
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: success, bundle unchanged in behavior.

- [ ] **Step 3: Commit**

```bash
git add src/lib/secrets.ts
git commit -m "feat(secrets): vscode SecretStorage adapter for providers core"
```

---

### Task 6: Quick-switch QuickPick command + status bar

**Files:**
- Create: `src/lib/status-bar.ts`
- Create: `src/commands/providers.ts`
- Modify: `src/extension.ts`
- Modify: `package.json` (new commands)
- Modify: `package.nls.json` + `package.nls.zh-cn.json`
- Modify: `l10n/bundle.l10n.json` + `l10n/bundle.l10n.zh-cn.json`

- [ ] **Step 1: Add package.json command declarations**

Edit `package.json` → `contributes.commands`, append:

```json
{ "command": "claudeCopilot.providers.quickSwitch", "title": "%cmd.providers.quickSwitch%", "icon": "$(rocket)" },
{ "command": "claudeCopilot.providers.create", "title": "%cmd.providers.create%", "icon": "$(add)" },
{ "command": "claudeCopilot.providers.edit", "title": "%cmd.providers.edit%" },
{ "command": "claudeCopilot.providers.delete", "title": "%cmd.providers.delete%" },
{ "command": "claudeCopilot.providers.deactivate", "title": "%cmd.providers.deactivate%" }
```

- [ ] **Step 2: Add NLS keys**

Edit `package.nls.json`, append:

```json
"cmd.providers.quickSwitch": "Claude Copilot: Switch Provider Profile",
"cmd.providers.create": "Claude Copilot: Add Provider Profile...",
"cmd.providers.edit": "Claude Copilot: Edit Provider Profile...",
"cmd.providers.delete": "Claude Copilot: Delete Provider Profile...",
"cmd.providers.deactivate": "Claude Copilot: Deactivate Provider (Subscription Mode)"
```

Edit `package.nls.zh-cn.json`, append:

```json
"cmd.providers.quickSwitch": "Claude Copilot: 切换接入 Profile",
"cmd.providers.create": "Claude Copilot: 新建接入 Profile...",
"cmd.providers.edit": "Claude Copilot: 编辑接入 Profile...",
"cmd.providers.delete": "Claude Copilot: 删除接入 Profile...",
"cmd.providers.deactivate": "Claude Copilot: 停用 Profile（订阅模式）"
```

- [ ] **Step 3: Add l10n keys for bundle.l10n.json**

Append to `l10n/bundle.l10n.json`:

```json
"providers.statusBar.subscription": "Subscription",
"providers.statusBar.tooltip": "Click to switch provider profile",
"providers.quickPick.title": "Switch provider profile",
"providers.quickPick.active": "Active",
"providers.quickPick.placeholder": "Select a profile, or create a new one",
"providers.quickPick.createNew": "+ Create new profile...",
"providers.quickPick.manage": "Manage profiles...",
"providers.quickPick.deactivate": "Deactivate (fall back to subscription)",
"providers.create.chooseKind": "Choose provider type",
"providers.create.kind.anthropic": "Anthropic (or API-compatible)",
"providers.create.kind.bedrock": "AWS Bedrock",
"providers.create.kind.vertex": "Google Vertex",
"providers.create.kind.foundry": "Microsoft Foundry",
"providers.create.name": "Profile name (e.g. Official, Zhipu, My Proxy)",
"providers.create.authMode": "Auth mode",
"providers.create.baseUrl": "Base URL (optional, e.g. https://api.anthropic.com)",
"providers.create.apiKey": "API key",
"providers.create.authToken": "Auth token",
"providers.create.apiKeyHelper": "Helper script path",
"providers.create.bedrockToken": "Bearer token (optional)",
"providers.create.vertexProjectId": "GCP project ID",
"providers.create.foundryResource": "Foundry resource name",
"providers.create.foundryApiKey": "Foundry API key",
"providers.create.skipAuth": "Skip provider auth (LLM gateway mode)? (yes/no)",
"providers.edit.pickTarget": "Select a profile to edit",
"providers.delete.pickTarget": "Select a profile to delete",
"providers.delete.confirm": "Delete profile \"{0}\"? Stored credentials will also be erased.",
"providers.delete.confirmBtn": "Delete",
"providers.migrated": "Migrated your existing provider config to profile \"Default\".",
"providers.activated": "Activated profile: {0}",
"providers.deactivated": "Deactivated. Fell back to subscription mode."
```

Append equivalent Chinese translations to `l10n/bundle.l10n.zh-cn.json` (same keys). Example:

```json
"providers.statusBar.subscription": "订阅模式",
"providers.statusBar.tooltip": "点击切换接入 Profile",
"providers.quickPick.title": "切换接入 Profile",
"providers.quickPick.active": "当前",
"providers.quickPick.placeholder": "选择一个 Profile，或新建",
"providers.quickPick.createNew": "+ 新建 Profile...",
"providers.quickPick.manage": "管理 Profile...",
"providers.quickPick.deactivate": "停用（回落订阅模式）",
"providers.create.chooseKind": "选择 Provider 类型",
"providers.create.kind.anthropic": "Anthropic（或兼容的 API）",
"providers.create.kind.bedrock": "AWS Bedrock",
"providers.create.kind.vertex": "Google Vertex",
"providers.create.kind.foundry": "Microsoft Foundry",
"providers.create.name": "Profile 名称（例如：官方、智谱、自建 Proxy）",
"providers.create.authMode": "鉴权方式",
"providers.create.baseUrl": "Base URL（可选，如 https://api.anthropic.com）",
"providers.create.apiKey": "API Key",
"providers.create.authToken": "Auth Token",
"providers.create.apiKeyHelper": "Helper 脚本路径",
"providers.create.bedrockToken": "Bearer Token（可选）",
"providers.create.vertexProjectId": "GCP Project ID",
"providers.create.foundryResource": "Foundry 资源名",
"providers.create.foundryApiKey": "Foundry API Key",
"providers.create.skipAuth": "跳过后端鉴权（LLM gateway 模式）？(yes/no)",
"providers.edit.pickTarget": "选择要编辑的 Profile",
"providers.delete.pickTarget": "选择要删除的 Profile",
"providers.delete.confirm": "删除 Profile \"{0}\"？已存储的凭证也会一并抹除。",
"providers.delete.confirmBtn": "删除",
"providers.migrated": "已把现有接入配置迁移为 Profile \"Default\"。",
"providers.activated": "已激活 Profile：{0}",
"providers.deactivated": "已停用。回落订阅模式。"
```

- [ ] **Step 4: Create status bar module**

Create `src/lib/status-bar.ts`:

```ts
import * as vscode from 'vscode';
import { readProviders } from '../core/providers';
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
      const doc = await readProviders(CLAUDE_HOME);
      const active = doc.profiles.find(p => p.id === doc.active);
      const label = active ? active.name : t('providers.statusBar.subscription');
      item.text = `$(rocket) ${label}`;
      item.tooltip = t('providers.statusBar.tooltip');
    } catch (err) {
      item.text = '$(rocket) —';
    }
  }

  return {
    update,
    dispose: () => item.dispose(),
  };
}
```

- [ ] **Step 5: Create commands module**

Create `src/commands/providers.ts`:

```ts
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  readProviders, writeProviders, newId, secretKey, providersFilePath,
  applyProfileToSettings, deactivateFromSettings,
  type Profile, type ProviderKind, type AuthMode, type SecretsGateway, type ProvidersFile,
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

  // wipe secrets under this id
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
        { label: t('settings.authMode.subscription'), value: 'subscription' as AuthMode },
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
      type Item = vscode.QuickPickItem & { action: 'activate' | 'create' | 'manage' | 'deactivate'; id?: string };
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
      items.push({ label: t('providers.quickPick.createNew'), action: 'create' });
      if (doc.active) items.push({ label: t('providers.quickPick.deactivate'), action: 'deactivate' });
      if (doc.profiles.length) items.push({ label: t('providers.quickPick.manage'), action: 'manage' });

      const pick = await vscode.window.showQuickPick(items, {
        title: t('providers.quickPick.title'),
        placeHolder: t('providers.quickPick.placeholder'),
      });
      if (!pick) return;

      if (pick.action === 'activate' && pick.id) {
        await setActive(pick.id, secrets);
        const name = doc.profiles.find(p => p.id === pick.id)?.name ?? '';
        vscode.window.showInformationMessage(t('providers.activated', name));
        await fire();
      } else if (pick.action === 'deactivate') {
        await setActive(null, secrets);
        vscode.window.showInformationMessage(t('providers.deactivated'));
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

    vscode.commands.registerCommand('claudeCopilot.providers.delete', async () => {
      const doc = await readProviders(CLAUDE_HOME);
      if (!doc.profiles.length) return;
      const pick = await vscode.window.showQuickPick(
        doc.profiles.map(p => ({ label: p.name, description: p.kind, id: p.id })),
        { title: t('providers.delete.pickTarget') },
      );
      if (!pick) return;
      const target = doc.profiles.find(p => p.id === pick.id)!;
      const confirm = await vscode.window.showWarningMessage(
        t('providers.delete.confirm', target.name),
        { modal: true },
        t('providers.delete.confirmBtn'),
      );
      if (confirm !== t('providers.delete.confirmBtn')) return;
      await deleteProfile(target.id, secrets);
      await fire();
    }),

    vscode.commands.registerCommand('claudeCopilot.providers.edit', async () => {
      // v1: open JSON file for power users; richer edit UI can come later.
      const p = providersFilePath(CLAUDE_HOME);
      try { await fs.access(p); }
      catch { await writeProviders(CLAUDE_HOME, { version: 1, active: null, profiles: [] }); }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('claudeCopilot.providers.deactivate', async () => {
      await setActive(null, secrets);
      vscode.window.showInformationMessage(t('providers.deactivated'));
      await fire();
    }),
  ];
}
```

- [ ] **Step 6: Wire up activation in extension.ts**

Edit `src/extension.ts`. Add imports near the top:

```ts
import { secretsGateway } from './lib/secrets';
import { createProviderStatusBar } from './lib/status-bar';
import { registerProviderCommands } from './commands/providers';
```

Then restructure `activate` so `secrets` and `statusBar` are declared **before** the single `context.subscriptions.push(...)` call (other tasks will reference them inside that push). The new body looks like:

```ts
export function activate(context: vscode.ExtensionContext): void {
  const plugins = new PluginsTreeProvider();
  const mcp = new McpTreeProvider();
  const skills = new SkillsTreeProvider();
  const memory = new MemoryTreeProvider();
  const settings = new SettingsTreeProvider();
  const usage = new UsageTreeProvider();

  const secrets = secretsGateway(context);
  const statusBar = createProviderStatusBar();
  void statusBar.update();

  context.subscriptions.push(
    { dispose: () => statusBar.dispose() },
    vscode.window.registerTreeDataProvider('claudeCopilot.plugins', plugins),
    vscode.window.registerTreeDataProvider('claudeCopilot.mcp', mcp),
    vscode.window.registerTreeDataProvider('claudeCopilot.skills', skills),
    vscode.window.registerTreeDataProvider('claudeCopilot.memory', memory),
    vscode.window.registerTreeDataProvider('claudeCopilot.settings', settings),
    vscode.window.registerTreeDataProvider('claudeCopilot.usage', usage),
    vscode.commands.registerCommand('claudeCopilot.refresh', () => {
      plugins.refresh(); mcp.refresh(); skills.refresh(); memory.refresh(); settings.refresh();
    }),
    vscode.commands.registerCommand('claudeCopilot.openFile', async (filePath: string) => {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }),
    vscode.commands.registerCommand('claudeCopilot.openSettingsPanel', () => openSettingsPanel(context)),
    vscode.commands.registerCommand('claudeCopilot.openUsage', () => openUsagePanel(context)),
    vscode.commands.registerCommand('claudeCopilot.openMarketplace', () => openMarketplacePanel(context)),
    ...registerPluginCommands(() => plugins.refresh()),
    ...registerMcpCommands(() => mcp.refresh()),
    ...registerSkillCommands(() => skills.refresh()),
    ...registerMemoryCommands(() => memory.refresh()),
    ...registerProviderCommands(secrets, () => {
      void statusBar.update();
      settings.refresh();
    }),
    ...registerWatchers({
      plugins: () => plugins.refresh(),
      mcp: () => mcp.refresh(),
      skills: () => skills.refresh(),
      memory: () => memory.refresh(),
      settings: () => settings.refresh(),
      providers: () => { void statusBar.update(); settings.refresh(); },   // added in Task 9
    }),
  );

  registerMarketplaceRefresh(() => plugins.refresh());

  runClaude(['--version'], 5000).catch(() => {
    vscode.window.showWarningMessage(t('toast.cliMissing'));
  });
}
```

Note: the `providers:` line inside `registerWatchers` references the expanded `RefreshHandlers` from Task 9 — Task 9 updates that interface before this line compiles. If you implement tasks out of order, either keep the handler inline with `providers: () => {}` until Task 9 lands or skip the `providers` key (the handlers object is structurally typed; extras are fine, missing keys fail compile once Task 9 widens the interface).

- [ ] **Step 7: Build + manual verify**

Run: `pnpm build`
Expected: clean build.

Open the project in VSCode and press F5. In the Extension Development Host:
1. Confirm the status bar shows `$(rocket) 订阅模式` / `Subscription`.
2. Command palette → `Claude Copilot: Add Provider Profile...` → anthropic → name "Test" → API Key mode → enter a key.
3. Confirm status bar flips to `$(rocket) Test` and `~/.claude/settings.json` now has `env.ANTHROPIC_API_KEY`.
4. Command palette → `Claude Copilot: Switch Provider Profile` → pick the deactivate entry.
5. Confirm `env.ANTHROPIC_API_KEY` is gone and the status bar shows subscription again.
6. Delete the profile via `Claude Copilot: Delete Provider Profile...` → confirm it's gone from `providers.json`.

- [ ] **Step 8: Commit**

```bash
git add package.json package.nls.json package.nls.zh-cn.json l10n/ src/lib/status-bar.ts src/commands/providers.ts src/extension.ts
git commit -m "feat(providers): status bar, quick-switch, create/delete commands"
```

---

### Task 7: Auto-migration on first run

**Files:**
- Create: `src/lib/migrate-providers.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Create the migration helper**

```ts
// src/lib/migrate-providers.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  readProviders, writeProviders, providersFilePath,
  detectLegacyProfile, secretKey,
  type SecretsGateway, type Profile,
} from '../core/providers';
import { readUser, userSettingsPath } from '../core/settings';
import { CLAUDE_HOME } from './paths';
import { t } from './l10n';

export async function migrateProvidersOnce(secrets: SecretsGateway): Promise<boolean> {
  // If providers.json already exists, migration has run.
  try { await fs.access(providersFilePath(CLAUDE_HOME)); return false; } catch { /* not found → proceed */ }

  const user = await readUser(CLAUDE_HOME);
  const legacy = detectLegacyProfile(user);

  if (!legacy) {
    // Still create an empty providers.json so this migration doesn't retrigger.
    await writeProviders(CLAUDE_HOME, { version: 1, active: null, profiles: [] });
    return false;
  }

  // Move secret material into SecretStorage under stable keys.
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
```

- [ ] **Step 2: Wire into extension.ts**

Add the import near the top of `src/extension.ts`:

```ts
import { migrateProvidersOnce } from './lib/migrate-providers';
```

Then in `activate`, replace the bare `void statusBar.update();` line (added in Task 6) with:

```ts
  void (async () => {
    try { await migrateProvidersOnce(secrets); }
    catch (err) { console.error('providers migration failed', err); }
    await statusBar.update();
  })();
```

This ensures the status bar only updates after migration finishes so it reflects the freshly-created Default profile on first run.

- [ ] **Step 3: Manual verify**

In Extension Development Host:
1. Delete `~/.claude/claude-copilot/providers.json` if present.
2. Ensure `~/.claude/settings.json` has `env.ANTHROPIC_API_KEY` set.
3. Restart the host (Developer: Reload Window).
4. A toast should say "Migrated your existing provider config to profile Default".
5. `providers.json` should now exist with one profile named "Default" and `active` pointing at it.
6. Running `claudeCopilot.providers.quickSwitch` should show the Default profile as active.

- [ ] **Step 4: Commit**

```bash
git add src/lib/migrate-providers.ts src/extension.ts
git commit -m "feat(providers): auto-migrate existing env config into Default profile on first run"
```

---

### Task 8: Settings TreeView — surface active profile as a top row

**Files:**
- Modify: `src/tree/settings-tree.ts`

- [ ] **Step 1: Extend the tree provider to prepend a profile node**

Replace the file with:

```ts
import * as vscode from 'vscode';
import { userSettingsPath, projectSettingsPath, localSettingsPath } from '../core/settings';
import { readProviders } from '../core/providers';
import { CLAUDE_HOME } from '../lib/paths';
import { currentWorkspace } from '../lib/workspace';
import { t } from '../lib/l10n';

type Layer = 'user' | 'project' | 'local';
type Node =
  | { kind: 'layer'; layer: Layer; path: string; available: boolean }
  | { kind: 'profile'; name: string };

const LAYER_META: Record<Layer, { labelKey: string; icon: string }> = {
  user: { labelKey: 'tree.group.user', icon: 'account' },
  project: { labelKey: 'tree.group.project', icon: 'folder-opened' },
  local: { labelKey: 'tree.layer.local', icon: 'device-desktop' },
};

export class SettingsTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  refresh(): void { this._onDidChange.fire(); }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'profile') {
      const item = new vscode.TreeItem(t('tree.providers.label'), vscode.TreeItemCollapsibleState.None);
      item.description = node.name;
      item.iconPath = new vscode.ThemeIcon('rocket');
      item.tooltip = t('providers.statusBar.tooltip');
      item.command = { command: 'claudeCopilot.providers.quickSwitch', title: 'Switch provider' };
      item.contextValue = 'settings:provider';
      return item;
    }
    const meta = LAYER_META[node.layer];
    const item = new vscode.TreeItem(t(meta.labelKey), vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(meta.icon);
    item.tooltip = node.path;
    item.description = node.available ? '' : t('tree.group.noWorkspace');
    if (node.available) {
      item.command = { command: 'claudeCopilot.openSettingsPanel', title: 'Open Settings' };
    }
    item.contextValue = 'settings:layer';
    return item;
  }

  async getChildren(): Promise<Node[]> {
    const ws = currentWorkspace();
    const doc = await readProviders(CLAUDE_HOME);
    const active = doc.profiles.find(p => p.id === doc.active);
    const profileName = active ? active.name : t('providers.statusBar.subscription');
    return [
      { kind: 'profile', name: profileName },
      { kind: 'layer', layer: 'user', path: userSettingsPath(CLAUDE_HOME), available: true },
      { kind: 'layer', layer: 'project', path: ws ? projectSettingsPath(ws.fsPath) : '', available: !!ws },
      { kind: 'layer', layer: 'local', path: ws ? localSettingsPath(ws.fsPath) : '', available: !!ws },
    ];
  }
}
```

- [ ] **Step 2: Add tree label i18n keys**

Append to `l10n/bundle.l10n.json`:

```json
"tree.providers.label": "API Provider",
```

Append to `l10n/bundle.l10n.zh-cn.json`:

```json
"tree.providers.label": "API 接入方",
```

- [ ] **Step 3: Manual verify**

`pnpm build` then F5. In the Settings view sidebar, the first row should read "API Provider — <active name>" or "API Provider — Subscription". Clicking it opens the quick-switch QuickPick.

- [ ] **Step 4: Commit**

```bash
git add src/tree/settings-tree.ts l10n/bundle.l10n.json l10n/bundle.l10n.zh-cn.json
git commit -m "feat(providers): show active provider row atop Settings tree"
```

---

### Task 9: Watch providers.json to refresh tree + status bar

**Files:**
- Modify: `src/lib/watchers.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Extend the watcher handlers**

In `src/lib/watchers.ts`:

```ts
// extend the RefreshHandlers interface
export interface RefreshHandlers {
  plugins(): void;
  mcp(): void;
  skills(): void;
  memory(): void;
  settings(): void;
  providers(): void;   // NEW
}
```

Inside `registerWatchers`, after the existing `CLAUDE_HOME` watchers:

```ts
  out.push(watch(new vscode.RelativePattern(CLAUDE_HOME, 'claude-copilot/providers.json'), () => {
    handlers.providers();
    handlers.settings();
  }));
```

- [ ] **Step 2: Confirm the handler in extension.ts**

Task 6 Step 6 already placed `providers: () => { void statusBar.update(); settings.refresh(); }` in the `registerWatchers({...})` call. With Task 9 Step 1 widening `RefreshHandlers` to require `providers`, this compiles. No further code change needed — just build to verify:

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: clean build with no missing-property errors on `registerWatchers`.

- [ ] **Step 4: Manual verify**

F5, open `providers.json` directly, hand-edit the profile name, save. Status bar and Settings tree should update within a second.

- [ ] **Step 5: Commit**

```bash
git add src/lib/watchers.ts src/extension.ts
git commit -m "feat(providers): refresh status bar and tree on providers.json change"
```

---

### Task 10: Settings WebView top profile switcher (RPC + UI)

**Files:**
- Modify: `src/webview/settings-panel.ts`
- Modify: `webview-ui/src/settings-form.ts`

- [ ] **Step 1: Extend panel RPC with providers:list and providers:activate**

Edit `src/webview/settings-panel.ts` — imports:

```ts
import { readProviders, writeProviders, applyProfileToSettings, deactivateFromSettings, type ProvidersFile } from '../core/providers';
import { secretsGateway } from '../lib/secrets';
```

Change `openSettingsPanel(context)` signature to keep `context` (already there), then in the message handler add:

```ts
} else if (req.method === 'providers:list') {
  const doc = await readProviders(CLAUDE_HOME);
  res = { id: req.id, result: doc };
} else if (req.method === 'providers:activate') {
  const { id } = req.params as { id: string | null };
  const secrets = secretsGateway(context);
  const doc = await readProviders(CLAUDE_HOME);
  doc.active = id;
  const user = await readUser(CLAUDE_HOME);
  const next = id
    ? await applyProfileToSettings(user, doc.profiles.find(p => p.id === id)!, secrets)
    : deactivateFromSettings(user);
  await fs.mkdir(path.dirname(userSettingsPath(CLAUDE_HOME)), { recursive: true });
  await fs.writeFile(userSettingsPath(CLAUDE_HOME), JSON.stringify(next, null, 2) + '\n', 'utf-8');
  await writeProviders(CLAUDE_HOME, doc);
  res = { id: req.id, result: 'ok' };
}
```

(Place before the `else { res = { id: req.id, error: ... } }` fallback.)

Extend `SETTINGS_KEYS` with:

```ts
'providers.webview.header',
'providers.webview.active',
'providers.webview.none',
'providers.webview.switch',
'providers.webview.create',
'providers.webview.manage',
'providers.statusBar.subscription',
```

- [ ] **Step 2: Add the l10n keys**

Append to `l10n/bundle.l10n.json`:

```json
"providers.webview.header": "API Provider",
"providers.webview.active": "Active profile",
"providers.webview.none": "Subscription mode (no active profile)",
"providers.webview.switch": "Switch",
"providers.webview.create": "+ New profile",
"providers.webview.manage": "Open providers.json",
```

Append to `l10n/bundle.l10n.zh-cn.json`:

```json
"providers.webview.header": "API 接入方",
"providers.webview.active": "当前 Profile",
"providers.webview.none": "订阅模式（未激活 Profile）",
"providers.webview.switch": "切换",
"providers.webview.create": "+ 新建 Profile",
"providers.webview.manage": "打开 providers.json",
```

- [ ] **Step 3: Add provider strip in the form**

Edit `webview-ui/src/settings-form.ts`. Add to State:

```ts
  interface State {
    // ...existing fields...
    providers: ProvidersData | null;
  }

  interface ProvidersData { active: string | null; profiles: Array<{ id: string; name: string; kind: string }> }
```

Extend initial state: `providers: null,`.

In `load()`, after `state.data = ...`:

```ts
      state.providers = await call<ProvidersData>('providers:list').catch(() => null);
```

Add a helper at module scope:

```ts
function providerStrip(p: { active: string | null; profiles: Array<{ id: string; name: string; kind: string }> }): string {
  const active = p.profiles.find(x => x.id === p.active);
  const name = active ? active.name : t('providers.webview.none');
  const options = p.profiles.map(x =>
    `<option value="${escapeHtml(x.id)}" ${x.id === p.active ? 'selected' : ''}>${escapeHtml(x.name)} · ${escapeHtml(x.kind)}</option>`
  ).join('');
  return `
    <section class="rounded-lg border border-current/15 p-4 flex flex-wrap items-center gap-3 bg-current/[0.04]">
      <span class="text-sm font-semibold opacity-80">🚀 ${escapeHtml(t('providers.webview.header'))}</span>
      <span class="text-xs opacity-60">${escapeHtml(t('providers.webview.active'))}:</span>
      <span class="text-sm font-medium">${escapeHtml(name)}</span>
      <div class="flex-1"></div>
      <select id="providers-switch" class="bg-transparent border border-current/20 rounded px-2 py-1 text-sm">
        <option value="">${escapeHtml(t('providers.webview.none'))}</option>
        ${options}
      </select>
      <button id="providers-new" class="text-xs px-2 py-1 border border-current/20 rounded hover:bg-current/5">${escapeHtml(t('providers.webview.create'))}</button>
      <button id="providers-manage" class="text-xs px-2 py-1 opacity-70 hover:opacity-100">${escapeHtml(t('providers.webview.manage'))}</button>
    </section>
  `;
}
```

In `render()`, insert between the header `<div>` and tabs block:

```ts
        ${state.providers ? providerStrip(state.providers) : ''}
```

In `bind()`, append:

```ts
    root.querySelector<HTMLSelectElement>('#providers-switch')?.addEventListener('change', async (e) => {
      const id = (e.target as HTMLSelectElement).value || null;
      try { await call('providers:activate', { id }); state.providers = await call('providers:list'); load(); }
      catch (err: any) { alert('Switch failed: ' + (err?.message ?? err)); }
    });
    root.querySelector<HTMLButtonElement>('#providers-new')?.addEventListener('click', () => {
      call('commands:execute', { command: 'claudeCopilot.providers.create' }).catch(() => {});
    });
    root.querySelector<HTMLButtonElement>('#providers-manage')?.addEventListener('click', () => {
      call('commands:execute', { command: 'claudeCopilot.providers.edit' }).catch(() => {});
    });
```

- [ ] **Step 4: Add commands:execute RPC method**

In `src/webview/settings-panel.ts` message handler, add:

```ts
} else if (req.method === 'commands:execute') {
  const { command } = req.params as { command: string };
  await vscode.commands.executeCommand(command);
  res = { id: req.id, result: 'ok' };
}
```

- [ ] **Step 5: Build + manual verify**

Run: `pnpm build`

F5, open Settings WebView (Command Palette → Claude Copilot: Open Settings Panel).
1. Top of the form should show the provider strip with active profile name.
2. The `<select>` should list all profiles.
3. Selecting another profile should swap `env.ANTHROPIC_API_KEY` in `~/.claude/settings.json` and the form should reload with the new values populated in the existing "Provider & Auth" section below.
4. Clicking "+ New profile" should trigger the VSCode QuickPick create flow.

- [ ] **Step 6: Commit**

```bash
git add src/webview/settings-panel.ts webview-ui/src/settings-form.ts l10n/bundle.l10n.json l10n/bundle.l10n.zh-cn.json
git commit -m "feat(providers): settings webview top strip to switch/create profiles"
```

---

### Task 11: Version bump + CHANGELOG

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `CHANGELOG.zh-CN.md`

- [ ] **Step 1: Bump to 0.2.0**

In `package.json`, change `"version": "0.1.16"` → `"version": "0.2.0"`.

- [ ] **Step 2: Add CHANGELOG entries**

Prepend a new section above the last entry in `CHANGELOG.md`:

```markdown
## [0.2.0] — 2026-04-22

### Added
- **Provider profiles**: save multiple Anthropic-compatible / Bedrock / Vertex / Foundry configs as named profiles, switch instantly from the status bar, Settings tree, or the top of the Settings webview. Credentials are stored in VSCode SecretStorage (OS keychain), never in `settings.json`.
- Auto-migration: existing provider env in `settings.json` becomes a "Default" profile on first launch; existing behavior preserved.
- Deleting the active profile falls back to subscription mode and cleans up env automatically.
```

Add the matching Chinese entry to `CHANGELOG.zh-CN.md`:

```markdown
## [0.2.0] — 2026-04-22

### 新增
- **接入 Profile**：Anthropic / Bedrock / Vertex / Foundry 的多份配置作为命名 Profile 保存，可在状态栏、Settings 树、Settings WebView 顶部秒切。凭证写入 VSCode SecretStorage（系统 keychain），不再明文落入 `settings.json`。
- 自动迁移：首次启动时，`settings.json` 中已有的 provider env 会被转成 "Default" Profile，保留原行为。
- 删除激活中的 Profile 会清空相关 env 并回落到订阅模式。
```

Append the version tag link at the bottom of both CHANGELOG files (follow existing format).

- [ ] **Step 3: Run tests + package**

```bash
pnpm test && pnpm package
```

Expected: green tests (57+ core tests). `claude-copilot-0.2.0.vsix` produced.

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md CHANGELOG.zh-CN.md
git commit -m "chore(release): 0.2.0 — provider profiles"
```

---

## Notes for the Implementer

- **Do not re-export `Profile` types from `settings.ts`**; keep providers typing contained in `providers.ts`. `settings-form.ts` only needs the subset `{ id, name, kind }` for the dropdown.
- **When activating a profile, never call `mergeForSave` with the full `KNOWN_ENV_KEYS` list from the WebView form.** That list includes non-provider env like `CLAUDE_CODE_MAX_OUTPUT_TOKENS` which profiles must not touch. The providers core uses only `['env', 'apiKeyHelper']` as managed keys and relies on env-level key-by-key merging inside `applyProfileToSettings`.
- **Don't delete secrets eagerly on deactivate** — only delete them on profile *delete*. Deactivate just clears the env, leaving keys in SecretStorage so reactivating the same profile later still works.
- **Cross-platform note for SecretStorage**: On Linux without libsecret, VSCode falls back to its built-in file-based double-encryption store. No user action required from us. If VSCode ever surfaces the well-known "password store" banner, it is a VSCode concern, not ours.
