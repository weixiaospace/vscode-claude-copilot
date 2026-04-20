import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { readUser, readProjectSettings, readLocalSettings } from './settings';

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
