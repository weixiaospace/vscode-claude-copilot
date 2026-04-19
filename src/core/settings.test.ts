import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { readUser, readProjectSettings, readLocalSettings, mergeSettings, writeUser, ensureFile } from './settings';

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

  it('writeUser then readUser roundtrips', async () => {
    await writeUser(tmpHome, { foo: 'bar' });
    const result = await readUser(tmpHome);
    assert.deepEqual(result, { foo: 'bar' });
  });

  it('mergeSettings layers user < project < local', async () => {
    await fs.mkdir(path.join(tmpProject, '.claude'), { recursive: true });
    await fs.writeFile(path.join(tmpHome, 'settings.json'), JSON.stringify({ a: 1, b: 1 }));
    await fs.writeFile(path.join(tmpProject, '.claude', 'settings.json'), JSON.stringify({ b: 2, c: 2 }));
    await fs.writeFile(path.join(tmpProject, '.claude', 'settings.local.json'), JSON.stringify({ c: 3 }));

    const merged = await mergeSettings(tmpHome, tmpProject);
    assert.deepEqual(merged, { a: 1, b: 2, c: 3 });
  });

  it('ensureFile creates {} when missing', async () => {
    const target = path.join(tmpProject, '.claude', 'new-settings.json');
    await ensureFile(target);
    const content = await fs.readFile(target, 'utf-8');
    assert.equal(content, '{}\n');
  });

  it('ensureFile leaves existing files untouched', async () => {
    const target = path.join(tmpProject, '.claude', 'settings.json');
    await ensureFile(target);
    const content = JSON.parse(await fs.readFile(target, 'utf-8'));
    assert.deepEqual(content, { b: 2, c: 2 });
  });
});
