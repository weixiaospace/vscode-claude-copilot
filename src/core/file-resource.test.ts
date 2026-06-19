import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  extractFrontmatter,
  parseInlineList,
  defineFileResource,
  listResource,
  createResource,
  deleteResource,
  type FileResourceItem,
} from './file-resource';

describe('file-resource helpers', () => {
  describe('extractFrontmatter', () => {
    it('returns {} when content has no frontmatter', () => {
      assert.deepEqual(extractFrontmatter('# Hello\nWorld'), {});
    });

    it('returns {} when content is empty', () => {
      assert.deepEqual(extractFrontmatter(''), {});
    });

    it('parses key: value pairs', () => {
      const fm = extractFrontmatter('---\nname: foo\ndescription: bar baz\n---\n# Body');
      assert.equal(fm['name'], 'foo');
      assert.equal(fm['description'], 'bar baz');
    });

    it('handles CRLF line endings', () => {
      const fm = extractFrontmatter('---\r\nname: foo\r\nmodel: opus\r\n---\r\n');
      assert.equal(fm['name'], 'foo');
      assert.equal(fm['model'], 'opus');
    });

    it('preserves everything after the first colon in the value', () => {
      const fm = extractFrontmatter('---\nurl: https://example.com:8080/path\n---\n');
      assert.equal(fm['url'], 'https://example.com:8080/path');
    });

    it('returns {} when closing --- is missing', () => {
      assert.deepEqual(extractFrontmatter('---\nname: foo\n# never closes'), {});
    });
  });

  describe('parseInlineList', () => {
    it('returns undefined when input is undefined', () => {
      assert.equal(parseInlineList(undefined), undefined);
    });

    it('returns undefined for non-array string', () => {
      assert.equal(parseInlineList('not an array'), undefined);
    });

    it('parses empty inline array as []', () => {
      assert.deepEqual(parseInlineList('[]'), []);
    });

    it('parses simple list', () => {
      assert.deepEqual(parseInlineList('[Read, Edit, Bash]'), ['Read', 'Edit', 'Bash']);
    });

    it('strips quotes from quoted items', () => {
      assert.deepEqual(parseInlineList('["Read", \'Edit\']'), ['Read', 'Edit']);
    });
  });
});

interface FakeItem extends FileResourceItem {
  flavour?: string;
}

describe('file-resource descriptor pipeline (synthetic)', () => {
  let tmpHome: string;
  let tmpProject: string;

  // A synthetic descriptor exercises the descriptor pipeline directly,
  // independent of the production skills/agents wiring.
  const fakeDescriptor = defineFileResource<FakeItem>({
    kind: 'fake',
    scopeRoots: {
      user: home => path.join(home, 'fakes'),
      project: projectPath => path.join(projectPath, '.fake', 'fakes'),
    },
    discovery: 'recursive',
    parse: (filePath, content, scope) => {
      const fm = extractFrontmatter(content);
      const name = fm['name'] || path.basename(filePath, '.md');
      return {
        name,
        description: fm['description'] ?? '',
        scope,
        path: filePath,
        flavour: fm['flavour'] || undefined,
      };
    },
    template: name => `---\nname: ${name}\ndescription: synthetic\n---\n`,
    createFilePath: (baseDir, scope, name) =>
      scope === 'user'
        ? path.join(baseDir, 'fakes', `${name}.md`)
        : path.join(baseDir, '.fake', 'fakes', `${name}.md`),
    deletePath: filePath => filePath,
  });

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-fileres-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-fileres-proj-'));
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('listResource returns [] when scope dirs missing', async () => {
    const result = await listResource(fakeDescriptor, tmpHome, tmpProject);
    assert.deepEqual(result, []);
  });

  it('createResource writes the file at descriptor.createFilePath', async () => {
    const written = await createResource(fakeDescriptor, tmpHome, 'user', 'alpha');
    assert.equal(written, path.join(tmpHome, 'fakes', 'alpha.md'));
    const stat = await fs.stat(written);
    assert.ok(stat.isFile());
  });

  it('listResource picks up the created item via parse()', async () => {
    const result = await listResource(fakeDescriptor, tmpHome, tmpProject);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, 'alpha');
    assert.equal(result[0]?.scope, 'user');
  });

  it('recursive discovery walks subdirectories', async () => {
    await fs.mkdir(path.join(tmpHome, 'fakes', 'nested'), { recursive: true });
    await fs.writeFile(
      path.join(tmpHome, 'fakes', 'nested', 'beta.md'),
      '---\nname: beta\n---\n',
    );
    const result = await listResource(fakeDescriptor, tmpHome, tmpProject);
    assert.ok(result.find(i => i.name === 'beta'));
  });

  it('dedups by name within scope (first wins)', async () => {
    await fs.writeFile(path.join(tmpHome, 'fakes', 'dup-a.md'), '---\nname: dup\nflavour: a\n---\n');
    await fs.writeFile(path.join(tmpHome, 'fakes', 'dup-b.md'), '---\nname: dup\nflavour: b\n---\n');
    const result = await listResource(fakeDescriptor, tmpHome, tmpProject);
    const dups = result.filter(i => i.name === 'dup');
    assert.equal(dups.length, 1);
    assert.equal(dups[0]?.flavour, 'a');
  });

  it('createResource scope=project writes under descriptor.scopeRoots.project', async () => {
    const written = await createResource(fakeDescriptor, tmpProject, 'project', 'gamma');
    assert.equal(written, path.join(tmpProject, '.fake', 'fakes', 'gamma.md'));
  });

  it('deleteResource removes the path that deletePath returns', async () => {
    const target = path.join(tmpHome, 'fakes', 'alpha.md');
    await deleteResource(fakeDescriptor, target);
    const result = await listResource(fakeDescriptor, tmpHome, tmpProject);
    assert.ok(!result.find(i => i.name === 'alpha'));
    // parent dir still exists
    const dir = await fs.stat(path.join(tmpHome, 'fakes'));
    assert.ok(dir.isDirectory());
  });
});

describe('file-resource descriptor pipeline (flat-subdirs discovery)', () => {
  let tmpHome: string;

  interface DirItem extends FileResourceItem {}

  const dirDescriptor = defineFileResource<DirItem>({
    kind: 'dir',
    scopeRoots: {
      user: home => path.join(home, 'dirs'),
      project: () => '/never',
    },
    discovery: { kind: 'flat-subdirs', basename: 'MARKER.md' },
    parse: (filePath, _content, scope) => ({
      name: path.basename(path.dirname(filePath)),
      description: '',
      scope,
      path: filePath,
    }),
    template: () => '# marker\n',
    createFilePath: (baseDir, _scope, name) => path.join(baseDir, 'dirs', name, 'MARKER.md'),
    deletePath: filePath => path.dirname(filePath),
  });

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-fileres-flat-'));
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('picks up <dir>/<basename> entries and ignores subdirs without it', async () => {
    await fs.mkdir(path.join(tmpHome, 'dirs', 'has-marker'), { recursive: true });
    await fs.writeFile(path.join(tmpHome, 'dirs', 'has-marker', 'MARKER.md'), '# yes');
    await fs.mkdir(path.join(tmpHome, 'dirs', 'no-marker'), { recursive: true });
    const result = await listResource(dirDescriptor, tmpHome, null);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, 'has-marker');
  });

  it('deleteResource removes the parent dir when deletePath returns it', async () => {
    const marker = path.join(tmpHome, 'dirs', 'has-marker', 'MARKER.md');
    await deleteResource(dirDescriptor, marker);
    const result = await listResource(dirDescriptor, tmpHome, null);
    assert.equal(result.length, 0);
    // parent dirs/ still exists, but has-marker/ is gone
    const dirsExists = await fs.stat(path.join(tmpHome, 'dirs'));
    assert.ok(dirsExists.isDirectory());
    await assert.rejects(fs.stat(path.join(tmpHome, 'dirs', 'has-marker')));
  });
});

// Skills/agents are frequently symlinked into ~/.claude/skills from shared
// locations (e.g. ~/.agents/skills, cc-switch, matt-pocock setups). readdir
// withFileTypes reports a symlink's lstat, so isDirectory()/isFile() are both
// false for symlinks — discovery must resolve them, or the panel silently
// drops every symlinked resource.
describe('file-resource symlink handling', () => {
  let tmpHome: string;
  let external: string;

  interface SItem extends FileResourceItem {}

  const flatDesc = defineFileResource<SItem>({
    kind: 'flat',
    scopeRoots: { user: home => path.join(home, 'flats'), project: () => '/never' },
    discovery: { kind: 'flat-subdirs', basename: 'MARKER.md' },
    parse: (filePath, _content, scope) => ({
      name: path.basename(path.dirname(filePath)),
      description: '',
      scope,
      path: filePath,
    }),
    template: () => '# marker\n',
    createFilePath: (baseDir, _scope, name) => path.join(baseDir, 'flats', name, 'MARKER.md'),
    deletePath: filePath => path.dirname(filePath),
  });

  const recDesc = defineFileResource<SItem>({
    kind: 'rec',
    scopeRoots: { user: home => path.join(home, 'recs'), project: () => '/never' },
    discovery: 'recursive',
    parse: (filePath, content, scope) => ({
      name: extractFrontmatter(content)['name'] || path.basename(filePath, '.md'),
      description: '',
      scope,
      path: filePath,
    }),
    template: name => `---\nname: ${name}\n---\n`,
    createFilePath: (baseDir, _scope, name) => path.join(baseDir, 'recs', `${name}.md`),
    deletePath: filePath => filePath,
  });

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-fileres-link-'));
    external = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-fileres-ext-'));
    await fs.mkdir(path.join(tmpHome, 'flats'), { recursive: true });
    await fs.mkdir(path.join(tmpHome, 'recs'), { recursive: true });
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(external, { recursive: true, force: true });
  });

  it('flat-subdirs: discovers a symlinked subdir that contains the basename', async () => {
    const target = path.join(external, 'linked-skill');
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'MARKER.md'), '# yes');
    await fs.symlink(target, path.join(tmpHome, 'flats', 'linked'));
    const result = await listResource(flatDesc, tmpHome, null);
    assert.ok(result.find(i => i.name === 'linked'), 'symlinked skill dir should be discovered');
  });

  it('flat-subdirs: ignores a symlink whose target lacks the basename', async () => {
    const target = path.join(external, 'bare');
    await fs.mkdir(target, { recursive: true });
    await fs.symlink(target, path.join(tmpHome, 'flats', 'bare-link'));
    const result = await listResource(flatDesc, tmpHome, null);
    assert.ok(!result.find(i => i.name === 'bare-link'), 'symlink without MARKER.md should be skipped');
  });

  it('recursive: discovers a symlinked .md file', async () => {
    const target = path.join(external, 'delta.md');
    await fs.writeFile(target, '---\nname: delta\n---\n');
    await fs.symlink(target, path.join(tmpHome, 'recs', 'delta-link.md'));
    const result = await listResource(recDesc, tmpHome, null);
    assert.ok(result.find(i => i.name === 'delta'), 'symlinked .md should be discovered');
  });

  it('recursive: recurses into a symlinked subdirectory', async () => {
    const target = path.join(external, 'nested-dir');
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'epsilon.md'), '---\nname: epsilon\n---\n');
    await fs.symlink(target, path.join(tmpHome, 'recs', 'linked-dir'));
    const result = await listResource(recDesc, tmpHome, null);
    assert.ok(result.find(i => i.name === 'epsilon'), 'skill in symlinked subdir should be discovered');
  });

  it('recursive: a symlink cycle does not hang or throw', async () => {
    // recs/loop -> recs  (points back at an ancestor)
    await fs.symlink(path.join(tmpHome, 'recs'), path.join(tmpHome, 'recs', 'loop'));
    const result = await listResource(recDesc, tmpHome, null);
    // delta is still found; the cycle is simply pruned
    assert.ok(result.find(i => i.name === 'delta'));
  });
});
