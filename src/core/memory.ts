import * as fs from 'fs/promises';
import * as path from 'path';

export interface Memory {
  fileName: string;
  path: string;
  modifiedAt: number;
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export function projectSlug(projectPath: string): string {
  return projectPath.replace(/\//g, '-');
}

export function memoryDir(home: string, projectPath: string): string {
  return path.join(home, 'projects', projectSlug(projectPath), 'memory');
}

export async function listMemories(home: string, projectPath: string): Promise<Memory[]> {
  const dir = memoryDir(home, projectPath);
  if (!await exists(dir)) return [];
  const result: Memory[] = [];
  for (const name of await fs.readdir(dir)) {
    if (name === 'MEMORY.md' || !name.endsWith('.md')) continue;
    const full = path.join(dir, name);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    result.push({ fileName: name, path: full, modifiedAt: stat.mtimeMs });
  }
  return result.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function createMemory(home: string, projectPath: string, fileName: string): Promise<string> {
  const dir = memoryDir(home, projectPath);
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(dir, fileName.endsWith('.md') ? fileName : `${fileName}.md`);
  await fs.writeFile(full, '', 'utf-8');
  return full;
}

export async function deleteMemory(home: string, projectPath: string, filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  await fs.rm(filePath, { force: true });
  const idxPath = path.join(memoryDir(home, projectPath), 'MEMORY.md');
  if (!await exists(idxPath)) return;
  const indexContent = await fs.readFile(idxPath, 'utf-8');
  const lines = indexContent.split('\n').filter(l => !l.includes(`(${fileName})`));
  await fs.writeFile(idxPath, lines.join('\n'), 'utf-8');
}
