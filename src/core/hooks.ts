import * as fs from 'fs/promises';
import * as path from 'path';

export type HookSource =
  | { kind: 'user' }
  | { kind: 'project' }
  | { kind: 'local' }
  | { kind: 'plugin'; pluginKey: string };

export interface HookHandler {
  type: string; // 'command' | 'http' | 'mcp_tool' | 'prompt' | 'agent' | 'unknown'
  summary: string;
  raw: Record<string, unknown>;
}

export interface HookEntry {
  event: string;
  matcher: string;
  handler: HookHandler;
  source: HookSource;
  sourceFile: string;
}

async function readJsonSafe<T>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'));
  } catch (err: any) {
    if (err?.code === 'ENOENT') return fallback;
    throw err;
  }
}

function summarizeHandler(h: unknown): HookHandler {
  if (!h || typeof h !== 'object') return { type: 'unknown', summary: '', raw: {} };
  const o = h as Record<string, unknown>;
  const type = typeof o.type === 'string' ? o.type : 'unknown';
  let summary = '';
  if (type === 'command') summary = String(o.command ?? '');
  else if (type === 'http') summary = String(o.url ?? '');
  else if (type === 'mcp_tool') summary = `${o.server ?? '?'}.${o.tool ?? '?'}`;
  else if (type === 'prompt') summary = String(o.prompt ?? '').split('\n')[0] ?? '';
  else if (type === 'agent') summary = String(o.agent ?? o.name ?? '');
  return { type, summary, raw: o };
}

function flattenHooks(raw: unknown, source: HookSource, sourceFile: string): HookEntry[] {
  const out: HookEntry[] = [];
  if (!raw || typeof raw !== 'object') return out;
  const hooks = (raw as Record<string, unknown>).hooks;
  if (!hooks || typeof hooks !== 'object') return out;
  for (const [event, groups] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!group || typeof group !== 'object') continue;
      const g = group as Record<string, unknown>;
      const matcherRaw = g.matcher;
      const matcher = typeof matcherRaw === 'string' && matcherRaw.length > 0 && matcherRaw !== '*'
        ? matcherRaw
        : '*';
      const handlers = Array.isArray(g.hooks) ? g.hooks : [];
      for (const h of handlers) {
        out.push({ event, matcher, handler: summarizeHandler(h), source, sourceFile });
      }
    }
  }
  return out;
}

async function readPluginHooks(installPath: string): Promise<{ raw: unknown; file: string } | null> {
  for (const file of [
    path.join(installPath, 'hooks', 'hooks.json'),
    path.join(installPath, 'hooks.json'),
  ]) {
    const raw = await readJsonSafe<unknown | null>(file, null);
    if (raw) return { raw, file };
  }
  return null;
}

export async function listHooks(home: string, projectPath: string | null): Promise<HookEntry[]> {
  const out: HookEntry[] = [];

  const userFile = path.join(home, 'settings.json');
  const userRaw = await readJsonSafe<unknown | null>(userFile, null);
  if (userRaw) out.push(...flattenHooks(userRaw, { kind: 'user' }, userFile));

  if (projectPath) {
    const projFile = path.join(projectPath, '.claude', 'settings.json');
    const proj = await readJsonSafe<unknown | null>(projFile, null);
    if (proj) out.push(...flattenHooks(proj, { kind: 'project' }, projFile));
    const localFile = path.join(projectPath, '.claude', 'settings.local.json');
    const local = await readJsonSafe<unknown | null>(localFile, null);
    if (local) out.push(...flattenHooks(local, { kind: 'local' }, localFile));
  }

  const installedRaw = await readJsonSafe<unknown | null>(path.join(home, 'plugins', 'installed_plugins.json'), null);
  const installed = installedRaw as { plugins?: Record<string, Array<{ installPath?: string }>> } | null;
  if (installed?.plugins) {
    for (const [key, entries] of Object.entries(installed.plugins)) {
      const entry = entries[0];
      if (!entry?.installPath) continue;
      const found = await readPluginHooks(entry.installPath);
      if (found) out.push(...flattenHooks(found.raw, { kind: 'plugin', pluginKey: key }, found.file));
    }
  }

  return out;
}
