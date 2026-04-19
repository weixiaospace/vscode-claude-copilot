import * as fs from 'fs/promises';
import * as path from 'path';

async function readJsonSafe<T = any>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'));
  } catch (err: any) {
    if (err?.code === 'ENOENT') return fallback;
    throw err;
  }
}

export type Settings = Record<string, unknown>;

export function userSettingsPath(home: string): string {
  return path.join(home, 'settings.json');
}
export function projectSettingsPath(projectPath: string): string {
  return path.join(projectPath, '.claude', 'settings.json');
}
export function localSettingsPath(projectPath: string): string {
  return path.join(projectPath, '.claude', 'settings.local.json');
}

export async function readUser(home: string): Promise<Settings> {
  return readJsonSafe(userSettingsPath(home), {});
}
export async function readProjectSettings(projectPath: string): Promise<Settings> {
  return readJsonSafe(projectSettingsPath(projectPath), {});
}
export async function readLocalSettings(projectPath: string): Promise<Settings> {
  return readJsonSafe(localSettingsPath(projectPath), {});
}

// Shallow merge — top-level keys only. Consumers that need nested keys
// (permissions, env, mcpServers) should read individual layers and merge themselves.
export async function mergeSettings(home: string, projectPath: string): Promise<Settings> {
  const [user, project, local] = await Promise.all([
    readUser(home), readProjectSettings(projectPath), readLocalSettings(projectPath),
  ]);
  return { ...user, ...project, ...local };
}

export async function writeUser(home: string, settings: Settings): Promise<void> {
  await fs.writeFile(userSettingsPath(home), JSON.stringify(settings, null, 2), 'utf-8');
}

export async function ensureFile(filePath: string): Promise<void> {
  try { await fs.access(filePath); return; } catch { /* fallthrough */ }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '{}\n', 'utf-8');
}
