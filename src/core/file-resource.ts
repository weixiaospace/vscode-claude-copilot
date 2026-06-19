import * as fs from 'fs/promises';
import * as path from 'path';

export type Scope = 'user' | 'project';

export interface FileResourceItem {
  name: string;
  description: string;
  scope: Scope;
  path: string;
}

export type Discovery =
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

async function discoverFlatSubdirs(dir: string, basename: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, basename);
    if (await exists(file)) out.push(file);
  }
  return out;
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
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
    const content = await fs.readFile(file, 'utf-8');
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
