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

/**
 * Merge a partial update into existing settings.
 * Keys listed in `knownKeys` are first deleted from existing, then overwritten
 * by `partial`. Keys NOT in `knownKeys` are preserved untouched.
 *
 * This gives the form full control over the subset it manages, while keeping
 * unrelated settings (hooks, statusLine, sandbox, custom fields, etc.) intact.
 *
 * Side effect: saving normalizes the file — a redundant explicit
 * `autoMemoryEnabled: true` (which equals the CLI default) will be dropped
 * from disk on save. Semantics are unchanged since the CLI treats missing
 * keys as their default.
 */
export function mergeForSave(existing: Settings, partial: Record<string, unknown>, knownKeys: string[]): Settings {
  const next: Settings = { ...existing };
  for (const k of knownKeys) delete next[k];
  Object.assign(next, partial);
  return next;
}
