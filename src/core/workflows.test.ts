import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { listWorkflows, createWorkflow, deleteWorkflow } from './workflows';

describe('workflows', () => {
  let tmpHome: string;
  let tmpProject: string;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-wf-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-wf-proj-'));
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('returns [] when directories missing', async () => {
    assert.deepEqual(await listWorkflows(tmpHome, tmpProject), []);
  });

  it('createWorkflow scope=user writes ~/.claude/workflows/<name>.md', async () => {
    const file = await createWorkflow(tmpHome, 'user', 'review');
    assert.equal(file, path.join(tmpHome, 'workflows', 'review.md'));
    const content = await fs.readFile(file, 'utf-8');
    assert.match(content, /name: review/);
  });

  it('createWorkflow scope=project writes .claude/workflows/<name>.md', async () => {
    const file = await createWorkflow(tmpProject, 'project', 'triage');
    assert.equal(file, path.join(tmpProject, '.claude', 'workflows', 'triage.md'));
  });

  it('identity is the filename without .md', async () => {
    const result = await listWorkflows(tmpHome, tmpProject);
    const review = result.find(w => w.name === 'review');
    assert.ok(review);
    assert.equal(review?.scope, 'user');
  });

  it('scans subdirectories recursively', async () => {
    await fs.mkdir(path.join(tmpHome, 'workflows', 'team'), { recursive: true });
    await fs.writeFile(path.join(tmpHome, 'workflows', 'team', 'sprint.md'), '---\n---\n');
    const result = await listWorkflows(tmpHome, tmpProject);
    assert.ok(result.find(w => w.name === 'sprint'));
  });

  it('deleteWorkflow removes only the file', async () => {
    const file = path.join(tmpHome, 'workflows', 'review.md');
    await deleteWorkflow(file);
    const result = await listWorkflows(tmpHome, tmpProject);
    assert.ok(!result.find(w => w.name === 'review'));
    const dir = await fs.stat(path.join(tmpHome, 'workflows'));
    assert.ok(dir.isDirectory());
  });
});
