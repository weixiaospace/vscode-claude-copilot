import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { readUser, readProjectSettings, readLocalSettings, mergeForSave } from './settings';

describe('settings', () => {
  let tmpHome: string;
  let tmpProject: string;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-settings-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-project-'));
  });

  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('readUser returns {} when settings.json missing', async () => {
    const result = await readUser(tmpHome);
    assert.deepEqual(result, {});
  });

  it('readProjectSettings / readLocalSettings return {} when files missing', async () => {
    assert.deepEqual(await readProjectSettings(tmpProject), {});
    assert.deepEqual(await readLocalSettings(tmpProject), {});
  });

  it('readers parse JSON when present', async () => {
    await fs.writeFile(path.join(tmpHome, 'settings.json'), JSON.stringify({ foo: 'bar' }));
    await fs.mkdir(path.join(tmpProject, '.claude'), { recursive: true });
    await fs.writeFile(path.join(tmpProject, '.claude', 'settings.json'), JSON.stringify({ a: 1 }));
    await fs.writeFile(path.join(tmpProject, '.claude', 'settings.local.json'), JSON.stringify({ b: 2 }));

    assert.deepEqual(await readUser(tmpHome), { foo: 'bar' });
    assert.deepEqual(await readProjectSettings(tmpProject), { a: 1 });
    assert.deepEqual(await readLocalSettings(tmpProject), { b: 2 });
  });
});

describe('mergeForSave', () => {
  it('preserves keys not listed in knownKeys', () => {
    const existing = { hooks: { PreToolUse: [] }, model: 'old-model', companyAnnouncements: ['hi'] };
    const partial = { model: 'new-model' };
    const next = mergeForSave(existing, partial, ['model']);
    assert.equal(next.model, 'new-model');
    assert.deepEqual(next.hooks, { PreToolUse: [] });
    assert.deepEqual(next.companyAnnouncements, ['hi']);
  });

  it('wipes known keys that are absent from partial (toggle-off semantics)', () => {
    const existing = { autoMemoryEnabled: false, verbose: true };
    const partial = { }; // user re-enabled autoMemory and turned off verbose (both back to default)
    const next = mergeForSave(existing, partial, ['autoMemoryEnabled', 'verbose']);
    assert.ok(!('autoMemoryEnabled' in next));
    assert.ok(!('verbose' in next));
  });

  it('replaces the whole env object (no deep merge)', () => {
    const existing = { env: { OLD_VAR: '1', ANTHROPIC_API_KEY: 'sk-old' } };
    const partial = { env: { NEW_VAR: '2' } };
    const next = mergeForSave(existing, partial, ['env']);
    assert.deepEqual(next.env, { NEW_VAR: '2' });
  });

  it('provider switching cleans up previous provider credentials when re-written', () => {
    const existing = {
      env: { CLAUDE_CODE_USE_BEDROCK: '1', AWS_BEARER_TOKEN_BEDROCK: 'secret' },
    };
    // form after switching to Anthropic with an api key:
    const partial = {
      env: { ANTHROPIC_API_KEY: 'sk-ant-new' },
    };
    const next = mergeForSave(existing, partial, ['env']) as any;
    assert.equal(next.env.ANTHROPIC_API_KEY, 'sk-ant-new');
    assert.ok(!('CLAUDE_CODE_USE_BEDROCK' in next.env));
    assert.ok(!('AWS_BEARER_TOKEN_BEDROCK' in next.env));
  });

  it('enabledPlugins round-trip preserves unmanaged entries via partial', () => {
    // Simulates what formToPartial produces: explicit false override for one plugin,
    // plus raw entries for plugins the form UI did not see.
    const existing = {
      enabledPlugins: {
        'foo@mp1': true,
        'bar@mp1': false,
        'unmanaged@private': true,
      },
    };
    const partial = {
      enabledPlugins: {
        'unmanaged@private': true,  // preserved from _rawEnabledPlugins
        'bar@mp1': false,           // kept as explicit override
        // foo@mp1 is now re-enabled (default), so it's omitted
      },
    };
    const next = mergeForSave(existing, partial, ['enabledPlugins']) as any;
    assert.equal(next.enabledPlugins['unmanaged@private'], true);
    assert.equal(next.enabledPlugins['bar@mp1'], false);
    assert.ok(!('foo@mp1' in next.enabledPlugins));
  });

  it('legacy top-level permissionMode gets cleaned up when permissions is managed', () => {
    const existing = { permissionMode: 'bypassPermissions', permissions: { defaultMode: 'default' } };
    const partial = { permissions: { defaultMode: 'plan' } };
    const next = mergeForSave(existing, partial, ['permissions', 'permissionMode']) as any;
    assert.ok(!('permissionMode' in next));
    assert.deepEqual(next.permissions, { defaultMode: 'plan' });
  });
});
