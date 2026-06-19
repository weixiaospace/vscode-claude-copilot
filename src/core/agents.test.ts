import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { listAgents, createAgent, deleteAgent } from './agents';

async function writeAgent(
  filePath: string,
  fm: Record<string, unknown>,
  body = '',
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const fmLines = Object.entries(fm).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: [${v.map(x => JSON.stringify(x)).join(', ')}]`;
    return `${k}: ${v}`;
  });
  const content = `---\n${fmLines.join('\n')}\n---\n${body}`;
  await fs.writeFile(filePath, content, 'utf-8');
}

describe('agents', () => {
  let tmpHome: string;
  let tmpProject: string;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-agents-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-agents-proj-'));
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('listAgents returns [] when directories missing', async () => {
    const result = await listAgents(tmpHome, tmpProject);
    assert.deepEqual(result, []);
  });

  it('parses identity from YAML name field, not filename', async () => {
    await writeAgent(path.join(tmpHome, 'agents', 'some-file.md'), {
      name: 'my-agent',
      description: 'do stuff',
    });
    const result = await listAgents(tmpHome, tmpProject);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, 'my-agent');
    assert.equal(result[0]?.description, 'do stuff');
    assert.equal(result[0]?.scope, 'user');
  });

  it('falls back to filename when YAML name is missing', async () => {
    await writeAgent(path.join(tmpHome, 'agents', 'anon.md'), {
      description: 'anonymous',
    });
    const result = await listAgents(tmpHome, tmpProject);
    const anon = result.find(a => a.name === 'anon');
    assert.ok(anon, 'anon should be picked up by filename fallback');
    assert.equal(anon?.description, 'anonymous');
  });

  it('scans nested subdirectories recursively', async () => {
    await writeAgent(path.join(tmpHome, 'agents', 'review', 'security.md'), {
      name: 'security',
    });
    const result = await listAgents(tmpHome, tmpProject);
    assert.ok(result.find(a => a.name === 'security'));
  });

  it('distinguishes user and project scopes', async () => {
    await writeAgent(path.join(tmpProject, '.claude', 'agents', 'proj-a.md'), {
      name: 'proj-a',
    });
    const result = await listAgents(tmpHome, tmpProject);
    const byName = Object.fromEntries(result.map(a => [a.name, a.scope]));
    assert.equal(byName['proj-a'], 'project');
    assert.equal(byName['my-agent'], 'user');
  });

  it('extracts model, tools (inline-array form), color frontmatter fields', async () => {
    await writeAgent(path.join(tmpHome, 'agents', 'rich.md'), {
      name: 'rich',
      description: 'rich agent',
      model: 'opus',
      tools: ['Read', 'Edit'],
      color: 'blue',
    });
    const result = await listAgents(tmpHome, tmpProject);
    const rich = result.find(a => a.name === 'rich');
    assert.ok(rich);
    assert.equal(rich?.model, 'opus');
    assert.deepEqual(rich?.tools, ['Read', 'Edit']);
    assert.equal(rich?.color, 'blue');
  });

  it('parses tools authored as a YAML comma-scalar (the official docs form)', async () => {
    const file = path.join(tmpHome, 'agents', 'scalar-tools.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      '---\nname: scalar-tools\ntools: Read, Glob, Grep\nmodel: sonnet\n---\n',
      'utf-8',
    );
    const result = await listAgents(tmpHome, tmpProject);
    const a = result.find(x => x.name === 'scalar-tools');
    assert.ok(a, 'comma-scalar tools agent should be listed');
    assert.deepEqual(a?.tools, ['Read', 'Glob', 'Grep']);
    assert.equal(a?.model, 'sonnet');
  });

  it('parses tools authored as a single bare value', async () => {
    const file = path.join(tmpHome, 'agents', 'single-tool.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '---\nname: single-tool\ntools: Bash\n---\n', 'utf-8');
    const result = await listAgents(tmpHome, tmpProject);
    const a = result.find(x => x.name === 'single-tool');
    assert.deepEqual(a?.tools, ['Bash']);
  });

  it('within one scope, duplicate name keeps only the first occurrence', async () => {
    await writeAgent(path.join(tmpHome, 'agents', 'dup-a.md'), { name: 'dup' });
    await writeAgent(path.join(tmpHome, 'agents', 'sub', 'dup-b.md'), { name: 'dup' });
    const result = await listAgents(tmpHome, tmpProject);
    const dups = result.filter(a => a.name === 'dup');
    assert.equal(dups.length, 1);
  });

  it('createAgent scope=user writes <home>/agents/<name>.md with frontmatter', async () => {
    await createAgent(tmpHome, 'user', 'new-agent');
    const file = path.join(tmpHome, 'agents', 'new-agent.md');
    const content = await fs.readFile(file, 'utf-8');
    assert.match(content, /name: new-agent/);
    assert.match(content, /description:/);
  });

  it('createAgent scope=project writes <project>/.claude/agents/<name>.md', async () => {
    await createAgent(tmpProject, 'project', 'proj-agent');
    const stat = await fs.stat(
      path.join(tmpProject, '.claude', 'agents', 'proj-agent.md'),
    );
    assert.ok(stat.isFile());
  });

  it('deleteAgent removes only the .md file, leaving the parent directory', async () => {
    const file = path.join(tmpHome, 'agents', 'rich.md');
    await deleteAgent(file);
    const result = await listAgents(tmpHome, tmpProject);
    assert.ok(!result.find(a => a.name === 'rich'));
    const dir = await fs.stat(path.join(tmpHome, 'agents'));
    assert.ok(dir.isDirectory());
  });
});
