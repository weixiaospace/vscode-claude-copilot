import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { listSkills, createSkill, deleteSkill, SkillScope } from './skills';

describe('skills', () => {
  let tmpHome: string;
  let tmpProject: string;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-skills-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-skills-proj-'));
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('listSkills returns [] when directory missing', async () => {
    const result = await listSkills(tmpHome, tmpProject);
    assert.deepEqual(result, []);
  });

  it('createSkill creates SKILL.md with frontmatter', async () => {
    await createSkill(tmpHome, 'user', 'my-skill');
    const content = await fs.readFile(path.join(tmpHome, 'skills', 'my-skill', 'SKILL.md'), 'utf-8');
    assert.match(content, /name: my-skill/);
    assert.match(content, /description:/);
  });

  it('listSkills picks up the new skill with parsed description', async () => {
    const result = await listSkills(tmpHome, tmpProject);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, 'my-skill');
    assert.equal(result[0]?.scope, 'user');
  });

  it('createSkill scope=project writes to project .claude/skills', async () => {
    await createSkill(tmpProject, 'project', 'proj-skill');
    const exists = await fs.stat(path.join(tmpProject, '.claude', 'skills', 'proj-skill', 'SKILL.md'));
    assert.ok(exists.isFile());
  });

  it('listSkills returns both user and project skills with correct scope', async () => {
    const result = await listSkills(tmpHome, tmpProject);
    assert.equal(result.length, 2);
    const scopes = result.map(s => s.scope).sort();
    assert.deepEqual(scopes, ['project', 'user']);
  });

  it('deleteSkill removes the entire skill directory', async () => {
    await deleteSkill(path.join(tmpHome, 'skills', 'my-skill', 'SKILL.md'));
    const result = await listSkills(tmpHome, tmpProject);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.scope, 'project');
  });
});
