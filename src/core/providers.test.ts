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
import { profileToPartial, type Profile } from './providers';

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
