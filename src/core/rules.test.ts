import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { listRules, createRule, deleteRule } from './rules';

describe('rules', () => {
  let tmpHome: string;
  let tmpProject: string;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-rules-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-rules-proj-'));
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('returns [] when directories missing', async () => {
    assert.deepEqual(await listRules(tmpHome, tmpProject), []);
  });

  it('createRule scope=user writes ~/.claude/rules/<name>.md', async () => {
    const file = await createRule(tmpHome, 'user', 'preferences');
    assert.equal(file, path.join(tmpHome, 'rules', 'preferences.md'));
  });

  it('createRule scope=project writes .claude/rules/<name>.md', async () => {
    const file = await createRule(tmpProject, 'project', 'api-design');
    assert.equal(file, path.join(tmpProject, '.claude', 'rules', 'api-design.md'));
  });

  it('identity is the filename, scope split is correct', async () => {
    const result = await listRules(tmpHome, tmpProject);
    const byName = Object.fromEntries(result.map(r => [r.name, r.scope]));
    assert.equal(byName['preferences'], 'user');
    assert.equal(byName['api-design'], 'project');
  });

  it('scans nested subdirectories (e.g. frontend/, backend/)', async () => {
    await fs.mkdir(path.join(tmpProject, '.claude', 'rules', 'frontend'), { recursive: true });
    await fs.writeFile(
      path.join(tmpProject, '.claude', 'rules', 'frontend', 'react.md'),
      '# React Rules\n',
    );
    const result = await listRules(tmpHome, tmpProject);
    assert.ok(result.find(r => r.name === 'react'));
  });

  it('flags rules that declare a paths frontmatter field as path-scoped', async () => {
    const file = path.join(tmpHome, 'rules', 'api-scoped.md');
    await fs.writeFile(file, '---\npaths:\n  - "src/api/**/*.ts"\n---\n# scoped\n', 'utf-8');
    const result = await listRules(tmpHome, tmpProject);
    const scoped = result.find(r => r.name === 'api-scoped');
    assert.ok(scoped);
    assert.equal(scoped?.pathScoped, true);
  });

  it('deleteRule removes only the file', async () => {
    const file = path.join(tmpHome, 'rules', 'preferences.md');
    await deleteRule(file);
    const result = await listRules(tmpHome, tmpProject);
    assert.ok(!result.find(r => r.name === 'preferences'));
  });
});
