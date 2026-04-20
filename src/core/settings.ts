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
