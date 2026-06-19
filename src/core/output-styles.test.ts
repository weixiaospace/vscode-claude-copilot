import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  listOutputStyles,
  createOutputStyle,
  deleteOutputStyle,
  readActiveOutputStyle,
  writeActiveOutputStyle,
} from './output-styles';

describe('output-styles', () => {
  let tmpHome: string;
  let tmpProject: string;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-os-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-os-proj-'));
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('returns [] when directories missing', async () => {
    assert.deepEqual(await listOutputStyles(tmpHome, tmpProject), []);
  });

  it('createOutputStyle scope=user writes ~/.claude/output-styles/<name>.md', async () => {
    const file = await createOutputStyle(tmpHome, 'user', 'concise');
    assert.equal(file, path.join(tmpHome, 'output-styles', 'concise.md'));
  });

  it('identity comes from filename when no name frontmatter', async () => {
    const result = await listOutputStyles(tmpHome, tmpProject);
    assert.ok(result.find(s => s.name === 'concise'));
  });

  it('identity comes from frontmatter name when present (overrides filename)', async () => {
    const file = path.join(tmpHome, 'output-styles', 'wat.md');
    await fs.writeFile(
      file,
      '---\nname: Diagrams first\ndescription: lead with a diagram\n---\n',
      'utf-8',
    );
    const result = await listOutputStyles(tmpHome, tmpProject);
    const diag = result.find(s => s.name === 'Diagrams first');
    assert.ok(diag, 'frontmatter name should take precedence over filename');
    assert.equal(diag?.description, 'lead with a diagram');
  });

  it('captures keep-coding-instructions frontmatter flag', async () => {
    const file = path.join(tmpHome, 'output-styles', 'keep.md');
    await fs.writeFile(
      file,
      '---\nname: keeps\nkeep-coding-instructions: true\n---\n',
      'utf-8',
    );
    const result = await listOutputStyles(tmpHome, tmpProject);
    const keep = result.find(s => s.name === 'keeps');
    assert.equal(keep?.keepCoding, true);
  });

  it('readActiveOutputStyle returns null when no settings present', async () => {
    const active = await readActiveOutputStyle(tmpProject);
    assert.equal(active, null);
  });

  it('writeActiveOutputStyle writes outputStyle to .claude/settings.local.json and readActiveOutputStyle reads it back', async () => {
    await writeActiveOutputStyle(tmpProject, 'Diagrams first');
    const active = await readActiveOutputStyle(tmpProject);
    assert.equal(active, 'Diagrams first');
    const raw = await fs.readFile(path.join(tmpProject, '.claude', 'settings.local.json'), 'utf-8');
    const doc = JSON.parse(raw);
    assert.equal(doc.outputStyle, 'Diagrams first');
  });

  it('writeActiveOutputStyle preserves other keys in settings.local.json', async () => {
    const settingsPath = path.join(tmpProject, '.claude', 'settings.local.json');
    const doc = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
    doc.someOtherKey = 'preserve-me';
    await fs.writeFile(settingsPath, JSON.stringify(doc, null, 2), 'utf-8');
    await writeActiveOutputStyle(tmpProject, 'concise');
    const updated = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
    assert.equal(updated.outputStyle, 'concise');
    assert.equal(updated.someOtherKey, 'preserve-me');
  });

  it('deleteOutputStyle removes only the file', async () => {
    const file = path.join(tmpHome, 'output-styles', 'concise.md');
    await deleteOutputStyle(file);
    const result = await listOutputStyles(tmpHome, tmpProject);
    assert.ok(!result.find(s => s.name === 'concise'));
  });
});
