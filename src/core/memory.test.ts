import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { listMemories, createMemory, deleteMemory, projectSlug, memoryDir } from './memory';

describe('memory', () => {
  let tmpHome: string;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-memory-'));
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('projectSlug replaces / with -', () => {
    assert.equal(projectSlug('/Users/yuzi/Projects/foo'), '-Users-yuzi-Projects-foo');
  });

  it('listMemories returns [] when directory missing', async () => {
    const result = await listMemories(tmpHome, '/some/project');
    assert.deepEqual(result, []);
  });

  it('createMemory creates the file with empty body', async () => {
    const filePath = await createMemory(tmpHome, '/proj', 'note.md');
    assert.match(filePath, /-proj\/memory\/note\.md$/);
    const content = await fs.readFile(filePath, 'utf-8');
    assert.equal(content, '');
  });

  it('listMemories returns the new memory and excludes MEMORY.md', async () => {
    const memDir = memoryDir(tmpHome, '/proj');
    await fs.writeFile(path.join(memDir, 'MEMORY.md'), '# index');
    const result = await listMemories(tmpHome, '/proj');
    assert.equal(result.length, 1);
    assert.equal(result[0]?.fileName, 'note.md');
  });

  it('deleteMemory removes file and prunes MEMORY.md index line', async () => {
    const memDir = memoryDir(tmpHome, '/proj');
    await fs.writeFile(path.join(memDir, 'MEMORY.md'),
      '- [Note](note.md) — test\n- [Other](other.md) — keep me');
    await deleteMemory(tmpHome, '/proj', path.join(memDir, 'note.md'));
    const remaining = await fs.readdir(memDir);
    assert.ok(!remaining.includes('note.md'));
    const idx = await fs.readFile(path.join(memDir, 'MEMORY.md'), 'utf-8');
    assert.ok(!idx.includes('note.md'));
    assert.ok(idx.includes('other.md'));
  });
});
