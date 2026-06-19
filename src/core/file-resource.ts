import * as fs from 'fs/promises';
import * as path from 'path';

export type Scope = 'user' | 'project';

export interface FileResourceItem {
  name: string;
  description: string;
  scope: Scope;
  path: string;
}

type Discovery =
  | 'recursive'
  | { kind: 'flat-subdirs'; basename: string };

export interface FileResourceDescriptor<T extends FileResourceItem = FileResourceItem> {
  kind: string;
  scopeRoots: {
    user(home: string): string;
    project(projectPath: string): string;
  };
  discovery: Discovery;
  parse(filePath: string, content: string, scope: Scope): T;
  template(name: string): string;
  createFilePath(baseDir: string, scope: Scope, name: string): string;
  deletePath(filePath: string): string;
}

export function defineFileResource<T extends FileResourceItem>(
  desc: FileResourceDescriptor<T>,
): FileResourceDescriptor<T> {
  return desc;
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export function extractFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export function parseInlineList(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const m = raw.match(/^\[(.*)\]$/);
  if (!m) return undefined;
  const inner = m[1]?.trim() ?? '';
  if (!inner) return [];
  return inner
    .split(',')
    .map(s => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

async function discoverFiles(
  discovery: Discovery,
  dir: string,
): Promise<string[]> {
  if (!await exists(dir)) return [];
  if (typeof discovery === 'object' && discovery.kind === 'flat-subdirs') {
    return discoverFlatSubdirs(dir, discovery.basename);
  }
  return walkMarkdown(dir);
}

// readdir's Dirent reflects the entry's own lstat, so a symlink-to-directory
// reports isDirectory() === false. Skills/agents are routinely symlinked into
// ~/.claude from shared dirs, so resolve the symlink's real kind before
// deciding. Returns 'dir' | 'file' | 'other' (broken/dangling links -> 'other').
export async function entryKind(
  entry: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean },
  full: string,
): Promise<'dir' | 'file' | 'other'> {
  if (entry.isDirectory()) return 'dir';
  if (entry.isFile()) return 'file';
  if (entry.isSymbolicLink()) {
    try {
      const st = await fs.stat(full); // follows the link
      if (st.isDirectory()) return 'dir';
      if (st.isFile()) return 'file';
    } catch { /* dangling symlink */ }
  }
  return 'other';
}

async function discoverFlatSubdirs(dir: string, basename: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (await entryKind(entry, path.join(dir, entry.name)) !== 'dir') continue;
    const file = path.join(dir, entry.name, basename);
    if (await exists(file)) out.push(file);
  }
  return out;
}

async function walkMarkdown(dir: string, seen?: Set<string>): Promise<string[]> {
  // Guard against symlink cycles (e.g. a link pointing back at an ancestor).
  const visited = seen ?? new Set<string>();
  let real: string;
  try { real = await fs.realpath(dir); } catch { return []; }
  if (visited.has(real)) return [];
  visited.add(real);

  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const kind = await entryKind(entry, full);
    if (kind === 'dir') {
      out.push(...await walkMarkdown(full, visited));
    } else if (kind === 'file' && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

async function scanScope<T extends FileResourceItem>(
  desc: FileResourceDescriptor<T>,
  dir: string,
  scope: Scope,
): Promise<T[]> {
  const files = await discoverFiles(desc.discovery, dir);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file, 'utf-8');
    } catch (err: any) {
      // A file (or symlink target) can vanish between discovery and read,
      // e.g. when a watcher-driven refresh races a delete. Skip it rather
      // than blanking the whole panel.
      if (err?.code === 'ENOENT') continue;
      throw err;
    }
    const item = desc.parse(file, content, scope);
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    out.push(item);
  }
  return out;
}

export async function listResource<T extends FileResourceItem>(
  desc: FileResourceDescriptor<T>,
  home: string,
  projectPath: string | null,
): Promise<T[]> {
  const userItems = await scanScope(desc, desc.scopeRoots.user(home), 'user');
  const projectItems = projectPath
    ? await scanScope(desc, desc.scopeRoots.project(projectPath), 'project')
    : [];
  return [...userItems, ...projectItems];
}

export async function createResource<T extends FileResourceItem>(
  desc: FileResourceDescriptor<T>,
  baseDir: string,
  scope: Scope,
  name: string,
): Promise<string> {
  const filePath = desc.createFilePath(baseDir, scope, name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, desc.template(name), 'utf-8');
  return filePath;
}

export async function deleteResource<T extends FileResourceItem>(
  desc: FileResourceDescriptor<T>,
  filePath: string,
): Promise<void> {
  const target = desc.deletePath(filePath);
  await fs.rm(target, { recursive: true, force: true });
}
