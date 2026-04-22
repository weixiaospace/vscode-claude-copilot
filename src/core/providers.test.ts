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
